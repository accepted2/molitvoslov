import {Image} from 'react-native';
import {File} from 'expo-file-system';

const PONOMAR_ASSET_URI =
  Image.resolveAssetSource(require('../../assets/fonts/Ponomar-Regular.ttf'))?.uri || '';

let cachedDataUri = '';
let pendingDataUri = null;

const readWithFileSystem = async (uri) => {
  const file = new File(uri);
  const base64 = await file.base64();

  return base64 ? `data:font/ttf;base64,${base64}` : '';
};

const readWithFetch = async (uri) => {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить Ponomar: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return `data:font/ttf;base64,${btoa(binary)}`;
};

export const getCachedPonomarFontDataUri = () => cachedDataUri;

export const loadPonomarFontDataUri = async () => {
  if (cachedDataUri) {
    return cachedDataUri;
  }

  if (pendingDataUri) {
    return pendingDataUri;
  }

  pendingDataUri = (async () => {
    if (!PONOMAR_ASSET_URI) {
      throw new Error('Не найден asset Ponomar');
    }

    try {
      cachedDataUri = await readWithFileSystem(PONOMAR_ASSET_URI);
    } catch (fileError) {
      cachedDataUri = await readWithFetch(PONOMAR_ASSET_URI);
    }

    if (!cachedDataUri) {
      throw new Error('Ponomar загружен без данных');
    }

    return cachedDataUri;
  })();

  try {
    return await pendingDataUri;
  } finally {
    pendingDataUri = null;
  }
};
