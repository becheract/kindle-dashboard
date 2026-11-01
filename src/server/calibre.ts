// A small client for Calibre's content server, used by the plain /books page
// that old e-reader browsers (like the Kobo Touch's) can open.

export interface CalibreConfig {
  url: string; // e.g. http://127.0.0.1:8080
  username?: string;
  password?: string;
}

export interface CalibreBook {
  id: number;
  title: string;
  authors: string[];
  formats: string[];
}

export interface CalibrePage {
  total: number;
  books: CalibreBook[];
}

export class CalibreError extends Error {}

export function calibreClient(cfg: CalibreConfig) {
  const base = cfg.url.replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (cfg.username) {
    headers.authorization = "Basic " + Buffer.from(`${cfg.username}:${cfg.password ?? ""}`).toString("base64");
  }

  const get = async (path: string): Promise<Response> => {
    let res: Response;
    try {
      res = await fetch(base + path, { headers });
    } catch {
      throw new CalibreError(`Can't reach Calibre at ${base}. Is calibre-server running?`);
    }
    if (res.status === 401) throw new CalibreError("Calibre refused the login. Check CALIBRE_USER and CALIBRE_PASSWORD.");
    if (!res.ok) throw new CalibreError(`Calibre answered ${res.status} for ${path}.`);
    return res;
  };

  return {
    async search(query: string, offset: number, num: number): Promise<CalibrePage> {
      const q = new URLSearchParams({ query, offset: String(offset), num: String(num), sort: "title", sort_order: "asc" });
      const found = (await (await get(`/ajax/search?${q}`)).json()) as { total_num: number; book_ids: number[] };
      if (!found.book_ids.length) return { total: found.total_num, books: [] };
      const meta = (await (await get(`/ajax/books?ids=${found.book_ids.join(",")}`)).json()) as Record<
        string,
        { title?: string; authors?: string[]; formats?: string[] } | null
      >;
      const books = found.book_ids.flatMap((id) => {
        const m = meta[String(id)];
        if (!m) return [];
        return [{ id, title: m.title ?? "Untitled", authors: m.authors ?? [], formats: (m.formats ?? []).map((f) => f.toUpperCase()) }];
      });
      return { total: found.total_num, books };
    },

    // Streams a book file straight from Calibre.
    async download(id: number, format: string): Promise<Response> {
      return get(`/get/${encodeURIComponent(format.toLowerCase())}/${id}`);
    },
  };
}

export type CalibreClient = ReturnType<typeof calibreClient>;
