import { test } from "node:test";
import assert from "node:assert/strict";
import { groupClippings, parseClippingsText, parseKindleDate } from "../src/clippings.ts";
import { cleanTitle } from "../src/titles.ts";

const SAMPLE = [
  "﻿Some Book -- Doe, Jane -- 2020 -- abc123 -- Anna’s Archive (Uploader)",
  "- Your Highlight on page 3 | Location 40-41 | Added on Monday, 1 December 2025 21:13:16",
  "",
  "the short version",
  "==========",
  "Some Book -- Doe, Jane -- 2020 -- abc123 -- Anna’s Archive (Uploader)",
  "- Your Highlight on page 3 | Location 39-41 | Added on Monday, 1 December 2025 21:13:20",
  "",
  "before the short version",
  "==========",
  "Some Book -- Doe, Jane -- 2020 -- abc123 -- Anna’s Archive (Uploader)",
  "- Your Note on page 3 | Location 41 | Added on Monday, 1 December 2025 21:13:30",
  "",
  "my thought",
  "==========",
  "Some Book -- Doe, Jane -- 2020 -- abc123 -- Anna’s Archive (Uploader)",
  "- Your Note on Location 900 | Added on Monday, 1 December 2025 22:00:00",
  "",
  "a loose note",
  "==========",
  "Some Book -- Doe, Jane -- 2020 -- abc123 -- Anna’s Archive (Uploader)",
  "- Your Bookmark on Location 50 | Added on Monday, 1 December 2025 22:00:00",
  "",
  "",
  "==========",
  "",
].join("\r\n");

test("parses both English date formats", () => {
  assert.equal(parseKindleDate("Monday, 1 December 2025 21:13:16"), "2025-12-01T21:13:16");
  assert.equal(parseKindleDate("Monday, December 1, 2025 9:13:16 PM"), "2025-12-01T21:13:16");
  assert.equal(parseKindleDate("Monday, December 1, 2025 12:05:00 AM"), "2025-12-01T00:05:00");
});

test("groups clippings, drops superseded highlights and bookmarks, attaches notes", () => {
  const raw = parseClippingsText(SAMPLE);
  assert.equal(raw.length, 5);
  const [book] = groupClippings(raw);
  assert.equal(book.rawTitle, "Some Book -- Doe, Jane -- 2020 -- abc123 -- Anna’s Archive");
  assert.equal(book.highlights.length, 1);
  assert.equal(book.highlights[0].text, "before the short version");
  assert.deepEqual(book.highlights[0].location, { start: 39, end: 41 });
  assert.equal(book.highlights[0].note, "my thought");
  assert.deepEqual(book.notes.map((n) => n.text), ["a loose note"]);
});

test("cleans filename-style titles", () => {
  assert.deepEqual(cleanTitle("Some Book_ A Subtitle -- Doe, Jane [Doe, Jane] -- 2020"), {
    title: "Some Book: A Subtitle",
    author: "Jane Doe",
  });
  assert.equal(cleanTitle("X -- George R_ R_ Martin -- y").author, "George R. R. Martin");
  assert.deepEqual(cleanTitle("Mockingjay - Suzanne Collins"), { title: "Mockingjay", author: "Suzanne Collins" });
  assert.equal(
    cleanTitle("ebin.pub_the-clear-quran-a-thematic-english-translation-quotgodquot-edition-9780977300969").title,
    "The Clear Quran a Thematic English Translation God Edition",
  );
});
