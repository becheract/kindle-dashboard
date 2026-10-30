import type { Highlight, Location, Note } from "./types.ts";

export interface RawClipping {
  rawTitle: string;
  kind: "highlight" | "note" | "bookmark";
  page?: number;
  location?: Location;
  addedAt?: string;
  text: string;
}

export interface ClippingsBook {
  rawTitle: string;
  highlights: Highlight[];
  notes: Note[];
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const pad = (n: number) => String(n).padStart(2, "0");

// The Kindle writes the date in the device's locale. We handle the two English forms:
//   "Monday, 1 December 2025 21:13:16"          (UK)
//   "Monday, December 1, 2025 9:13:16 PM"       (US)
export function parseKindleDate(s: string): string | undefined {
  const t = s.trim();
  let day: number, month: number, year: number, h: number, m: number, sec: number;

  let x = t.match(/(\d{1,2}) ([A-Za-z]+) (\d{4}) (\d{1,2}):(\d{2}):(\d{2})/);
  if (x) {
    day = +x[1]; month = MONTHS.indexOf(x[2].toLowerCase()); year = +x[3];
    h = +x[4]; m = +x[5]; sec = +x[6];
  } else {
    x = t.match(/([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i);
    if (!x) return undefined;
    month = MONTHS.indexOf(x[1].toLowerCase()); day = +x[2]; year = +x[3];
    h = +x[4]; m = +x[5]; sec = +x[6];
    const ampm = x[7]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
  }
  if (month < 0) return undefined;
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function parseMeta(line: string): Omit<RawClipping, "rawTitle" | "text"> | undefined {
  const kindMatch = line.match(/Your (Highlight|Note|Bookmark)/i);
  if (!kindMatch) return undefined;
  const kind = kindMatch[1].toLowerCase() as RawClipping["kind"];

  const page = line.match(/page (\d+)/i);
  const loc = line.match(/location (\d+)(?:-(\d+))?/i);
  const added = line.match(/Added on (.+)$/i);

  return {
    kind,
    page: page ? +page[1] : undefined,
    location: loc ? { start: +loc[1], end: +(loc[2] ?? loc[1]) } : undefined,
    addedAt: added ? parseKindleDate(added[1]) : undefined,
  };
}

// The title line ends with " (Author)". For sideloaded files the "author" is often just
// whatever the file's metadata said, so we drop it and let cleanTitle() find the real one.
function stripAuthor(line: string): string {
  return line.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

export function parseClippingsText(content: string): RawClipping[] {
  const out: RawClipping[] = [];
  const entries = content.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/^==========\s*$/m);

  for (const entry of entries) {
    const lines = entry.replace(/^﻿/, "").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length < 2) continue;

    const meta = parseMeta(lines[1]);
    if (!meta) continue;
    out.push({
      rawTitle: stripAuthor(lines[0]),
      ...meta,
      text: lines.slice(2).join("\n").trim().replace(/\s*\n\s*/g, " "),
    });
  }
  return out;
}

const overlaps = (a: Location, b: Location) => a.start <= b.end && b.start <= a.end;

// When you extend or adjust a highlight, the Kindle appends a new clipping and keeps the
// old one. Drop a highlight when another overlapping one in the same book contains its text.
export function dedupeHighlights(hs: Highlight[]): Highlight[] {
  return hs.filter((a, i) =>
    !hs.some((b, j) => {
      if (i === j || !a.location || !b.location || !overlaps(a.location, b.location)) return false;
      if (!b.text.includes(a.text)) return false;
      // identical text: keep the later one
      return b.text.length > a.text.length || j > i;
    }),
  );
}

export function groupClippings(clippings: RawClipping[]): ClippingsBook[] {
  const books = new Map<string, ClippingsBook>();
  const notesByBook = new Map<string, RawClipping[]>();

  for (const c of clippings) {
    if (c.kind === "bookmark") continue;
    let book = books.get(c.rawTitle);
    if (!book) {
      book = { rawTitle: c.rawTitle, highlights: [], notes: [] };
      books.set(c.rawTitle, book);
      notesByBook.set(c.rawTitle, []);
    }
    if (c.kind === "highlight") {
      if (c.text) book.highlights.push({ text: c.text, page: c.page, location: c.location, addedAt: c.addedAt });
    } else {
      notesByBook.get(c.rawTitle)!.push(c);
    }
  }

  for (const book of books.values()) {
    book.highlights = dedupeHighlights(book.highlights);

    // A note is saved at the last location of the highlight it was typed on.
    for (const n of notesByBook.get(book.rawTitle)!) {
      const at = n.location?.start;
      const target = at === undefined ? undefined
        : book.highlights.find((h) => h.location?.end === at && !h.note)
          ?? book.highlights.find((h) => h.location && h.location.start <= at && at <= h.location.end && !h.note);
      if (target) target.note = n.text;
      else book.notes.push({ text: n.text, page: n.page, location: at, addedAt: n.addedAt });
    }

    const byLocation = (a?: number, b?: number) => (a ?? 0) - (b ?? 0);
    book.highlights.sort((a, b) => byLocation(a.location?.start, b.location?.start));
    book.notes.sort((a, b) => byLocation(a.location, b.location));
  }
  return [...books.values()];
}
