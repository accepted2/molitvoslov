import {getSavedItems, saveItem} from './savedItems';

const sameBookmark = (item, position) => {
  if (
    item.save_type !== 'bookmark' ||
    item.anchor_type !== position.anchorType ||
    Number(item.anchor_id) !== Number(position.anchorId)
  ) {
    return false;
  }

  const savedOffset = Number(item.metadata?.bookmark_offset || 0);
  const currentOffset = Number(position.offset || 0);

  return Math.abs(savedOffset - currentOffset) < 32;
};

export const saveReadingBookmark = async ({
  sourceType,
  sourceId,
  sourceTitle = '',
  itemTitle = '',
  position,
  metadata = {},
}) => {
  if (!sourceType || !sourceId || !position?.anchorType || !position?.anchorId) {
    throw new Error('Текущая позиция чтения ещё не определена.');
  }

  const existing = await getSavedItems({
    source_type: sourceType,
    source_id: sourceId,
    save_type: 'bookmark',
  });

  const duplicate = existing.find((item) => sameBookmark(item, position));

  if (duplicate) {
    return {
      item: duplicate,
      created: false,
    };
  }

  const saved = await saveItem({
    save_type: 'bookmark',
    source_type: sourceType,
    source_id: sourceId,
    anchor_type: position.anchorType,
    anchor_id: position.anchorId,
    source_title: sourceTitle,
    item_title: itemTitle,
    text: '',
    start_offset: null,
    end_offset: null,
    metadata: {
      ...(position.metadata || {}),
      ...(metadata || {}),
      bookmark_offset: Math.max(0, Number(position.offset || 0)),
      progress_percent: Math.max(
        0,
        Math.min(100, Math.round(Number(position.progressPercent || 0)))
      ),
    },
  });

  return {
    item: saved,
    created: true,
  };
};
