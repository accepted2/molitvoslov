// Single source of Church Slavonic Bible book titles and interface rubrics.
// Cross-reference previews and all Bible navigation screens share this table.
export const CSL_BIBLE_BOOK_TITLES = {
  GEN: 'Книга Бытія',
  EXO: 'Книга Исходъ',
  LEV: 'Книга Левитъ',
  NUM: 'Книга Числъ',
  DEU: 'Книга Второзаконія',
  JOS: 'Книга Іисуса Навина',
  JDG: 'Книга Судей Израилевыхъ',
  RUT: 'Книга Руѳи',
  '1SA': 'Пе́рваѧ кни́га Ца́рствъ',
  '2SA': 'Втора́ѧ кни́га Ца́рствъ',
  '1KI': 'Тре́тіѧ кни́га Ца́рствъ',
  '2KI': 'Четве́ртаѧ кни́га Ца́рствъ',
  '1CH': 'Пе́рваѧ кни́га Паралипоме́нонъ',
  '2CH': 'Втора́ѧ кни́га Паралипоме́нонъ',
  EZR: 'Пе́рваѧ кни́га Е́здры',
  NEH: 'Книга Нееміи',
  '1ES': 'Втора́ѧ кни́га Е́здры',
  TOB: 'Книга Товита',
  JDT: 'Книга Іудиѳи',
  EST: 'Книга Есѳири',
  JOB: 'Книга Іова',
  PSA: 'Псалтирь',
  PRO: 'Притчи Соломоновы',
  ECC: 'Книга Екклесіаста',
  SNG: 'Пѣснь пѣсней Соломона',
  WIS: 'Премудрость Соломонова',
  SIR: 'Премудрость Іисуса сына Сирахова',
  ISA: 'Книга пророка Исаіи',
  JER: 'Книга пророка Іереміи',
  LAM: 'Плачъ Іереміинъ',
  LJE: 'Посланіе Іереміино',
  BAR: 'Книга пророка Варуха',
  EZK: 'Книга пророка Іезекіиля',
  DAN: 'Книга пророка Даніила',
  HOS: 'Книга пророка Осіи',
  JOL: 'Книга пророка Іоиля',
  AMO: 'Книга пророка Амоса',
  OBA: 'Книга пророка Авдія',
  JON: 'Книга пророка Іоны',
  MIC: 'Книга пророка Михея',
  NAM: 'Книга пророка Наума',
  HAB: 'Книга пророка Аввакума',
  ZEP: 'Книга пророка Софоніи',
  HAG: 'Книга пророка Аггея',
  ZEC: 'Книга пророка Захаріи',
  MAL: 'Книга пророка Малахіи',
  '1MA': 'Пе́рваѧ кни́га Маккаве́йскаѧ',
  '2MA': 'Втора́ѧ кни́га Маккаве́йскаѧ',
  '3MA': 'Тре́тіѧ кни́га Маккаве́йскаѧ',
  '2ES': 'Тре́тіѧ кни́га Е́здры',
  MAN: 'Молитва Манассіи',
  MAT: 'Еѵангеліе ѿ Матѳея',
  MRK: 'Еѵангеліе ѿ Марка',
  LUK: 'Еѵангеліе ѿ Луки',
  JHN: 'Еѵангеліе ѿ Іоанна',
  ACT: 'Дѣянія святыхъ Апостолъ',
  JAS: 'Соборное посланіе Іакова',
  '1PE': 'Первое соборное посланіе Петра',
  '2PE': 'Второе соборное посланіе Петра',
  '1JN': 'Первое соборное посланіе Іоанна',
  '2JN': 'Второе соборное посланіе Іоанна',
  '3JN': 'Третіе соборное посланіе Іоанна',
  JUD: 'Соборное посланіе Іуды',
  ROM: 'Посланіе къ Римляномъ',
  '1CO': 'Первое посланіе къ Коринѳяномъ',
  '2CO': 'Второе посланіе къ Коринѳяномъ',
  GAL: 'Посланіе къ Галатомъ',
  EPH: 'Посланіе къ Ефесеемъ',
  PHP: 'Посланіе къ Филипписіемъ',
  COL: 'Посланіе къ Колоссаемъ',
  '1TH': 'Первое посланіе къ Солуняномъ',
  '2TH': 'Второе посланіе къ Солуняномъ',
  '1TI': 'Первое посланіе къ Тимоѳею',
  '2TI': 'Второе посланіе къ Тимоѳею',
  TIT: 'Посланіе къ Титу',
  PHM: 'Посланіе къ Филимону',
  HEB: 'Посланіе ко Евреемъ',
  REV: 'Откровеніе Іоанна Богослова',
};

