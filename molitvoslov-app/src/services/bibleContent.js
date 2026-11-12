import {getCurrentBibleContent} from './bibleStore';
import {getCslBibleBookName} from './bibleUi';

const currentBible = (translationCode = 'rst') =>
  getCurrentBibleContent(translationCode) || {};

const currentBooks = (translationCode = 'rst') => {
  const payload = currentBible(translationCode);

  return Array.isArray(payload?.books) ? payload.books : [];
};

const currentIndexes = (translationCode = 'rst') => {
  const books = currentBooks(translationCode);

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

  getTranslation(translationCode = 'rst') {
    return currentBible(translationCode)?.translation || null;
  },

  getBooks(testament = null, translationCode = 'rst') {
    const books = currentBooks(translationCode);

    if (!testament) {
      return books;
    }

    return books.filter((book) => book.testament === testament);
  },

  getBook(bookIdOrSlug, translationCode = 'rst') {
    const {byId, bySlug} = currentIndexes(translationCode);

    if (typeof bookIdOrSlug === 'string' && bySlug.has(bookIdOrSlug)) {
      return bySlug.get(bookIdOrSlug);
    }

    return byId.get(Number(bookIdOrSlug)) || null;
  },

  getDisplayName(bookIdOrObject, translationCode = 'rst') {
    const book = typeof bookIdOrObject === 'object'
      ? bookIdOrObject
      : this.getBook(bookIdOrObject, translationCode);

    if (!book) {
      return 'Библия';
    }

    if (translationCode === 'csl_traditional') {
      return getCslBibleBookName(book);
    }
    return BIBLE_BOOK_DISPLAY_TITLES[book.code] || book.name || book.short_name || 'Библия';
  },

  getChapter(bookIdOrSlug, chapterNumber, translationCode = 'rst') {
    const book = this.getBook(bookIdOrSlug, translationCode);

    if (!book) {
      return null;
    }

    return (
      book.chapters?.find((chapter) => Number(chapter.number) === Number(chapterNumber)) || null
    );
  },
};
