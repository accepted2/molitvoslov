import * as Crypto from 'expo-crypto';

import {
  Directory,
  File,
  Paths,
} from 'expo-file-system';

import {getDatabase} from '../db/database';
import {contentApi} from './contentApi';
import {
  API_BASE_URL,
  authenticatedFetch,
  getApiToken,
  getCachedBackendUser,
} from './backendAuth';

let prayerBooksSyncPromise = null;

const parseJson = (value, fallback = {}) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const stringifyJson = (value) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

const currentOwner = async () => {
  const user = await getCachedBackendUser();
  return {
    user,
    cloudUserId: user?.id ?? null,
  };
};

const ownerWhere = (user, alias = '') => {
  const prefix = alias ? `${alias}.` : '';
  if (user?.id) {
    return {
      clause: `${prefix}cloud_user_id = ?`,
      values: [user.id],
    };
  }
  return {
    clause: `${prefix}cloud_user_id IS NULL`,
    values: [],
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

const throwResponseError = async (response, fallback) => {
  const data = await readResponseData(response);
  throw new Error(data?.detail || data?.error || `${fallback}: ${response.status}`);
};

const extensionFromAsset = (asset) => {
  const name = String(asset?.fileName || asset?.uri || '');
  const match = name.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  if (match) {
    const value = match[1].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(value)) {
      return value === 'jpeg' ? 'jpg' : value;
    }
  }

  const byMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return byMime[String(asset?.mimeType || '').toLowerCase()] || 'jpg';
};

const contentTypeFromAsset = (asset, extension) => {
  if (asset?.mimeType) {
    return asset.mimeType;
  }
  const byExtension = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return byExtension[extension] || 'image/jpeg';
};

const prayerPhotoDirectory = () => {
  const directory = new Directory(Paths.document, 'personal-prayers');
  directory.create({
    idempotent: true,
    intermediates: true,
  });
  return directory;
};

const persistPhotoAsset = async (asset, syncId) => {
  if (!asset?.uri) {
    throw new Error('Не удалось получить файл фотографии');
  }

  const extension = extensionFromAsset(asset);
  const target = new File(prayerPhotoDirectory(), `${syncId}.${extension}`);
  const source = new File(asset.uri);

  await source.copy(target, {overwrite: true});

  return {
    uri: target.uri,
    originalName: asset.fileName || `prayer-${syncId}.${extension}`,
    contentType: contentTypeFromAsset(asset, extension),
  };
};

const deleteLocalFile = (uri) => {
  if (!uri) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Файл уже мог быть удалён системой.
  }
};

const cacheRemotePhoto = async (serverPhoto) => {
  const url = String(serverPhoto?.download_url || '').trim();
  if (!url || serverPhoto?.deleted_at) {
    return null;
  }

  try {
    const extension = extensionFromAsset({
      fileName: serverPhoto.original_name,
      mimeType: serverPhoto.content_type,
      uri: url,
    });
    const target = new File(prayerPhotoDirectory(), `${serverPhoto.sync_id}.${extension}`);
    const downloaded = await File.downloadFileAsync(url, target, {idempotent: true});
    return downloaded.uri;
  } catch (error) {
    console.log('Не удалось закэшировать фото молитвы:', error?.message || error);
    return null;
  }
};

const preparePhoto = (row) => ({
  ...row,
  uri: row.local_uri || row.remote_url || null,
});

const preparePrayer = (row, photos = []) => ({
  ...row,
  origin_data: parseJson(row.origin_data, {}),
  photos: photos
    .filter((photo) => photo.prayer_sync_id === row.sync_id && !photo.deleted_at)
    .map(preparePhoto),
});

const prepareBook = (row, items = [], prayers = [], photos = []) => {
  const prayerMap = new Map(
    prayers.map((prayer) => [prayer.sync_id, preparePrayer(prayer, photos)])
  );

  return {
    ...row,
    items: items
      .filter((item) => item.book_sync_id === row.sync_id && !item.deleted_at)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((item) => ({
        ...item,
        prayer: prayerMap.get(item.prayer_sync_id) || null,
      }))
      .filter((item) => !!item.prayer),
  };
};

const getOwnedRows = async (table, user, extra = '', values = []) => {
  const db = await getDatabase();
  const owner = ownerWhere(user);
  return db.getAllAsync(
    `
      SELECT *
      FROM ${table}
      WHERE ${owner.clause}
      ${extra}
    `,
    [...owner.values, ...values]
  );
};

