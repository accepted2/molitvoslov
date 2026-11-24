// Church Slavonic display letters are visually shorter than standard UI fonts.
// This compensates ONLY for the app interface, never prayer reader content.
// Every size is derived from the existing interface scale supplied by caller.
export const traditionalUiTextStyle = (language, size, lineHeight) => {
  if (language !== 'csl_traditional') return null;
  const raw = Math.max(8, Number(size) || 16);
  const factor = raw <= 13 ? 1.18 : raw <= 19 ? 1.12 : 1.08;
  const fontSize = Math.ceil(raw * factor);
  const originalLineHeight = Math.max(raw * 1.30, Number(lineHeight) || 0);
  return {
    fontFamily: 'Ponomar',
    fontWeight: '400',
    fontSize,
    lineHeight: Math.max(Math.ceil(fontSize * 1.26), Math.ceil(originalLineHeight * 1.08)),
  };
};
