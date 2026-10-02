import NetInfo from '@react-native-community/netinfo';

import {API_BASE_URL} from './backendAuth';
import {bibleContent} from './bibleContent';
import {
  getOfflineCalendarDay,
  getOfflineCalendarMonth,
  storeCalendarDay,
  storeCalendarMonth,
} from './calendarOfflineStore';

const fetchCalendarJson = async (path, {signal} = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {signal});

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `Ошибка календаря: ${response.status}`);
  }

  return data;
};

const monthCache = new Map();
const dayCache = new Map();

const pad = (value) => String(value).padStart(2, '0');

export const toCalendarDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
};

const canReachNetwork = async () => {
  try {
    const state = await NetInfo.fetch();

    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
};

export const getCalendarDay = async (
  value = new Date(),
  {force = false, language = 'ru', skipOffline = false, signal} = {}
) => {
  const dateKey = typeof value === 'string' ? value : toCalendarDate(value);
  const lang = language === 'uk' ? 'uk' : 'ru';
  const key = `${lang}:${dateKey}`;

  if (!force && dayCache.has(key)) {
    return dayCache.get(key);
  }

  const offline = skipOffline ? null : await getOfflineCalendarDay(dateKey, lang);
  const online = await canReachNetwork();

  if (!online && offline) {
    dayCache.set(key, offline);
    return offline;
  }

  try {
    const data = await fetchCalendarJson(
      `/api/calendar/day/?date=${encodeURIComponent(dateKey)}&lang=${lang}`,
      {signal}
    );

    if (signal?.aborted) {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }

    dayCache.set(key, data);
    await storeCalendarDay(dateKey, lang, data);

    return data;
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') {
      throw error;
    }

    if (offline) {
      dayCache.set(key, offline);
      return offline;
    }

    throw error;
  }
};

export const getCalendarMonth = async (
  year,
  month,
  {force = false, language = 'ru', skipOffline = false, signal} = {}
) => {
  const lang = language === 'uk' ? 'uk' : 'ru';
  const key = `${lang}:${year}-${month}`;

  if (!force && monthCache.has(key)) {
    return monthCache.get(key);
  }

  const offline = skipOffline ? null : await getOfflineCalendarMonth(year, month, lang);
  const online = await canReachNetwork();

  if (!online && offline) {
    monthCache.set(key, offline);

    (offline.days || []).forEach((day) => {
      if (day?.date_gregorian) {
        dayCache.set(`${lang}:${day.date_gregorian}`, day);
      }
    });

    return offline;
  }

  try {
    const data = await fetchCalendarJson(
      `/api/calendar/month/?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&lang=${lang}`,
      {signal}
    );

    if (signal?.aborted) {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }

    monthCache.set(key, data);
    await storeCalendarMonth(data, lang);

    (data?.days || []).forEach((day) => {
      if (day?.date_gregorian) {
        dayCache.set(`${lang}:${day.date_gregorian}`, day);
      }
    });

    return data;
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') {
      throw error;
    }

    if (offline) {
      monthCache.set(key, offline);

      (offline.days || []).forEach((day) => {
        if (day?.date_gregorian) {
          dayCache.set(`${lang}:${day.date_gregorian}`, day);
        }
      });

      return offline;
    }

    throw error;
  }
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

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^$()|[\]\\]/g, '\\$&');

const romanToNumber = (value) => {
  const source = String(value || '').toUpperCase();
  const values = {I: 1, V: 5, X: 10, L: 50, C: 100};
  let total = 0;
  let previous = 0;

  for (let index = source.length - 1; index >= 0; index -= 1) {
    const current = values[source[index]] || 0;

    if (current < previous) {
      total -= current;
    } else {
      total += current;
      previous = current;
    }
  }

  return total || null;
};

const findBookByCode = (code) => bibleContent.getBooks().find((book) => book.code === code) || null;