export const getPersonalPrayers = async () => {
  const db = await getDatabase();
  const {user} = await currentOwner();
  const owner = ownerWhere(user);

  const prayers = await db.getAllAsync(
    `
      SELECT *
      FROM personal_prayers
      WHERE ${owner.clause}
      AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
    `,
    owner.values
  );
  const photos = await getOwnedRows(
    'personal_prayer_photos',
    user,
    'AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC'
  );

  return prayers.map((prayer) => preparePrayer(prayer, photos));
};

export const getPrayerBooks = async () => {
  const db = await getDatabase();
  const {user} = await currentOwner();
  const owner = ownerWhere(user);

  const [books, prayers, items, photos] = await Promise.all([
    db.getAllAsync(
      `
        SELECT *
        FROM personal_prayer_books
        WHERE ${owner.clause}
        AND deleted_at IS NULL
        ORDER BY updated_at DESC, id DESC
      `,
      owner.values
    ),
    getOwnedRows('personal_prayers', user, 'AND deleted_at IS NULL'),
    getOwnedRows(
      'personal_prayer_book_items',
      user,
      'AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC'
    ),
    getOwnedRows(
      'personal_prayer_photos',
      user,
      'AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC'
    ),
  ]);

  return books.map((book) => prepareBook(book, items, prayers, photos));
};

export const getPrayerBook = async (syncId) => {
  const books = await getPrayerBooks();
  return books.find((book) => book.sync_id === syncId) || null;
};

export const createPrayerBook = async ({title, description = ''} = {}) => {
  const db = await getDatabase();
  const {user, cloudUserId} = await currentOwner();
  const now = new Date().toISOString();
  const syncId = Crypto.randomUUID();
  const cleanTitle = String(title || '').trim() || 'Мой молитвослов';

  await db.runAsync(
    `
      INSERT INTO personal_prayer_books (
        sync_id, cloud_user_id, server_id, sync_status,
        title, description,
        created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      syncId,
      cloudUserId,
      null,
      user?.id ? 'pending' : 'local',
      cleanTitle,
      String(description || '').trim(),
      now,
      now,
      null,
    ]
  );

  if (user?.id) {
    syncPrayerBooks().catch(() => {});
  }
  return getPrayerBook(syncId);
};

export const updatePrayerBook = async (syncId, patch = {}) => {
  const db = await getDatabase();
  const {user} = await currentOwner();
  const owner = ownerWhere(user);
  const current = await db.getFirstAsync(
    `
      SELECT *
      FROM personal_prayer_books
      WHERE sync_id = ?
      AND ${owner.clause}
      AND deleted_at IS NULL
      LIMIT 1
    `,
    [syncId, ...owner.values]
  );

  if (!current) {
    throw new Error('Молитвослов не найден');
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `
      UPDATE personal_prayer_books
      SET title = ?, description = ?, sync_status = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      patch.title !== undefined
        ? String(patch.title || '').trim() || 'Мой молитвослов'
        : current.title,
      patch.description !== undefined
        ? String(patch.description || '')
        : current.description,
      user?.id ? 'pending' : 'local',
      now,
      current.id,
    ]
  );

  if (user?.id) {
    syncPrayerBooks().catch(() => {});
  }
  return getPrayerBook(syncId);
};

export const deletePrayerBook = async (syncId) => {
  const db = await getDatabase();
  const {user} = await currentOwner();
  const owner = ownerWhere(user);
  const book = await db.getFirstAsync(
    `SELECT * FROM personal_prayer_books WHERE sync_id = ? AND ${owner.clause} LIMIT 1`,
    [syncId, ...owner.values]
  );

  if (!book) {
    return;
  }

  if (!user?.id) {
    await db.runAsync(
      'DELETE FROM personal_prayer_book_items WHERE book_sync_id = ? AND cloud_user_id IS NULL',
      [syncId]
    );
    await db.runAsync('DELETE FROM personal_prayer_books WHERE id = ?', [book.id]);
    return;
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `
      UPDATE personal_prayer_books
      SET deleted_at = ?, updated_at = ?, sync_status = 'deleted'
      WHERE id = ?
    `,
    [now, now, book.id]
  );
  await db.runAsync(
    `
      UPDATE personal_prayer_book_items
      SET deleted_at = ?, updated_at = ?, sync_status = 'deleted'
      WHERE book_sync_id = ? AND cloud_user_id = ?
    `,
    [now, now, syncId, user.id]
  );
  syncPrayerBooks().catch(() => {});
};

