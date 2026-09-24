import {
  getDatabase,
} from '../db/database';

import {
  getCurrentUser,
} from './localAuth';


export const getReadingProgress =
  async () => {
    const user =
      await getCurrentUser();

    if (!user) {
      return [];
    }

    const db =
      await getDatabase();

    const rows =
      await db.getAllAsync(
        `
          SELECT
            id,
            source_type,
            source_id,
            anchor_type,
            anchor_id,
            offset,
            progress_percent,
            updated_at
          FROM reading_progress
          WHERE user_id = ?
          ORDER BY updated_at DESC
        `,
        [
          user.id,
        ]
      );

    return rows.map(
      item => ({
        ...item,

        // Пока оставляем для совместимости
        // с главной страницей.
        anchor_info:
          null,

        progress_percent:
          Number(
            item.progress_percent ||
            0
          ),
      })
    );
  };


export const saveReadingProgress =
  async ({
    sourceType,
    sourceId,
    anchorType,
    anchorId,
    offset = 0,
    progressPercent = 0,
  }) => {
    const user =
      await getCurrentUser();

    // Без аккаунта прогресс
    // не сохраняем.
    if (!user) {
      return null;
    }

    const db =
      await getDatabase();

    const updatedAt =
      new Date().toISOString();

    const normalizedProgressPercent =
      Math.max(
        0,
        Math.min(
          Math.round(
            Number(
              progressPercent ||
              0
            )
          ),
          100
        )
      );

    await db.runAsync(
      `
        INSERT INTO reading_progress (
          user_id,
          source_type,
          source_id,
          anchor_type,
          anchor_id,
          offset,
          progress_percent,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT(
          user_id,
          source_type,
          source_id
        )
        DO UPDATE SET
          anchor_type =
            excluded.anchor_type,
          anchor_id =
            excluded.anchor_id,
          offset =
            excluded.offset,
          progress_percent =
            excluded.progress_percent,
          updated_at =
            excluded.updated_at
      `,
      [
        user.id,
        sourceType,
        sourceId,
        anchorType,
        anchorId,
        offset,
        normalizedProgressPercent,
        updatedAt,
      ]
    );

    return db.getFirstAsync(
      `
        SELECT
          id,
          source_type,
          source_id,
          anchor_type,
          anchor_id,
          offset,
          progress_percent,
          updated_at
        FROM reading_progress
        WHERE user_id = ?
        AND source_type = ?
        AND source_id = ?
      `,
      [
        user.id,
        sourceType,
        sourceId,
      ]
    );
  };


export const deleteReadingProgress =
  async progressId => {
    if (!progressId) {
      return;
    }

    const user =
      await getCurrentUser();

    if (!user) {
      return;
    }

    const db =
      await getDatabase();

    await db.runAsync(
      `
        DELETE FROM reading_progress
        WHERE id = ?
        AND user_id = ?
      `,
      [
        progressId,
        user.id,
      ]
    );
  };
