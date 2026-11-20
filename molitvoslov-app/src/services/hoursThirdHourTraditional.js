// Full user-supplied traditional Church Slavonic Third Hour.
// All source strings are embedded in hoursThirdHourTraditional.json unchanged.
// The original Third Hour (CS), verified RU translation and imported Bible
// are never modified. Stable original section/row anchors are inherited.
import thirdHourChurch from '../data/hoursThirdHourEditorial.json';
import traditional from '../data/hoursThirdHourTraditional.json';
import firstHourRussian from '../data/hoursFirstHourRussian.json';

const sourceSections = () => {
  if (traditional.entryId !== 'ordinary-3' || traditional.sections.length !== 13 ||
      thirdHourChurch.sections.length !== 13) {
    throw new Error('Traditional Third Hour section mapping is incomplete');
  }
  return thirdHourChurch.sections.map((section, index) => {
    const target = traditional.sections[index];
    if (!target || target.rows.length !== section.rows.length) {
      throw new Error('Traditional Third Hour row mismatch in section ' + index);
    }
    return {
      ...section,
      originalSectionIndex: index,
      ...(target.title ? {traditionalTitle: target.title} : {}),
      rows: section.rows.map((row, rowIndex) => {
        const supplied = target.rows[rowIndex];
        if (!supplied || typeof supplied.traditional !== 'string' ||
            !supplied.traditional.trim()) {
          throw new Error('Missing traditional Third Hour text at ' + index + ':' + rowIndex);
        }
        return {
          ...row,
          traditional: supplied.traditional,
          ...(supplied.traditionalHeading
            ? {traditionalHeading: supplied.traditionalHeading} : {}),
          ...(supplied.traditionalSplitAfter
            ? {traditionalSplitAfter: supplied.traditionalSplitAfter} : {}),
          ...(supplied.traditionalPresentation
            ? {traditionalPresentation: supplied.traditionalPresentation} : {}),
          ...(supplied.traditionalDividerAfter
            ? {traditionalDividerAfter: true} : {}),
          ...(supplied.traditionalPreserveLineBreaks
            ? {traditionalPreserveLineBreaks: true} : {}),
        };
      }),
    };
  });
};

const ephremSection = () => {
  const source = firstHourRussian.afterPsalms.find(s => s.accordionId === 'first-hour-ephrem');
  const supplied = traditional.ephrem;
  if (!source || !supplied || source.rows.length !== supplied.rows.length) {
    throw new Error('Traditional Saint Ephrem rows cannot be paired with First Hour');
  }
  return {
    ...source,
    title: supplied.title,
    traditionalTitle: supplied.title,
    originalSectionIndex: 13,
    accordionId: 'third-hour-ephrem',
    rows: source.rows.map((row, index) => ({
      ...row, traditional: supplied.rows[index].traditional,
    })),
  };
};

// The traditional reader has exactly the order confirmed in the full TXT:
// Lenten tropar, blessing, Trisagion, Kondak, fasting tropar, concluding
// prayers, Saint Ephrem, Saint Mardarius.
export const getThirdHourTraditionalSections = () => {
  const sections = sourceSections();
  return [...sections.slice(0, 12), ephremSection(), sections[12]];
};

export const getThirdHourTraditionalSource = () => traditional;

// UTF-16 spans for existing WebView mark-up. This custom matcher is needed
// because First Hour's regex is tied to different abbreviations/orthography.
// Never normalize or rewrite strings: the original accent and titlo indices
// remain exact for selecting, copying, bookmarks and sharing.
export const getThirdHourTraditionalMarks = (text, presentation = '') => {
  if (!text || presentation === 'comment') return [];
  const ranges = [];
  const add = (match, kind) => {
    if (match && match[0].length) ranges.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      kind,
    });
  };
  add(/^(?:Сщ҃е́нникъ:|Чте́цъ:)/u.exec(text), 'speaker');
  if (/^Сла́ва /u.test(text) && text.length < 175) {
    add(/^Сла́ва .+/u.exec(text), 'devotional');
  }
  if (/^И҆ ны́нѣ/u.test(text) && text.length < 175) {
    add(/^И҆ ны́нѣ.+/u.exec(text), 'devotional');
  }
  if (/^А҆ллилꙋ́їѧ/u.test(text)) {
    const at = text.lastIndexOf(' (');
    add({index: 0, 0: text.slice(0, at < 0 ? text.length : at)}, 'devotional');
  }
  if (/^Гдⷭ҇и,\s+поми́лꙋй/u.test(text)) {
    add(/^Гдⷭ҇и,\s+поми́лꙋй\./u.exec(text), 'mercy');
  }
  add(/^(?:Бг҃оро́диченъ:|Тропа́рь днѧ̀|Трист҃о́е\.)/u.exec(text), 'cue');
  add(/^Сті́хъ [ав]҃:/u.exec(text), 'cue');
  const endCount = /\s*(\((?:г҃|в҃і|м҃|Три́жды|Покло́нъ)\))\s*$/u.exec(text);
  if (endCount) {
    const offset = endCount.index + endCount[0].indexOf('(');
    ranges.push({start: offset, end: offset + endCount[1].length, kind: 'repeat'});
  }
  return ranges.sort((a,b)=>a.start-b.start||b.end-a.end).filter((current,index,all)=>
    !all.slice(0,index).some(prev=>current.start<prev.end && prev.start<current.end));
};