export const createPersonalPrayer = async ({
  title,
  text = '',
  origin_type = 'custom',
  origin_data = {},
} = {}) => {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) {
    throw new Error('Укажите название молитвы');
  }

  const db = await getDatabase();
  const {user, cloudUserId} = await currentOwner();
  const syncId = Crypto.randomUUID();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO personal_prayers (
        sync_id, cloud_user_id, server_id, sync_status,
        title, text, origin_type, origin_data,
        created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      syncId,
      cloudUserId,
      null,
      user?.id ? 'pending' : 'local',
      cleanTitle,
      String(text || ''),
      origin_type,
      stringifyJson(origin_data),
      now,
      now,
      null,
    ]
  );

  if (user?.id) {
    syncPrayerBooks().catch(() => {});
  }

  const prayers = await getPersonalPrayers();
  return prayers.find((prayer) => prayer.sync_id === syncId) || null;
};

export const updatePersonalPrayer = async (syncId, patch = {}) => {
  const db = await getDatabase();
  const {user} = await currentOwner();
  const owner = ownerWhere(user);
  const current = await db.getFirstAsync(
    `
      SELECT *
      FROM personal_prayers
      WHERE sync_id = ?
      AND ${owner.clause}
      AND deleted_at IS NULL
      LIMIT 1
    `,
    [syncId, ...owner.values]
  );
  if (!current) {
    throw new Error('Молитва не найдена');
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `
      UPDATE personal_prayers
      SET title = ?, text = ?, origin_type = ?, origin_data = ?,
          sync_status = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      patch.title !== undefined ? String(patch.title || '').trim() || current.title : current.title,
      patch.text !== undefined ? String(patch.text || '') : current.text,
      patch.origin_type !== undefined ? patch.origin_type : current.origin_type,
      patch.origin_data !== undefined
        ? stringifyJson(patch.origin_data)
        : current.origin_data,
      user?.id ? 'pending' : 'local',
      now,
      current.id,
    ]
  );

  if (user?.id) {
    syncPrayerBooks().catch(() => {});
  }
  const prayers = await getPersonalPrayers();
  return prayers.find((prayer) => prayer.sync_id === syncId) || null;
};

export const addPrayerToBook = async (bookSyncId, prayerSyncId) => {
  const db = await getDatabase();
  const {user, cloudUserId} = await currentOwner();
  const owner = ownerWhere(user);

  const [book, prayer] = await Promise.all([
    db.getFirstAsync(
      `SELECT * FROM personal_prayer_books WHERE sync_id = ? AND ${owner.clause} AND deleted_at IS NULL`,
      [bookSyncId, ...owner.values]
    ),
    db.getFirstAsync(
      `SELECT * FROM personal_prayers WHERE sync_id = ? AND ${owner.clause} AND deleted_at IS NULL`,
      [prayerSyncId, ...owner.values]
    ),
  ]);
  if (!book || !prayer) {
    throw new Error('Не удалось найти молитвослов или молитву');
  }

  const existing = await db.getFirstAsync(
    `
      SELECT *
      FROM personal_prayer_book_items
      WHERE book_sync_id = ?
      AND prayer_sync_id = ?
      AND ${owner.clause}
      LIMIT 1
    `,
    [bookSyncId, prayerSyncId, ...owner.values]
  );
  if (existing && !existing.deleted_at) {
    return getPrayerBook(bookSyncId);
  }

  const maxOrder = await db.getFirstAsync(
    `
      SELECT COALESCE(MAX(sort_order), -1) AS max_order
      FROM personal_prayer_book_items
      WHERE book_sync_id = ?
      AND ${owner.clause}
      AND deleted_at IS NULL
    `,
    [bookSyncId, ...owner.values]
  );

  const now = new Date().toISOString();
  if (existing) {
    await db.runAsync(
      `
        UPDATE personal_prayer_book_items
        SET deleted_at = NULL, sort_order = ?, updated_at = ?, sync_status = ?
        WHERE id = ?
      `,
      [
        Number(maxOrder?.max_order ?? -1) + 1,
        now,
        user?.id ? 'pending' : 'local',
        existing.id,
      ]
    );
  } else {
    await db.runAsync(
      `
        INSERT INTO personal_prayer_book_items (
          book_sync_id, prayer_sync_id, sync_id,
          cloud_user_id, server_id, sync_status,
          sort_order, created_at, updated_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        bookSyncId,
        prayerSyncId,
        Crypto.randomUUID(),
        cloudUserId,
        null,
        user?.id ? 'pending' : 'local',
        Number(maxOrder?.max_order ?? -1) + 1,
        now,
        now,
        null,
      ]
    );
  }

  if (user?.id) {
    syncPrayerBooks().catch(() => {});
  }
  return getPrayerBook(bookSyncId);
};

