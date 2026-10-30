import type { DB } from "./db.ts";

export interface Meaning {
  partOfSpeech: string;
  definitions: string[];
}

export interface Definition {
  word: string;
  phonetic?: string;
  meanings: Meaning[];
}

const API = "https://api.dictionaryapi.dev/api/v2/entries/en/";

// Looks a word up in the free dictionary API and caches the answer (including "not found")
// so each word is fetched at most once per server.
// Returns null when the dictionary has no entry, undefined when it couldn't be reached.
export async function getDefinition(db: DB, rawWord: string): Promise<Definition | null | undefined> {
  const word = rawWord.toLowerCase().trim();
  if (!/^[\p{L}'’-]{1,60}$/u.test(word)) return null;

  const cached = db.prepare("SELECT data FROM definitions WHERE word = ?").get(word) as
    | { data: string | null }
    | undefined;
  if (cached) return cached.data ? JSON.parse(cached.data) : null;

  let def: Definition | null = null;
  try {
    const res = await fetch(API + encodeURIComponent(word), { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const entries = (await res.json()) as any[];
      const meanings = new Map<string, string[]>();
      for (const e of entries) {
        for (const m of e.meanings ?? []) {
          const list = meanings.get(m.partOfSpeech) ?? [];
          for (const d of m.definitions ?? []) if (list.length < 3) list.push(d.definition);
          meanings.set(m.partOfSpeech, list);
        }
      }
      def = {
        word,
        phonetic: entries.find((e) => e.phonetic)?.phonetic,
        meanings: [...meanings].map(([partOfSpeech, definitions]) => ({ partOfSpeech, definitions })),
      };
    } else if (res.status !== 404) {
      return undefined; // rate limited or down: don't cache, try again next time
    }
  } catch {
    return undefined;
  }

  db.prepare("INSERT OR REPLACE INTO definitions (word, data) VALUES (?, ?)").run(word, def ? JSON.stringify(def) : null);
  return def;
}
