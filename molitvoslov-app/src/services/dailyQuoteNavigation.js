import {bibleContent} from './bibleContent';

// A daily quotation is a pointer to its actual source, not a link back to Home.
// Only Bible verses with an existing chapter in the bundled reader are clickable.
const BOOK_REFERENCES = {
  'Флп':'PHP', 'Ин':'JHN', 'Мф':'MAT', 'Мк':'MRK', 'Лк':'LUK',
  'Рим':'ROM', '1 Кор':'1CO', '2 Кор':'2CO', 'Гал':'GAL',
  '1 Фес':'1TH', 'Кол':'COL', 'Еф':'EPH', 'Евр':'HEB',
  'Иак':'JAS', '1 Пет':'1PE', '1 Ин':'1JN', 'Пс':'PSA',
  'Притч':'PRO', 'Еккл':'ECC', 'Ис':'ISA', 'Иер':'JER', 'Авв':'HAB',
};

export const resolveDailyQuoteSource = quote => {
  if (!quote || typeof quote !== 'object') return null;
  const stored = quote?.target || quote?.quote_target ||
    quote?.metadata?.quote_target || null;
  let bookCode = stored?.type === 'bible' ? stored.bookCode : null;
  let chapter = Number(stored?.chapter);
  let verse = Number(stored?.verse);
  if (!bookCode) {
    // Legacy saved daily quotes only have a human-readable reference.
    const reference = String(quote.reference || quote?.metadata?.reference || '');
    const match = /^(.+?)\.\s*(\d+):(\d+)(?:\D|$)/u.exec(reference);
    if (!match) return null;
    bookCode = BOOK_REFERENCES[match[1]];
    chapter = Number(match[2]);
    verse = Number(match[3]);
  }
  if (!bookCode || !Number.isInteger(chapter) || chapter < 1 ||
      !Number.isInteger(verse) || verse < 1) return null;
  const book = bibleContent.getBooks('old', 'rst').find(b=>b.code===bookCode) ||
    bibleContent.getBooks(null, 'rst').find(b=>b.code===bookCode);
  const chapterData = book?.chapters?.find(c=>Number(c.number)===chapter);
  if (!chapterData?.verses?.some(v=>Number(v.number)===verse)) return null;
  return {bookId:book.id, chapterNumber:chapter, verseNumber:verse, translationCode:'rst'};
};

export const openDailyQuoteSource = (navigation, quote) => {
  const target = resolveDailyQuoteSource(quote);
  if (!target || !navigation) return false;
  navigation.navigate('BibleChapter', target);
  return true;
};