export const movePrayerInBook = async (bookSyncId, itemSyncId, direction) => {
  const db = await getDatabase();
  const {user} = await currentOwner();
  const owner = ownerWhere(user);

  const items = await db.getAllAsync(
    `
      SELECT *
      FROM personal_prayer_book_items
      WHERE book_sync_id = ?
      AND ${owner.clause}
      AND deleted_at IS NULL
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `,
    [bookSyncId, ...owner.values]
  );

  const index = items.findIndex((item) => item.sync_id === itemSyncId);
  const targetIndex = index + Number(direction || 0);

  if (index < 0 || targetIndex < 0 || targetIndex >= items.length) {
    return getPrayerBook(bookSyncId);
  }

  const current = items[index];
  const target = items[targetIndex];
  const now = new Date().toISOString();
  const syncStatus = user?.id ? 'pending' : 'local';

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        UPDATE personal_prayer_book_items
        SET sort_order = ?, updated_at = ?, sync_status = ?
        WHERE id = ?
      `,
      [target.sort_order, now, syncStatus, current.id]
    );
    await db.runAsync(
      `
        UPDATE personal_prayer_book_items
        SET sort_order = ?, updated_at = ?, sync_status = ?
        WHERE id = ?
      `,
      [current.sort_order, now, syncStatus, target.id]
    );
  });

  if (user?.id) {
    syncPrayerBooks().catch(() => {});
  }

  return getPrayerBook(bookSyncId);
};

export const removePrayerFromBook = async (itemSyncId) => {
  const db = await getDatabase();
  const {user} = await currentOwner();
  const owner = ownerWhere(user);
  const item = await db.getFirstAsync(
    `SELECT * FROM personal_prayer_book_items WHERE sync_id = ? AND ${owner.clause} LIMIT 1`,
    [itemSyncId, ...owner.values]
  );
  if (!item) {
    return;
  }

  if (!user?.id) {
    await db.runAsync('DELETE FROM personal_prayer_book_items WHERE id = ?', [item.id]);
    return;
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `
      UPDATE personal_prayer_book_items
      SET deleted_at = ?, updated_at = ?, sync_status = 'deleted'
      WHERE id = ?
    `,
    [now, now, item.id]
  );
  syncPrayerBooks().catch(() => {});
};

const textFromObject = (object, language) => {
  if (!object) {
    return '';
  }
  if (language === 'russian') {
    return String(object.translation || object.russian || object.content || '').trim();
  }
  return String(
    object.content ||
      object.church_slavonic ||
      object.translation ||
      object.russian ||
      ''
  ).trim();
};

const fullTextFromSavedItem = async (item) => {
  const metadata = item?.metadata || {};
  const language = metadata.language;

  try {
    if (item.source_type === 'text' && metadata.slug) {
      const response = await contentApi.get(`texts/${metadata.slug}/`);
      return textFromObject(response.data, language) || item.text || '';
    }

    if (item.source_type === 'category' && metadata.category_slug) {
      const response = await contentApi.get(
        `categories/${metadata.category_slug}/texts/`
      );
      const entry = (response.data || []).find(
        (row) =>
          Number(row?.text?.id) === Number(item.anchor_id) ||
          Number(row?.id) === Number(item.anchor_id)
      );
      return textFromObject(entry?.text, language) || item.text || '';
    }

    if (item.source_type === 'prayer_rule' && metadata.slug) {
      const response = await contentApi.get(`prayer-rules/${metadata.slug}/`);
      const rule = response.data;
      const ruleItem = (rule?.items || []).find(
        (row) =>
          Number(row?.id) === Number(item.anchor_id) ||
          Number(row?.text?.id) === Number(item.anchor_id)
      );
      return (
        textFromObject(ruleItem?.text, language) ||
        String(ruleItem?.content || '').trim() ||
        item.text ||
        ''
      );
    }

    if (item.source_type === 'akathist' && metadata.slug) {
      const response = await contentApi.get(`akathists/${metadata.slug}/`);
      const akathist = response.data;
      if (item.save_type === 'akathist') {
        return (akathist?.sections || [])
          .map((section) => {
            const heading =
              section.section_type === 'kontakion'
                ? `Кондак ${section.number || ''}`
                : section.section_type === 'ikos'
                  ? `Икос ${section.number || ''}`
                  : section.text?.title || '';
            const body = textFromObject(section.text, language);
            return [heading, body].filter(Boolean).join('\n');
          })
          .filter(Boolean)
          .join('\n\n');
      }
      const section = (akathist?.sections || []).find(
        (row) => Number(row?.id) === Number(item.anchor_id)
      );
      return textFromObject(section?.text, language) || item.text || '';
    }

    if (item.source_type === 'canon' && metadata.slug) {
      const response = await contentApi.get(`canons/${metadata.slug}/`);
      const canon = response.data;
      if (item.save_type === 'canon') {
        return (canon?.sections || [])
          .map((section) => {
            const heading = section.heading || '';
            const body = textFromObject(section.text, language);
            return [heading, body].filter(Boolean).join('\n');
          })
          .filter(Boolean)
          .join('\n\n');
      }
      const section = (canon?.sections || []).find(
        (row) => Number(row?.id) === Number(item.anchor_id)
      );
      return textFromObject(section?.text, language) || item.text || '';
    }
  } catch (error) {
    console.log('Не удалось восстановить полный текст сохранения:', error?.message || error);
  }

  return String(item?.text || '').trim();
};

export const importSavedItemToBook = async (bookSyncId, item) => {
  const fullText = await fullTextFromSavedItem(item);
  const prayer = await createPersonalPrayer({
    title:
      item?.item_title ||
      item?.source_title ||
      item?.save_type_display ||
      'Молитва',
    text: fullText,
    origin_type: 'saved',
    origin_data: {
      saved_sync_id: item?.sync_id || null,
      save_type: item?.save_type || null,
      source_type: item?.source_type || null,
      source_id: item?.source_id ?? null,
      anchor_type: item?.anchor_type || null,
      anchor_id: item?.anchor_id ?? null,
      metadata: item?.metadata || {},
      full_text_resolved: fullText.length > String(item?.text || '').length,
    },
  });
  await addPrayerToBook(bookSyncId, prayer.sync_id);
  return prayer;
};

export const addPrayerPhoto = async (prayerSyncId, asset) => {
  const db = await getDatabase();
  const {user, cloudUserId} = await currentOwner();
  const owner = ownerWhere(user);
  const prayer = await db.getFirstAsync(
    `SELECT * FROM personal_prayers WHERE sync_id = ? AND ${owner.clause} AND deleted_at IS NULL`,
    [prayerSyncId, ...owner.values]
  );
  if (!prayer) {
    throw new Error('Молитва не найдена');
  }

  const syncId = Crypto.randomUUID();
  const persisted = await persistPhotoAsset(asset, syncId);
  const maxOrder = await db.getFirstAsync(
    `
      SELECT COALESCE(MAX(sort_order), -1) AS max_order
      FROM personal_prayer_photos
      WHERE prayer_sync_id = ?
      AND ${owner.clause}
      AND deleted_at IS NULL
    `,
    [prayerSyncId, ...owner.values]
  );
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO personal_prayer_photos (
        prayer_sync_id, sync_id, cloud_user_id, server_id, sync_status,
        local_uri, remote_url, original_name, content_type, sort_order,
        created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      prayerSyncId,
      syncId,
      cloudUserId,
      null,
      user?.id ? 'pending' : 'local',
      persisted.uri,
      null,
      persisted.originalName,
      persisted.contentType,
      Number(maxOrder?.max_order ?? -1) + 1,
      now,
      now,
      null,
    ]
  );

  if (user?.id) {
    syncPrayerBooks().catch(() => {});
  }
  return syncId;
};

export const deletePrayerPhoto = async (photoSyncId) => {
  const db = await getDatabase();
  const {user} = await currentOwner();
  const owner = ownerWhere(user);
  const photo = await db.getFirstAsync(
    `SELECT * FROM personal_prayer_photos WHERE sync_id = ? AND ${owner.clause} LIMIT 1`,
    [photoSyncId, ...owner.values]
  );
  if (!photo) {
    return;
  }
  deleteLocalFile(photo.local_uri);

  if (!user?.id) {
    await db.runAsync('DELETE FROM personal_prayer_photos WHERE id = ?', [photo.id]);
    return;
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `
      UPDATE personal_prayer_photos
      SET local_uri = NULL, deleted_at = ?, updated_at = ?, sync_status = 'deleted'
      WHERE id = ?
    `,
    [now, now, photo.id]
  );
  syncPrayerBooks().catch(() => {});
};

const postJson = async (path, payload, fallback) => {
  const response = await authenticatedFetch(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwResponseError(response, fallback);
  }
  return readResponseData(response);
};

const pushBooks = async (db, user) => {
  const rows = await db.getAllAsync(
    `SELECT * FROM personal_prayer_books WHERE cloud_user_id = ? AND sync_status IN ('pending','deleted') ORDER BY created_at ASC`,
    [user.id]
  );
  for (const row of rows) {
    const server = await postJson(
      '/api/personal-prayer-books/',
      {
        sync_id: row.sync_id,
        title: row.title,
        description: row.description || '',
        updated_at: row.updated_at,
        deleted_at: row.deleted_at || null,
      },
      'Ошибка синхронизации молитвослова'
    );
    await db.runAsync(
      `UPDATE personal_prayer_books SET server_id = ?, sync_status = 'synced', updated_at = COALESCE(?, updated_at), deleted_at = ? WHERE id = ?`,
      [server.id ?? row.server_id ?? null, server.updated_at ?? null, server.deleted_at ?? row.deleted_at ?? null, row.id]
    );
    if (row.deleted_at) {
      const response = await authenticatedFetch(
        `/api/personal-prayer-books/${row.sync_id}/`,
        {method: 'DELETE'}
      );
      if (!response.ok && response.status !== 404) {
        await throwResponseError(response, 'Ошибка удаления молитвослова');
      }
    }
  }
};

const pushPrayers = async (db, user) => {
  const rows = await db.getAllAsync(
    `SELECT * FROM personal_prayers WHERE cloud_user_id = ? AND sync_status IN ('pending','deleted') ORDER BY created_at ASC`,
    [user.id]
  );
  for (const row of rows) {
    const server = await postJson(
      '/api/personal-prayers/',
      {
        sync_id: row.sync_id,
        title: row.title,
        text: row.text || '',
        origin_type: row.origin_type || 'custom',
        origin_data: parseJson(row.origin_data, {}),
        updated_at: row.updated_at,
        deleted_at: row.deleted_at || null,
      },
      'Ошибка синхронизации молитвы'
    );
    await db.runAsync(
      `UPDATE personal_prayers SET server_id = ?, sync_status = 'synced', updated_at = COALESCE(?, updated_at), deleted_at = ? WHERE id = ?`,
      [server.id ?? row.server_id ?? null, server.updated_at ?? null, server.deleted_at ?? row.deleted_at ?? null, row.id]
    );
    if (row.deleted_at) {
      const response = await authenticatedFetch(
        `/api/personal-prayers/${row.sync_id}/`,
        {method: 'DELETE'}
      );
      if (!response.ok && response.status !== 404) {
        await throwResponseError(response, 'Ошибка удаления молитвы');
      }
    }
  }
};

const pushItems = async (db, user) => {
  const rows = await db.getAllAsync(
    `SELECT * FROM personal_prayer_book_items WHERE cloud_user_id = ? AND sync_status IN ('pending','deleted') ORDER BY created_at ASC`,
    [user.id]
  );
  for (const row of rows) {
    const server = await postJson(
      '/api/personal-prayer-book-items/',
      {
        sync_id: row.sync_id,
        book_sync_id: row.book_sync_id,
        prayer_sync_id: row.prayer_sync_id,
        order: row.sort_order || 0,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at || null,
      },
      'Ошибка синхронизации состава молитвослова'
    );
    await db.runAsync(
      `UPDATE personal_prayer_book_items SET server_id = ?, sync_status = 'synced', updated_at = COALESCE(?, updated_at), deleted_at = ? WHERE id = ?`,
      [server.id ?? row.server_id ?? null, server.updated_at ?? null, server.deleted_at ?? row.deleted_at ?? null, row.id]
    );
    if (row.deleted_at) {
      const response = await authenticatedFetch(
        `/api/personal-prayer-book-items/${row.sync_id}/`,
        {method: 'DELETE'}
      );
      if (!response.ok && response.status !== 404) {
        await throwResponseError(response, 'Ошибка удаления молитвы из сборника');
      }
    }
  }
};

const uploadPhoto = async (row) => {
  const token = await getApiToken();
  if (!token) {
    throw new Error('Пользователь не авторизован');
  }

  const form = new FormData();
  form.append('prayer_sync_id', row.prayer_sync_id);
  form.append('sync_id', row.sync_id);
  form.append('order', String(row.sort_order || 0));
  form.append('file', {
    uri: row.local_uri,
    name: row.original_name || `${row.sync_id}.jpg`,
    type: row.content_type || 'image/jpeg',
  });

  const response = await fetch(`${API_BASE_URL}/api/personal-prayer-photos/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
    },
    body: form,
  });
  if (!response.ok) {
    await throwResponseError(response, 'Ошибка загрузки фото молитвы');
  }
  return readResponseData(response);
};

