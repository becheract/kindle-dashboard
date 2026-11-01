import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { buildLibrary } from "../library.ts";
import {
  createSession, createUser, deleteSession, findUserByLogin, findUserBySyncKey,
  rotateSyncKey, SESSION_MAX_AGE, userForSession, type User,
} from "./auth.ts";
import type { DB } from "./db.ts";
import { CalibreError, type CalibreClient } from "./calibre.ts";
import { getDefinition } from "./definitions.ts";
import { loadLibrary, mergeLibraries, saveLibrary } from "./store.ts";
import { authPage, bookPage, layout, libraryPage, settingsPage, shelfPage, uploadPage } from "./views.ts";

export interface AppConfig {
  db: DB;
  allowSignup: boolean;
  secureCookies: boolean;
  baseUrl?: string;
  calibre?: CalibreClient;
}

type Env = { Variables: { user: User } };

const COOKIE = "session";
const MAX_UPLOAD = 50 * 1024 * 1024;

async function readUpload(form: Record<string, unknown>) {
  const clippings = form.clippings instanceof File && form.clippings.size ? await form.clippings.text() : undefined;
  const vocabDb =
    form.vocab instanceof File && form.vocab.size ? new Uint8Array(await form.vocab.arrayBuffer()) : undefined;
  return { clippings, vocabDb };
}

