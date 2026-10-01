import * as Crypto from 'expo-crypto';

import {
  Directory,
  File,
  Paths,
} from 'expo-file-system';

import {getDatabase} from '../db/database';

import {
  API_BASE_URL,
  authenticatedFetch,
  getApiToken,
  getCachedBackendUser,
} from './backendAuth';

let memorialSyncPromise = null;

const parseJson = (value, fallback) => {
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

const parseNames = (value) => {
  const parsed = parseJson(value, []);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((name) => String(name || '').trim())
    .filter(Boolean);
};

const stringifyNames = (value) =>
  JSON.stringify(
    (Array.isArray(value) ? value : [])
      .map((name) => String(name || '').trim())
      .filter(Boolean)
  );

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

const preparePhoto = (photo) => ({
  ...photo,

  id: Number(photo.id),
  sort_order: Number(photo.sort_order || 0),

  display_uri:
    photo.local_uri ||
    photo.remote_url ||
    '',
});

const prepareBook = (
  book,
  photos = []
) => ({
  ...book,

  id: Number(book.id),

  health_names:
    parseNames(book.health_names),

  repose_names:
    parseNames(book.repose_names),

  photos:
    photos
      .filter(
        (photo) =>
          photo.book_sync_id ===
          book.sync_id
      )
      .map(preparePhoto)
      .sort(
        (left, right) =>
          Number(left.sort_order || 0) -
          Number(right.sort_order || 0)
      ),
});

const currentOwner = async () => {
  const user =
    await getCachedBackendUser();

  return {
    user,
    cloudUserId:
      user?.id ?? null,
  };
};

const ownerWhere = (
  user,
  alias = ''
) => {
  const prefix =
    alias ? `${alias}.` : '';

  if (user?.id) {
    return {
      clause:
        `${prefix}cloud_user_id = ?`,
      values: [user.id],
    };
  }

  return {
    clause:
      `${prefix}cloud_user_id IS NULL`,
    values: [],
  };
};

const getBookRow = async (
  db,
  syncId,
  user
) => {
  const owner =
    ownerWhere(user);

  return db.getFirstAsync(
    `
      SELECT *
      FROM memorial_books
      WHERE sync_id = ?
      AND ${owner.clause}
      LIMIT 1
    `,
    [
      syncId,
      ...owner.values,
    ]
  );
};

const getPhotoRows = async (
  db,
  user,
  {
    includeDeleted = false,
    bookSyncId = null,
  } = {}
) => {
  const owner =
    ownerWhere(user);

  const conditions = [
    owner.clause,
  ];

  const values = [
    ...owner.values,
  ];

  if (!includeDeleted) {
    conditions.push(
      'deleted_at IS NULL'
    );
  }

  if (bookSyncId) {
    conditions.push(
      'book_sync_id = ?'
    );

    values.push(bookSyncId);
  }

  return db.getAllAsync(
    `
      SELECT *
      FROM memorial_photos
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        sort_order ASC,
        created_at ASC,
        id ASC
    `,
    values
  );
};

const deleteLocalFile = (
  uri
) => {
  if (!uri) {
    return;
  }

  try {
    const file =
      new File(uri);

    if (file.exists) {
      file.delete();
    }
  } catch {
    // Файл мог быть уже удалён системой или пользователем.
  }
};

const extensionFromAsset = (
  asset
) => {
  const name =
    String(
      asset?.fileName ||
      asset?.uri ||
      ''
    );

  const match =
    name.match(
      /\.([a-zA-Z0-9]{2,5})(?:\?|$)/
    );

  if (match) {
    const value =
      match[1].toLowerCase();

    if (
      [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'heic',
        'heif',
      ].includes(value)
    ) {
      return value === 'jpeg'
        ? 'jpg'
        : value;
    }
  }

  const mimeType =
    String(
      asset?.mimeType || ''
    ).toLowerCase();

  const byMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };

  return byMime[mimeType] || 'jpg';
};