const pushPhotos = async (db, user) => {
  const rows = await db.getAllAsync(
    `SELECT * FROM personal_prayer_photos WHERE cloud_user_id = ? AND sync_status IN ('pending','deleted') ORDER BY created_at ASC`,
    [user.id]
  );

  for (const row of rows) {
    if (row.deleted_at) {
      const response = await authenticatedFetch(
        `/api/personal-prayer-photos/${row.sync_id}/`,
        {method: 'DELETE'}
      );
      if (!response.ok && response.status !== 404) {
        await throwResponseError(response, 'Ошибка удаления фото молитвы');
      }
      await db.runAsync(
        `UPDATE personal_prayer_photos SET sync_status = 'synced' WHERE id = ?`,
        [row.id]
      );
      continue;
    }

    if (!row.local_uri) {
      continue;
    }

    const server = await uploadPhoto(row);
    await db.runAsync(
      `
        UPDATE personal_prayer_photos
        SET server_id = ?, remote_url = ?, sync_status = 'synced',
            updated_at = COALESCE(?, updated_at)
        WHERE id = ?
      `,
      [server.id ?? null, server.download_url || null, server.updated_at ?? null, row.id]
    );
  }
};

const pullJsonList = async (path, fallback) => {
  const response = await authenticatedFetch(path);
  if (!response.ok) {
    await throwResponseError(response, fallback);
  }
  const data = await readResponseData(response);
  return Array.isArray(data) ? data : data?.results || [];
};

