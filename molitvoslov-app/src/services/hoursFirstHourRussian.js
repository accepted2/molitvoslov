import russianEdition from '../data/hoursFirstHourRussian.json';

// Read-only text corpus created from the user's complete Russian First Hour.
// Other liturgical Hours continue to use their imported offline texts.
const cloneSection = (section) => ({
  ...section,
  rows: (section.rows || []).map(row => ({...row})),
});

export const getFirstHourRussianSections = () => [
  cloneSection(russianEdition.opening),
  ...russianEdition.psalms.map(cloneSection),
  ...russianEdition.afterPsalms.map(cloneSection),
];

/** Never pair unrelated paragraphs merely because they share an index. */
const sameRowCount = (a, b) =>
  Array.isArray(a?.rows) && Array.isArray(b?.rows) &&
  a.rows.length === b.rows.length;

const copyRows = rows => (rows || []).map(row => ({...row}));

export const pairFirstHourSections = ({churchSections, russianSections}) => {
  if (!Array.isArray(churchSections) || !Array.isArray(russianSections) ||
      churchSections.length !== russianSections.length) return null;

  return churchSections.map((cs, index) => {
    const ru = russianSections[index];
    const sameKind = cs.kind === ru.kind ||
      !cs.kind || !ru.kind;
    const sameGroup = (cs.accordionId || null) === (ru.accordionId || null);

    if (!sameKind || !sameGroup) {
      return null;
    }
    const matched = sameRowCount(cs, ru);
    const rows = matched
      ? cs.rows.map((row, rowIndex) => ({
          ...row,
          russian: ru.rows[rowIndex].russian,
          // Source text stays language-specific. Split metadata allows the
          // renderer to color each language without editing its words.
          russianPresentation: ru.rows[rowIndex].presentation || '',
          russianAccentPrefix: ru.rows[rowIndex].accentPrefix || '',
          russianRedInitial: ru.rows[rowIndex].redInitial === true,
          dividerAfter: row.dividerAfter === true ||
            ru.rows[rowIndex].dividerAfter === true,
          compactAfter: row.compactAfter === true ||
            ru.rows[rowIndex].compactAfter === true,
        }))
      : [
          ...copyRows(cs.rows),
          ...copyRows(ru.rows),
        ];
    return {
      ...cs,
      rows,
      // A heading appears once. The same five accordions work in all modes.
      pairedRussian: true,
      pairedByRow: matched,
    };
  });
};