const contentTypeFromAsset = (
  asset,
  extension
) => {
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

  return (
    byExtension[extension] ||
    'image/jpeg'
  );
};

const cacheRemotePhoto = async (
  serverPhoto
) => {
  const url =
    String(
      serverPhoto?.download_url ||
      ''
    ).trim();

  if (
    !url ||
    serverPhoto?.deleted_at
  ) {
    return null;
  }

  try {
    const directory =
      new Directory(
        Paths.document,
        'memorials'
      );

    directory.create({
      idempotent: true,
      intermediates: true,
    });

    const extension =
      extensionFromAsset({
        fileName:
          serverPhoto.original_name,

        mimeType:
          serverPhoto.content_type,

        uri: url,
      });

    const target =
      new File(
        directory,
        `${serverPhoto.sync_id}.${extension}`
      );

    const downloaded =
      await File.downloadFileAsync(
        url,
        target,
        {
          idempotent: true,
        }
      );

    return downloaded.uri;
  } catch (error) {
    /*
     * Кэширование не должно ломать общую синхронизацию:
     * пока есть свежий signed URL, фото всё равно можно показать онлайн.
     */
    console.log(
      'Не удалось закэшировать фото помянника:',
      error?.message || error
    );

    return null;
  }
};


const persistPhotoAsset = async (
  asset,
  syncId
) => {
  if (!asset?.uri) {
    throw new Error(
      'Не удалось получить файл фотографии'
    );
  }

  const directory =
    new Directory(
      Paths.document,
      'memorials'
    );

  directory.create({
    idempotent: true,
    intermediates: true,
  });

  const extension =
    extensionFromAsset(asset);

  const target =
    new File(
      directory,
      `${syncId}.${extension}`
    );

  const source =
    new File(asset.uri);

  await source.copy(
    target,
    {
      overwrite: true,
    }
  );

  return {
    uri: target.uri,

    originalName:
      asset.fileName ||
      `memorial-${syncId}.${extension}`,

    contentType:
      contentTypeFromAsset(
        asset,
        extension
      ),
  };
};

export const getMemorialBooks =
  async () => {
    const db =
      await getDatabase();

    const {user} =
      await currentOwner();

    const owner =
      ownerWhere(user);

    const books =
      await db.getAllAsync(
        `
          SELECT *
          FROM memorial_books
          WHERE ${owner.clause}
          AND deleted_at IS NULL
          ORDER BY
            updated_at DESC,
            id DESC
        `,
        owner.values
      );

    const photos =
      await getPhotoRows(
        db,
        user
      );

    return books.map(
      (book) =>
        prepareBook(
          book,
          photos
        )
    );
  };

export const getMemorialBook =
  async (
    syncId
  ) => {
    const db =
      await getDatabase();

    const {user} =
      await currentOwner();

    const book =
      await getBookRow(
        db,
        syncId,
        user
      );

    if (
      !book ||
      book.deleted_at
    ) {
      return null;
    }

    const photos =
      await getPhotoRows(
        db,
        user,
        {
          bookSyncId: syncId,
        }
      );

    return prepareBook(
      book,
      photos
    );
  };

export const createMemorialBook =
  async (
    title = 'Мой помянник'
  ) => {
    const db =
      await getDatabase();

    const {user, cloudUserId} =
      await currentOwner();

    const syncId =
      Crypto.randomUUID();

    const now =
      new Date().toISOString();

    const cleanTitle =
      String(
        title ||
        'Мой помянник'
      ).trim() ||
      'Мой помянник';

    const result =
      await db.runAsync(
        `
          INSERT INTO memorial_books (
            sync_id,
            cloud_user_id,
            server_id,
            sync_status,

            title,
            health_names,
            repose_names,

            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?
          )
        `,
        [
          syncId,
          cloudUserId,
          null,
          user?.id
            ? 'pending'
            : 'local',

          cleanTitle,
          '[]',
          '[]',

          now,
          now,
          null,
        ]
      );

    const row =
      await db.getFirstAsync(
        `
          SELECT *
          FROM memorial_books
          WHERE id = ?
        `,
        [
          result.lastInsertRowId,
        ]
      );

    if (user?.id) {
      syncMemorials().catch(
        () => {}
      );
    }

    return prepareBook(
      row,
      []
    );
  };

