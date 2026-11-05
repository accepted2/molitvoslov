/**
 * Structural completeness for the currently selected canon variant.
 *
 * A Russian translation is shown only when EVERY text-bearing Church
 * Slavonic section has a nonempty Russian translation. This includes
 * refrains and prayers. A heading-only section needs no translation.
 * This check says nothing about translation quality or proofreading.
 */
export const getCanonRussianCoverage = (sections = []) => {
  const required = (Array.isArray(sections) ? sections : []).filter(
    section => !!section?.text?.content?.trim()
  );
  const missing = required.filter(section => !section?.text?.translation?.trim());
  return {
    complete: required.length > 0 && missing.length === 0,
    total: required.length,
    translated: required.length - missing.length,
    missingSectionIds: missing.map(section => section.id),
  };
};
