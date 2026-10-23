import NetInfo from '@react-native-community/netinfo';
import {applyYearMarkers, applyYearMarkersToMonth, loadYearMarkers} from './calendarYearMarkers';

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

export const getCalendarReadingItems = (day, kind) => {
  const normalizedKind = ['gospel', 'apostle', 'old_testament'].includes(kind) ? kind : 'gospel';
  const structured = Array.isArray(day?.readings)
    ? day.readings
        .filter((reading) => reading?.kind === normalizedKind && reading?.title)
        .slice()
        .sort(
          (left, right) =>
            Number(left?.order || 0) - Number(right?.order || 0) ||
            Number(left?.id || 0) - Number(right?.id || 0)
        )
    : [];

  if (structured.length) {
    return structured;
  }

  const legacyTitle =
    normalizedKind === 'gospel'
      ? day?.gospel_title
      : normalizedKind === 'apostle'
        ? day?.apostolic_title
        : null;

  return legacyTitle
    ? [
        {
          id: `legacy-${normalizedKind}`,
          kind: normalizedKind,
          label: '',
          title: legacyTitle,
          order: 0,
        },
      ]
    : [];
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
  if (!force && offline) {
    dayCache.set(key, offline);
    return offline;
  }
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

    const enriched = applyYearMarkers(data, await loadYearMarkers(Number(dateKey.slice(0, 4))));
    await storeCalendarDay(dateKey, lang, enriched);
    dayCache.set(key, enriched);

    return enriched;
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
  if (!force && offline) {
    monthCache.set(key, offline);
    (offline.days || []).forEach((day) => {
      if (day?.date_gregorian) dayCache.set(`${lang}:${day.date_gregorian}`, day);
    });
    return offline;
  }
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

    const enriched = applyYearMarkersToMonth(data, await loadYearMarkers(year));
    await storeCalendarMonth(enriched, lang);
    monthCache.set(key, enriched);

    (enriched?.days || []).forEach((day) => {
      if (day?.date_gregorian) {
        dayCache.set(`${lang}:${day.date_gregorian}`, day);
      }
    });

    return enriched;
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
  {code: 'GEN', aliases: ['быт', 'бытие']},
  {code: 'EXO', aliases: ['исх', 'исход']},
  {code: 'LEV', aliases: ['лев', 'левит']},
  {code: 'NUM', aliases: ['чис', 'числа']},
  {code: 'DEU', aliases: ['втор', 'второзаконие']},
  {code: 'JOS', aliases: ['нав', 'иис нав']},
  {code: 'JDG', aliases: ['суд', 'судей']},
  {code: 'RUT', aliases: ['руф', 'руфь']},
  {code: '1SA', aliases: ['1 цар', '1цар']},
  {code: '2SA', aliases: ['2 цар', '2цар']},
  {code: '1KI', aliases: ['3 цар', '3цар']},
  {code: '2KI', aliases: ['4 цар', '4цар']},
  {code: '1CH', aliases: ['1 пар', '1пар']},
  {code: '2CH', aliases: ['2 пар', '2пар']},
  {code: 'EZR', aliases: ['езд']},
  {code: 'NEH', aliases: ['неем']},
  {code: 'EST', aliases: ['есф']},
  {code: 'JOB', aliases: ['иов']},
  {code: 'PSA', aliases: ['пс', 'псал']},
  {code: 'PRO', aliases: ['притч', 'притчи']},
  {code: 'ECC', aliases: ['еккл']},
  {code: 'SNG', aliases: ['песн']},
  {code: 'WIS', aliases: ['прем']},
  {code: 'SIR', aliases: ['сир']},
  {code: 'ISA', aliases: ['ис', 'исайя']},
  {code: 'JER', aliases: ['иер']},
  {code: 'LAM', aliases: ['плач']},
  {code: 'BAR', aliases: ['вар']},
  {code: 'EZK', aliases: ['иез']},
  {code: 'DAN', aliases: ['дан']},
  {code: 'HOS', aliases: ['ос']},
  {code: 'JOL', aliases: ['иоил']},
  {code: 'AMO', aliases: ['ам']},
  {code: 'OBA', aliases: ['авд']},
  {code: 'JON', aliases: ['ион']},
  {code: 'MIC', aliases: ['мих']},
  {code: 'NAM', aliases: ['наум']},
  {code: 'HAB', aliases: ['авв']},
  {code: 'ZEP', aliases: ['соф']},
  {code: 'HAG', aliases: ['агг']},
  {code: 'ZEC', aliases: ['зах']},
  {code: 'MAL', aliases: ['мал']},
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
  {code: '1TH', aliases: ['1 фес', '1фес', '1 сол', '1сол', '1солунянам', '1фессалоникийцам']},
  {code: '2TH', aliases: ['2 фес', '2фес', '2 сол', '2сол', '2солунянам', '2фессалоникийцам']},
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

// A lectionary reference can contain separate sections, e.g.
// 11:24–26,32–12:2 or 19:29–40,22:7–39.
// A number after a comma is a verse in the current chapter unless
// it is followed by a colon, in which case it starts a new chapter.
const parseReadingSegments = (title) => {
  const source = String(title || '').split(/\s*\(\s*зач\.?/i)[0];
  const first = /(\d+)\s*[:.]\s*(\d+)\s*(?:[-–—]\s*(?:(\d+)\s*[:.]\s*)?(\d+))?/.exec(source);
  if (!first) {
    const single = parseVerseRange(title);
    return single ? [single] : [];
  }

  const segments = [
    {
      startChapter: Number(first[1]),
      startVerse: Number(first[2]),
      endChapter: first[3] ? Number(first[3]) : Number(first[1]),
      endVerse: first[4] ? Number(first[4]) : Number(first[2]),
    },
  ];
  let currentChapter = segments[0].endChapter;
  let offset = first.index + first[0].length;

  while (offset < source.length) {
    const rest = source.slice(offset);
    const match =
      /^\s*[,;]\s*(\d+)\s*(?:[:.]\s*(\d+))?\s*(?:[-–—]\s*(?:(\d+)\s*[:.]\s*)?(\d+))?/.exec(rest);
    if (!match) break;

    const startChapter = match[2] ? Number(match[1]) : currentChapter;
    const startVerse = match[2] ? Number(match[2]) : Number(match[1]);
    const endChapter = match[3] ? Number(match[3]) : startChapter;
    const endVerse = match[4] ? Number(match[4]) : startVerse;
    segments.push({startChapter, startVerse, endChapter, endVerse});
    currentChapter = endChapter;
    offset += match[0].length;
  }
  return segments;
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
  const ranges = parseReadingSegments(title);
  const range = ranges[0];

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
    ranges,
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
  const seen = new Set();

  for (const range of target.ranges || [target]) {
    const startChapter = Number(range.startChapter);
    const endChapter = Number(range.endChapter || startChapter);

    if (endChapter < startChapter || endChapter - startChapter > 3) {
      continue;
    }

    for (let chapterNumber = startChapter; chapterNumber <= endChapter; chapterNumber += 1) {
      const chapter = bibleContent.getChapter(target.book.id, chapterNumber);
      if (!chapter) continue;

      const startVerse = chapterNumber === startChapter ? Number(range.startVerse) : 1;
      const lastVerse = Number(chapter.verses?.[chapter.verses.length - 1]?.number || 0);
      const endVerse = chapterNumber === endChapter ? Number(range.endVerse) : lastVerse;

      for (const verse of chapter.verses || []) {
        const verseNumber = Number(verse.number);
        if (verseNumber < startVerse || verseNumber > endVerse) continue;
        const key = `${chapterNumber}:${verseNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({chapterNumber, verseNumber, text: String(verse.text || '').trim()});
      }
    }
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

export const getCalendarMarkers = (day) =>
  day?.calendar_markers || day?.source_payload?.azbyka_calendar_markers || null;

export const formatMemorialDay = (day, language = 'ru') => {
  const markers = getCalendarMarkers(day);
  if (!markers?.is_memorial_day) return '';
  const title = markers.memorial_title || '';
  return title || (language === 'uk' ? 'День поминання спочилих' : 'День поминовения усопших');
};

export const getCalendarDayAppearance = (day) => {
  const markers = getCalendarMarkers(day);
  if (markers?.is_easter) return 'easter';
  if (markers?.is_major_feast) return 'feast';
  const code = day?.fast_type_code || '';
  const lenacomCodes = ['no-fast', 'fish', 'oil', 'no-oil', 'dry', 'cheese', 'no-food',
    'caviar', 'fast_fish', 'fast_oil', 'fast_no_oil', 'fast_dry', 'fast_no_meat', 'fast_no_meal'];
  if (lenacomCodes.includes(code)) {
    if (code === 'no-fast' && markers?.is_solid_week) return 'solid';
    return code === 'no-fast' ? null : code === 'cheese' || code === 'fast_no_meat' ? 'solid' : 'fast';
  }
  if (markers?.is_solid_week) return 'solid';
  if (markers?.is_fasting_day) return 'fast';
  if (markers?.is_memorial_day) return 'memorial';
  return null;
};

export const formatFast = (day, language = 'ru') => {
  if (!day) return '';

  const markers = getCalendarMarkers(day);
  const uk = language === 'uk';
  const cu = language === 'cu';
  const noFast = uk ? 'Посту немає' : cu ? 'Поста нѣсть' : 'Поста нет';
  const solid = uk ? 'Суцільний тиждень' : 'Сплошная седмица';
  const fasting = uk ? 'Пісний день' : 'Постный день';

  // Lenacom imports carry the final dietary restriction for this date.
  // Do not let older Azbyka fasting markers override verified imported values.
  const imported = day?.source_payload?.lenacom_fasting || day?.source_payload?.lenacom_fasts ||
    day?.source_payload?.lenacom_fasting_2025_2027 ||
    day?.fast_source === 'lenacom' ||
    ['no-fast', 'fish', 'oil', 'no-oil', 'dry', 'cheese', 'no-food', 'caviar',
      'fast_fish', 'fast_oil', 'fast_no_oil', 'fast_dry', 'fast_no_meat', 'fast_no_meal'].includes(day.fast_type_code);
  if (markers?.is_solid_week && (!imported || day.fast_type_code === 'no-fast')) {
    return `${noFast} — ${solid.toLowerCase()}`;
  }
  if (!imported && markers?.is_fasting_day === false) return noFast;

  const name = day.fast_name || (!imported ? markers?.fast_period_name : '') || '';
  const type = day.fast_type_title || '';
  if (imported && (day.fast_type_code === 'no-fast' || (name === 'Нет поста' && !type))) return noFast;
  if (name && type && !['Нет поста', 'Поста нет', type].includes(name) &&
      type !== fasting && type !== 'Постный день') {
    return `${name} — ${type}`;
  }
  if (name) return name;
  if (type) return type;
  if (markers?.is_fasting_day) return fasting;
  if (day.fast_type_code === 'no-fast') return noFast;
  return day.fast_description || '';
};