export const updateMemorialBook =
  async (
    syncId,
    patch = {}
  ) => {
    const db =
      await getDatabase();

    const {user} =
      await currentOwner();

    const current =
      await getBookRow(
        db,
        syncId,
        user
      );

    if (
      !current ||
      current.deleted_at
    ) {
      throw new Error(
        'Помянник не найден'
      );
    }

    const title =
      patch.title !== undefined
        ? (
            String(
              patch.title || ''
            ).trim() ||
            'Мой помянник'
          )
        : current.title;

    const healthNames =
      patch.health_names !== undefined
        ? patch.health_names
        : parseNames(
            current.health_names
          );

    const reposeNames =
      patch.repose_names !== undefined
        ? patch.repose_names
        : parseNames(
            current.repose_names
          );

    const now =
      new Date().toISOString();

    await db.runAsync(
      `
        UPDATE memorial_books
        SET
          title = ?,
          health_names = ?,
          repose_names = ?,
          sync_status = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        title,
        stringifyNames(
          healthNames
        ),
        stringifyNames(
          reposeNames
        ),
        user?.id
          ? 'pending'
          : 'local',
        now,
        current.id,
      ]
    );

    if (user?.id) {
      syncMemorials().catch(
        () => {}
      );
    }

    return getMemorialBook(
      syncId
    );
  };

export const deleteMemorialBook =
  async (
    syncId
  ) => {
    const db =
      await getDatabase();

    const {user} =
      await currentOwner();

    const book =
      await getBookRow(
        db,
        syncId,
        user
      );

    if (!book) {
      return;
    }

    const photos =
      await getPhotoRows(
        db,
        user,
        {
          includeDeleted: true,
          bookSyncId: syncId,
        }
      );

    photos.forEach(
      (photo) =>
        deleteLocalFile(
          photo.local_uri
        )
    );

    if (!user?.id) {
      await db.runAsync(
        `
          DELETE FROM memorial_photos
          WHERE book_sync_id = ?
          AND cloud_user_id IS NULL
        `,
        [syncId]
      );

      await db.runAsync(
        `
          DELETE FROM memorial_books
          WHERE id = ?
        `,
        [book.id]
      );

      return;
    }

    const now =
      new Date().toISOString();

    await db.runAsync(
      `
        UPDATE memorial_books
        SET
          deleted_at = ?,
          updated_at = ?,
          sync_status = 'deleted'
        WHERE id = ?
      `,
      [
        now,
        now,
        book.id,
      ]
    );

    await db.runAsync(
      `
        UPDATE memorial_photos
        SET
          deleted_at = ?,
          updated_at = ?,
          sync_status = 'deleted',
          local_uri = NULL
        WHERE book_sync_id = ?
        AND cloud_user_id = ?
      `,
      [
        now,
        now,
        syncId,
        user.id,
      ]
    );

    syncMemorials().catch(
      () => {}
    );
  };

export const addMemorialPhoto =
  async (
    bookSyncId,
    asset
  ) => {
    const db =
      await getDatabase();

    const {user, cloudUserId} =
      await currentOwner();

    const book =
      await getBookRow(
        db,
        bookSyncId,
        user
      );

    if (
      !book ||
      book.deleted_at
    ) {
      throw new Error(
        'Сначала создайте помянник'
      );
    }

    const syncId =
      Crypto.randomUUID();

    const persisted =
      await persistPhotoAsset(
        asset,
        syncId
      );

    const photoOwner =
      ownerWhere(user);

    const maxOrder =
      await db.getFirstAsync(
        `
          SELECT
            COALESCE(
              MAX(sort_order),
              -1
            ) AS max_order
          FROM memorial_photos
          WHERE book_sync_id = ?
          AND deleted_at IS NULL
          AND ${photoOwner.clause}
        `,
        [
          bookSyncId,
          ...photoOwner.values,
        ]
      );

    const sortOrder =
      Number(
        maxOrder?.max_order ?? -1
      ) + 1;

    const now =
      new Date().toISOString();

    const result =
      await db.runAsync(
        `
          INSERT INTO memorial_photos (
            book_sync_id,

            sync_id,
            cloud_user_id,
            server_id,
            sync_status,

            local_uri,
            remote_url,

            original_name,
            content_type,
            sort_order,

            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?
          )
        `,
        [
          bookSyncId,

          syncId,
          cloudUserId,
          null,
          user?.id
            ? 'pending'
            : 'local',

          persisted.uri,
          null,

          persisted.originalName,
          persisted.contentType,
          sortOrder,

          now,
          now,
          null,
        ]
      );

    const photo =
      await db.getFirstAsync(
        `
          SELECT *
          FROM memorial_photos
          WHERE id = ?
        `,
        [
          result.lastInsertRowId,
        ]
      );

    if (user?.id) {
      syncMemorials().catch(
        () => {}
      );
    }

    return preparePhoto(
      photo
    );
  };

export const deleteMemorialPhoto =
  async (
    photoSyncId
  ) => {
    const db =
      await getDatabase();

    const {user} =
      await currentOwner();

    const owner =
      ownerWhere(user);

    const photo =
      await db.getFirstAsync(
        `
          SELECT *
          FROM memorial_photos
          WHERE sync_id = ?
          AND ${owner.clause}
          LIMIT 1
        `,
        [
          photoSyncId,
          ...owner.values,
        ]
      );

    if (!photo) {
      return;
    }

    deleteLocalFile(
      photo.local_uri
    );

    if (!user?.id) {
      await db.runAsync(
        `
          DELETE FROM memorial_photos
          WHERE id = ?
        `,
        [photo.id]
      );

      return;
    }

    const now =
      new Date().toISOString();

    await db.runAsync(
      `
        UPDATE memorial_photos
        SET
          local_uri = NULL,
          deleted_at = ?,
          updated_at = ?,
          sync_status = 'deleted'
        WHERE id = ?
      `,
      [
        now,
        now,
        photo.id,
      ]
    );

    syncMemorials().catch(
      () => {}
    );
  };

const bookToServerPayload = (
  book
) => ({
  sync_id:
    book.sync_id,

  title:
    book.title ||
    'Мой помянник',

  health_names:
    parseNames(
      book.health_names
    ),

  repose_names:
    parseNames(
      book.repose_names
    ),

  updated_at:
    book.updated_at,

  deleted_at:
    book.deleted_at || null,
});

const pushBook = async (
  db,
  user,
  book
) => {
    const response =
      await authenticatedFetch(
        '/api/memorial-books/',
        {
          method: 'POST',

          body: JSON.stringify(
            bookToServerPayload(
              book
            )
          ),
        }
      );

    if (!response.ok) {
      await throwResponseError(
        response,
        'Ошибка синхронизации помянника'
      );
    }

    const serverBook =
      await readResponseData(
        response
      );

    await db.runAsync(
      `
        UPDATE memorial_books
        SET
          server_id = ?,
          sync_status = 'synced',
          title = ?,
          health_names = ?,
          repose_names = ?,
          updated_at = ?,
          deleted_at = ?
        WHERE id = ?
        AND cloud_user_id = ?
      `,
      [
        serverBook.id ??
          book.server_id ??
          null,

        serverBook.title ??
          book.title,

        stringifyNames(
          serverBook.health_names ??
            parseNames(
              book.health_names
            )
        ),

        stringifyNames(
          serverBook.repose_names ??
            parseNames(
              book.repose_names
            )
        ),

        serverBook.updated_at ??
          book.updated_at,

        serverBook.deleted_at ??
          book.deleted_at ??
          null,

        book.id,
        user.id,
      ]
    );

    if (book.deleted_at) {
      const deleteResponse =
        await authenticatedFetch(
          `/api/memorial-books/${book.sync_id}/`,
          {
            method: 'DELETE',
          }
        );

      if (
        !deleteResponse.ok &&
        deleteResponse.status !== 404
      ) {
        await throwResponseError(
          deleteResponse,
          'Ошибка удаления помянника'
        );
      }

      await db.runAsync(
        `
          UPDATE memorial_books
          SET sync_status = 'synced'
          WHERE id = ?
          AND cloud_user_id = ?
        `,
        [
          book.id,
          user.id,
        ]
      );
    }
  };

const pushPendingBooks = async (
  db,
  user
) => {
    const books =
      await db.getAllAsync(
        `
          SELECT *
          FROM memorial_books
          WHERE cloud_user_id = ?
          AND sync_status IN (
            'pending',
            'deleted'
          )
          ORDER BY
            created_at ASC,
            id ASC
        `,
        [user.id]
      );

    const errors = [];

    for (const book of books) {
      try {
        await pushBook(
          db,
          user,
          book
        );
      } catch (error) {
        errors.push(error);
      }
    }

    return errors;
  };

const uploadPhoto = async (
  db,
  user,
  photo
) => {
    const token =
      await getApiToken();

    if (!token) {
      throw new Error(
        'Пользователь не авторизован'
      );
    }

    if (!photo.local_uri) {
      throw new Error(
        'Локальный файл фотографии не найден'
      );
    }

    const formData =
      new FormData();

    formData.append(
      'book_sync_id',
      photo.book_sync_id
    );

    formData.append(
      'sync_id',
      photo.sync_id
    );

    formData.append(
      'order',
      String(
        photo.sort_order || 0
      )
    );

    formData.append(
      'file',
      {
        uri:
          photo.local_uri,

        name:
          photo.original_name ||
          `memorial-${photo.sync_id}.jpg`,

        type:
          photo.content_type ||
          'image/jpeg',
      }
    );

    const response =
      await fetch(
        `${API_BASE_URL}/api/memorial-photos/`,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Token ${token}`,
          },

          body: formData,
        }
      );

    if (!response.ok) {
      await throwResponseError(
        response,
        'Ошибка загрузки фотографии'
      );
    }

    const serverPhoto =
      await readResponseData(
        response
      );

    await db.runAsync(
      `
        UPDATE memorial_photos
        SET
          server_id = ?,
          remote_url = ?,
          sync_status = 'synced',
          updated_at = ?,
          deleted_at = ?
        WHERE id = ?
        AND cloud_user_id = ?
      `,
      [
        serverPhoto.id ??
          photo.server_id ??
          null,

        serverPhoto.download_url ||
          photo.remote_url ||
          null,

        serverPhoto.updated_at ||
          photo.updated_at,

        serverPhoto.deleted_at ??
          photo.deleted_at ??
          null,

        photo.id,
        user.id,
      ]
    );
  };

