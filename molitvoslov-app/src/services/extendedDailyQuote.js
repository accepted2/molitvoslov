import {bibleContent} from './bibleContent';

// Builds scripture quotations exclusively from full adjacent Synodal verses.
// No generated continuations, no invisible omissions, no shortened sentence.
export const expandBibleQuote = (quote, books = bibleContent.getBooks()) => {
  if (quote?.kind !== 'bible' || quote?.target?.type !== 'bible') return null;
  const book = books.find(item => item.code === quote.target.bookCode);
  const chapter = book?.chapters?.find(item =>
    Number(item.number) === Number(quote.target.chapter));
  const verses = chapter?.verses || [];
  const anchorIndex = verses.findIndex(item =>
    Number(item.number) === Number(quote.target.verse));
  if (anchorIndex < 0) return null;

  const normalize = verse => String(verse?.text || '')
    .trim().replace(/\s+/gu, ' ');
  const preferredEnd = Number(quote.verseEnd || quote.target.verse);
  const candidates = [];
  // Include at most four preceding and six following verses while requiring
  // a contiguous canonical range containing the original chosen verse.
  for (let from = Math.max(0, anchorIndex - 4); from <= anchorIndex; from++) {
    let text = '';
    for (let to = from; to < Math.min(verses.length, anchorIndex + 7); to++) {
      if (to > from &&
          Number(verses[to].number) !== Number(verses[to - 1].number) + 1) break;
      const piece = normalize(verses[to]);
      if (!piece) break;
      text += (text ? ' ' : '') + piece;
      if (text.length > 300) break;
      if (to < anchorIndex || text.length < 150) continue;
      const first = Number(verses[from].number);
      const last = Number(verses[to].number);
      const missingRequestedEnd = last < preferredEnd;
      const score = Math.abs(250 - text.length) +
        (missingRequestedEnd ? 45 : 0) +
        Math.max(0, quote.target.verse - first) * 7 +
        Math.max(0, last - preferredEnd) * 3;
      candidates.push({first, last, text, score});
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.first - b.first);
  const best = candidates[0];
  if (!best) return null;

  const raw = String(quote.reference || '');
  const referencePrefix = raw.match(/^(.+?\s+\d+):\d+(?:[–-]\d+)?$/u)?.[1];
  const reference = referencePrefix
    ? referencePrefix + ':' + best.first +
      (best.last !== best.first ? '–' + best.last : '')
    : raw;

  return {
    ...quote,
    text: best.text,
    reference,
    target: {...quote.target, verse: best.first},
    verseEnd: best.last,
  };
};

// Rotate only long sourced entries. Legacy short quotes remain untouched in
// the original catalogue for saved favorites but never appear in this pool.
// Two days of patristic teachings alternate with one day of Scripture.
export const selectExtendedDailyQuote = (
  dateOrdinal, fathers, bibleQuotes, books = bibleContent.getBooks()
) => {
  const fatherPool = fathers.filter(item =>
    item?.kind === 'father' &&
    typeof item.text === 'string' &&
    item.text.length >= 150 && item.text.length <= 300);
  const biblePool = bibleQuotes.filter(item =>
    item?.kind === 'bible' && item.target?.type === 'bible');

  const day = ((dateOrdinal % 3) + 3) % 3;
  const group = Math.floor(dateOrdinal / 3);

  if (day !== 0 && fatherPool.length) {
    const index = ((group * 2 + day - 1) % fatherPool.length +
      fatherPool.length) % fatherPool.length;
    return fatherPool[index];
  }
  for (let offset = 0; offset < biblePool.length; offset++) {
    const index = ((group + offset) % biblePool.length + biblePool.length) %
      biblePool.length;
    const expanded = expandBibleQuote(biblePool[index], books);
    if (expanded?.text?.length >= 150 && expanded.text.length <= 300)
      return expanded;
  }
  // Never fill an unfinished verse with invented text or show a short stub.
  if (fatherPool.length) {
    return fatherPool[((group % fatherPool.length) + fatherPool.length) %
      fatherPool.length];
  }
  return null;
};
