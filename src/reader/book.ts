export interface Chapter {
  /** For example "CHAPTER I." */
  number: string;
  title: string;
  paragraphs: string[];
}

export interface Book {
  title: string;
  author: string;
  chapters: Chapter[];
}
