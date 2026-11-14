/** Store a published image in the app's persistent document directory.
 * A failed download never removes the last successfully cached image.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

const KEY_PREFIX = '@molitvoslov/asset-cache:';
const inflight = new Map();

export const getCachedPublicImage = async (key, remoteUrl) => {
  if (!remoteUrl || !/^https:\/\//.test(remoteUrl)) return null;
  const checksum = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256, remoteUrl
  );
  const storageKey = KEY_PREFIX + key;
  const saved = await AsyncStorage.getItem(storageKey);
  if (saved) {
    try {
      const item = JSON.parse(saved);
      if (item.url === remoteUrl && (await FileSystem.getInfoAsync(item.file)).exists) {
        return item.file;
      }
    } catch {}
  }
  if (inflight.has(storageKey + checksum)) return inflight.get(storageKey + checksum);
  const task = (async () => {
    const root = FileSystem.documentDirectory + 'public-assets/';
    await FileSystem.makeDirectoryAsync(root, {intermediates: true});
    const target = root + checksum + '.asset';
    let downloaded = target;
    if (!(await FileSystem.getInfoAsync(target)).exists) {
      const temp = root + checksum + '.part';
      try {
        const result = await FileSystem.downloadAsync(remoteUrl, temp);
        if (result.status < 200 || result.status >= 300) throw new Error('Image HTTP ' + result.status);
        await FileSystem.moveAsync({from: temp, to: target});
      } catch (error) {
        try { await FileSystem.deleteAsync(temp, {idempotent: true}); } catch {}
        throw error;
      }
    }
    await AsyncStorage.setItem(storageKey, JSON.stringify({url: remoteUrl, file: downloaded}));
    return downloaded;
  })().finally(() => inflight.delete(storageKey + checksum));
  inflight.set(storageKey + checksum, task);
  return task;
};