export function createApp(cfg: AppConfig) {
  const { db } = cfg;
  const app = new Hono<Env>();

  const ingest = async (userId: number, files: { clippings?: string; vocabDb?: Uint8Array }) => {
    const incoming = await buildLibrary(files);
    const merged = mergeLibraries(loadLibrary(db, userId).library, incoming);
    saveLibrary(db, userId, merged);
    return incoming;
  };

  const startSession = (c: Context, userId: number) => {
    setCookie(c, COOKIE, createSession(db, userId), {
      httpOnly: true, sameSite: "Lax", secure: cfg.secureCookies, path: "/", maxAge: SESSION_MAX_AGE,
    });
  };

  const requireUser = async (c: Context<Env>, next: () => Promise<void>) => {
    const user = userForSession(db, getCookie(c, COOKIE));
    if (!user) return c.redirect("/login");
    c.set("user", user);
    await next();
  };

  // ---------- accounts ----------

  app.get("/login", (c) => c.html(layout("Sign in", authPage("login", cfg.allowSignup))));
  app.post("/login", async (c) => {
    const f = await c.req.parseBody();
    const user = findUserByLogin(db, String(f.email ?? ""), String(f.password ?? ""));
    if (!user) {
      return c.html(layout("Sign in", authPage("login", cfg.allowSignup), { flash: "Wrong email or password." }), 401);
    }
    startSession(c, user.id);
    return c.redirect("/");
  });

  app.get("/signup", (c) =>
    cfg.allowSignup ? c.html(layout("Create an account", authPage("signup", true))) : c.redirect("/login"),
  );
  app.post("/signup", async (c) => {
    if (!cfg.allowSignup) return c.redirect("/login");
    const f = await c.req.parseBody();
    const email = String(f.email ?? "").trim();
    const password = String(f.password ?? "");
    const fail = (msg: string) => c.html(layout("Create an account", authPage("signup", true), { flash: msg }), 400);
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return fail("Enter a valid email.");
    if (password.length < 8) return fail("Use a password of at least 8 characters.");
    let user: User;
    try {
      user = createUser(db, email, password);
    } catch {
      return fail("That email already has an account.");
    }
    startSession(c, user.id);
    return c.redirect("/upload");
  });

  app.post("/logout", (c) => {
    const token = getCookie(c, COOKIE);
    if (token) deleteSession(db, token);
    deleteCookie(c, COOKIE, { path: "/" });
    return c.redirect("/login");
  });

  // ---------- pages ----------

  app.get("/", requireUser, (c) => {
    const user = c.get("user");
    const { library, updatedAt } = loadLibrary(db, user.id);
    const flash = c.req.query("added");
    return c.html(layout("Library", libraryPage(library, updatedAt), {
      email: user.email,
      flash: flash ? `Upload done. ${flash}` : undefined,
    }));
  });

  app.get("/books/:id", requireUser, (c) => {
    const user = c.get("user");
    const book = loadLibrary(db, user.id).library.books.find((b) => b.id === c.req.param("id"));
    if (!book) return c.html(layout("Not found", `<h1>Book not found</h1><a href="/">Back to library</a>`, { email: user.email }), 404);
    return c.html(layout(book.title, bookPage(book, c.req.query("tab") ?? ""), { email: user.email }));
  });

  app.get("/upload", requireUser, (c) => c.html(layout("Upload", uploadPage(), { email: c.get("user").email })));
  app.post("/upload", requireUser, bodyLimit({ maxSize: MAX_UPLOAD }), async (c) => {
    const user = c.get("user");
    const files = await readUpload(await c.req.parseBody());
    if (!files.clippings && !files.vocabDb) {
      return c.html(layout("Upload", uploadPage(), { email: user.email, flash: "Pick at least one file." }), 400);
    }
    try {
      const lib = await ingest(user.id, files);
      return c.redirect(`/?added=${encodeURIComponent(`Read ${lib.books.length} books from your files.`)}`);
    } catch (e) {
      console.error("upload failed", e);
      return c.html(layout("Upload", uploadPage(), {
        email: user.email,
        flash: "Couldn't read those files. Check you picked My Clippings.txt and vocab.db.",
      }), 400);
    }
  });

  app.get("/settings", requireUser, (c) => {
    const user = c.get("user");
    const base = cfg.baseUrl ?? new URL(c.req.url).origin;
    return c.html(layout("Settings", settingsPage(user.email, user.sync_key, base), { email: user.email }));
  });
  app.post("/settings/rotate-key", requireUser, (c) => {
    rotateSyncKey(db, c.get("user").id);
    return c.redirect("/settings");
  });

  // ---------- Calibre book list (for old e-reader browsers) ----------

  const SHELF_PER_PAGE = 25;
  app.get("/shelf", requireUser, async (c) => {
    const query = (c.req.query("q") ?? "").trim();
    const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
    const view = { books: [], total: 0, page, perPage: SHELF_PER_PAGE, query };
    if (!cfg.calibre) {
      return c.html(shelfPage({ ...view, error: "The book list isn't set up. Add CALIBRE_URL to /etc/kindle-dashboard.env." }), 503);
    }
    try {
      const res = await cfg.calibre.search(query, (page - 1) * SHELF_PER_PAGE, SHELF_PER_PAGE);
      return c.html(shelfPage({ ...view, ...res }));
    } catch (e) {
      if (!(e instanceof CalibreError)) throw e;
      console.error("calibre:", e.message);
      return c.html(shelfPage({ ...view, error: e.message }), 502);
    }
  });

  app.get("/shelf/get/:id/:format", requireUser, async (c) => {
    const id = Number(c.req.param("id"));
    const format = c.req.param("format");
    if (!cfg.calibre || !Number.isInteger(id) || !/^[A-Za-z0-9]{1,10}$/.test(format)) return c.notFound();
    try {
      const res = await cfg.calibre.download(id, format);
      const out = new Headers();
      for (const h of ["content-type", "content-length", "content-disposition", "last-modified"]) {
        const v = res.headers.get(h);
        if (v) out.set(h, v);
      }
      return new Response(res.body, { status: 200, headers: out });
    } catch (e) {
      if (!(e instanceof CalibreError)) throw e;
      console.error("calibre:", e.message);
      return c.html(shelfPage({ books: [], total: 0, page: 1, perPage: SHELF_PER_PAGE, query: "", error: e.message }), 502);
    }
  });

  // ---------- API ----------

  app.get("/api/define/:word", requireUser, async (c) => {
    const def = await getDefinition(db, c.req.param("word"));
    return def === undefined ? c.json({ error: "dictionary unavailable" }, 503) : c.json(def);
  });

  // Used by the Kindle sync script:
  //   curl -H "Authorization: Bearer <key>" -F clippings=@"My Clippings.txt" -F vocab=@vocab.db <server>/api/sync
  app.post("/api/sync", bodyLimit({ maxSize: MAX_UPLOAD }), async (c) => {
    const key = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const user = key ? findUserBySyncKey(db, key) : undefined;
    if (!user) return c.json({ error: "invalid sync key" }, 401);
    const files = await readUpload(await c.req.parseBody());
    if (!files.clippings && !files.vocabDb) return c.json({ error: "send clippings and/or vocab" }, 400);
    try {
      const lib = await ingest(user.id, files);
      return c.json({ ok: true, books: lib.books.length });
    } catch (e) {
      console.error("sync failed", e);
      return c.json({ error: "could not read files" }, 400);
    }
  });

  app.get("/healthz", (c) => c.text("ok"));

  return app;
}
