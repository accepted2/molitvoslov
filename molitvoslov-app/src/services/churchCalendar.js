import {api} from '../api';
import {bibleContent} from './bibleContent';

const monthCache = new Map();
const dayCache = new Map();

const pad = (value) => String(value).padStart(2, '0');

export const toCalendarDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
};

export const getCalendarDay = async (value = new Date(), {force = false} = {}) => {
  const key = typeof value === 'string' ? value : toCalendarDate(value);

  if (!force && dayCache.has(key)) {
    return dayCache.get(key);
  }

  const response = await api.get('calendar/day/', {params: {date: key}});
  dayCache.set(key, response.data);
  return response.data;
};

export const getCalendarMonth = async (
  year,
  month,
  {force = false} = {}
) => {
  const key = `${year}-${month}`;

  if (!force && monthCache.has(key)) {
    return monthCache.get(key);
  }

  const response = await api.get('calendar/month/', {
    params: {year, month},
  });

  monthCache.set(key, response.data);

  (response.data?.days || []).forEach((day) => {
    if (day?.date_gregorian) {
      dayCache.set(day.date_gregorian, day);
    }
  });

  return response.data;
};

const BOOK_ALIASES = [
  {code: 'MAT', aliases: ['мф', 'матф', 'матфея']},
  {code: 'MRK', aliases: ['мк', 'мрк', 'мар', 'марка']},
  {code: 'LUK', aliases: ['лк', 'лук', 'луки']},
  {code: 'JHN', aliases: ['ин', 'иоан', 'иоанна']},
  {code: 'ACT', aliases: ['деян', 'деяния']},
  {code: 'JAS', aliases: ['иак', 'иакова']},
  {code: '1PE', aliases: ['1 пет', '1пет', '1 петра']},
  {code: '2PE', aliases: ['2 пет', '2пет', '2 петра']},
  {code: '1JN', aliases: ['1 ин', '1ин', '1 иоан']},
  {code: '2JN', aliases: ['2 ин', '2ин', '2 иоан']},
  {code: '3JN', aliases: ['3 ин', '3ин', '3 иоан']},
  {code: 'JUD', aliases: ['иуд', 'иуды']},
  {code: 'ROM', aliases: ['рим', 'римлянам']},
  {code: '1CO', aliases: ['1 кор', '1кор', '1 коринф']},
  {code: '2CO', aliases: ['2 кор', '2кор', '2 коринф']},
  {code: 'GAL', aliases: ['гал', 'галат']},
  {code: 'EPH', aliases: ['еф', 'ефес']},
  {code: 'PHP', aliases: ['флп', 'филип']},
  {code: 'COL', aliases: ['кол', 'колос']},
  {code: '1TH', aliases: ['1 фес', '1фес', '1 сол']},
  {code: '2TH', aliases: ['2 фес', '2фес', '2 сол']},
  {code: '1TI', aliases: ['1 тим', '1тим']},
  {code: '2TI', aliases: ['2 тим', '2тим']},
  {code: 'TIT', aliases: ['тит']},
  {code: 'PHM', aliases: ['флм', 'филим']},
  {code: 'HEB', aliases: ['евр', 'евреям']},
  {code: 'REV', aliases: ['откр', 'апок', 'откров']},
];

const normalizeReference = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[–—−]/g, '-')
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const romanToNumber = (value) => {
  const source = String(value || '').toUpperCase();
  const values = {I: 1, V: 5, X: 10, L: 50};
  let total = 0;
  let previous = 0;

  for (let index = source.length - 1; index >= 0; index -= 1) {
    const current = values[source[index]] || 0;
    if (current < previous) total -= current;
    else {
      total += current;
      previous = current;
    }
  }

  return total || null;
};

const findBookByCode = (code) =>
  bibleContent.getBooks().find((book) => book.code === code) || null;

export const resolveBibleReference = (title) => {
  if (!title) {
    return null;
  }

  const normalized = normalizeReference(title);

  const alias = BOOK_ALIASES.find((candidate) =>
    candidate.aliases.some((item) => normalized.includes(item))
  );

  if (!alias) {
    return null;
  }

  const book = findBookByCode(alias.code);
  if (!book) {
    return null;
  }

  let chapterNumber = null;
  let verseNumber = null;

  const colonMatch = String(title).match(/(\d+)\s*[:.]\s*(\d+)/);
  if (colonMatch) {
    chapterNumber = Number(colonMatch[1]);
    verseNumber = Number(colonMatch[2]);
  }

  if (!chapterNumber) {
    const romanMatch = String(title).match(
      /(?:зач\.?[^IVXLCDM\d]*)?\b([IVXLCDM]{1,8})\b\s*[,.:]?\s*(\d+)?/i
    );

    if (romanMatch) {
      chapterNumber = romanToNumber(romanMatch[1]);
      verseNumber = romanMatch[2] ? Number(romanMatch[2]) : null;
    }
  }

  if (!chapterNumber) {
    const numbers = String(title).match(/\d+/g)?.map(Number) || [];
    if (numbers.length >= 2) {
      chapterNumber = numbers[numbers.length - 2];
      verseNumber = numbers[numbers.length - 1];
    }
  }

  if (!chapterNumber) {
    return null;
  }

  const chapter = bibleContent.getChapter(book.id, chapterNumber);
  if (!chapter) {
    return null;
  }

  const verse =
    (chapter.verses || []).find(
      (item) => Number(item.number) === Number(verseNumber)
    ) ||
    chapter.verses?.[0] ||
    null;

  return {
    book,
    chapter,
    verse,
    chapterNumber: Number(chapter.number),
    verseNumber: verse ? Number(verse.number) : null,
  };
};

export const openCalendarBibleReference = (navigation, title) => {
  const target = resolveBibleReference(title);

  if (!target) {
    return false;
  }

  navigation.push('BibleChapter', {
    bookId: target.book.id,
    chapterNumber: target.chapterNumber,
    focusTarget: target.verse
      ? {
          save_type: 'verse',
          anchor_type: 'bible_verse',
          anchor_id: Number(target.verse.id),
          start_offset: null,
          end_offset: null,
          metadata: {
            book_id: Number(target.book.id),
            book_slug: target.book.slug,
            chapter_number: target.chapterNumber,
            verse_number: target.verseNumber,
          },
        }
      : null,
  });

  return true;
};

export const formatFast = (day) => {
  if (!day) return '';

  if (day.fast_type_code === 'no-fast') {
    return 'Поста нет';
  }

  if (day.fast_name && day.fast_type_title) {
    return `${day.fast_name} — ${day.fast_type_title}`;
  }

  return day.fast_name || day.fast_type_title || day.fast_description || '';
};
