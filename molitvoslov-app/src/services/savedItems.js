import {
  getDatabase,
} from '../db/database';

import {
  getCurrentUser,
} from './localAuth';


const SAVE_TYPE_NAMES = {
  word: 'Слово',
  sentence: 'Предложение',
  paragraph: 'Абзац',
  fragment: 'Фрагмент',
  verse: 'Стих',
  section: 'Раздел',
  prayer: 'Молитва',
  psalm: 'Псалом',
  kathisma: 'Кафизма',
  chapter: 'Глава',
  akathist: 'Акафист',
  canon: 'Канон',
  text: 'Текст',
};


const parseMetadata =
  value => {
    if (!value) {
      return {};
    }

    if (
      typeof value ===
      'object'
    ) {
      return value;
    }

    try {
      return JSON.parse(
        value
      );
    } catch {
      return {};
    }
  };


const prepareItem =
  item => ({
    ...item,

    metadata:
      parseMetadata(
        item.metadata
      ),

    save_type_display:
      SAVE_TYPE_NAMES[
        item.save_type
      ] ||
      item.save_type,
  });


export const getSavedItems =
  async (params = {}) => {
    const user =
      await getCurrentUser();

    if (!user) {
      return [];
    }

    const db =
      await getDatabase();

    const conditions = [
      'user_id = ?',
    ];

    const values = [
      user.id,
    ];

    const allowedFilters = [
      'source_type',
      'source_id',
      'anchor_type',
      'anchor_id',
      'save_type',
    ];

    allowedFilters.forEach(
      field => {
        const value =
          params[field];

        if (
          value !== undefined &&
          value !== null &&
          value !== ''
        ) {
          conditions.push(
            `${field} = ?`
          );

          values.push(
            value
          );
        }
      }
    );

    const items =
      await db.getAllAsync(
        `
          SELECT *
          FROM saved_items
          WHERE ${conditions.join(
            ' AND '
          )}
          ORDER BY created_at DESC
        `,
        values
      );

    return items.map(
      prepareItem
    );
  };


export const saveItem =
  async payload => {
    const user =
      await getCurrentUser();

    if (!user) {
      throw new Error(
        'Для сохранения необходимо войти в аккаунт'
      );
    }

    const db =
      await getDatabase();

    const metadata =
      JSON.stringify(
        payload.metadata ||
        {}
      );

    const result =
      await db.runAsync(
        `
          INSERT INTO saved_items (
            user_id,
            save_type,
            source_type,
            source_id,
            anchor_type,
            anchor_id,
            source_title,
            item_title,
            text,
            start_offset,
            end_offset,
            metadata,
            created_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?
          )
        `,
        [
          user.id,
          payload.save_type,
          payload.source_type,
          payload.source_id,
          payload.anchor_type,
          payload.anchor_id,
          payload.source_title ||
            '',
          payload.item_title ||
            '',
          payload.text ||
            '',
          payload.start_offset ??
            null,
          payload.end_offset ??
            null,
          metadata,
          new Date().toISOString(),
        ]
      );

    const item =
      await db.getFirstAsync(
        `
          SELECT *
          FROM saved_items
          WHERE id = ?
          AND user_id = ?
        `,
        [
          result.lastInsertRowId,
          user.id,
        ]
      );

    return prepareItem(
      item
    );
  };


export const deleteSavedItem =
  async itemId => {
    const user =
      await getCurrentUser();

    if (!user) {
      return;
    }

    const db =
      await getDatabase();

    await db.runAsync(
      `
        DELETE FROM saved_items
        WHERE id = ?
        AND user_id = ?
      `,
      [
        itemId,
        user.id,
      ]
    );
  };
