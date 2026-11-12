import hoursTexts from '../data/hoursTexts.json';
import {READER_LANGUAGE_MODES, buildReaderLanguageOptions} from './readerLanguageModes';

// Each segment holds corresponding source-language paragraphs in the same
// reading order; no translation is synthesized from the other language.
const MISSING = {
  church: 'Церковнославянский текст этого часа пока не добавлен.',
  russian: 'Русский текст этого часа пока не добавлен.',
  traditional: 'Традиционное церковнославянское написание этого часа пока не добавлено.',
};

export const getOfflineHoursText = (entryId) => hoursTexts.entries?.[entryId] || null;

const isText = (value) => typeof value === 'string' && !!value.trim();

export const getHoursLanguageAvailability = (content) => {
  const segments = (content?.sections || []).flatMap((section) => section.rows || []);
  return {
    hasChurch: segments.some((row) => isText(row.church)),
    hasRussian: segments.some((row) => isText(row.russian)),
    hasTraditional: segments.some((row) => isText(row.traditional)),
  };
};

const createBlock = ({entry, row, sectionTitle, language, text, id}) => ({
  id,
  text,
  className: language === 'russian' ? 'secondary' : '',
  sourceType: 'hours',
  sourceId: entry.sourceId,
  anchorType: 'hours_row',
  anchorId: id,
  sourceTitle: entry.title,
  itemTitle: sectionTitle || entry.title,
  fullSaveType: 'hours_row',
  metadata: {language, entryId: entry.id, groupId: entry.groupId},
});

export const buildHoursDocument = ({entry, content, viewMode}) => {
  const available = getHoursLanguageAvailability(content);
  const sections = [];
  let blockId = 0;

  const make = (row, field, sectionTitle) => createBlock({
    entry,
    row,
    sectionTitle,
    language: field,
    text: isText(row[field]) ? row[field].trim() : MISSING[field],
    id: ++blockId,
  });

  if (!Array.isArray(content?.sections) || !content.sections.length) {
    return {
      title: entry.title,
      description: '',
      progressAnchorType: 'hours_row',
      sections: [],
      savedItems: [],
      viewSwitcher: {
        activeKey: viewMode,
        options: buildReaderLanguageOptions({hasChurch: true, hasRussian: true, hasTraditional: true}),
      },
    };
  }

  for (const [index, item] of content.sections.entries()) {
    const title = String(item.title || '').trim();
    const rows = (item.rows || []).map((row) => {
      let blocks;
      if (viewMode === READER_LANGUAGE_MODES.RUSSIAN) {
        blocks = [make(row, 'russian', title)];
      } else if (viewMode === READER_LANGUAGE_MODES.TRADITIONAL) {
        blocks = [make(row, 'traditional', title)];
      } else if (viewMode === READER_LANGUAGE_MODES.BOTH) {
        blocks = [make(row, 'church', title), make(row, 'russian', title)];
      } else {
        blocks = [make(row, 'church', title)];
      }
      return {layout: 'stack', blocks};
    });
    if (rows.length) {
      sections.push({
        title,
        progressAnchorId: index + 1,
        trackProgress: true,
        rows,
      });
    }
  }

  return {
    title: entry.title,
    description: '',
    progressAnchorType: 'hours_row',
    sections,
    savedItems: [],
    // Display all four familiar tabs; a missing variant always says so
    // explicitly instead of silently repeating a different language.
    viewSwitcher: {
      activeKey: viewMode,
      options: buildReaderLanguageOptions({hasChurch: true, hasRussian: true, hasTraditional: true}),
    },
    available,
  };
};
