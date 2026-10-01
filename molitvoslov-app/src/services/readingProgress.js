import {getDatabase} from '../db/database';

import {authenticatedFetch, getApiToken, getCachedBackendUser} from './backendAuth';

import {getOrCreateAnonymousLocalUser} from './localDataOwnership';

let readingProgressSyncPromise = null;

const parseMetadata = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const stringifyMetadata = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
};

const prepareProgress = (item) => {
  if (!item) {
    return null;
  }

  const metadata = parseMetadata(item.metadata);

  return {
    ...item,

    metadata,

    anchor_info: Object.keys(metadata).length ? metadata : null,

    progress_percent: Number(item.progress_percent || 0),
  };
};

const readResponseData = async (response) => {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const throwResponseError = async (response, fallbackMessage) => {
  const data = await readResponseData(response);

  throw new Error(data?.detail || data?.error || `${fallbackMessage}: ${response.status}`);
};

const toTimestamp = (value) => {
  const timestamp = new Date(value || 0).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const pushPendingReadingProgress = async (db, user) => {
  const rows = await db.getAllAsync(
    `
        SELECT *
        FROM reading_progress
        WHERE cloud_user_id = ?
        AND sync_status = 'pending'
        ORDER BY updated_at ASC
      `,
    [user.id]
  );

  const errors = [];

  for (const row of rows) {
    try {
      const response = await authenticatedFetch('/api/reading-progress/', {
        method: 'POST',

        body: JSON.stringify({
          source_type: row.source_type,

          source_id: row.source_id,

          anchor_type: row.anchor_type || '',

          anchor_id: row.anchor_id ?? null,

          offset: row.offset ?? 0,

          progress_percent: Number(row.progress_percent || 0),

          metadata: parseMetadata(row.metadata),

          updated_at: row.updated_at,

          deleted_at: row.deleted_at ?? null,
        }),
      });

      if (!response.ok) {
        await throwResponseError(response, 'Ошибка синхронизации прогресса');
      }

      const serverItem = await readResponseData(response);

      await db.runAsync(
        `
            UPDATE reading_progress
            SET
              server_id = ?,
              sync_status = 'synced',

              anchor_type = ?,
              anchor_id = ?,

              offset = ?,
              progress_percent = ?,

              metadata = ?,

              updated_at = ?,
              deleted_at = ?

            WHERE id = ?
            AND cloud_user_id = ?
          `,
        [
          serverItem.id ?? null,

          serverItem.anchor_type || '',
          serverItem.anchor_id ?? null,

          serverItem.offset ?? 0,

          Number(serverItem.progress_percent || 0),

          stringifyMetadata(serverItem.metadata),

          serverItem.updated_at || row.updated_at,

          serverItem.deleted_at ?? null,

          row.id,
          user.id,
        ]
      );
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
};

const pullReadingProgress = async (db, user) => {
  const response = await authenticatedFetch('/api/reading-progress/?include_deleted=1');

  if (!response.ok) {
    await throwResponseError(response, 'Ошибка загрузки прогресса');
  }

  const data = await readResponseData(response);

  const serverRows = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];

  for (const serverItem of serverRows) {
    const existing = await db.getFirstAsync(
      `
            SELECT *
            FROM reading_progress
            WHERE cloud_user_id = ?
            AND source_type = ?
            AND source_id = ?
            LIMIT 1
          `,
      [user.id, serverItem.source_type, serverItem.source_id]
    );

    /*
     * Локальная pending-запись ещё
     * не дошла до сервера — её не
     * перетираем pull-ом.
     */
    if (existing?.sync_status === 'pending') {
      continue;
    }

    const serverUpdatedAt = toTimestamp(serverItem.updated_at);

    const localUpdatedAt = toTimestamp(existing?.updated_at);

    /*
     * Если локально каким-то образом
     * уже есть более свежая версия,
     * серверную не применяем.
     */
    if (existing && localUpdatedAt > serverUpdatedAt) {
      continue;
    }

    const metadata = stringifyMetadata(serverItem.metadata);

    if (existing) {
      await db.runAsync(
        `
            UPDATE reading_progress
            SET
              server_id = ?,
              sync_status = 'synced',

              anchor_type = ?,
              anchor_id = ?,

              offset = ?,
              progress_percent = ?,

              metadata = ?,

              updated_at = ?,
              deleted_at = ?

            WHERE id = ?
            AND cloud_user_id = ?
          `,
        [
          serverItem.id ?? null,

          serverItem.anchor_type || '',
          serverItem.anchor_id ?? null,

          serverItem.offset ?? 0,

          Number(serverItem.progress_percent || 0),

          metadata,

          serverItem.updated_at || existing.updated_at,

          serverItem.deleted_at ?? null,

          existing.id,
          user.id,
        ]
      );

      continue;
    }

    /*
     * Старое поле user_id имеет
     * UNIQUE(user_id, source_type,
     * source_id).
     *
     * Для Google-аккаунтов используем
     * отрицательный технический owner,
     * чтобы не столкнуться с legacy
     * local_users с положительными id.
     */
    const localOwnerId = -Math.abs(Number(user.id));

    await db.runAsync(
      `
          INSERT INTO reading_progress (
            user_id,
            cloud_user_id,

            server_id,
            sync_status,

            source_type,
            source_id,

            anchor_type,
            anchor_id,

            offset,
            progress_percent,

            metadata,

            updated_at,
            deleted_at
          )
          VALUES (
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?,
            ?, ?
          )
        `,
      [
        localOwnerId,
        user.id,

        serverItem.id ?? null,
        'synced',

        serverItem.source_type,
        serverItem.source_id,

        serverItem.anchor_type || '',
        serverItem.anchor_id ?? null,

        serverItem.offset ?? 0,

        Number(serverItem.progress_percent || 0),

        metadata,

        serverItem.updated_at || new Date().toISOString(),

        serverItem.deleted_at ?? null,
      ]
    );
  }
};

const runReadingProgressSync = async () => {
  const user = await getCachedBackendUser();
  const token = await getApiToken();

  if (!user?.id) {
    return {
      success: false,
      reason: 'no-user',
    };
  }
  if (!token) {
    return {
      success: false,
      reason: 'no-auth',
    };
  }

  const db = await getDatabase();

  try {
    const pushErrors = await pushPendingReadingProgress(db, user);

    await pullReadingProgress(db, user);

    return {
      success: pushErrors.length === 0,

      pushErrors,
    };
  } catch (error) {
    return {
      success: false,
      error,
    };
  }
};

export const syncReadingProgress = async () => {
  if (readingProgressSyncPromise) {
    return readingProgressSyncPromise;
  }

  readingProgressSyncPromise = runReadingProgressSync();

  try {
    return await readingProgressSyncPromise;
  } finally {
    readingProgressSyncPromise = null;
  }
};

export const getReadingProgress = async () => {
  const user = await getCachedBackendUser();

  const db = await getDatabase();

  let rows = [];

  if (user?.id) {
    rows = await db.getAllAsync(
      `
          SELECT
              id,
              server_id,
              source_type,
              source_id,
              anchor_type,
              anchor_id,
              offset,
              progress_percent,
              metadata,
              updated_at,
              deleted_at,
              sync_status
          FROM reading_progress
          WHERE cloud_user_id = ?
            AND deleted_at IS NULL
          ORDER BY updated_at DESC, id DESC
      `,
      [user.id]
    );
  } else {
    const guest = await getOrCreateAnonymousLocalUser(db);

    rows = await db.getAllAsync(
      `
          SELECT
              id,
              server_id,
              source_type,
              source_id,
              anchor_type,
              anchor_id,
              offset,
              progress_percent,
              metadata,
              updated_at,
              deleted_at,
              sync_status
          FROM reading_progress
          WHERE cloud_user_id IS NULL
            AND user_id = ?
            AND deleted_at IS NULL
          ORDER BY updated_at DESC, id DESC
      `,
      [guest.id]
    );
  }

  return rows
    .sort((left, right) => {
      const timeDifference = toTimestamp(right.updated_at) - toTimestamp(left.updated_at);

      if (timeDifference !== 0) {
        return timeDifference;
      }

      return Number(right.id || 0) - Number(left.id || 0);
    })
    .map(prepareProgress);
};

export const saveReadingProgress = async ({
  sourceType,
  sourceId,

  anchorType,
  anchorId,

  offset = 0,

  progressPercent = 0,

  metadata = null,
}) => {
  const user = await getCachedBackendUser();

  const db = await getDatabase();

  let localUserId;
  let cloudUserId;
  let syncStatus;

  if (user?.id) {
    localUserId = -Math.abs(Number(user.id));
    cloudUserId = user.id;
    syncStatus = 'pending';
  } else {
    const guest = await getOrCreateAnonymousLocalUser(db);

    localUserId = guest.id;
    cloudUserId = null;
    syncStatus = 'local';
  }

  const updatedAt = new Date().toISOString();

  const normalizedProgressPercent = Math.max(
    0,
    Math.min(Math.round(Number(progressPercent || 0)), 100)
  );

  const normalizedMetadata = stringifyMetadata(metadata);

  await db.runAsync(
    `
        INSERT INTO reading_progress (
          user_id,
          cloud_user_id,

          sync_status,

          source_type,
          source_id,

          anchor_type,
          anchor_id,

          offset,
          progress_percent,

          metadata,

          updated_at,
          deleted_at
        )

        VALUES (
          ?, ?,
          ?,
          ?, ?,
          ?, ?,
          ?, ?,
          ?,
          ?,
          NULL
        )

        ON CONFLICT(
          user_id,
          source_type,
          source_id
        )

        DO UPDATE SET
          cloud_user_id =
            excluded.cloud_user_id,

          sync_status =
            excluded.sync_status,

          anchor_type =
            excluded.anchor_type,

          anchor_id =
            excluded.anchor_id,

          offset =
            excluded.offset,

          progress_percent =
            excluded.progress_percent,

          metadata =
            excluded.metadata,

          updated_at =
            excluded.updated_at,

          deleted_at =
            NULL
      `,
    [
      localUserId,
      cloudUserId,

      syncStatus,

      sourceType,
      sourceId,

      anchorType || '',
      anchorId ?? null,

      offset,
      normalizedProgressPercent,

      normalizedMetadata,

      updatedAt,
    ]
  );

  const row = await db.getFirstAsync(
    `
        SELECT *
        FROM reading_progress
        WHERE user_id = ?
          AND source_type = ?
          AND source_id = ?
    `,
    [localUserId, sourceType, sourceId]
  );

  if (user?.id) {
    syncReadingProgress().catch(() => {});
  }

  return prepareProgress(row);
};

export const deleteReadingProgress = async (progressId) => {
  if (!progressId) {
    return;
  }

  const user = await getCachedBackendUser();
  const db = await getDatabase();

  if (!user?.id) {
    const guest = await getOrCreateAnonymousLocalUser(db);

    await db.runAsync(
      `
        DELETE FROM reading_progress
        WHERE id = ?
          AND cloud_user_id IS NULL
          AND user_id = ?
      `,
      [progressId, guest.id]
    );

    return;
  }

  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE reading_progress
      SET
        deleted_at = ?,
        updated_at = ?,
        sync_status = 'pending'
      WHERE id = ?
        AND cloud_user_id = ?
    `,
    [now, now, progressId, user.id]
  );

  syncReadingProgress().catch(() => {});
};
