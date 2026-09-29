import * as Crypto from 'expo-crypto';

import {getDatabase} from '../db/database';
import {getCurrentUser} from './localAuth';

import {
  authenticatedFetch,
  getCachedBackendUser,
} from './backendAuth';

const ANONYMOUS_LOCAL_USERNAME = '__molitvoslov_guest__';

const getOrCreateLocalOwner = async (db) => {
  const currentLocalUser = await getCurrentUser();

  if (currentLocalUser?.id) {
    return currentLocalUser;
  }

  let guest = await db.getFirstAsync(
    `
      SELECT id, username
      FROM local_users
      WHERE username = ?
      LIMIT 1
    `,
    [ANONYMOUS_LOCAL_USERNAME]
  );

  if (guest) {
    return guest;
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
    // На случай, если два вызова одновременно попытались создать guest.
    guest = await db.getFirstAsync(
      `
        SELECT id, username
        FROM local_users
        WHERE username = ?
        LIMIT 1
      `,
      [ANONYMOUS_LOCAL_USERNAME]
    );

    if (guest) {
      return guest;
    }

    throw error;
  }
};


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
  quote: 'Цитата',
};

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
let savedItemsSyncPromise = null;

const stringifyMetadata = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
};

const prepareItem = (item) => ({
  ...item,

  metadata: parseMetadata(item.metadata),

  save_type_display:
    SAVE_TYPE_NAMES[item.save_type] || item.save_type,
});

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

const throwResponseError = async (
  response,
  fallbackMessage
) => {
  const data = await readResponseData(response);

  throw new Error(
    data?.detail ||
    data?.error ||
    `${fallbackMessage}: ${response.status}`
  );
};

const savedItemToServerPayload = (item) => ({
  sync_id: item.sync_id,

  save_type: item.save_type,

  source_type: item.source_type,
  source_id: item.source_id,

  anchor_type: item.anchor_type,
  anchor_id: item.anchor_id,

  source_title: item.source_title || '',
  item_title: item.item_title || '',
  text: item.text || '',

  start_offset: item.start_offset ?? null,
  end_offset: item.end_offset ?? null,

  metadata: parseMetadata(item.metadata),
});

const pushSavedItem = async (
  db,
  user,
  localItem
) => {
  let item = localItem;

  /*
   * Старые/повреждённые pending-записи могут
   * оказаться без UUID. Выдаём его перед отправкой.
   */
  if (!item.sync_id) {
    const syncId = Crypto.randomUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `
        UPDATE saved_items
        SET
          sync_id = ?,
          updated_at = ?
        WHERE id = ?
        AND cloud_user_id = ?
      `,
      [
        syncId,
        now,
        item.id,
        user.id,
      ]
    );

    item = {
      ...item,
      sync_id: syncId,
      updated_at: now,
    };
  }

  /*
   * POST идемпотентен по sync_id.
   *
   * Даже если запрос дошёл до Django,
   * но телефон не получил ответ, повторная
   * отправка не должна создать второй SavedItem.
   */
  const createResponse = await authenticatedFetch(
    '/api/saved-items/',
    {
      method: 'POST',

      body: JSON.stringify(
        savedItemToServerPayload(item)
      ),
    }
  );

  if (!createResponse.ok) {
    await throwResponseError(
      createResponse,
      'Ошибка синхронизации сохранения'
    );
  }

  const serverItem =
    await readResponseData(createResponse);

  /*
   * Сервер может вернуть другой sync_id,
   * если обнаружил старую аналогичную запись,
   * существовавшую ещё до появления UUID.
   *
   * В таком случае принимаем серверный UUID.
   */
  const serverSyncId =
    serverItem.sync_id || item.sync_id;

  await db.runAsync(
    `
      UPDATE saved_items
      SET
        sync_id = ?,
        server_id = ?,
        cloud_user_id = ?,
        sync_status = 'synced',
        created_at = COALESCE(?, created_at),
        updated_at = COALESCE(?, updated_at),
        deleted_at = ?
      WHERE id = ?
      AND cloud_user_id = ?
    `,
    [
      serverSyncId,
      serverItem.id ?? item.server_id ?? null,
      user.id,
      serverItem.created_at ?? null,
      serverItem.updated_at ?? null,
      serverItem.deleted_at ?? item.deleted_at ?? null,
      item.id,
      user.id,
    ]
  );

  /*
   * Если запись была удалена на телефоне
   * до синхронизации, сначала гарантировали
   * её наличие на сервере через POST,
   * теперь передаём tombstone.
   */
  if (item.deleted_at) {
    const deleteResponse =
      await authenticatedFetch(
        `/api/saved-items/${serverSyncId}/`,
        {
          method: 'DELETE',
        }
      );

    /*
     * 404 здесь тоже можно считать успехом:
     * запись могла быть уже soft-deleted
     * предыдущим запросом.
     */
    if (
      !deleteResponse.ok &&
      deleteResponse.status !== 404
    ) {
      await throwResponseError(
        deleteResponse,
        'Ошибка синхронизации удаления'
      );
    }

    await db.runAsync(
      `
        UPDATE saved_items
        SET
          sync_status = 'synced'
        WHERE id = ?
        AND cloud_user_id = ?
      `,
      [
        item.id,
        user.id,
      ]
    );
  }
};

