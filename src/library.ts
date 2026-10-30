import { groupClippings, parseClippingsText } from "./clippings.ts";
import { cleanTitle } from "./titles.ts";
import { parseVocabDb } from "./vocab.ts";
import type { Book, Library } from "./types.ts";

// A stable id for books that only appear in My Clippings.txt (vocab.db has its own ids).
function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "clip-" + h.toString(36);
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export async function buildLibrary(input: { clippings?: string; vocabDb?: Uint8Array }): Promise<Library> {
  const books = new Map<string, Book>();

  const getBook = (rawTitle: string, id?: string): Book => {
    const key = normalize(rawTitle);
    let book = books.get(key);
    if (!book) {
      const { title, author } = cleanTitle(rawTitle);
      book = { id: id ?? hashId(key), title, author, rawTitle, highlights: [], notes: [], vocab: [] };
      books.set(key, book);
    } else if (id && book.id.startsWith("clip-")) {
      book.id = id;
    }
    return book;
  };

  if (input.vocabDb) {
    for (const vb of await parseVocabDb(input.vocabDb)) getBook(vb.rawTitle, vb.id).vocab.push(...vb.vocab);
  }
  if (input.clippings) {
    for (const cb of groupClippings(parseClippingsText(input.clippings))) {
      const book = getBook(cb.rawTitle);
      book.highlights.push(...cb.highlights);
      book.notes.push(...cb.notes);
    }
  }

  for (const book of books.values()) {
    const times = [
      ...book.highlights.map((h) => h.addedAt),
      ...book.notes.map((n) => n.addedAt),
      ...book.vocab.map((v) => v.lookedUpAt),
    ].filter((t): t is string => !!t).sort();
    book.firstActivity = times[0];
    book.lastActivity = times.at(-1);
  }

  // Most recently read first.
  const list = [...books.values()].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  return { books: list };
}
