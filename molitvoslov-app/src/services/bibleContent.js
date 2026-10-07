import {getCurrentBibleContent} from './bibleStore';

const currentBible = () => getCurrentBibleContent('rst') || {};

const currentBooks = () => {
  const payload = currentBible();

  return Array.isArray(payload?.books) ? payload.books : [];
};

const currentIndexes = () => {
  const books = currentBooks();

  return {
    books,
    byId: new Map(books.map((book) => [Number(book.id), book])),
    bySlug: new Map(books.map((book) => [book.slug, book])),
  };
};

const BIBLE_BOOK_DISPLAY_TITLES = {
  MAT: 'Евангелие от Матфея',
  MRK: 'Евангелие от Марка',
  LUK: 'Евангелие от Луки',
  JHN: 'Евангелие от Иоанна',
  ACT: 'Деяния святых апостолов',
  JAS: 'Послание апостола Иакова',
  '1PE': 'Первое послание апостола Петра',
  '2PE': 'Второе послание апостола Петра',
  '1JN': 'Первое послание апостола Иоанна',
  '2JN': 'Второе послание апостола Иоанна',
  '3JN': 'Третье послание апостола Иоанна',
  JUD: 'Послание апостола Иуды',
  ROM: 'Послание апостола Павла к Римлянам',
  '1CO': 'Первое послание апостола Павла к Коринфянам',
  '2CO': 'Второе послание апостола Павла к Коринфянам',
  GAL: 'Послание апостола Павла к Галатам',
  EPH: 'Послание апостола Павла к Ефесянам',
  PHP: 'Послание апостола Павла к Филиппийцам',
  COL: 'Послание апостола Павла к Колоссянам',
  '1TH': 'Первое послание апостола Павла к Фессалоникийцам',
  '2TH': 'Второе послание апостола Павла к Фессалоникийцам',
  '1TI': 'Первое послание апостола Павла к Тимофею',
  '2TI': 'Второе послание апостола Павла к Тимофею',
  TIT: 'Послание апостола Павла к Титу',
  PHM: 'Послание апостола Павла к Филимону',
  HEB: 'Послание к Евреям',
  REV: 'Откровение Иоанна Богослова (Апокалипсис)',
};

export const BIBLE_SECTION_TITLES = {
  old: 'Ветхий Завет',
  gospels: 'Евангелия',
  acts: 'Деяния святых апостолов',
  epistles: 'Послания',
  revelation: 'Апокалипсис',
};

export const bibleContent = {
  get translation() {
    return currentBible()?.translation || null;
  },

  getBooks(testament = null) {
    const books = currentBooks();

    if (!testament) {
      return books;
    }

    return books.filter((book) => book.testament === testament);
  },

  getBook(bookIdOrSlug) {
    const {byId, bySlug} = currentIndexes();

    if (typeof bookIdOrSlug === 'string' && bySlug.has(bookIdOrSlug)) {
      return bySlug.get(bookIdOrSlug);
    }

    return byId.get(Number(bookIdOrSlug)) || null;
  },

  getDisplayName(bookIdOrObject) {
    const book = typeof bookIdOrObject === 'object' ? bookIdOrObject : this.getBook(bookIdOrObject);

    if (!book) {
      return 'Библия';
    }

    return BIBLE_BOOK_DISPLAY_TITLES[book.code] || book.name || book.short_name || 'Библия';
  },

  getChapter(bookIdOrSlug, chapterNumber) {
    const book = this.getBook(bookIdOrSlug);

    if (!book) {
      return null;
    }

    return (
      book.chapters?.find((chapter) => Number(chapter.number) === Number(chapterNumber)) || null
    );
  },
};
