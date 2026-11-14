import {useCallback, useEffect, useRef, useState} from 'react';
import {
  loadScopedAppearance,
  normalizeReaderAppearance,
  resetScopedAppearance,
  storeScopedAppearance,
} from '../services/scopedReaderAppearance';
import {DEFAULT_READING_SETTINGS, subscribeReadingSettings} from '../services/readerPreferences';

/** Per account + per document, stored on device (never deleted by sign-out). */
export const useScopedReaderAppearance = (sourceType, sourceId, initialFontSize = null) => {
  // An optional reader-specific default applies only if there is no saved
  // override and the global font size is still the application default.
  const inheritedSize = settings => ({
    ...settings,
    fontSize: initialFontSize &&
      Number(settings.fontSize) === DEFAULT_READING_SETTINGS.fontSize
      ? initialFontSize : settings.fontSize,
  });
  const [appearance, setAppearance] = useState(() =>
    normalizeReaderAppearance(inheritedSize(DEFAULT_READING_SETTINGS)));
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
      const effective = inherited ? normalizeReaderAppearance(inheritedSize(value)) : value;
      latestRef.current = effective;
      setAppearance(effective);
      setReady(true);
    }).catch((error) => {
      console.warn('[reader appearance] load:', error?.message || error);
      if (active) setReady(true);
    });
    return () => {active = false; persist();};
  }, [sourceType, sourceId, initialFontSize, persist]);

  // Existing readers without a custom override follow global changes live.
  useEffect(() => subscribeReadingSettings(settings => {
    if (!inheritedRef.current) return;
    const next = normalizeReaderAppearance(inheritedSize(settings));
    latestRef.current = next;
    setAppearance(next);
  }), [initialFontSize]);

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