const upsertBook = async (db, user, item) => {
  await db.runAsync(
    `
      INSERT INTO personal_prayer_books (
        sync_id, cloud_user_id, server_id, sync_status,
        title, description, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, 'synced', ?, ?, ?, ?, ?)
      ON CONFLICT(sync_id) DO UPDATE SET
        cloud_user_id = excluded.cloud_user_id,
        server_id = excluded.server_id,
        sync_status = 'synced',
        title = excluded.title,
        description = excluded.description,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `,
    [
      item.sync_id,
      user.id,
      item.id ?? null,
      item.title || 'Мой молитвослов',
      item.description || '',
      item.created_at || item.updated_at || new Date().toISOString(),
      item.updated_at || new Date().toISOString(),
      item.deleted_at || null,
    ]
  );
};

const upsertPrayer = async (db, user, item) => {
  await db.runAsync(
    `
      INSERT INTO personal_prayers (
        sync_id, cloud_user_id, server_id, sync_status,
        title, text, origin_type, origin_data,
        created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, 'synced', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sync_id) DO UPDATE SET
        cloud_user_id = excluded.cloud_user_id,
        server_id = excluded.server_id,
        sync_status = 'synced',
        title = excluded.title,
        text = excluded.text,
        origin_type = excluded.origin_type,
        origin_data = excluded.origin_data,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `,
    [
      item.sync_id,
      user.id,
      item.id ?? null,
      item.title || 'Молитва',
      item.text || '',
      item.origin_type || 'custom',
      stringifyJson(item.origin_data || {}),
      item.created_at || item.updated_at || new Date().toISOString(),
      item.updated_at || new Date().toISOString(),
      item.deleted_at || null,
    ]
  );
};

