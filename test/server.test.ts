import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.ts";
import { openDb } from "../src/server/db.ts";
import { getDefinition } from "../src/server/definitions.ts";
import { mergeLibraries } from "../src/server/store.ts";
import type { Book } from "../src/types.ts";

const book = (over: Partial<Book>): Book => ({
  id: "b1", title: "T", rawTitle: "T", highlights: [], notes: [], vocab: [], ...over,
});

test("merging keeps old items and adds new ones without duplicates", () => {
  const v = { word: "w", stem: "w", context: "", lookedUpAt: "2026-01-01T00:00:00", mastered: false };
  const oldLib = { books: [book({ highlights: [{ text: "a", location: { start: 1, end: 1 } }], vocab: [v] })] };
  const newLib = {
    books: [
      book({ highlights: [{ text: "a", location: { start: 1, end: 1 } }, { text: "b", location: { start: 9, end: 9 } }], vocab: [v] }),
      book({ id: "b2", title: "U", rawTitle: "U" }),
    ],
  };
  const merged = mergeLibraries(oldLib, newLib);
  assert.equal(merged.books.length, 2);
  const t = merged.books.find((b) => b.rawTitle === "T")!;
  assert.deepEqual(t.highlights.map((h) => h.text), ["a", "b"]);
  assert.equal(t.vocab.length, 1);

  // An upload after My Clippings.txt was cleared must not lose anything.
  assert.equal(mergeLibraries(merged, { books: [] }).books.length, 2);
});

test("definitions are fetched once and cached, failures are not cached", async (t) => {
  const db = openDb(":memory:");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(
      JSON.stringify([{ phonetic: "/x/", meanings: [{ partOfSpeech: "adjective", definitions: [{ definition: "hard" }] }] }]),
      { status: 200 },
    );
  });
  const d = await getDefinition(db, "Arduous");
  assert.deepEqual(d, { word: "arduous", phonetic: "/x/", meanings: [{ partOfSpeech: "adjective", definitions: ["hard"] }] });
  await getDefinition(db, "arduous");
  assert.equal(calls, 1);

  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  assert.equal(await getDefinition(db, "other"), undefined);
});

test("sign up, upload, view a book, and sync with a key", async () => {
  const db = openDb(":memory:");
  const app = createApp({ db, allowSignup: true, secureCookies: false });

  assert.equal((await app.request("/")).headers.get("location"), "/login");

  const signup = await app.request("/signup", {
    method: "POST",
    body: new URLSearchParams({ email: "a@b.c", password: "password123" }),
  });
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];

  const form = new FormData();
  form.append("clippings", new File([
    "My Book -- Doe, Jane (x)\n- Your Highlight on Location 5-6 | Added on Monday, 1 December 2025 21:13:16\n\n<script>bad</script>\n==========\n",
  ], "My Clippings.txt"));
  const up = await app.request("/upload", { method: "POST", body: form, headers: { cookie } });
  assert.equal(up.status, 302);

  const home = await (await app.request("/", { headers: { cookie } })).text();
  assert.match(home, /My Book/);
  const id = home.match(/href="\/books\/([^"]+)"/)![1];
  const page = await (await app.request(`/books/${id}`, { headers: { cookie } })).text();
  assert.match(page, /&lt;script&gt;bad/);
  assert.doesNotMatch(page, /<script>bad/);

  const key = (db.prepare("SELECT sync_key FROM users").get() as { sync_key: string }).sync_key;
  const sync = new FormData();
  sync.append("clippings", new File(["Other -- Roe, Ann (x)\n- Your Note on Location 3 | Added on Monday, 1 December 2025 21:13:16\n\nhi\n==========\n"], "c.txt"));
  const bad = await app.request("/api/sync", { method: "POST", body: sync, headers: { authorization: "Bearer nope" } });
  assert.equal(bad.status, 401);
  const ok = await app.request("/api/sync", { method: "POST", body: sync, headers: { authorization: `Bearer ${key}` } });
  assert.deepEqual(await ok.json(), { ok: true, books: 1 });
  const after = await (await app.request("/", { headers: { cookie } })).text();
  assert.match(after, /My Book/);
  assert.match(after, /Other/);
});