const matchesBookAlias = (normalized, alias) => {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(alias)}(?=\\s|$)`, 'i');

  return pattern.test(normalized);
};

const parseVerseRange = (title) => {
  const source = String(title || '');

  const colon = source.match(/(\d+)\s*[:.]\s*(\d+)\s*(?:[-–—]\s*(?:(\d+)\s*[:.]\s*)?(\d+))?/);

  if (colon) {
    return {
      startChapter: Number(colon[1]),
      startVerse: Number(colon[2]),
      endChapter: colon[3] ? Number(colon[3]) : Number(colon[1]),
      endVerse: colon[4] ? Number(colon[4]) : Number(colon[2]),
    };
  }

  const romanRange = source.match(
    /\b([IVXLCDM]{1,8})\s*[,.:]\s*(\d+)\s*(?:[-–—]\s*(?:([IVXLCDM]{1,8})\s*[,.:]\s*)?(\d+))?/i
  );

  if (romanRange) {
    const startChapter = romanToNumber(romanRange[1]);

    return {
      startChapter,
      startVerse: Number(romanRange[2]),
      endChapter: romanRange[3] ? romanToNumber(romanRange[3]) : startChapter,
      endVerse: romanRange[4] ? Number(romanRange[4]) : Number(romanRange[2]),
    };
  }

  const afterLectionary = source.replace(/\b\d+\s*зач\.?/gi, ' ').replace(/\s+/g, ' ');

  const commaRange = afterLectionary.match(
    /(\d+)\s*,\s*(\d+)\s*(?:[-–—]\s*(?:(\d+)\s*,\s*)?(\d+))?/
  );

  if (commaRange) {
    return {
      startChapter: Number(commaRange[1]),
      startVerse: Number(commaRange[2]),
      endChapter: commaRange[3] ? Number(commaRange[3]) : Number(commaRange[1]),
      endVerse: commaRange[4] ? Number(commaRange[4]) : Number(commaRange[2]),
    };
  }

  return null;
};

export const resolveBibleReference = (title) => {
  if (!title) {
    return null;
  }

  const normalized = normalizeReference(title);

  const alias = BOOK_ALIASES.find((candidate) =>
    candidate.aliases.some((item) => matchesBookAlias(normalized, item))
  );

  if (!alias) {
    return null;
  }

  const book = findBookByCode(alias.code);
  const range = parseVerseRange(title);

  if (!book || !range?.startChapter) {
    return null;
  }

  const chapter = bibleContent.getChapter(book.id, range.startChapter);

  if (!chapter) {
    return null;
  }

  const verse =
    (chapter.verses || []).find((item) => Number(item.number) === Number(range.startVerse)) ||
    chapter.verses?.[0] ||
    null;

  if (!verse) {
    return null;
  }

  return {
    book,
    chapter,
    verse,
    chapterNumber: Number(chapter.number),
    verseNumber: Number(verse.number),
    startChapter: range.startChapter,
    startVerse: range.startVerse,
    endChapter: range.endChapter || range.startChapter,
    endVerse: range.endVerse || range.startVerse,
  };
};

export const getBibleReadingVerses = (title) => {
  const target = resolveBibleReference(title);

  if (!target) {
    return [];
  }

  const result = [];
  const startChapter = Number(target.startChapter);
  const endChapter = Number(target.endChapter || startChapter);

  if (endChapter < startChapter || endChapter - startChapter > 3) {
    return [];
  }

  for (let chapterNumber = startChapter; chapterNumber <= endChapter; chapterNumber += 1) {
    const chapter = bibleContent.getChapter(target.book.id, chapterNumber);

    if (!chapter) {
      continue;
    }

    const startVerse = chapterNumber === startChapter ? Number(target.startVerse) : 1;

    const lastVerseInChapter = Number(chapter.verses?.[chapter.verses.length - 1]?.number || 0);

    const endVerse = chapterNumber === endChapter ? Number(target.endVerse) : lastVerseInChapter;

    (chapter.verses || [])
      .filter((verse) => Number(verse.number) >= startVerse && Number(verse.number) <= endVerse)
      .forEach((verse) => {
        result.push({
          chapterNumber,
          verseNumber: Number(verse.number),
          text: String(verse.text || '').trim(),
        });
      });
  }

  return result;
};

export const getBibleReadingText = (title) => {
  const verses = getBibleReadingVerses(title);

  if (!verses.length) {
    return '';
  }

  const parts = [];
  let previousChapter = null;
  const multipleChapters = new Set(verses.map((verse) => verse.chapterNumber)).size > 1;

  verses.forEach((verse) => {
    if (multipleChapters && verse.chapterNumber !== previousChapter) {
      if (parts.length) {
        parts.push('');
      }
      parts.push(`Глава ${verse.chapterNumber}`);
      previousChapter = verse.chapterNumber;
    }

    parts.push(`${verse.verseNumber} ${verse.text}`);
  });

  return parts.join('\n').trim();
};

export const openCalendarBibleReference = (navigation, title) => {
  const target = resolveBibleReference(title);

  if (!target) {
    return false;
  }

  navigation.push('BibleChapter', {
    bookId: target.book.id,
    chapterNumber: target.chapterNumber,
    focusTarget: {
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
    },
  });

  return true;
};

export const formatFast = (day, language = 'ru') => {
  if (!day) {
    return '';
  }

  if (day.fast_type_code === 'no-fast') {
    return language === 'uk' ? 'Посту немає' : 'Поста нет';
  }

  if (day.fast_name && day.fast_type_title) {
    return `${day.fast_name} — ${day.fast_type_title}`;
  }

  return day.fast_name || day.fast_type_title || day.fast_description || '';
};
