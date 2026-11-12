import {useCallback, useEffect, useRef, useState} from 'react';
import {
  loadScopedAppearance,
  normalizeReaderAppearance,
  resetScopedAppearance,
  storeScopedAppearance,
} from '../services/scopedReaderAppearance';
import {DEFAULT_READING_SETTINGS, subscribeReadingSettings} from '../services/readerPreferences';

/** Per account + per document, stored on device (never deleted by sign-out). */
export const useScopedReaderAppearance = (sourceType, sourceId) => {
  const [appearance, setAppearance] = useState(() => normalizeReaderAppearance(DEFAULT_READING_SETTINGS));
  const [ready, setReady] = useState(false);
  const keyRef = useRef(null);
  const inheritedRef = useRef(true);
  const timerRef = useRef(null);
  const latestRef = useRef(appearance);
  const persist = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (keyRef.current && !inheritedRef.current) {
      storeScopedAppearance(keyRef.current, latestRef.current).catch((error) =>
        console.warn('[reader appearance] save:', error?.message || error)
      );
    }
  }, []);
  useEffect(() => {
    let active = true;
    persist();
    keyRef.current = null;
    inheritedRef.current = true;
    setReady(false);
    if (!sourceId) return () => {active = false;};
    loadScopedAppearance({sourceType, sourceId}).then(({key, value, inherited}) => {
      if (!active) return;
      keyRef.current = key;
      inheritedRef.current = inherited;
      latestRef.current = value;
      setAppearance(value);
      setReady(true);
    }).catch((error) => {
      console.warn('[reader appearance] load:', error?.message || error);
      if (active) setReady(true);
    });
    return () => {active = false; persist();};
  }, [sourceType, sourceId, persist]);

  // Existing readers without a custom override follow global changes live.
  useEffect(() => subscribeReadingSettings(settings => {
    if (!inheritedRef.current) return;
    const next = normalizeReaderAppearance(settings);
    latestRef.current = next;
    setAppearance(next);
  }), []);

  const changeAppearance = useCallback((patch) => {
    inheritedRef.current = false;
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
    inheritedRef.current = true;
    latestRef.current = next;
    setAppearance(next);
  }, []);

  return {appearance, appearanceReady: ready, changeAppearance, resetAppearance};
};