const upsertBookItem = async (db, user, item) => {
  await db.runAsync(
    `
      INSERT INTO personal_prayer_book_items (
        book_sync_id, prayer_sync_id, sync_id,
        cloud_user_id, server_id, sync_status,
        sort_order, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?)
      ON CONFLICT(sync_id) DO UPDATE SET
        book_sync_id = excluded.book_sync_id,
        prayer_sync_id = excluded.prayer_sync_id,
        cloud_user_id = excluded.cloud_user_id,
        server_id = excluded.server_id,
        sync_status = 'synced',
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `,
    [
      item.book_sync_id,
      item.prayer_sync_id,
      item.sync_id,
      user.id,
      item.id ?? null,
      item.order || 0,
      item.created_at || item.updated_at || new Date().toISOString(),
      item.updated_at || new Date().toISOString(),
      item.deleted_at || null,
    ]
  );
};

const upsertPhoto = async (db, user, item) => {
  const current = await db.getFirstAsync(
    `SELECT * FROM personal_prayer_photos WHERE sync_id = ? AND cloud_user_id = ? LIMIT 1`,
    [item.sync_id, user.id]
  );

  if (item.deleted_at) {
    deleteLocalFile(current?.local_uri);
  }

  let localUri = current?.local_uri || null;
  if (!item.deleted_at && !localUri && item.download_url) {
    localUri = await cacheRemotePhoto(item);
  }

  await db.runAsync(
    `
      INSERT INTO personal_prayer_photos (
        prayer_sync_id, sync_id, cloud_user_id, server_id, sync_status,
        local_uri, remote_url, original_name, content_type, sort_order,
        created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, 'synced', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sync_id) DO UPDATE SET
        prayer_sync_id = excluded.prayer_sync_id,
        cloud_user_id = excluded.cloud_user_id,
        server_id = excluded.server_id,
        sync_status = 'synced',
        local_uri = excluded.local_uri,
        remote_url = excluded.remote_url,
        original_name = excluded.original_name,
        content_type = excluded.content_type,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `,
    [
      item.prayer_sync_id,
      item.sync_id,
      user.id,
      item.id ?? null,
      localUri,
      item.download_url || null,
      item.original_name || '',
      item.content_type || '',
      item.order || 0,
      item.created_at || item.updated_at || new Date().toISOString(),
      item.updated_at || new Date().toISOString(),
      item.deleted_at || null,
    ]
  );
};

