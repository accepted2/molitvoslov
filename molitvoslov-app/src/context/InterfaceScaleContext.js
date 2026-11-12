import React, {createContext, useContext, useEffect, useState} from 'react';
import {getReadingSettings, subscribeReadingSettings} from '../services/readerPreferences';

const InterfaceScaleContext = createContext(1);

export const InterfaceScaleProvider = ({children}) => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeReadingSettings(settings => {
      if (active) setScale(settings.interfaceScale || 1);
    });
    getReadingSettings().then(settings => {
      if (active) setScale(settings.interfaceScale || 1);
    }).catch(console.warn);
    return () => {active = false; unsubscribe();};
  }, []);

  return <InterfaceScaleContext.Provider value={scale}>{children}</InterfaceScaleContext.Provider>;
};

export const useInterfaceScale = () => useContext(InterfaceScaleContext);
