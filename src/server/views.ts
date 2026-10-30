import type { Book, Highlight, Library, Note, VocabEntry } from "../types.ts";

// Every string from a user's files goes through esc() before it reaches the page.
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DATE_FMT = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });
const fmtDate = (iso?: string) => (iso ? DATE_FMT.format(new Date(iso)) : "");

const CSS = `
:root { --bg:#faf8f4; --card:#fff; --ink:#22201c; --muted:#6f6a61; --line:#e6e1d8; --accent:#8a5a2b; --hl:#fdf1c7; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#17150f; --card:#211e18; --ink:#ece7dd; --muted:#a39d91; --line:#36312a; --accent:#d9a46b; --hl:#4a3e1c; }
}
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 Georgia, "Iowan Old Style", serif; }
a { color:var(--accent); }
header { display:flex; gap:16px; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--line); font-family:system-ui, sans-serif; font-size:14px; }
header .brand { font-weight:700; text-decoration:none; color:var(--ink); font-size:16px; }
header nav { display:flex; gap:14px; align-items:center; }
header form { margin:0; }
main { max-width:860px; margin:0 auto; padding:24px 16px 64px; }
h1 { font-size:28px; margin:0 0 4px; line-height:1.2; }
.muted { color:var(--muted); }
.ui { font-family:system-ui, sans-serif; font-size:14px; }
.stats { display:flex; gap:24px; margin:12px 0 28px; font-family:system-ui, sans-serif; }
.stats b { display:block; font-size:22px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:14px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; text-decoration:none; color:inherit; display:block; }
a.card:hover { border-color:var(--accent); }
.card h3 { margin:0 0 2px; font-size:18px; line-height:1.3; }
.counts { margin-top:10px; font-family:system-ui, sans-serif; font-size:13px; color:var(--muted); display:flex; gap:12px; flex-wrap:wrap; }
.tabs { display:flex; gap:6px; margin:20px 0; border-bottom:1px solid var(--line); font-family:system-ui, sans-serif; }
.tabs a { padding:8px 12px; text-decoration:none; color:var(--muted); border-bottom:2px solid transparent; margin-bottom:-1px; }
.tabs a.on { color:var(--ink); border-color:var(--accent); }
.item { padding:16px 0; border-bottom:1px solid var(--line); }
blockquote { margin:0; padding:2px 10px; background:var(--hl); border-radius:4px; display:inline; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
.note { margin-top:8px; padding-left:12px; border-left:3px solid var(--accent); font-style:italic; }
.meta { margin-top:6px; font-family:system-ui, sans-serif; font-size:12px; color:var(--muted); }
.word { font-size:20px; font-weight:700; }
.def { margin-top:6px; font-family:system-ui, sans-serif; font-size:14px; }
.def ol { margin:4px 0; padding-left:20px; }
.pos { font-style:italic; color:var(--muted); }
.badge { font-family:system-ui, sans-serif; font-size:11px; background:var(--line); border-radius:99px; padding:1px 8px; margin-left:6px; vertical-align:middle; }
form.stack { display:grid; gap:12px; max-width:380px; font-family:system-ui, sans-serif; }
input[type=email], input[type=password], input[type=file], input[type=search] { font:inherit; padding:9px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--ink); width:100%; }
button { font:inherit; font-family:system-ui, sans-serif; padding:9px 14px; border-radius:8px; border:1px solid var(--accent); background:var(--accent); color:#fff; cursor:pointer; }
button.link { background:none; border:none; color:var(--accent); padding:0; }
.flash { padding:10px 14px; border-radius:8px; background:var(--hl); margin-bottom:16px; font-family:system-ui, sans-serif; font-size:14px; }
code { font-size:13px; background:var(--line); padding:2px 6px; border-radius:4px; word-break:break-all; }
.empty { text-align:center; padding:48px 0; }
`;