const pullAll = async (db, user) => {
  const [books, prayers, items, photos] = await Promise.all([
    pullJsonList(
      '/api/personal-prayer-books/?include_deleted=true',
      'Ошибка загрузки молитвословов'
    ),
    pullJsonList(
      '/api/personal-prayers/?include_deleted=true',
      'Ошибка загрузки личных молитв'
    ),
    pullJsonList(
      '/api/personal-prayer-book-items/?include_deleted=true',
      'Ошибка загрузки состава молитвословов'
    ),
    pullJsonList(
      '/api/personal-prayer-photos/?include_deleted=true',
      'Ошибка загрузки фото молитв'
    ),
  ]);

  for (const item of books) {
    await upsertBook(db, user, item);
  }
  for (const item of prayers) {
    await upsertPrayer(db, user, item);
  }
  for (const item of items) {
    await upsertBookItem(db, user, item);
  }
  for (const item of photos) {
    await upsertPhoto(db, user, item);
  }
};

const runSync = async () => {
  const user = await getCachedBackendUser();
  if (!user?.id) {
    return {
      success: false,
      reason: 'no-user',
    };
  }

  const db = await getDatabase();
  const errors = [];

  for (const task of [pushBooks, pushPrayers, pushItems, pushPhotos]) {
    try {
      await task(db, user);
    } catch (error) {
      errors.push(error);
    }
  }

  try {
    await pullAll(db, user);
  } catch (error) {
    errors.push(error);
  }

  return {
    success: errors.length === 0,
    errors,
    error: errors[0] || null,
  };
};

export const syncPrayerBooks = async () => {
  if (prayerBooksSyncPromise) {
    return prayerBooksSyncPromise;
  }

  prayerBooksSyncPromise = runSync();
  try {
    return await prayerBooksSyncPromise;
  } finally {
    prayerBooksSyncPromise = null;
  }
};