const deleteRemotePhoto =
  async (
    db,
    user,
    photo
  ) => {
    const response =
      await authenticatedFetch(
        `/api/memorial-photos/${photo.sync_id}/`,
        {
          method: 'DELETE',
        }
      );

    if (
      !response.ok &&
      response.status !== 404
    ) {
      await throwResponseError(
        response,
        'Ошибка удаления фотографии'
      );
    }

    await db.runAsync(
      `
        UPDATE memorial_photos
        SET
          sync_status = 'synced'
        WHERE id = ?
        AND cloud_user_id = ?
      `,
      [
        photo.id,
        user.id,
      ]
    );
  };

const pushPendingPhotos =
  async (
    db,
    user
  ) => {
    const photos =
      await db.getAllAsync(
        `
          SELECT *
          FROM memorial_photos
          WHERE cloud_user_id = ?
          AND sync_status IN (
            'pending',
            'deleted'
          )
          ORDER BY
            created_at ASC,
            id ASC
        `,
        [user.id]
      );

    const errors = [];

    for (const photo of photos) {
      try {
        if (photo.deleted_at) {
          await deleteRemotePhoto(
            db,
            user,
            photo
          );
        } else {
          await uploadPhoto(
            db,
            user,
            photo
          );
        }
      } catch (error) {
        errors.push(error);
      }
    }

    return errors;
  };

