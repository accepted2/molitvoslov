import {useCallback, useEffect, useRef, useState} from 'react';
import {
  loadScopedAppearance,
  normalizeReaderAppearance,
  resetScopedAppearance,
  storeScopedAppearance,
} from '../services/scopedReaderAppearance';
import {DEFAULT_READING_SETTINGS} from '../services/readerPreferences';

/** Per account + per document, stored on device (never deleted by sign-out). */
export const useScopedReaderAppearance = (sourceType, sourceId) => {
  const [appearance, setAppearance] = useState(() => normalizeReaderAppearance(DEFAULT_READING_SETTINGS));
  const [ready, setReady] = useState(false);
  const keyRef = useRef(null);
  const timerRef = useRef(null);
  const latestRef = useRef(appearance);
  const persist = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (keyRef.current) {
      storeScopedAppearance(keyRef.current, latestRef.current).catch((error) =>
        console.warn('[reader appearance] save:', error?.message || error)
      );
    }
  }, []);
  useEffect(() => {
    let active = true;
    persist();
    keyRef.current = null;
    setReady(false);
    if (!sourceId) return () => {active = false;};
    loadScopedAppearance({sourceType, sourceId}).then(({key, value}) => {
      if (!active) return;
      keyRef.current = key;
      latestRef.current = value;
      setAppearance(value);
      setReady(true);
    }).catch((error) => {
      console.warn('[reader appearance] load:', error?.message || error);
      if (active) setReady(true);
    });
    return () => {active = false; persist();};
  }, [sourceType, sourceId, persist]);

  const changeAppearance = useCallback((patch) => {
    setAppearance((current) => {
      const next = normalizeReaderAppearance({...current, ...patch});
      latestRef.current = next;
      return next;
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(persist, 220);
  }, [persist]);

  const resetAppearance = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const next = await resetScopedAppearance(keyRef.current);
    latestRef.current = next;
    setAppearance(next);
  }, []);

  return {appearance, appearanceReady: ready, changeAppearance, resetAppearance};
};
