// Calendar hymns may be plain Russian/UK or genuine Church Slavonic Unicode.
// Real Church Slavonic text is rendered with Ponomar; old UCS8 must first be
// converted during offline export. Never force civilian text through Ponomar.
export const isCalendarHymnCsl = (text, script) => {
  if (script === 'csl') return true;
  // Historical records may still have the default 'civil' marker despite
  // containing Church Slavonic glyphs. Detect those glyphs as a safe fallback.
  return /[\u0483\u0486\u0487\u2de0-\u2dffѣѡѻѿꙋꙗѧѵѳѯѱ]/iu.test(String(text || ''));
};

export const getLocalizedHymnField = (feast, key, language = 'ru') => {
  if (!feast) return '';
  if (language === 'uk' && feast[key + '_uk']) return feast[key + '_uk'];
  return feast[key] || '';
};

export const getLocalizedHymnScript = (feast, key, language = 'ru') => {
  if (!feast) return undefined;
  if (language === 'uk' && feast[key + '_uk']) {
    return feast[key + '_uk'];
  }
  return feast[key];
};