const pushPendingSavedItems = async (
  db,
  user
) => {
  const pendingItems = await db.getAllAsync(
    `
      SELECT *
      FROM saved_items
      WHERE cloud_user_id = ?
      AND sync_status IN (
        'pending',
        'deleted'
      )
      ORDER BY created_at ASC
    `,
    [user.id]
  );

  const errors = [];

  for (const item of pendingItems) {
    try {
      await pushSavedItem(
        db,
        user,
        item
      );
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
};

const pullSavedItems = async (
  db,
  user
) => {
  const response = await authenticatedFetch(
    '/api/saved-items/?include_deleted=1'
  );

  if (!response.ok) {
    await throwResponseError(
      response,
      'Ошибка загрузки сохранений'
    );
  }

  const data = await readResponseData(response);

  const serverItems = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
      ? data.results
      : [];

  for (const serverItem of serverItems) {
    if (!serverItem.sync_id) {
      continue;
    }

    const existing =
      await db.getFirstAsync(
        `
          SELECT *
          FROM saved_items
          WHERE sync_id = ?
          AND cloud_user_id = ?
          LIMIT 1
        `,
        [
          serverItem.sync_id,
          user.id,
        ]
      );

    /*
     * Не перетираем локальное изменение,
     * которое ещё не удалось отправить.
     */
    if (
      existing &&
      (
        existing.sync_status === 'pending' ||
        existing.sync_status === 'deleted'
      )
    ) {
      continue;
    }

    const metadata = stringifyMetadata(
      serverItem.metadata
    );

    if (existing) {
      await db.runAsync(
        `
          UPDATE saved_items
          SET
            user_id = ?,
            cloud_user_id = ?,
            server_id = ?,
            sync_status = 'synced',

            save_type = ?,

            source_type = ?,
            source_id = ?,

            anchor_type = ?,
            anchor_id = ?,

            source_title = ?,
            item_title = ?,
            text = ?,

            start_offset = ?,
            end_offset = ?,

            metadata = ?,

            created_at = ?,
            updated_at = ?,
            deleted_at = ?

          WHERE id = ?
        `,
        [
          user.id,
          user.id,
          serverItem.id ?? null,

          serverItem.save_type,

          serverItem.source_type,
          serverItem.source_id,

          serverItem.anchor_type,
          serverItem.anchor_id,

          serverItem.source_title || '',
          serverItem.item_title || '',
          serverItem.text || '',

          serverItem.start_offset ?? null,
          serverItem.end_offset ?? null,

          metadata,

          serverItem.created_at ||
          existing.created_at,

          serverItem.updated_at ||
          existing.updated_at,

          serverItem.deleted_at ?? null,

          existing.id,
        ]
      );
    } else {
      await db.runAsync(
        `
          INSERT INTO saved_items (
            user_id,
            cloud_user_id,

            sync_id,
            server_id,
            sync_status,

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

            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            ?, ?,
            ?, ?, ?,
            ?,
            ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?,
            ?,
            ?, ?, ?
          )
        `,
        [
          user.id,
          user.id,

          serverItem.sync_id,
          serverItem.id ?? null,
          'synced',

          serverItem.save_type,

          serverItem.source_type,
          serverItem.source_id,

          serverItem.anchor_type,
          serverItem.anchor_id,

          serverItem.source_title || '',
          serverItem.item_title || '',
          serverItem.text || '',

          serverItem.start_offset ?? null,
          serverItem.end_offset ?? null,

          metadata,

          serverItem.created_at ||
          new Date().toISOString(),

          serverItem.updated_at ||
          new Date().toISOString(),

          serverItem.deleted_at ?? null,
        ]
      );
    }
  }
};

/*
 * Полная синхронизация:
 *
 * 1. Сначала отправляем локальные изменения.
 * 2. Затем получаем состояние сервера.
 *
 * Это важно: локальное удаление не должно
 * быть затёрто старой серверной копией.
 */
const runSavedItemsSync = async () => {
  const user = await getCachedBackendUser();

  if (!user?.id) {
    return {
      success: false,
      reason: 'no-user',
    };
  }

  const db = await getDatabase();

  try {
    const pushErrors =
      await pushPendingSavedItems(
        db,
        user
      );

    await pullSavedItems(
      db,
      user
    );

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

export const syncSavedItems = async () => {
  if (savedItemsSyncPromise) {
    return savedItemsSyncPromise;
  }

  savedItemsSyncPromise =
    runSavedItemsSync();

  try {
    return await savedItemsSyncPromise;
  } finally {
    savedItemsSyncPromise = null;
  }
};

export const getSavedItems = async (
  params = {}
) => {
  const cloudUser =
    await getCachedBackendUser();

  const db = await getDatabase();

  const conditions = [
    'deleted_at IS NULL',
  ];

  const values = [];

  if (cloudUser?.id) {
    /*
     * Авторизованный Google/Django пользователь:
     * показываем только его облачные сохранения.
     */
    conditions.push(
      'cloud_user_id = ?'
    );

    values.push(cloudUser.id);
  } else {
    /*
     * Без аккаунта:
     * работаем только с локальными сохранениями.
     */
    const localOwner =
      await getOrCreateLocalOwner(db);

    conditions.push(
      'cloud_user_id IS NULL'
    );

    conditions.push(
      'user_id = ?'
    );

    values.push(localOwner.id);
  }

  const allowedFilters = [
    'source_type',
    'source_id',
    'anchor_type',
    'anchor_id',
    'save_type',
  ];

  allowedFilters.forEach((field) => {
    const value = params[field];

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      conditions.push(`${field} = ?`);
      values.push(value);
    }
  });

  const items = await db.getAllAsync(
    `
        SELECT *
        FROM saved_items
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
    `,
    values
  );

  return items.map(prepareItem);
};
export const saveItem = async (
  payload
) => {
  const cloudUser =
    await getCachedBackendUser();

  const db = await getDatabase();

  let localOwner = null;

  if (!cloudUser?.id) {
    localOwner =
      await getOrCreateLocalOwner(db);
  }

  /*
   * user_id всё ещё NOT NULL.
   *
   * Для Google-пользователя сохраняем старое поведение.
   * Для анонимного пользователя используем локальный ID.
   */
  const userId =
    cloudUser?.id ??
    localOwner.id;

  /*
   * NULL означает:
   * эта запись только локальная и не принадлежит
   * никакому Django/Google аккаунту.
   */
  const cloudUserId =
    cloudUser?.id ?? null;

  const syncStatus =
    cloudUser?.id
      ? 'pending'
      : 'legacy';

  const syncId =
    Crypto.randomUUID();

  const now =
    new Date().toISOString();

  const metadata =
    stringifyMetadata(
      payload.metadata
    );

  const result = await db.runAsync(
    `
      INSERT INTO saved_items (
        user_id,
        cloud_user_id,

        sync_id,
        sync_status,

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

        created_at,
        updated_at,
        deleted_at,
        server_id
      )
      VALUES (
        ?, ?,
        ?, ?,
        ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?,
        ?, ?, ?, ?
      )
    `,
    [
      userId,
      cloudUserId,

      syncId,
      syncStatus,

      payload.save_type,

      payload.source_type,
      payload.source_id,

      payload.anchor_type,
      payload.anchor_id,

      payload.source_title || '',
      payload.item_title || '',
      payload.text || '',

      payload.start_offset ?? null,
      payload.end_offset ?? null,

      metadata,

      now,
      now,
      null,
      null,
    ]
  );

  /*
   * Здесь специально ищем только по id.
   *
   * Для анонимной записи cloud_user_id = NULL,
   * поэтому условие "cloud_user_id = ?" не подходит.
   */
  const item =
    await db.getFirstAsync(
      `
        SELECT *
        FROM saved_items
        WHERE id = ?
      `,
      [
        result.lastInsertRowId,
      ]
    );

  /*
   * Только записи Google/Django пользователя
   * отправляем в облако.
   */
  if (cloudUser?.id) {
    syncSavedItems().catch(() => {});
  }

  return prepareItem(item);
};

export const deleteSavedItem = async (
  itemId
) => {
  const cloudUser =
    await getCachedBackendUser();

  const db = await getDatabase();

  /*
   * Анонимное сохранение никуда синхронизировать
   * не требуется — удаляем его локально сразу.
   */
  if (!cloudUser?.id) {
    const localOwner =
      await getOrCreateLocalOwner(db);

    await db.runAsync(
      `
        DELETE FROM saved_items
        WHERE id = ?
        AND user_id = ?
        AND cloud_user_id IS NULL
      `,
      [
        itemId,
        localOwner.id,
      ]
    );

    return;
  }

  const now =
    new Date().toISOString();

  /*
   * Для облачного сохранения оставляем tombstone,
   * чтобы удаление синхронизировалось с Django.
   */
  await db.runAsync(
    `
        UPDATE saved_items
        SET
            deleted_at = ?,
            updated_at = ?,
            sync_status = 'deleted'
        WHERE id = ?
          AND cloud_user_id = ?
    `,
    [
      now,
      now,
      itemId,
      cloudUser.id,
    ]
  );

  syncSavedItems().catch(() => {});
};