export interface Location {
  start: number;
  end: number;
}

export interface Highlight {
  text: string;
  page?: number;
  location?: Location;
  addedAt?: string; // ISO local time, no timezone (the Kindle doesn't record one)
  note?: string; // a note the reader attached to this highlight
}

export interface Note {
  text: string;
  page?: number;
  location?: number;
  addedAt?: string;
}

export interface VocabEntry {
  word: string; // the word as it appeared in the book
  stem: string; // the dictionary form the Kindle looked up
  context: string; // the sentence it appeared in
  lookedUpAt: string;
  mastered: boolean;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  rawTitle: string; // the title exactly as the Kindle stores it; used to match the two files
  firstActivity?: string;
  lastActivity?: string;
  highlights: Highlight[];
  notes: Note[]; // notes that didn't sit on any highlight
  vocab: VocabEntry[];
}

export interface Library {
  books: Book[];
}
