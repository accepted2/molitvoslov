import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = __DEV__
  ? 'http://10.0.2.2:8000'
  : 'https://molitvoslov-3o9d.onrender.com';

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
      await SecureStore.deleteItemAsync(API_USER_KEY);

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
    await SecureStore.deleteItemAsync(API_TOKEN_KEY);
    await SecureStore.deleteItemAsync(API_USER_KEY);
  }
};
