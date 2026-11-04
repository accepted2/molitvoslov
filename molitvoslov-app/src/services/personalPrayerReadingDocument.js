// Build ordinary personal-prayer pages for the same selectable WebView reader
// used by Akathists, canons, Bible verses and prayer rules. No TextInput here.
export const buildPersonalPrayerReadingDocument = ({
  book, items, bookSyncId, sourceIdForSync, savedItems = [],
}) => {
  let nextId = 1;
  const sections = (items || []).filter(item =>
    item?.prayer && String(item.prayer.text || '').trim()
  ).map(item => {
    const prayer = item.prayer;
    const numericId = sourceIdForSync(prayer.sync_id);
    return {
      className: 'personal-prayer-section',
      progressAnchorId: numericId,
      trackProgress: false,
      title: String(prayer.title || 'Молитва'),
      rows: [{
        layout: 'stack',
        blocks: [{
          id: nextId++,
          text: String(prayer.text),
          className: 'personal-prayer',
          sourceType: 'personal_prayer',
          sourceId: numericId,
          anchorType: 'personal_prayer',
          anchorId: numericId,
          fullSaveType: 'prayer',
          sourceTitle: String(book?.title || 'Мой молитвослов'),
          itemTitle: String(prayer.title || 'Молитва'),
          metadata: {
            book_sync_id: bookSyncId,
            prayer_sync_id: prayer.sync_id,
          },
        }],
      }],
    };
  });
  return {
    title: String(book?.title || 'Мой молитвослов'),
    description: String(book?.description || ''),
    progressAnchorType: 'personal_prayer',
    savedItems,
    sections,
  };
};
