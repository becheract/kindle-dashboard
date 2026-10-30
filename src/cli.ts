// Usage: npm run parse -- [--clippings "My Clippings.txt"] [--vocab vocab.db] [--out library.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildLibrary } from "./library.ts";

const { values } = parseArgs({
  options: {
    clippings: { type: "string" },
    vocab: { type: "string" },
    out: { type: "string" },
  },
});

const library = await buildLibrary({
  clippings: values.clippings ? readFileSync(values.clippings, "utf8") : undefined,
  vocabDb: values.vocab ? new Uint8Array(readFileSync(values.vocab)) : undefined,
});

const json = JSON.stringify(library, null, 2);
if (values.out) writeFileSync(values.out, json);
else console.log(json);

for (const b of library.books) {
  console.error(
    `${b.title}${b.author ? ` by ${b.author}` : ""}: ` +
      `${b.highlights.length} highlights, ${b.highlights.filter((h) => h.note).length + b.notes.length} notes, ${b.vocab.length} lookups`,
  );
}
