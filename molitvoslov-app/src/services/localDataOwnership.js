import {getDatabase} from '../db/database';

const ANONYMOUS_LOCAL_USERNAME = '__molitvoslov_guest__';

export const getOrCreateAnonymousLocalUser = async (existingDb = null) => {
  const db = existingDb || (await getDatabase());

  let user = await db.getFirstAsync(
    `
      SELECT id, username
      FROM local_users
      WHERE username = ?
      LIMIT 1
    `,
    [ANONYMOUS_LOCAL_USERNAME]
  );

  if (user) {
    return user;
  }

  try {
    const result = await db.runAsync(
      `
        INSERT INTO local_users (
          username,
          password_hash,
          created_at
        )
        VALUES (?, ?, ?)
      `,
      [
        ANONYMOUS_LOCAL_USERNAME,
        '__anonymous__',
        new Date().toISOString(),
      ]
    );

    return {
      id: Number(result.lastInsertRowId),
      username: ANONYMOUS_LOCAL_USERNAME,
    };
  } catch (error) {
    user = await db.getFirstAsync(
      `
        SELECT id, username
        FROM local_users
        WHERE username = ?
        LIMIT 1
      `,
      [ANONYMOUS_LOCAL_USERNAME]
    );

    if (user) {
      return user;
    }

    throw error;
  }
};

const toTimestamp = (value) => {
  const timestamp = new Date(value || 0).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const adoptAnonymousLocalData = async (cloudUserId) => {
  const userId = Number(cloudUserId);

  if (!Number.isFinite(userId) || userId <= 0) {
    return {
      success: false,
      reason: 'invalid-user',
    };
  }

  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    const syncTables = [
      'memorial_books',
      'memorial_photos',

      'personal_prayer_books',
      'personal_prayers',
      'personal_prayer_book_items',
      'personal_prayer_photos',
    ];

    for (const table of syncTables) {
      await db.runAsync(
        `
          UPDATE ${table}
          SET
            cloud_user_id = ?,
            sync_status =
              CASE
                WHEN deleted_at IS NULL
                  THEN 'pending'
                ELSE 'deleted'
              END
          WHERE cloud_user_id IS NULL
        `,
        [userId]
      );
    }

    await db.runAsync(
      `
        UPDATE saved_items
        SET
          cloud_user_id = ?,
          sync_status =
            CASE
              WHEN deleted_at IS NULL
                THEN 'pending'
              ELSE 'deleted'
            END
        WHERE cloud_user_id IS NULL
      `,
      [userId]
    );

    /*
     * У reading_progress есть UNIQUE:
     *
     * user_id + source_type + source_id
     *
     * Поэтому здесь нельзя просто массово поменять user_id.
     * Аккуратно объединяем локальный прогресс с аккаунтом.
     */
    const anonymousProgress = await db.getAllAsync(`
      SELECT *
      FROM reading_progress
      WHERE cloud_user_id IS NULL
      ORDER BY updated_at ASC
    `);

    const accountLocalUserId = -Math.abs(userId);

    for (const localRow of anonymousProgress) {
      const existing = await db.getFirstAsync(
        `
          SELECT *
          FROM reading_progress
          WHERE user_id = ?
          AND source_type = ?
          AND source_id = ?
          LIMIT 1
        `,
        [
          accountLocalUserId,
          localRow.source_type,
          localRow.source_id,
        ]
      );

      if (!existing) {
        await db.runAsync(
          `
            UPDATE reading_progress
            SET
              user_id = ?,
              cloud_user_id = ?,
              sync_status = 'pending'
            WHERE id = ?
          `,
          [
            accountLocalUserId,
            userId,
            localRow.id,
          ]
        );

        continue;
      }

      if (Number(existing.id) === Number(localRow.id)) {
        await db.runAsync(
          `
            UPDATE reading_progress
            SET
              cloud_user_id = ?,
              sync_status = 'pending'
            WHERE id = ?
          `,
          [
            userId,
            localRow.id,
          ]
        );

        continue;
      }

      const localUpdatedAt = toTimestamp(localRow.updated_at);
      const existingUpdatedAt = toTimestamp(existing.updated_at);

      if (localUpdatedAt > existingUpdatedAt) {
        await db.runAsync(
          `
            UPDATE reading_progress
            SET
              cloud_user_id = ?,
              sync_status = 'pending',

              anchor_type = ?,
              anchor_id = ?,

              offset = ?,
              progress_percent = ?,

              metadata = ?,
              updated_at = ?,
              deleted_at = ?
            WHERE id = ?
          `,
          [
            userId,

            localRow.anchor_type,
            localRow.anchor_id,

            localRow.offset,
            localRow.progress_percent,

            localRow.metadata,
            localRow.updated_at,
            localRow.deleted_at,

            existing.id,
          ]
        );
      }

      await db.runAsync(
        `
          DELETE FROM reading_progress
          WHERE id = ?
        `,
        [localRow.id]
      );
    }
  });

  return {
    success: true,
  };
};