export const isTraditionalBible = (code) => code === 'csl_traditional';
export const traditionalBibleTextStyle = {fontFamily: 'Ponomar', fontWeight: '400'};


const CSL_UNITS = ['', 'а', 'в', 'г', 'д', 'є', 'ѕ', 'з', 'и', 'ѳ'];
const CSL_TENS = ['', 'і', 'к', 'л', 'м', 'н', 'ѯ', 'ѻ', 'п', 'ч'];
const CSL_HUNDREDS = ['', 'р', 'с', 'т', 'у', 'ф', 'х', 'ѱ', 'ѿ', 'ц'];
const cslNumberLetters = (n) => {
  const rest = n % 100;
  const ending = rest >= 11 && rest <= 19
    ? CSL_UNITS[rest - 10] + 'і'
    : CSL_TENS[Math.floor(rest / 10)] + CSL_UNITS[rest % 10];
  return CSL_HUNDREDS[Math.floor(n / 100)] + ending;
};
const addTitlo = (value) => {
  const index = Math.max(0, value.length - 2);
  return value.slice(0, index + 1) + '҃' + value.slice(index + 1);
};
// Numerals are a presentation only: DB IDs, anchors, and verse lookups
// remain ordinary integers. Church Slavonic uses units before ten in 11–19.
export const formatBibleNumber = (code, value) => {
  if (!isTraditionalBible(code)) return String(value);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 9999) return String(value);
  if (n < 1000) return addTitlo(cslNumberLetters(n));
  const thousand = Math.floor(n / 1000);
  const rest = n % 1000;
  return '҂' + CSL_UNITS[thousand] + (rest ? addTitlo(cslNumberLetters(rest)) : '҃');
};

export const getCslBibleBookName = (book) =>
  CSL_BIBLE_BOOK_TITLES[book?.code] || book?.name || book?.short_name || 'Библи́я';

const CSL_BIBLE_LABELS = {
  bible: 'Библи́я',
  translationName: 'Церковнославѧ́нскаѧ (Елисаве́тинскаѧ Библи́я)',
  source: ({book}) => `Библи́я: ${book}`,
  wholeChapterTitle: ({book, chapter}) => `${book}. Глава́ ${formatBibleNumber('csl_traditional', chapter)}`,
  oldTestament: 'Ве́тхій Завѣ́тъ',
  newTestament: 'Но́вый Завѣ́тъ',
  sectionOld: 'Кни́ги Ве́тхаго Завѣ́та',
  sectionGospels: 'Свята́я Еѵангелія',
  sectionActs: 'Дѣя́нія святы́хъ Апо́столъ',
  sectionEpistles: 'Посла́нія',
  sectionRevelation: 'Открове́ніе',
  books: ({count}) => `${formatBibleNumber('csl_traditional', count)} кни́гъ`,
  booksAndSections: ({count}) => `${formatBibleNumber('csl_traditional', count)} кни́гъ и раздѣ́ловъ`,
  chapters: ({count}) => `${formatBibleNumber('csl_traditional', count)} гла́въ`,
  stoppedChapter: ({chapter}) => `Остано́влено на главѣ́ ${formatBibleNumber('csl_traditional', chapter)}`,
  chapter: ({number}) => `Глава́ ${formatBibleNumber('csl_traditional', number)}`,
  continueReading: 'Продолжи́ть чте́ніе',
  pageOf: ({page, count}) => `страни́ца ${formatBibleNumber('csl_traditional', page)} изъ ${formatBibleNumber('csl_traditional', count)}`,
  crossReferences: 'Паралле́льныя мѣста',
  noCrossReferences: 'Для сего́ стиха́ нѣ́сть досту́пныхъ паралле́льныхъ мѣстъ.',
  showMore: ({count, remaining}) => `Показа́ть еще́ ${formatBibleNumber('csl_traditional', count)} (оста́лось ${formatBibleNumber('csl_traditional', remaining)})`,
  synodalFallback: 'Те́кстъ по Синода́льному перево́ду',
};

export const bibleUiText = (code, key, fallback, params = {}) => {
  if (!isTraditionalBible(code)) return fallback;
  const label = CSL_BIBLE_LABELS[key];
  return typeof label === 'function' ? label(params) : label || fallback;
};
