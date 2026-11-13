import hoursTexts from '../data/hoursTexts.json';
import {READER_LANGUAGE_MODES, buildReaderLanguageOptions} from './readerLanguageModes';
import {
  classifyHoursRow,
  classifyHoursSection,
  collectHoursTextMarks,
} from './hoursTypography';
import {getEditedFirstHour} from './hoursFirstHourEditorial';
import {
  getFirstHourRussianSections,
  pairFirstHourSections,
} from './hoursFirstHourRussian';

const MISSING = {
  church: 'Церковнославянский текст этого часа пока не добавлен.',
  russian: 'Русский текст этого часа пока не добавлен.',
  traditional: 'Текст этого часа в традиционном церковнославянском написании пока не добавлен.',
};
const isText = (value) => typeof value === 'string' && !!value.trim();
const allRows = (sections) =>
  (Array.isArray(sections) ? sections : []).flatMap((section) => section.rows || []);

export const getOfflineHoursText = (entryId) => hoursTexts.entries?.[entryId] || null;

export const getHoursLanguageAvailability = (content) => {
  const rows = allRows(content?.sections);
  const traditional = allRows(content?.traditionalSections);
  return {
    hasChurch: rows.some((row) => isText(row.church)),
    hasRussian: rows.some((row) => isText(row.russian)),
    hasTraditional: traditional.some((row) => isText(row.traditional)),
  };
};

// Highlight complete doxologies in the *standalone Russian First Hour*.
// All marks are source offsets: no words are inserted and the original text
// remains selectable. Explicit commentary is never liturgically accented.
export const getFirstHourRussianRedMarks = (text) => {
  const patterns = [
    /Слава\s+Отцу,?\s+и\s+Сыну,?\s+и\s+Святому\s+Духу(?:,?\s+и\s+ныне\s+и\s+присно\s+и\s+во\s+веки\s+веков\.?\s+Аминь\.?)?/giu,
    /И\s+ныне\s+и\s+присно\s+и\s+во\s+веки\s+веков\.?\s+Аминь\.?/giu,
    /слава\s+Тебе,?\s+Боже/giu,
  ];
  const found = patterns.flatMap(pattern =>
    [...text.matchAll(pattern)].map(match => ({
      start: match.index,
      end: match.index + match[0].length,
      kind: 'devotional',
    }))
  );
  // When an entire Glory-and-Now is red, don't add its inner Now twice.
  return found.sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((mark, index, all) => !all.slice(0, index).some(
      previous => previous.start <= mark.start && previous.end >= mark.end
    ));
};