export function layout(title: string, body: string, opts: { email?: string; flash?: string } = {}): string {
  const nav = opts.email
    ? `<nav><a href="/">Library</a><a href="/upload">Upload</a><a href="/settings">Settings</a>
       <form method="post" action="/logout"><button class="link">Sign out</button></form></nav>`
    : `<nav><a href="/login">Sign in</a></nav>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><header><a class="brand" href="/">Marginalia</a>${nav}</header>
<main>${opts.flash ? `<div class="flash">${esc(opts.flash)}</div>` : ""}${body}</main></body></html>`;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const noteCount = (b: Book) => b.notes.length + b.highlights.filter((h) => h.note).length;

export function libraryPage(lib: Library, updatedAt?: string): string {
  if (!lib.books.length) {
    return `<div class="empty"><h1>No books yet</h1>
      <p class="muted">Plug in your Kindle and <a href="/upload">upload your files</a> to get started.</p></div>`;
  }
  const totals = lib.books.reduce(
    (t, b) => ({ h: t.h + b.highlights.length, n: t.n + noteCount(b), v: t.v + b.vocab.length }),
    { h: 0, n: 0, v: 0 },
  );
  const cards = lib.books
    .map(
      (b) => `<a class="card" href="/books/${encodeURIComponent(b.id)}">
      <h3>${esc(b.title)}</h3>
      ${b.author ? `<div class="muted">${esc(b.author)}</div>` : ""}
      <div class="counts"><span>${plural(b.highlights.length, "highlight")}</span>
      <span>${plural(noteCount(b), "note")}</span><span>${plural(b.vocab.length, "word")}</span></div>
      ${b.lastActivity ? `<div class="meta">Last read ${fmtDate(b.lastActivity)}</div>` : ""}</a>`,
    )
    .join("");
  return `<h1>Your library</h1>
    ${updatedAt ? `<div class="muted ui">Last synced ${esc(updatedAt)} UTC</div>` : ""}
    <div class="stats"><div><b>${lib.books.length}</b>books</div><div><b>${totals.h}</b>highlights</div>
    <div><b>${totals.n}</b>notes</div><div><b>${totals.v}</b>words looked up</div></div>
    <div class="grid">${cards}</div>`;
}

function locLabel(page?: number, loc?: number | { start: number; end: number }): string {
  const parts: string[] = [];
  if (page) parts.push(`Page ${page}`);
  if (typeof loc === "number") parts.push(`Location ${loc}`);
  else if (loc) parts.push(`Location ${loc.start}${loc.end !== loc.start ? `–${loc.end}` : ""}`);
  return parts.join(" · ");
}

const highlightItem = (h: Highlight) => `<div class="item"><blockquote>${esc(h.text)}</blockquote>
  ${h.note ? `<div class="note">${esc(h.note)}</div>` : ""}
  <div class="meta">${locLabel(h.page, h.location)}${h.addedAt ? ` · ${fmtDate(h.addedAt)}` : ""}</div></div>`;

const noteItem = (n: Note) => `<div class="item"><div class="note">${esc(n.text)}</div>
  <div class="meta">${locLabel(n.page, n.location)}${n.addedAt ? ` · ${fmtDate(n.addedAt)}` : ""}</div></div>`;

function boldWord(context: string, word: string): string {
  const safe = esc(context);
  const w = esc(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return w ? safe.replace(new RegExp(`(${w})`, "i"), "<b>$1</b>") : safe;
}

const vocabItem = (v: VocabEntry) => `<div class="item">
  <span class="word">${esc(v.stem)}</span>${v.mastered ? `<span class="badge">mastered</span>` : ""}
  <div class="def" data-word="${esc(v.stem)}"><span class="muted">Loading definition…</span></div>
  ${v.context ? `<div class="meta" style="font-size:14px;font-family:Georgia,serif">“${boldWord(v.context, v.word)}”</div>` : ""}
  <div class="meta">Looked up ${fmtDate(v.lookedUpAt)}</div></div>`;

// Definitions load after the page so a book with 100+ words still opens instantly.
const DEFINE_SCRIPT = `<script>
document.querySelectorAll('.def[data-word]').forEach(async (el) => {
  try {
    const r = await fetch('/api/define/' + encodeURIComponent(el.dataset.word));
    if (!r.ok) throw 0;
    const d = await r.json();
    if (!d || !d.meanings || !d.meanings.length) { el.innerHTML = '<span class="muted">No definition found</span>'; return; }
    el.textContent = '';
    for (const m of d.meanings.slice(0, 3)) {
      const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = m.partOfSpeech; el.append(pos);
      const ol = document.createElement('ol');
      for (const t of m.definitions) { const li = document.createElement('li'); li.textContent = t; ol.append(li); }
      el.append(ol);
    }
  } catch { el.innerHTML = '<span class="muted">Definition unavailable</span>'; }
});
</script>`;

export function bookPage(book: Book, tab: string): string {
  const tabs = [
    ["highlights", `Highlights (${book.highlights.length})`],
    ["notes", `Notes (${book.notes.length})`],
    ["words", `Words (${book.vocab.length})`],
  ];
  const active = tabs.some(([k]) => k === tab) ? tab : book.highlights.length ? "highlights" : "words";
  const words = [...book.vocab].reverse();
  const content =
    active === "highlights"
      ? book.highlights.map(highlightItem).join("") || `<p class="muted">No highlights in this book.</p>`
      : active === "notes"
        ? book.notes.map(noteItem).join("") ||
          `<p class="muted">No standalone notes. Notes you typed on a highlight show under Highlights.</p>`
        : words.length
          ? words.map(vocabItem).join("") + DEFINE_SCRIPT
          : `<p class="muted">No words looked up.</p>`;

  return `<a class="ui" href="/">← Library</a>
    <h1 style="margin-top:12px">${esc(book.title)}</h1>
    ${book.author ? `<div class="muted">${esc(book.author)}</div>` : ""}
    <div class="meta">${book.firstActivity ? `${fmtDate(book.firstActivity)} – ${fmtDate(book.lastActivity)}` : ""}</div>
    <nav class="tabs">${tabs
      .map(([k, label]) => `<a href="?tab=${k}" class="${k === active ? "on" : ""}">${label}</a>`)
      .join("")}</nav>${content}`;
}

export function authPage(mode: "login" | "signup", allowSignup: boolean): string {
  const isLogin = mode === "login";
  return `<h1>${isLogin ? "Sign in" : "Create an account"}</h1>
    <form class="stack" method="post" action="/${mode}" style="margin-top:20px">
      <label>Email<input type="email" name="email" required autocomplete="email"></label>
      <label>Password<input type="password" name="password" required minlength="8"
        autocomplete="${isLogin ? "current-password" : "new-password"}"></label>
      <button>${isLogin ? "Sign in" : "Create account"}</button>
    </form>
    <p class="ui muted">${
      isLogin
        ? allowSignup ? `New here? <a href="/signup">Create an account</a>` : ""
        : `Already have an account? <a href="/login">Sign in</a>`
    }</p>`;
}

export function uploadPage(): string {
  return `<h1>Upload from your Kindle</h1>
    <p class="muted">Plug your Kindle into your computer and pick these two files. You can upload one or both.
    Uploading again only adds what's new.</p>
    <form class="stack" method="post" action="/upload" enctype="multipart/form-data" style="margin-top:20px">
      <label>Highlights and notes: <code>documents/My Clippings.txt</code>
        <input type="file" name="clippings" accept=".txt,text/plain"></label>
      <label>Words you looked up: <code>system/vocabulary/vocab.db</code>
        <input type="file" name="vocab" accept=".db"></label>
      <button>Upload</button>
    </form>
    <p class="ui muted">Can't see the <code>system</code> folder? Turn on hidden files in your file manager.</p>`;
}

export function settingsPage(email: string, syncKey: string, baseUrl: string): string {
  return `<h1>Settings</h1>
    <p class="ui">Signed in as <b>${esc(email)}</b></p>
    <h2 style="margin-top:28px">Sync key</h2>
    <p class="muted">Your Kindle uses this key to send new highlights and words automatically.
    Keep it private, like a password.</p>
    <p><code>${esc(syncKey)}</code></p>
    <p class="ui muted">Sync address: <code>${esc(baseUrl)}/api/sync</code></p>
    <form method="post" action="/settings/rotate-key"><button>Make a new key</button></form>
    <p class="ui muted">Making a new key stops the old one from working.</p>`;
}