const pullBooks = async (
  db,
  user
) => {
    const response =
      await authenticatedFetch(
        '/api/memorial-books/?include_deleted=1'
      );

    if (!response.ok) {
      await throwResponseError(
        response,
        'Ошибка загрузки помянников'
      );
    }

    const data =
      await readResponseData(
        response
      );

    const books =
      Array.isArray(data)
        ? data
        : Array.isArray(
              data?.results
            )
          ? data.results
          : [];

    for (const serverBook of books) {
      if (!serverBook.sync_id) {
        continue;
      }

      const existing =
        await db.getFirstAsync(
          `
            SELECT *
            FROM memorial_books
            WHERE sync_id = ?
            AND cloud_user_id = ?
            LIMIT 1
          `,
          [
            serverBook.sync_id,
            user.id,
          ]
        );

      if (
        existing &&
        (
          existing.sync_status ===
            'pending' ||
          existing.sync_status ===
            'deleted'
        )
      ) {
        continue;
      }

      if (existing) {
        await db.runAsync(
          `
            UPDATE memorial_books
            SET
              server_id = ?,
              sync_status = 'synced',
              title = ?,
              health_names = ?,
              repose_names = ?,
              created_at = ?,
              updated_at = ?,
              deleted_at = ?
            WHERE id = ?
          `,
          [
            serverBook.id ??
              existing.server_id ??
              null,

            serverBook.title ||
              'Мой помянник',

            stringifyNames(
              serverBook.health_names
            ),

            stringifyNames(
              serverBook.repose_names
            ),

            serverBook.created_at ||
              existing.created_at,

            serverBook.updated_at ||
              existing.updated_at,

            serverBook.deleted_at ??
              null,

            existing.id,
          ]
        );
      } else {
        await db.runAsync(
          `
            INSERT INTO memorial_books (
              sync_id,
              cloud_user_id,
              server_id,
              sync_status,

              title,
              health_names,
              repose_names,

              created_at,
              updated_at,
              deleted_at
            )
            VALUES (
              ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?
            )
          `,
          [
            serverBook.sync_id,
            user.id,
            serverBook.id ??
              null,
            'synced',

            serverBook.title ||
              'Мой помянник',

            stringifyNames(
              serverBook.health_names
            ),

            stringifyNames(
              serverBook.repose_names
            ),

            serverBook.created_at ||
              new Date().toISOString(),

            serverBook.updated_at ||
              new Date().toISOString(),

            serverBook.deleted_at ??
              null,
          ]
        );
      }
    }
  };

