// Completeness is a structural check only, not certification that the
// Russian language itself was translated or proofread.
export const getAkathistRussianCoverage = akathist => {
  // Imported translations explicitly marked as unreviewed must NEVER be
  // treated as certified, even when all 25 fields happen to be populated.
  const awaitingReview = akathist?.translation_review_status === 'unverified';
  const expected = [
    ...Array.from({length: 13}, (_, index) => 'kontakion:' + (index + 1)),
    ...Array.from({length: 12}, (_, index) => 'ikos:' + (index + 1)),
  ];
  const found = new Map();
  const prayerSections = [];
  for (const section of akathist?.sections || []) {
    const type = section.section_type;
    if (type === 'kontakion' || type === 'ikos') {
      const key = type + ':' + section.number;
      if (!found.has(key)) found.set(key, section);
    } else if (type === 'prayer') {
      prayerSections.push(section);
    }
  }
  const missingMain = expected.filter(key => !found.get(key)?.text?.translation?.trim());
  const missingPrayers = prayerSections.filter(
    item => item.text?.content?.trim() && !item.text?.translation?.trim()
  ).map(item => 'prayer:' + item.number);
  const special = [
    ['troparion', akathist?.troparion],
    ['kontakion_before', akathist?.kontakion_before],
  ];
  const missingSpecial = special
    .filter(([, item]) => item?.content?.trim() && !item?.translation?.trim())
    .map(([name]) => name);
  return {
    complete: Boolean(akathist) && !awaitingReview && missingMain.length === 0 &&
      missingPrayers.length === 0 && missingSpecial.length === 0,
    totalMain: expected.length,
    translatedMain: expected.length - missingMain.length,
    missingMain,
    missingPrayers,
    missingSpecial,
  };
};
