import {bibleContent} from './bibleContent';

// Quotes are built from complete adjacent verses in the locally bundled
// Synodal Bible. The displayed reference and tap target cover the whole range.
// Never invent additional text to pad a Bible quotation.
export const expandBibleQuote = (quote, books = bibleContent.getBooks()) => {
  if (quote?.kind !== 'bible' || quote?.target?.type !== 'bible') return quote;
  const book = books.find(item => item.code === quote.target.bookCode);
  const chapter = book?.chapters?.find(item => Number(item.number) === Number(quote.target.chapter));
  const verses = chapter?.verses || [];
  const pivot = verses.findIndex(item => Number(item.number) === Number(quote.target.verse));
  if (pivot < 0) return quote;

  const text = verse => String(verse?.text || '').trim().replace(/\s+/gu, ' ');
  const minLength = 150;
  const idealLength = 250;
  const maxLength = 300;
  let start = pivot;
  let end = pivot;
  let currentText = text(verses[pivot]);
  if (!currentText || currentText.length > maxLength) return quote;

  // Prefer adjoining verses after the cited opening verse.
  while (end + 1 < verses.length) {
    const next = verses[end + 1];
    if (Number(next.number) !== Number(verses[end].number) + 1) break;
    const nextText = text(next);
    const merged = currentText + ' ' + nextText;
    if (!nextText || merged.length > maxLength) break;
    if (currentText.length >= minLength &&
        Math.abs(idealLength - merged.length) >= Math.abs(idealLength - currentText.length)) break;
    currentText = merged;
    end++;
  }
  // Very late verses can borrow the preceding context instead.
  while (currentText.length < minLength && start > 0) {
    const previous = verses[start - 1];
    if (Number(previous.number) !== Number(verses[start].number) - 1) break;
    const previousText = text(previous);
    const merged = previousText + ' ' + currentText;
    if (!previousText || merged.length > maxLength) break;
    currentText = merged;
    start--;
  }

  if (currentText.length < minLength) return quote;
  const first = Number(verses[start].number);
  const last = Number(verses[end].number);
  const refMatch = String(quote.reference || '').match(/^(.+?\s+\d+):\d+(?:[–-]\d+)?$/u);
  const reference = refMatch
    ? refMatch[1] + ':' + first + (last !== first ? '–' + last : '')
    : quote.reference;

  return {
    ...quote,
    text: currentText,
    reference,
    target: {...quote.target, verse: first},
    verseEnd: last,
  };
};

// Long patristic passages get two out of every three days; the remaining day
// features an expanded Bible passage. This preserves immutable saved IDs and
// still provides both patristic and scriptural quotations.
export const selectExtendedDailyQuote = (dateOrdinal, fathers, bibleQuotes, books = bibleContent.getBooks()) => {
  const fatherPool = fathers.filter(item => item?.text?.length >= 150 && item.text.length <= 320);
  const biblePool = bibleQuotes.filter(item => item?.kind === 'bible' && item.target?.type === 'bible');
  const day = ((dateOrdinal % 3) + 3) % 3;
  const group = Math.floor(dateOrdinal / 3);
  if (day !== 0 && fatherPool.length) {
    const index = ((group * 2 + day - 1) % fatherPool.length + fatherPool.length) % fatherPool.length;
    return fatherPool[index];
  }
  if (biblePool.length) {
    const index = ((group % biblePool.length) + biblePool.length) % biblePool.length;
    return expandBibleQuote(biblePool[index], books);
  }
  return fatherPool[0] || null;
};
