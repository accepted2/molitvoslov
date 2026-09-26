import offlineBible
  from '../data/offlineBible.json';


const books =
  Array.isArray(
    offlineBible?.books
  )
    ? offlineBible.books
    : [];


const byId =
  new Map(
    books.map(
      book => [
        Number(book.id),
        book,
      ]
    )
  );


const bySlug =
  new Map(
    books.map(
      book => [
        book.slug,
        book,
      ]
    )
  );


export const BIBLE_SECTION_TITLES = {
  old: 'Ветхий Завет',
  gospels: 'Евангелия',
  acts: 'Деяния святых апостолов',
  epistles: 'Послания',
  revelation: 'Апокалипсис',
};


export const bibleContent = {
  translation:
    offlineBible?.translation ||
    null,

  getBooks(testament = null) {
    if (!testament) {
      return books;
    }

    return books.filter(
      book =>
        book.testament ===
        testament
    );
  },

  getBook(bookIdOrSlug) {
    if (
      typeof bookIdOrSlug ===
        'string' &&
      bySlug.has(bookIdOrSlug)
    ) {
      return bySlug.get(
        bookIdOrSlug
      );
    }

    return (
      byId.get(
        Number(bookIdOrSlug)
      ) ||
      null
    );
  },

  getChapter(
    bookIdOrSlug,
    chapterNumber
  ) {
    const book =
      this.getBook(
        bookIdOrSlug
      );

    if (!book) {
      return null;
    }

    return (
      book.chapters?.find(
        chapter =>
          Number(
            chapter.number
          ) ===
          Number(
            chapterNumber
          )
      ) ||
      null
    );
  },
};
