import * as SQLite
  from 'expo-sqlite';


let database = null;


export const getDatabase =
  async () => {
    if (!database) {
      database =
        await SQLite
          .openDatabaseAsync(
            'molitvoslov.db'
          );
    }

    return database;
  };


export const initDatabase =
  async () => {
    const db =
      await getDatabase();

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
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reading_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        anchor_type TEXT,
        anchor_id INTEGER,
        offset INTEGER DEFAULT 0,
        progress_percent INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL,

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
    `);


    /*
     * Простые локальные миграции.
     *
     * CREATE TABLE IF NOT EXISTS не добавляет
     * новые колонки в таблицу, которая уже была
     * создана раньше, поэтому проверяем их отдельно.
     */

    const savedItemColumns =
      await db.getAllAsync(
        `
          PRAGMA table_info(saved_items)
        `
      );

    const savedItemColumnNames =
      savedItemColumns.map(
        column =>
          column.name
      );


    if (
      !savedItemColumnNames.includes(
        'source_title'
      )
    ) {
      await db.execAsync(`
        ALTER TABLE saved_items
        ADD COLUMN source_title TEXT;
      `);
    }


    if (
      !savedItemColumnNames.includes(
        'item_title'
      )
    ) {
      await db.execAsync(`
        ALTER TABLE saved_items
        ADD COLUMN item_title TEXT;
      `);
    }


    if (
      !savedItemColumnNames.includes(
        'text'
      )
    ) {
      await db.execAsync(`
        ALTER TABLE saved_items
        ADD COLUMN text TEXT;
      `);
    }


    const progressColumns =
      await db.getAllAsync(
        `
          PRAGMA table_info(reading_progress)
        `
      );

    const progressColumnNames =
      progressColumns.map(
        column =>
          column.name
      );


    if (
      !progressColumnNames.includes(
        'progress_percent'
      )
    ) {
      await db.execAsync(`
        ALTER TABLE reading_progress
        ADD COLUMN progress_percent INTEGER DEFAULT 0;
      `);
    }


    return db;
  };


export const setSetting =
  async (
    key,
    value
  ) => {
    const db =
      await getDatabase();

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
      [
        key,
        value,
      ]
    );
  };


export const getSetting =
  async key => {
    const db =
      await getDatabase();

    const result =
      await db.getFirstAsync(
        `
          SELECT value
          FROM app_settings
          WHERE key = ?
        `,
        [
          key,
        ]
      );

    return result?.value ??
      null;
  };
