// Build ordinary personal-prayer pages for the same selectable WebView reader
// used by Akathists, canons, Bible verses and prayer rules. No TextInput here.
import {presentPersonalPrayer} from './personalPrayerPresentation';

export const buildPersonalPrayerReadingDocument = ({
  book, items, bookSyncId, sourceIdForSync, savedItems = [],
}) => {
  let nextId = 1;
  const sections = (items || []).filter(item =>
    item?.prayer && String(item.prayer.text || '').trim()
  ).map(item => {
    const prayer = item.prayer;
    const numericId = sourceIdForSync(prayer.sync_id);
    const presentation = presentPersonalPrayer(prayer);
    return {
      className: 'personal-prayer-section',
      progressAnchorId: numericId,
      trackProgress: false,
      title: presentation.title,
      rows: [{
        layout: 'stack',
        blocks: [{
          id: nextId++,
          text: presentation.text,
          className: 'personal-prayer',
          sourceType: 'personal_prayer',
          sourceId: numericId,
          anchorType: 'personal_prayer',
          anchorId: numericId,
          fullSaveType: 'prayer',
          sourceTitle: String(book?.title || 'Мой молитвослов'),
          itemTitle: presentation.listTitle,
          metadata: {
            book_sync_id: bookSyncId,
            prayer_sync_id: prayer.sync_id,
          },
        }],
      }],
    };
  });
  return {
    // The FixedSectionHeader already shows the book name. Do not repeat it
    // above the first prayer (or expose user-created book notes as a heading).
    title: '',
    description: '',
    progressAnchorType: 'personal_prayer',
    savedItems,
    sections,
  };
};
