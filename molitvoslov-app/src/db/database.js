import * as SQLite from 'expo-sqlite';

let database = null;

export const getDatabase = async () => {
  if (!database) {
    database = await SQLite.openDatabaseAsync('molitvoslov.db');
  }

  return database;
};

export const initDatabase = async () => {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS local_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS saved_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      user_id INTEGER NOT NULL,
      cloud_user_id INTEGER,

      sync_id TEXT,
      server_id INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'legacy',

      save_type TEXT NOT NULL,

      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,

      anchor_type TEXT NOT NULL,
      anchor_id INTEGER NOT NULL,

      source_title TEXT,
      item_title TEXT,
      text TEXT,

      start_offset INTEGER,
      end_offset INTEGER,

      metadata TEXT,

      created_at TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      user_id INTEGER NOT NULL,
      cloud_user_id INTEGER,

      server_id INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'legacy',

      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,

      anchor_type TEXT,
      anchor_id INTEGER,

      offset INTEGER DEFAULT 0,
      progress_percent INTEGER DEFAULT 0,

      metadata TEXT,

      updated_at TEXT NOT NULL,
      deleted_at TEXT,

      UNIQUE(
        user_id,
        source_type,
        source_id
      )
    );

    CREATE TABLE IF NOT EXISTS daily_quotes (
      id INTEGER PRIMARY KEY,
      text TEXT NOT NULL,
      source TEXT,
      quote_date TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS memorial_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      sync_id TEXT NOT NULL UNIQUE,
      cloud_user_id INTEGER,
      server_id INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'local',

      title TEXT NOT NULL DEFAULT 'Мой помянник',

      health_names TEXT NOT NULL DEFAULT '[]',
      repose_names TEXT NOT NULL DEFAULT '[]',

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memorial_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      book_sync_id TEXT NOT NULL,

      sync_id TEXT NOT NULL UNIQUE,
      cloud_user_id INTEGER,
      server_id INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'local',

      local_uri TEXT,
      remote_url TEXT,

      original_name TEXT,
      content_type TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS personal_prayer_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_id TEXT NOT NULL UNIQUE,
      cloud_user_id INTEGER,
      server_id INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'local',
      title TEXT NOT NULL DEFAULT 'Мой молитвослов',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS personal_prayers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_id TEXT NOT NULL UNIQUE,
      cloud_user_id INTEGER,
      server_id INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'local',
      title TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      origin_type TEXT NOT NULL DEFAULT 'custom',
      origin_data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS personal_prayer_book_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_sync_id TEXT NOT NULL,
      prayer_sync_id TEXT NOT NULL,
      sync_id TEXT NOT NULL UNIQUE,
      cloud_user_id INTEGER,
      server_id INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'local',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS personal_prayer_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prayer_sync_id TEXT NOT NULL,
      sync_id TEXT NOT NULL UNIQUE,
      cloud_user_id INTEGER,
      server_id INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'local',
      local_uri TEXT,
      remote_url TEXT,
      original_name TEXT,
      content_type TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

  `);

  /*
   * ============================================
   * saved_items migrations
   * ============================================
   */

  const savedItemColumns = await db.getAllAsync(`
      PRAGMA table_info(saved_items)
    `);

  const savedItemColumnNames = savedItemColumns.map((column) => column.name);

  if (!savedItemColumnNames.includes('source_title')) {
    await db.execAsync(`
        ALTER TABLE saved_items
            ADD COLUMN source_title TEXT;
    `);
  }

  if (!savedItemColumnNames.includes('item_title')) {
    await db.execAsync(`
        ALTER TABLE saved_items
            ADD COLUMN item_title TEXT;
    `);
  }

  if (!savedItemColumnNames.includes('text')) {
    await db.execAsync(`
        ALTER TABLE saved_items
            ADD COLUMN text TEXT;
    `);
  }

  if (!savedItemColumnNames.includes('sync_id')) {
    await db.execAsync(`
      ALTER TABLE saved_items
      ADD COLUMN sync_id TEXT;
    `);
  }

  if (!savedItemColumnNames.includes('cloud_user_id')) {
    await db.execAsync(`
        ALTER TABLE saved_items
            ADD COLUMN cloud_user_id INTEGER;
    `);
  }

  if (!savedItemColumnNames.includes('sync_status')) {
    await db.execAsync(`
        ALTER TABLE saved_items
            ADD COLUMN sync_status TEXT
                NOT NULL DEFAULT 'legacy';
    `);
  }

  if (!savedItemColumnNames.includes('updated_at')) {
    await db.execAsync(`
        ALTER TABLE saved_items
            ADD COLUMN updated_at TEXT;
    `);
  }

  if (!savedItemColumnNames.includes('deleted_at')) {
    await db.execAsync(`
        ALTER TABLE saved_items
            ADD COLUMN deleted_at TEXT;
    `);
  }

  if (!savedItemColumnNames.includes('server_id')) {
    await db.execAsync(`
        ALTER TABLE saved_items
            ADD COLUMN server_id INTEGER;
    `);
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS
    idx_saved_items_cloud_user
    ON saved_items(cloud_user_id);

    CREATE INDEX IF NOT EXISTS
    idx_saved_items_sync_status
    ON saved_items(sync_status);

    CREATE INDEX IF NOT EXISTS
    idx_saved_items_sync_id
    ON saved_items(sync_id);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS
    idx_memorial_books_cloud_user
    ON memorial_books(cloud_user_id);

    CREATE INDEX IF NOT EXISTS
    idx_memorial_books_sync_status
    ON memorial_books(sync_status);

    CREATE INDEX IF NOT EXISTS
    idx_memorial_photos_book_sync_id
    ON memorial_photos(book_sync_id);

    CREATE INDEX IF NOT EXISTS
    idx_memorial_photos_cloud_user
    ON memorial_photos(cloud_user_id);

    CREATE INDEX IF NOT EXISTS
    idx_memorial_photos_sync_status
    ON memorial_photos(sync_status);
  `);

  await db.execAsync(`

    CREATE INDEX IF NOT EXISTS idx_personal_prayer_books_cloud_user
    ON personal_prayer_books(cloud_user_id);
    CREATE INDEX IF NOT EXISTS idx_personal_prayer_books_sync_status
    ON personal_prayer_books(sync_status);

    CREATE INDEX IF NOT EXISTS idx_personal_prayers_cloud_user
    ON personal_prayers(cloud_user_id);
    CREATE INDEX IF NOT EXISTS idx_personal_prayers_sync_status
    ON personal_prayers(sync_status);

    CREATE INDEX IF NOT EXISTS idx_personal_prayer_items_book
    ON personal_prayer_book_items(book_sync_id);
    CREATE INDEX IF NOT EXISTS idx_personal_prayer_items_prayer
    ON personal_prayer_book_items(prayer_sync_id);
    CREATE INDEX IF NOT EXISTS idx_personal_prayer_items_cloud_user
    ON personal_prayer_book_items(cloud_user_id);
    CREATE INDEX IF NOT EXISTS idx_personal_prayer_items_sync_status
    ON personal_prayer_book_items(sync_status);

    CREATE INDEX IF NOT EXISTS idx_personal_prayer_photos_prayer
    ON personal_prayer_photos(prayer_sync_id);
    CREATE INDEX IF NOT EXISTS idx_personal_prayer_photos_cloud_user
    ON personal_prayer_photos(cloud_user_id);
    CREATE INDEX IF NOT EXISTS idx_personal_prayer_photos_sync_status
    ON personal_prayer_photos(sync_status);
  `);

  /*
   * ============================================
   * reading_progress migrations
   * ============================================
   */

  const progressColumns = await db.getAllAsync(`
      PRAGMA table_info(reading_progress)
    `);

  const progressColumnNames = progressColumns.map((column) => column.name);

  if (!progressColumnNames.includes('progress_percent')) {
    await db.execAsync(`
        ALTER TABLE reading_progress
            ADD COLUMN progress_percent INTEGER
                DEFAULT 0;
    `);
  }

  if (!progressColumnNames.includes('metadata')) {
    await db.execAsync(`
        ALTER TABLE reading_progress
            ADD COLUMN metadata TEXT;
    `);
  }

  if (!progressColumnNames.includes('cloud_user_id')) {
    await db.execAsync(`
      ALTER TABLE reading_progress
      ADD COLUMN cloud_user_id INTEGER;
    `);
  }

  if (!progressColumnNames.includes('server_id')) {
    await db.execAsync(`
      ALTER TABLE reading_progress
      ADD COLUMN server_id INTEGER;
    `);
  }

  if (!progressColumnNames.includes('sync_status')) {
    await db.execAsync(`
      ALTER TABLE reading_progress
      ADD COLUMN sync_status TEXT
      NOT NULL DEFAULT 'legacy';
    `);
  }

  if (!progressColumnNames.includes('deleted_at')) {
    await db.execAsync(`
      ALTER TABLE reading_progress
      ADD COLUMN deleted_at TEXT;
    `);
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS
    idx_reading_progress_cloud_user
    ON reading_progress(cloud_user_id);

    CREATE INDEX IF NOT EXISTS
    idx_reading_progress_sync_status
    ON reading_progress(sync_status);
  `);

  return db;
};

export const setSetting = async (key, value) => {
  const db = await getDatabase();

  await db.runAsync(
    `
        INSERT INTO app_settings (
            key,
            value
        )
        VALUES (?, ?)

            ON CONFLICT(key)
      DO UPDATE SET
                         value = excluded.value
    `,
    [key, value]
  );
};

export const getSetting = async (key) => {
  const db = await getDatabase();

  const result = await db.getFirstAsync(
    `
          SELECT value
          FROM app_settings
          WHERE key = ?
      `,
    [key]
  );

  return result?.value ?? null;
};
