import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';

import {
  APP_LANGUAGES,
  getAppLanguage,
  normalizeAppLanguage,
  setAppLanguage,
} from '../services/languagePreferences';
import {translate} from '../i18n/translations';

const LanguageContext = createContext({
  language: APP_LANGUAGES.RU,
  languageReady: false,
  setLanguage: async () => APP_LANGUAGES.RU,
  t: (key) => key,
});

export const LanguageProvider = ({children}) => {
  const [language, setLanguageState] = useState(APP_LANGUAGES.RU);
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    let active = true;

    getAppLanguage()
      .then((storedLanguage) => {
        if (active) {
          setLanguageState(storedLanguage);
        }
      })
      .finally(() => {
        if (active) {
          setLanguageReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage) => {
    const normalized = normalizeAppLanguage(nextLanguage);

    setLanguageState(normalized);
    await setAppLanguage(normalized);

    return normalized;
  }, []);

  const t = useCallback((key, params = {}) => translate(language, key, params), [language]);

  const value = useMemo(
    () => ({
      language,
      languageReady,
      setLanguage,
      t,
    }),
    [language, languageReady, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
