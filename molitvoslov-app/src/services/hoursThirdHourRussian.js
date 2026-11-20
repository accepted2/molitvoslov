// User-supplied Russian Third Hour, paired row-for-row with the shipped CS
// edition. The original CS Psalms/verses are NEVER rewritten.
// The First Hour's existing Russian Saint Ephrem prayer is reused by reference
// (cloned for the Third Hour, with its own independent accordion state).
import thirdHourChurch from '../data/hoursThirdHourEditorial.json';
import thirdHourRussian from '../data/hoursThirdHourRussian.json';
import firstHourRussian from '../data/hoursFirstHourRussian.json';

const russianRows = (churchSection, russianSection, sectionIndex) => {
  if (!russianSection || churchSection.rows.length !== russianSection.rows.length) {
    throw new Error('Third Hour Russian/Church Slavonic row mismatch at section ' + sectionIndex);
  }
  return churchSection.rows.map((sourceRow, rowIndex) => {
    const russianRow = russianSection.rows[rowIndex];
    if (!russianRow || typeof russianRow.russian !== 'string' || !russianRow.russian.trim()) {
      throw new Error('Third Hour Russian source missing at ' + sectionIndex + ':' + rowIndex);
    }
    return {
      ...sourceRow,
      russian: russianRow.russian,
      ...(russianRow.heading ? {russianHeading: russianRow.heading} : {}),
      ...(russianRow.presentation ? {russianPresentation: russianRow.presentation} : {}),
      // Per-language divider overrides never alter the original CS rows.
      ...(russianRow.dividerAfter === true ? {dividerAfter: true} : {}),
      ...(russianRow.preserveLineBreaks ? {russianPreserveLineBreaks: true} : {}),
    };
  });
};

const originals = () => {
  if (thirdHourRussian.entryId !== 'ordinary-3' ||
      thirdHourRussian.sections.length !== thirdHourChurch.sections.length) {
    throw new Error('Invalid Third Hour Russian section mapping');
  }
  return thirdHourChurch.sections.map((churchSection, index) => ({
    ...churchSection,
    originalSectionIndex: index,
    rows: russianRows(churchSection, thirdHourRussian.sections[index], index),
    ...(thirdHourRussian.sections[index].title
      ? {russianTitle: thirdHourRussian.sections[index].title} : {}),
  }));
};

const ephremSection = () => {
  const firstHourEphrem = firstHourRussian.afterPsalms.find(section =>
    section.accordionId === 'first-hour-ephrem');
  if (!firstHourEphrem || firstHourEphrem.rows.length < 8) {
    throw new Error('First Hour Russian Saint Ephrem prayer is missing');
  }
  return {
    ...firstHourEphrem,
    accordionId: 'third-hour-ephrem',
    originalSectionIndex: 13,
    rows: firstHourEphrem.rows.map(row => ({...row})),
  };
};

// Both RU and CS+RU follow the same liturgical order:
// Lenten Third-Hour tropar -> blessing -> Trisagion / Lord's Prayer ->
// Kontakion -> conditional fasting troparia. "Господь Бог благословен"
// appears exactly once. originalSectionIndex preserves every old row anchor.
export const getThirdHourRussianSections = (_viewMode = 'russian') => {
  const sections = originals();
  const ephrem = ephremSection();
  return [...sections.slice(0, 12), ephrem, sections[12]];
};

export const getThirdHourRussianSource = () => thirdHourRussian;
