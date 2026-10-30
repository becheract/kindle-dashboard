import initSqlJs from "sql.js";
import type { VocabEntry } from "./types.ts";

export interface VocabBook {
  id: string;
  rawTitle: string;
  vocab: VocabEntry[];
}

const pad = (n: number) => String(n).padStart(2, "0");

// vocab.db stores epoch milliseconds. Render them in local time to match My Clippings.txt.
function msToLocalIso(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// sql.js runs SQLite as WebAssembly, so this same code works in the browser for uploads.
// Note: vocab.db holds the words and the sentence they appeared in, but not the definitions.
export async function parseVocabDb(bytes: Uint8Array): Promise<VocabBook[]> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(bytes);
  try {
    const books = new Map<string, VocabBook>();
    const info = db.exec("SELECT id, title FROM BOOK_INFO")[0]?.values ?? [];
    for (const [id, title] of info) {
      books.set(String(id), { id: String(id), rawTitle: String(title ?? "").trim(), vocab: [] });
    }

    const rows = db.exec(`
      SELECT l.book_key, w.word, w.stem, l.usage, l.timestamp, w.category
      FROM LOOKUPS l JOIN WORDS w ON w.id = l.word_key
      ORDER BY l.timestamp`)[0]?.values ?? [];

    for (const [bookKey, word, stem, usage, ts, category] of rows) {
      const key = String(bookKey);
      let book = books.get(key);
      if (!book) {
        book = { id: key, rawTitle: "Unknown book", vocab: [] };
        books.set(key, book);
      }
      book.vocab.push({
        word: String(word ?? ""),
        stem: String(stem ?? word ?? ""),
        context: String(usage ?? "").trim(),
        lookedUpAt: msToLocalIso(Number(ts)),
        mastered: Number(category) === 100, // 100 = "Mastered" in Vocabulary Builder
      });
    }
    return [...books.values()].filter((b) => b.vocab.length > 0);
  } finally {
    db.close();
  }
}
