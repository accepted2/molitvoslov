import hoursTexts from '../data/hoursTexts.json';
import {READER_LANGUAGE_MODES, buildReaderLanguageOptions} from './readerLanguageModes';
import {
  classifyHoursRow,
  classifyHoursSection,
  collectHoursTextMarks,
} from './hoursTypography';
import {getEditedFirstHour} from './hoursFirstHourEditorial';

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

export const buildHoursDocument = ({entry, content, viewMode}) => {
  const available = getHoursLanguageAvailability(content);
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

  const firstHourEdit = entry.id === 'ordinary-1'
    ? getEditedFirstHour(content)
    : {applied: false};
  const useFirstHourEdit = firstHourEdit.applied &&
    (viewMode === READER_LANGUAGE_MODES.CHURCH ||
      viewMode === READER_LANGUAGE_MODES.BOTH);
  const sourceSections = viewMode === READER_LANGUAGE_MODES.TRADITIONAL
    ? content?.traditionalSections
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
  }) => {
    const kind = classifyHoursRow({text, sectionKind});
    const visualNote = [
      'comment', 'placeholder', 'rubric-label', 'liturgical-label',
    ].includes(presentation) ? presentation : '';
    const hoursMarks = visualNote ? [] : collectHoursTextMarks(text);
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
        language === 'russian' ? 'secondary' : '',
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
          presentation: row.presentation,
          redInitial: row.redInitial === true,
          accentPrefix: row.accentPrefix || '',
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
  const missingNote = useFirstHourEdit && viewMode === READER_LANGUAGE_MODES.BOTH
    ? ''
    : incompleteTranslation
      ? (available.hasRussian
        ? 'Часть фрагментов русского перевода пока отсутствует.'
        : 'Русский текст этого часа пока не добавлен.')
      : '';
  return {...base, description: missingNote, sections, available};
};
