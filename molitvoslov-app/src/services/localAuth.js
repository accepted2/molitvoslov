import * as Crypto
  from 'expo-crypto';

import * as SecureStore
  from 'expo-secure-store';

import {
  getDatabase,
} from '../db/database';


const SESSION_KEY =
  'molitvoslov_user_id';


const hashPassword =
  async password => {
    return Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password
    );
  };


export const registerUser =
  async (
    username,
    password
  ) => {
    const db =
      await getDatabase();

    const normalizedUsername =
      username.trim();

    if (!normalizedUsername) {
      throw new Error(
        'Введите имя пользователя'
      );
    }

    if (
      !password ||
      password.length < 4
    ) {
      throw new Error(
        'Пароль должен содержать минимум 4 символа'
      );
    }

    const existing =
      await db.getFirstAsync(
        `
          SELECT id
          FROM local_users
          WHERE username = ?
        `,
        [
          normalizedUsername,
        ]
      );

    if (existing) {
      throw new Error(
        'Такой пользователь уже существует'
      );
    }

    const passwordHash =
      await hashPassword(
        password
      );

    const result =
      await db.runAsync(
        `
          INSERT INTO local_users (
            username,
            password_hash,
            created_at
          )
          VALUES (?, ?, ?)
        `,
        [
          normalizedUsername,
          passwordHash,
          new Date().toISOString(),
        ]
      );

    const userId =
      String(
        result.lastInsertRowId
      );

    await SecureStore.setItemAsync(
      SESSION_KEY,
      userId
    );

    return {
      id:
        Number(userId),

      username:
        normalizedUsername,
    };
  };


export const loginUser =
  async (
    username,
    password
  ) => {
    const db =
      await getDatabase();

    const passwordHash =
      await hashPassword(
        password
      );

    const user =
      await db.getFirstAsync(
        `
          SELECT id, username
          FROM local_users
          WHERE username = ?
          AND password_hash = ?
        `,
        [
          username.trim(),
          passwordHash,
        ]
      );

    if (!user) {
      throw new Error(
        'Неверное имя пользователя или пароль'
      );
    }

    await SecureStore.setItemAsync(
      SESSION_KEY,
      String(
        user.id
      )
    );

    return user;
  };


export const logoutUser =
  async () => {
    await SecureStore.deleteItemAsync(
      SESSION_KEY
    );
  };


export const getCurrentUser =
  async () => {
    const userId =
      await SecureStore.getItemAsync(
        SESSION_KEY
      );

    if (!userId) {
      return null;
    }

    const db =
      await getDatabase();

    const user =
      await db.getFirstAsync(
        `
          SELECT id, username
          FROM local_users
          WHERE id = ?
        `,
        [
          Number(userId),
        ]
      );

    return user || null;
  };
