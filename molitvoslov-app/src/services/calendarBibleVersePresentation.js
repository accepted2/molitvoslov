// Render-only cleanup of lectionary annotations in Church Slavonic Scripture.
// The underlying offline Bible, verse IDs, accents, and cross-reference anchors
// remain untouched. Mirrors the established BibleChapterScreen reader behavior.
const normalizeLectionaryLabel = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripInlineLectionaryMarkers = (value) =>
  String(value || '')
    .replace(
      /(?:\*{2}[ \t]*)?[°º˚◦∘○]*[ \t]*\([ \t]*([^()\n]*)[ \t]*\)[ \t]*[°º˚◦∘○]*(?:[ \t]*\*{2})?/gu,
      (match, label) =>
        /^(?:за\s*(?:№\s*)?\d+|зач(?:ало|\.)?\s*(?:№\s*)?\d*)$/iu.test(
          normalizeLectionaryLabel(label)
        )
          ? ' '
          : match
    )
    // '**(Заⷱ҇ 2)**' contains Markdown asterisks that Ponomar may
    // render as detached ornamental circles after the rubric is removed.
    .replace(/(^|[\s\u00a0])(?:\*{2}[ \t]*){2,}(?=$|[\s\u00a0])/gu, '$1')
    .replace(
      /(^|[\s\u00a0])(?:[°º˚◦∘○◌◯⁰][\s\u00a0\u200b\u2060]*){2,}/gu,
      '$1'
    )
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

export const cleanCalendarTraditionalBibleVerse = (value) => {
  // Also handle the malformed rubric 'З°°(ачало 1)°°' at the start
  // of any displayed verse, not only chapter verse 1.
  const withoutLeadingRubric = String(value || '').replace(
    /^[\s\p{P}\p{S}]*з[\s\p{P}\p{S}\p{M}]*(?:а[\s\p{P}\p{S}\p{M}]*)?ч[\s\p{P}\p{S}\p{M}]*а[\s\p{P}\p{S}\p{M}]*л[\s\p{P}\p{S}\p{M}]*о\s*(?:№\s*)?\d+[\s\p{P}\p{S}]*/iu,
    ''
  );
  return stripInlineLectionaryMarkers(withoutLeadingRubric);
};
