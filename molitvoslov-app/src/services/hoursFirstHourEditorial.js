import editedFirstHour from '../data/hoursFirstHourEditorial.json';

const clean = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300\u0301\u0340\u0341\u0483-\u0489]/g, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ru');

const identifyPsalm = (section) => {
  const title = clean(section?.title);
  const candidate = title || clean(section?.rows?.[0]?.church || '');
  const match = /^(?:псалом|псалм|ѱалом)(?:ъ)?[ .:№]*([0-9]{1,3})(?![0-9])/u.exec(candidate);
  return match ? Number(match[1]) : null;
};

// Remove only clearly identifiable *service text* accidentally imported
// into the final Psalm section. Scripture remains intact up to the cue.
// HOURS_FAST_EDITORIAL_20261116: Most Psalm letters are plain Cyrillic.
// Avoid running Unicode normalize(), regex replacement, locale lowercase
// and trim() for *every glyph* on Android Hermes. Keep the original
// output and UTF-16 offsets, including the existing whitespace behaviour.
const accentlessWithOffsets = (value) => {
  const source = String(value || '');
  const chars = [];
  const positions = [];
  const stripped = /[\u0300\u0301\u0340\u0341\u0483-\u0489]/u;
  const trailingMark = /[\u0300-\u036f\u0483-\u0489]/u;
  for (let i = 0; i < source.length;) {
    const beginning = i;
    const code = source.codePointAt(i);
    const base = String.fromCodePoint(code);
    i += base.length;
    let cluster = base;
    let otherCombining = false;
    while (i < source.length && trailingMark.test(source[i])) {
      const mark = source[i++];
      cluster += mark;
      if (!stripped.test(mark)) otherCombining = true;
    }
    // clean(cluster) trims individual spaces; preserve this old behaviour
    // so editorial cut points cannot shift inadvertently in this patch.
    if (/\s/u.test(base) || stripped.test(base)) continue;
    // Fast path: ordinary Cyrillic/ASCII characters + stress marks
    // removed by clean(). Normalization is unnecessary for these clusters.
    const simple = !otherCombining && (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x410 && code <= 0x44f) ||
      code === 0x401 || code === 0x451 ||
      (code >= 0x460 && code <= 0x52f && code !== 0x48d && code !== 0x48c) ||
      (code >= 0xa640 && code <= 0xa69f)
    );
    const normalized = simple ? base : clean(cluster);
    for (const char of normalized) {
      chars.push(char);
      positions.push(beginning);
    }
  }
  return {plain: chars.join('').toLocaleLowerCase('ru'), positions};
};

const locateOldAfterPsalm = (text, following = '') => {
  const current = accentlessWithOffsets(text);
  const next = clean(following);
  const phrase = /слава\s*,?\s*и\s*ныне\s*[:：]?/gu;
  for (const match of current.plain.matchAll(phrase)) {
    const tail = current.plain.slice(match.index + match[0].length) + ' ' + next;
    if (/^\s*аллилу[иі](?:а|я)/u.test(tail)) {
      return current.positions[match.index] ?? -1;
    }
  }
  // Some imports already start a new cell at the Alleluia.
  if (/^\s*аллилу[иі](?:а|я)(?:\s*[,;.!]|\s+)/u.test(current.plain) &&
      /(?:господи|слава|трижды|поклон)/u.test(current.plain + ' ' + next)) {
    return 0;
  }
  return -1;
};

export const trimImportedPsalmAppendix = (lastPsalm) => {
  const rows = Array.isArray(lastPsalm?.rows) ? lastPsalm.rows : [];
  let trimmed = false;
  const kept = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const next = rows.slice(index + 1, index + 3);
    const churchNext = next.map(item => item.church || '').join(' ');
    const russianNext = next.map(item => item.russian || '').join(' ');
    const churchCut = locateOldAfterPsalm(row.church, churchNext);
    const russianCut = locateOldAfterPsalm(row.russian, russianNext);
    if (churchCut < 0 && russianCut < 0) {
      kept.push({...row});
      continue;
    }
    // A matching cue is a reliable boundary. Drop subsequent liturgical
    // verses, but never erase any earlier Psalm rows or mutate source JSON.
    trimmed = true;
    const first = {
      ...row,
      church: churchCut >= 0
        ? String(row.church || '').slice(0, churchCut).trimEnd()
        : '',
      russian: russianCut >= 0
        ? String(row.russian || '').slice(0, russianCut).trimEnd()
        : '',
    };
    if (first.church?.trim() || first.russian?.trim()) kept.push(first);
    break;
  }
  return {
    section: {...lastPsalm, rows: kept},
    trimmed,
  };
};

export const getEditedFirstHour = (content) => {
  const original = content?.sections;
  if (!Array.isArray(original) || !original.length) {
    return {applied: false, reason: 'No imported First Hour sections'};
  }

  // The imported Psalms must be identifiable in the actual local edition:
  // never replace or guess Psalms from a different hour.
  const psalms = [5, 89, 100];
  const indexes = psalms.map(number => original.findIndex(section =>
    identifyPsalm(section) === number));
  const distinctAndOrdered = indexes.every(i => i >= 0) &&
    indexes[0] < indexes[1] && indexes[1] < indexes[2];

  if (!distinctAndOrdered) {
    return {
      applied: false,
      reason: 'Psalms 5, 89, 100 not found in the expected sequence',
      detected: original.map((section, i) => ({
        index: i, title: section?.title || '', psalm: identifyPsalm(section),
      })),
    };
  }

  const [firstIndex, , lastIndex] = indexes;
  // Preserve existing Scripture and its paired Russian translation exactly.
  const psalmSections = original.slice(firstIndex, lastIndex + 1);
  const lastPsalm = trimImportedPsalmAppendix(psalmSections[psalmSections.length - 1]);
  psalmSections[psalmSections.length - 1] = lastPsalm.section;
  const churchSections = [
    {...editedFirstHour.opening, rows: editedFirstHour.opening.rows.map(row => ({...row}))},
    ...psalmSections,
    ...editedFirstHour.afterPsalms.map(section => ({
      ...section,
      rows: section.rows.map(row => ({...row})),
    })),
  ];

  // RU-only mode keeps reading the untouched imported Russian source.
  // The combined reader never appends unmatched older rubrics after this ending.
  return {
    applied: true,
    sections: churchSections,
    preservedPsalms: psalms,
    removedImportedPostPsalmAppendix: lastPsalm.trimmed,
  };
};