export const buildHoursDocument = ({entry, content, viewMode}) => {
  const isFirstHour = entry.id === 'ordinary-1';
  const available = {
    ...getHoursLanguageAvailability(content),
    ...(isFirstHour ? {hasRussian: true} : {}),
  };
  const options = buildReaderLanguageOptions({
    hasChurch: true,
    hasRussian: true,
    hasTraditional: true,
  });
  const base = {
    title: entry.title,
    description: '',
    progressAnchorType: 'hours_row',
    savedItems: [],
    viewSwitcher: {activeKey: viewMode, options},
  };

  const selectedModeField = viewMode === READER_LANGUAGE_MODES.RUSSIAN
    ? 'russian'
    : viewMode === READER_LANGUAGE_MODES.TRADITIONAL
      ? 'traditional'
      : 'church';
  const hasSelectedText = selectedModeField === 'russian'
    ? available.hasRussian
    : selectedModeField === 'traditional'
      ? available.hasTraditional
      : available.hasChurch;

  const firstHourEdit = isFirstHour
    ? getEditedFirstHour(content)
    : {applied: false};
  const firstHourRussian = isFirstHour ? getFirstHourRussianSections() : null;
  const useFirstHourEdit = firstHourEdit.applied &&
    (viewMode === READER_LANGUAGE_MODES.CHURCH ||
      viewMode === READER_LANGUAGE_MODES.BOTH);
  const bilingualFirstHour = useFirstHourEdit &&
    viewMode === READER_LANGUAGE_MODES.BOTH && firstHourRussian
      ? pairFirstHourSections({
          churchSections: firstHourEdit.sections,
          russianSections: firstHourRussian,
        })
      : null;
  const sourceSections = viewMode === READER_LANGUAGE_MODES.TRADITIONAL
    ? content?.traditionalSections
    : isFirstHour && viewMode === READER_LANGUAGE_MODES.RUSSIAN
      ? firstHourRussian
      : bilingualFirstHour?.every(Boolean)
        ? bilingualFirstHour
        : useFirstHourEdit
          ? firstHourEdit.sections
          : content?.sections;
  // Only section headings lose their incidental underline/colon.
  // Punctuation inside prayers, verses and dialogue is never edited.
  const cleanHeading = value => String(value || '')
    .replace(/[\u0332\u0333]/gu, '')
    .replace(/^[_\s]+|[_\s]+$/gu, '')
    .replace(/[:：]+\s*$/u, '')
    .trim();

  const createBlock = ({
    id, language, text, title, sectionKind = 'general', opening = false,
    presentation = '', redInitial = false, accentPrefix = '',
    preserveLineBreaks = false,
  }) => {
    const kind = classifyHoursRow({text, sectionKind});
    const visualNote = [
      'comment', 'placeholder', 'rubric-label', 'liturgical-label',
      'liturgical-red', 'left-response', 'liturgical-prayers', 'plain-prayer',
      'choir-response', 'final-trinity',
    ].includes(presentation) ? presentation : '';
    // For the final choir doxology only the speaker cue is red.
    // Other full doxologies keep their normal liturgical red emphasis.
    const isComment = visualNote === 'comment';
    const hoursMarks = visualNote === 'choir-response'
      ? collectHoursTextMarks(text).filter(mark => mark.kind === 'speaker')
      : visualNote && !['left-response', 'liturgical-prayers'].includes(visualNote)
        ? []
        : collectHoursTextMarks(text);
    if (isFirstHour && language === 'russian' &&
        viewMode === READER_LANGUAGE_MODES.RUSSIAN &&
        !isComment && visualNote !== 'plain-prayer' &&
        visualNote !== 'choir-response') {
      for (const mark of getFirstHourRussianRedMarks(text)) {
        // Prefer the complete rubric over shorter, overlapping highlights.
        for (let index = hoursMarks.length - 1; index >= 0; index--) {
          if (hoursMarks[index].start < mark.end &&
              mark.start < hoursMarks[index].end) hoursMarks.splice(index, 1);
        }
        hoursMarks.push(mark);
      }
      hoursMarks.sort((a, b) => a.start - b.start || a.end - b.end);
    }
    // Only a specifically indicated cue is colored. Source punctuation,
    // paragraph text, and the original UTF-16 selection indices are unchanged.
    if (accentPrefix && text.startsWith(accentPrefix)) {
      const prefixEnd = accentPrefix.length;
      for (let i = hoursMarks.length - 1; i >= 0; i--) {
        if (hoursMarks[i].start < prefixEnd && hoursMarks[i].end > 0) {
          hoursMarks.splice(i, 1);
        }
      }
      hoursMarks.unshift({start: 0, end: prefixEnd, kind: 'cue'});
    }
    // Color the initial glyph inline instead of using ::first-letter:
    // a pseudo-letter can become a separate floated glyph in Android WebView.
    const colorInitial = redInitial === true ||
      (opening && kind === 'psalm') || sectionKind === 'opening';
    if (colorInitial && !hoursMarks.some(mark => mark.start === 0) && text) {
      let end = String.fromCodePoint(text.codePointAt(0)).length;
      while (end < text.length && /[\u0300-\u036f\u0483-\u0489]/u.test(text[end])) end++;
      hoursMarks.unshift({start: 0, end, kind: 'initial'});
    }
    return {
      id,
      text,
      className: [
        'hours-text',
        'hours-' + language,
        'hours-' + kind,
        language === 'russian' && viewMode === READER_LANGUAGE_MODES.BOTH
          ? 'secondary hours-russian-parallel'
          : language === 'russian'
            ? 'hours-russian-primary'
            : '',
        preserveLineBreaks === true ? 'hours-preserve-line-breaks' : '',
        opening && kind === 'psalm' ? 'hours-psalm-opening' : '',
        visualNote ? 'hours-presentation-' + visualNote : '',
      ].filter(Boolean).join(' '),
      hoursMarks,
      sourceType: 'hours',
      sourceId: entry.sourceId,
      anchorType: 'hours_row',
      anchorId: id,
      sourceTitle: entry.title,
      itemTitle: title || entry.title,
      fullSaveType: 'hours_row',
      metadata: {language, entryId: entry.id, groupId: entry.groupId},
    };
  };

  // Prevent repeating "no translation" for every paragraph.
  if ((!hasSelectedText && viewMode !== READER_LANGUAGE_MODES.BOTH) ||
      !Array.isArray(sourceSections) || !sourceSections.length) {
    const field = selectedModeField;
    const text = MISSING[field];
    return {
      ...base,
      sections: [{
        title: '',
        progressAnchorId: 1,
        trackProgress: false,
        rows: [{
          layout: 'stack',
          blocks: [createBlock({id: 1, language: field, text, title: ''})],
        }],
      }],
      available,
    };
  }

  const sections = [];
  let missingRussianRows = 0;
  for (const [sectionIndex, section] of sourceSections.entries()) {
    const title = cleanHeading(section.title);
    const sectionKind = section.kind || classifyHoursSection(title);
    const rows = [];
    for (const [rowIndex, row] of (section.rows || []).entries()) {
      const id = (sectionIndex + 1) * 10000 + (rowIndex + 1) * 10;
      const block = (field, suffix) => {
        if (!isText(row?.[field])) return null;
        return createBlock({
          id: id + suffix,
          language: field,
          text: row[field].trim(),
          title,
          sectionKind,
          opening: rowIndex === 0,
          presentation: field === 'russian'
            ? (row.russianPresentation || row.presentation)
            : row.presentation,
          redInitial: field === 'russian'
            ? (row.russianRedInitial ?? (row.redInitial === true))
            : row.redInitial === true,
          accentPrefix: field === 'russian'
            ? (row.russianAccentPrefix || row.accentPrefix || '')
            : row.accentPrefix || '',
          preserveLineBreaks: field === 'russian'
            ? (row.russianPreserveLineBreaks ?? (row.preserveLineBreaks === true))
            : row.preserveLineBreaks === true,
        });
      };
      let blocks;
      if (viewMode === READER_LANGUAGE_MODES.RUSSIAN) {
        const russian = block('russian', 2);
        if (!russian && isText(row?.church)) missingRussianRows += 1;
        blocks = [russian];
      } else if (viewMode === READER_LANGUAGE_MODES.TRADITIONAL) {
        blocks = [block('traditional', 3)];
      } else if (viewMode === READER_LANGUAGE_MODES.BOTH) {
        const church = block('church', 1);
        const russian = block('russian', 2);
        if (!russian && church) missingRussianRows += 1;
        blocks = [church, russian];
      } else {
        blocks = [block('church', 1)];
      }
      // Do not repeat an invented translation for every absent paragraph.
      blocks = blocks.filter(Boolean);
      if (blocks.length) rows.push({
        layout: 'stack',
        blocks,
        dividerAfter: row.dividerAfter === true,
        compactAfter: row.compactAfter === true,
      });
    }
    if (rows.length) {
      sections.push({
        title,
        className: ['hours-section', 'hours-section-' + sectionKind,
          viewMode === READER_LANGUAGE_MODES.TRADITIONAL ? 'hours-traditional-section' : '',
          section.noBottomDivider === true ? 'hours-no-bottom-divider' : '',
          section.dividerBefore === true ? 'hours-divider-before' : '',
        ].filter(Boolean).join(' '),
        progressAnchorId: sectionIndex + 1,
        trackProgress: true,
        collapsible: section.collapsible === true,
        accordionId: section.accordionId || null,
        rows,
      });
    }
  }

  // No extra copy of the importer’s old ending in the combined reader.
  // Russian-only mode still reads its original offline source unchanged.
  const incompleteTranslation =
    (viewMode === READER_LANGUAGE_MODES.BOTH || viewMode === READER_LANGUAGE_MODES.RUSSIAN) &&
    missingRussianRows;
  const missingNote = bilingualFirstHour?.every(Boolean)
    ? ''
    : incompleteTranslation
      ? (available.hasRussian
        ? 'Часть фрагментов русского перевода пока отсутствует.'
        : 'Русский текст этого часа пока не добавлен.')
      : '';
  return {...base, description: missingNote, sections, available};
};
