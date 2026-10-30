import { dedupeHighlights } from "../clippings.ts";
import type { Book, Library } from "../types.ts";
import type { DB } from "./db.ts";

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function unionBy<T>(a: T[], b: T[], key: (x: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const x of [...a, ...b]) seen.set(key(x), x); // later wins, so a note added since stays
  return [...seen.values()];
}

// Merge a freshly parsed upload into what we already have. Uploads only ever add:
// clearing My Clippings.txt on the Kindle must not wipe the history on the site.
export function mergeLibraries(existing: Library, incoming: Library): Library {
  const books = new Map<string, Book>();
  for (const b of existing.books) books.set(normalize(b.rawTitle), b);

  for (const nb of incoming.books) {
    const key = normalize(nb.rawTitle);
    const old = books.get(key);
    if (!old) {
      books.set(key, nb);
      continue;
    }
    const highlights = dedupeHighlights(
      unionBy(old.highlights, nb.highlights, (h) => `${h.location?.start}|${h.text}`),
    ).sort((a, b) => (a.location?.start ?? 0) - (b.location?.start ?? 0));
    books.set(key, {
      ...old,
      id: old.id.startsWith("clip-") && !nb.id.startsWith("clip-") ? nb.id : old.id,
      highlights,
      notes: unionBy(old.notes, nb.notes, (n) => `${n.location}|${n.text}`)
        .filter((n) => !highlights.some((h) => h.note === n.text))
        .sort((a, b) => (a.location ?? 0) - (b.location ?? 0)),
      vocab: unionBy(old.vocab, nb.vocab, (v) => `${v.stem}|${v.lookedUpAt}`).sort((a, b) =>
        a.lookedUpAt.localeCompare(b.lookedUpAt),
      ),
    });
  }

  for (const b of books.values()) {
    const times = [
      ...b.highlights.map((h) => h.addedAt),
      ...b.notes.map((n) => n.addedAt),
      ...b.vocab.map((v) => v.lookedUpAt),
    ].filter((t): t is string => !!t).sort();
    b.firstActivity = times[0];
    b.lastActivity = times.at(-1);
  }
  return {
    books: [...books.values()].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "")),
  };
}

export function loadLibrary(db: DB, userId: number): { library: Library; updatedAt?: string } {
  const row = db.prepare("SELECT data, updated_at FROM libraries WHERE user_id = ?").get(userId) as
    | { data: string; updated_at: string }
    | undefined;
  return row ? { library: JSON.parse(row.data), updatedAt: row.updated_at } : { library: { books: [] } };
}

export function saveLibrary(db: DB, userId: number, library: Library): void {
  db.prepare(
    `INSERT INTO libraries (user_id, data, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(userId, JSON.stringify(library));
}