const pullPhotos = async (
  db,
  user
) => {
    const response =
      await authenticatedFetch(
        '/api/memorial-photos/?include_deleted=1'
      );

    if (!response.ok) {
      await throwResponseError(
        response,
        'Ошибка загрузки фотографий помянника'
      );
    }

    const data =
      await readResponseData(
        response
      );

    const photos =
      Array.isArray(data)
        ? data
        : Array.isArray(
              data?.results
            )
          ? data.results
          : [];

    for (const serverPhoto of photos) {
      if (
        !serverPhoto.sync_id ||
        !serverPhoto.book_sync_id
      ) {
        continue;
      }

      const existing =
        await db.getFirstAsync(
          `
            SELECT *
            FROM memorial_photos
            WHERE sync_id = ?
            AND cloud_user_id = ?
            LIMIT 1
          `,
          [
            serverPhoto.sync_id,
            user.id,
          ]
        );

      if (
        existing &&
        (
          existing.sync_status ===
            'pending' ||
          existing.sync_status ===
            'deleted'
        )
      ) {
        continue;
      }

      if (
        serverPhoto.deleted_at &&
        existing?.local_uri
      ) {
        deleteLocalFile(
          existing.local_uri
        );
      }

      const cachedLocalUri =
        !serverPhoto.deleted_at &&
        !existing?.local_uri
          ? await cacheRemotePhoto(
              serverPhoto
            )
          : null;

      if (existing) {
        await db.runAsync(
          `
            UPDATE memorial_photos
            SET
              book_sync_id = ?,
              server_id = ?,
              sync_status = 'synced',
              remote_url = ?,
              original_name = ?,
              content_type = ?,
              sort_order = ?,
              updated_at = ?,
              deleted_at = ?,
              local_uri = ?
            WHERE id = ?
          `,
          [
            serverPhoto.book_sync_id,
            serverPhoto.id ??
              existing.server_id ??
              null,

            serverPhoto.download_url ||
              existing.remote_url ||
              null,

            serverPhoto.original_name ||
              existing.original_name ||
              '',

            serverPhoto.content_type ||
              existing.content_type ||
              '',

            Number(
              serverPhoto.order ??
                existing.sort_order ??
                0
            ),

            serverPhoto.updated_at ||
              existing.updated_at,

            serverPhoto.deleted_at ??
              null,

            serverPhoto.deleted_at
              ? null
              : (
                  existing.local_uri ||
                  cachedLocalUri ||
                  null
                ),

            existing.id,
          ]
        );
      } else {
        await db.runAsync(
          `
            INSERT INTO memorial_photos (
              book_sync_id,

              sync_id,
              cloud_user_id,
              server_id,
              sync_status,

              local_uri,
              remote_url,

              original_name,
              content_type,
              sort_order,

              created_at,
              updated_at,
              deleted_at
            )
            VALUES (
              ?,
              ?, ?, ?, ?,
              ?, ?,
              ?, ?, ?,
              ?, ?, ?
            )
          `,
          [
            serverPhoto.book_sync_id,

            serverPhoto.sync_id,
            user.id,
            serverPhoto.id ??
              null,
            'synced',

            cachedLocalUri,
            serverPhoto.download_url ||
              null,

            serverPhoto.original_name ||
              '',
            serverPhoto.content_type ||
              '',
            Number(
              serverPhoto.order ||
                0
            ),

            serverPhoto.created_at ||
              new Date().toISOString(),

            serverPhoto.updated_at ||
              new Date().toISOString(),

            serverPhoto.deleted_at ??
              null,
          ]
        );
      }
    }
  };

const runMemorialSync =
  async () => {
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

    const db =
      await getDatabase();

    try {
      const bookErrors =
        await pushPendingBooks(
          db,
          user
        );

      const photoErrors =
        await pushPendingPhotos(
          db,
          user
        );

      await pullBooks(
        db,
        user
      );

      await pullPhotos(
        db,
        user
      );

      const errors = [
        ...bookErrors,
        ...photoErrors,
      ];

      return {
        success:
          errors.length === 0,

        errors,
        error:
          errors[0] || null,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  };

export const syncMemorials =
  async () => {
    if (memorialSyncPromise) {
      return memorialSyncPromise;
    }

    memorialSyncPromise =
      runMemorialSync();

    try {
      return await memorialSyncPromise;
    } finally {
      memorialSyncPromise = null;
    }
  };
