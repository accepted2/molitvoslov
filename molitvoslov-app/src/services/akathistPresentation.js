// Presentation-only ordering. Never change canonical offline akathist data.
const isPart = (section, type, number) =>
  section?.section_type === type && Number(section.number) === number;

/**
 * The traditional reading order repeats Ikos 1 and Kontakion 1 after
 * Kontakion 13. Use the original section objects so their prayer text and
 * anchors stay canonical. "repeated" disables reading-progress tracking
 * for the additional copy without changing its source section ID.
 */
export const prepareAkathistSections = (input) => {
  const sections = Array.isArray(input) ? input : [];
  const original = sections.map(section => ({section, repeated: false}));
  const thirteenth = sections.findIndex(section => isPart(section, 'kontakion', 13));
  const firstIkos = sections.find(section => isPart(section, 'ikos', 1));
  const firstKontakion = sections.find(section => isPart(section, 'kontakion', 1));

  // Without the source texts there is nothing truthful to repeat.
  if (thirteenth < 0 || !firstIkos || !firstKontakion) return original;

  const afterThirteenth = sections.slice(thirteenth + 1);
  const firstTailIkos = afterThirteenth.find(section => isPart(section, 'ikos', 1));
  const firstTailKontakion = afterThirteenth.find(section => isPart(section, 'kontakion', 1));

  // Any repeats already present after Kontakion 13 are moved into the
  // expected position, rather than displayed twice at the end.
  const otherTail = afterThirteenth.filter(
    section => !isPart(section, 'ikos', 1) && !isPart(section, 'kontakion', 1)
  );

  return [
    ...original.slice(0, thirteenth + 1),
    {section: firstTailIkos || firstIkos, repeated: true},
    {section: firstTailKontakion || firstKontakion, repeated: true},
    ...otherTail.map(section => ({section, repeated: false})),
  ];
};
