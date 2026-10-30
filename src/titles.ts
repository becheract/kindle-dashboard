// Sideloaded books often carry filename-style titles, e.g.
//   "A Game of Thrones -- George R_ R_ Martin -- A Song of Ice and Fire, ... -- <md5> -- Anna’s Archive"
//   "ebin.pub_the-clear-quran-a-thematic-english-translation-quotgodquot-edition-9780977300969"
//   "Mockingjay - Suzanne Collins"
// cleanTitle turns those into a readable title and, when present, an author.

const SMALL_WORDS = new Set(["a", "an", "and", "the", "of", "in", "on", "to", "for", "or", "at", "by"]);

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Filenames can't hold ":" or ".", so tools swap them for "_".
function fixUnderscores(s: string): string {
  return s
    .replace(/\b([A-Z])_(?=\s|$)/g, "$1.") // "R_ R_ Martin" -> "R. R. Martin"
    .replace(/_\s/g, ": ") // "Games_ Mockingjay" -> "Games: Mockingjay"
    .replace(/_/g, " ")
    .trim();
}

function cleanAuthor(s: string): string {
  const a = fixUnderscores(s.replace(/\[.*?\]/g, "")).replace(/\s+/g, " ").trim();
  const lastFirst = a.match(/^([^,;]+), ([^,;]+)$/); // "Collins, Suzanne" -> "Suzanne Collins"
  return lastFirst ? `${lastFirst[2]} ${lastFirst[1]}` : a;
}

export function cleanTitle(raw: string): { title: string; author?: string } {
  const s = raw.trim();

  if (s.includes(" -- ")) {
    const [title, author] = s.split(" -- ");
    return { title: fixUnderscores(title), author: author ? cleanAuthor(author) : undefined };
  }

  const slug = s.match(/^(?:ebin\.pub_|[a-z0-9]+\.[a-z]{2,4}_)(.+)$/i);
  if (slug) {
    const words = slug[1]
      .replace(/-?\d{10,13}$/, "") // trailing ISBN
      .replace(/quot/g, " ") // HTML-escaped quotes left in the slug
      .split(/[-_\s]+/)
      .filter(Boolean)
      .join(" ");
    return { title: titleCase(words) };
  }

  const dash = s.match(/^(.+?) - ([^-]+)$/);
  if (dash) return { title: fixUnderscores(dash[1]), author: cleanAuthor(dash[2]) };

  return { title: fixUnderscores(s) };
}
