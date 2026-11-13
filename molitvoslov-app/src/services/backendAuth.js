import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getDatabase} from '../db/database';

// Both Dev Client and release use the deployed Django API by default.
// A local Django server may still be explicitly selected for development
// with EXPO_PUBLIC_API_BASE_URL (e.g., http://10.0.2.2:8000).
// Keep release pinned to the production backend.
export const API_BASE_URL = (__DEV__ && process.env.EXPO_PUBLIC_API_BASE_URL?.trim())
  || 'https://molitvoslov-3o9d.onrender.com';

const API_TOKEN_KEY = 'molitvoslov_api_token';
const API_USER_KEY = 'molitvoslov_api_user';

const saveCachedBackendUser = async (user) => {
  if (!user?.id) {
    return;
  }

  await SecureStore.setItemAsync(API_USER_KEY, JSON.stringify(user));
};

export const getCachedBackendUser = async () => {
  const raw = await SecureStore.getItemAsync(API_USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const loginToBackendWithGoogle = async (idToken) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/google/`, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
    },

    body: JSON.stringify({
      id_token: idToken,
    }),
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data?.detail || data?.error || `Ошибка авторизации на сервере: ${response.status}`
    );
  }

  if (!data.token) {
    throw new Error('Сервер не вернул токен авторизации');
  }

  await SecureStore.setItemAsync(API_TOKEN_KEY, data.token);

  const user = data.user ?? data;

  await saveCachedBackendUser(user);

  return data;
};

export const getApiToken = async () => {
  return SecureStore.getItemAsync(API_TOKEN_KEY);
};

export const deleteApiToken = async () => {
  await SecureStore.deleteItemAsync(API_TOKEN_KEY);
};

export const getCurrentBackendUser = async () => {
  const token = await getApiToken();

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me/`, {
      headers: {
        Authorization: `Token ${token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      await deleteApiToken();

      return null;
    }

    if (!response.ok) {
      throw new Error(`Ошибка получения аккаунта: ${response.status}`);
    }

    const data = await response.json();

    const user = data.user ?? data;

    await saveCachedBackendUser(user);

    return user;
  } catch (error) {
    /*
     * Если сервер недоступен или нет интернета,
     * продолжаем считать пользователя вошедшим
     * по последнему подтверждённому аккаунту.
     */
    const cachedUser = await getCachedBackendUser();

    if (cachedUser) {
      return cachedUser;
    }

    throw error;
  }
};

export const authenticatedFetch = async (path, options = {}) => {
  const token = await getApiToken();

  if (!token) {
    throw new Error('Пользователь не авторизован');
  }

  const headers = {
    ...(options.body
      ? {
          'Content-Type': 'application/json',
        }
      : {}),

    ...(options.headers || {}),

    Authorization: `Token ${token}`,
  };

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
};

export const logoutFromBackend = async () => {
  const token = await getApiToken();

  try {
    if (token) {
      await fetch(`${API_BASE_URL}/api/auth/logout/`, {
        method: 'POST',

        headers: {
          Authorization: `Token ${token}`,
        },
      });
    }
  } catch {
    /*
     * Даже если интернета нет, локальный выход
     * из аккаунта всё равно должен сработать.
     */
  } finally {
    /*
     * Удаляем только авторизацию.
     *
     * Последнего локального пользователя
     * сохраняем, чтобы после выхода:
     *
     * - помянники не исчезали;
     * - молитвословы не исчезали;
     * - избранное не исчезало;
     * - прогресс продолжал сохраняться;
     * - новые локальные изменения позже
     *   синхронизировались после повторного входа.
     */
    await SecureStore.deleteItemAsync(API_TOKEN_KEY);
  }
};


export const deleteBackendAccount = async () => {
  const user=await getCachedBackendUser();
  const response = await authenticatedFetch('/api/auth/delete-account/', {
    method: 'POST',
    body: JSON.stringify({confirmation: 'DELETE'}),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Не удалось удалить аккаунт (${response.status})`);
  }
  // The server has successfully deleted the identity and all owned records.
  // Never re-sync a tombstone or stale offline copy into a different account.
  let localClean=true;
  try {
    if(user?.id){
      const db=await getDatabase();
      await db.withTransactionAsync(async ()=>{
        for(const table of [
          'saved_items','reading_progress','memorial_books','memorial_photos',
          'personal_prayer_books','personal_prayers',
          'personal_prayer_book_items','personal_prayer_photos',
        ]) {
          await db.runAsync(`DELETE FROM ${table} WHERE cloud_user_id = ?`,[user.id]);
        }
      });
      const keys=await AsyncStorage.getAllKeys();
      const accountId=String(user.id);
      const localKeys=keys.filter(key=>
        key === '@molitvoslov/account-prefs-pending/v1:'+accountId ||
        key === '@molitvoslov/account-prefs-last-scopes/v1:'+accountId ||
        key === '@molitvoslov/home-category-order/v1:account-'+accountId ||
        key.includes(':account-'+encodeURIComponent(accountId)+':')
      );
      if(localKeys.length)await AsyncStorage.multiRemove(localKeys);
    }
  } catch(error) {
    localClean=false;
    console.warn('[account] cloud deleted; local cleanup incomplete:',error?.message||error);
  } finally {
    await SecureStore.deleteItemAsync(API_TOKEN_KEY);
    await SecureStore.deleteItemAsync(API_USER_KEY);
  }
  return {localClean};
};
