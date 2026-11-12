import hoursTexts from '../data/hoursTexts.json';
import {READER_LANGUAGE_MODES, buildReaderLanguageOptions} from './readerLanguageModes';

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

  const sourceSections = viewMode === READER_LANGUAGE_MODES.TRADITIONAL
    ? content?.traditionalSections
    : content?.sections;

  const createBlock = ({id, language, text, title}) => ({
    id,
    text,
    className: language === 'russian' ? 'secondary' : '',
    sourceType: 'hours',
    sourceId: entry.sourceId,
    anchorType: 'hours_row',
    anchorId: id,
    sourceTitle: entry.title,
    itemTitle: title || entry.title,
    fullSaveType: 'hours_row',
    metadata: {language, entryId: entry.id, groupId: entry.groupId},
  });

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
  for (const [sectionIndex, section] of sourceSections.entries()) {
    const title = String(section.title || '').trim();
    const rows = [];
    for (const [rowIndex, row] of (section.rows || []).entries()) {
      const id = (sectionIndex + 1) * 10000 + (rowIndex + 1) * 10;
      const block = (field, suffix) => createBlock({
        id: id + suffix,
        language: field,
        text: isText(row[field]) ? row[field].trim() : MISSING[field],
        title,
      });
      let blocks;
      if (viewMode === READER_LANGUAGE_MODES.RUSSIAN) {
        blocks = [block('russian', 2)];
      } else if (viewMode === READER_LANGUAGE_MODES.TRADITIONAL) {
        blocks = [block('traditional', 3)];
      } else if (viewMode === READER_LANGUAGE_MODES.BOTH) {
        blocks = [block('church', 1), block('russian', 2)];
      } else {
        blocks = [block('church', 1)];
      }
      rows.push({layout: 'stack', blocks});
    }
    if (rows.length) {
      sections.push({
        title,
        progressAnchorId: sectionIndex + 1,
        trackProgress: true,
        rows,
      });
    }
  }

  return {...base, sections, available};
};
