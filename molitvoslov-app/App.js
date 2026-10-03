import React, {useCallback, useEffect, useState} from 'react';

import {AppState} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import NetInfo from '@react-native-community/netinfo';

import {SafeAreaProvider} from 'react-native-safe-area-context';

import {useFonts} from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import {AppNavigator} from './src/navigation/AppNavigator';
import {OnboardingScreen} from './src/screens/OnboardingScreen';

import {TextSelectionProvider} from './src/context/TextSelectionContext';

import {initDatabase} from './src/db/database';

import {syncSavedItems} from './src/services/savedItems';

import {syncReadingProgress} from './src/services/readingProgress';

import {syncMemorials} from './src/services/memorials';

import {syncPrayerBooks} from './src/services/prayerBooks';
import {hydratePublicContent} from './src/services/contentStore';
import {syncPublicContent} from './src/services/contentSync';

const ONBOARDING_STORAGE_KEY = '@molitvoslov/onboarding-version';
const ONBOARDING_VERSION = 5;

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [fontsLoaded] = useFonts({
    Ponomar: require('./assets/fonts/Ponomar-Regular.ttf'),
  });

  const appReady = databaseReady && fontsLoaded && onboardingReady;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  useEffect(() => {
    const prepareDatabase = async () => {
      try {
        await initDatabase();
        await hydratePublicContent();

        setDatabaseReady(true);

        console.log('Локальная база данных готова');
      } catch (error) {
        console.log('Ошибка SQLite:', error);
      }
    };

    prepareDatabase();
  }, []);

  useEffect(() => {
    let active = true;

    const prepareOnboarding = async () => {
      try {
        const storedVersion = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        const seenVersion = Number(storedVersion || 0);

        if (active) {
          setShowOnboarding(seenVersion < ONBOARDING_VERSION);
        }
      } catch (error) {
        console.log('Ошибка проверки onboarding:', error);

        if (active) {
          setShowOnboarding(true);
        }
      } finally {
        if (active) {
          setOnboardingReady(true);
        }
      }
    };

    prepareOnboarding();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!databaseReady) {
      return;
    }

    let previousOnline = null;

    const runSync = async (reason) => {
      try {
        const [
          publicContentResult,
          savedItemsResult,
          readingProgressResult,
          memorialsResult,
          prayerBooksResult,
        ] = await Promise.all([
          syncPublicContent(),
          syncSavedItems(),
          syncReadingProgress(),
          syncMemorials(),
          syncPrayerBooks(),
        ]);

        if (publicContentResult?.updated) {
          console.log(`Public content updated: ${reason}`);
        } else if (!publicContentResult?.success && publicContentResult?.error) {
          console.log(
            `Public content sync отложен: ${reason}`,
            publicContentResult.error?.message || publicContentResult.error
          );
        }

        const noUser =
          savedItemsResult?.reason === 'no-user' &&
          readingProgressResult?.reason === 'no-user' &&
          memorialsResult?.reason === 'no-user' &&
          prayerBooksResult?.reason === 'no-user';

        if (noUser) {
          return;
        }

        if (
          savedItemsResult?.success &&
          readingProgressResult?.success &&
          memorialsResult?.success &&
          prayerBooksResult?.success
        ) {
          console.log(`Cloud sync OK: ${reason}`);

          return;
        }

        const error =
          savedItemsResult?.error ||
          readingProgressResult?.error ||
          memorialsResult?.error ||
          prayerBooksResult?.error;

        if (error) {
          console.log(`Cloud sync отложен: ${reason}`, error?.message || error);
        }
      } catch (error) {
        console.log(`Cloud sync ошибка: ${reason}`, error?.message || error);
      }
    };

    runSync('startup');

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;

      if (previousOnline === false && online) {
        runSync('network');
      }

      previousOnline = online;
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        runSync('foreground');
      }
    });

    return () => {
      unsubscribeNetInfo();

      appStateSubscription.remove();
    };
  }, [databaseReady]);

  const completeOnboarding = useCallback(async () => {
    setShowOnboarding(false);

    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, String(ONBOARDING_VERSION));
    } catch (error) {
      console.log('Ошибка сохранения onboarding:', error);
    }
  }, []);

  if (!appReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <TextSelectionProvider>
        {showOnboarding ? <OnboardingScreen onComplete={completeOnboarding} /> : <AppNavigator />}
      </TextSelectionProvider>
    </SafeAreaProvider>
  );
}
