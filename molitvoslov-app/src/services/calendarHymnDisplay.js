// Offline saint-card hymn script presentation.
// Source format: standard civil text OR decoded Church Slavonic Unicode.
// Never change a hymn's wording or translate it here.
export const isChurchSlavonicHymn = (text, scriptHint = '') => {
  if (scriptHint === 'csl') return true;
  if (scriptHint === 'civil') return false;
  return typeof text === 'string' &&
    /[ѣѢѡѠѻѺѿѾꙋꙊꙗꙖѧѦѳѲѵѴѯѱЅѕ]|[\u0483\u0486\u0487\u2de0-\u2dff]/u.test(text);
};
