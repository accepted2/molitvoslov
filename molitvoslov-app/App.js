import React, {useCallback, useEffect, useState} from 'react';

import {AppState, ImageBackground, StyleSheet, Text, View} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import NetInfo from '@react-native-community/netinfo';

import {SafeAreaProvider} from 'react-native-safe-area-context';

import {useFonts} from 'expo-font';

import {AppNavigator} from './src/navigation/AppNavigator';
import {OnboardingScreen} from './src/screens/OnboardingScreen';
import {PrayerBeadsLoader} from './src/components/feedback/PrayerBeadsLoader';

import {TextSelectionProvider} from './src/context/TextSelectionContext';
import {LanguageProvider} from './src/context/LanguageContext';

import {initDatabase} from './src/db/database';

import {syncSavedItems} from './src/services/savedItems';

import {syncReadingProgress} from './src/services/readingProgress';

import {syncMemorials} from './src/services/memorials';

import {syncPrayerBooks} from './src/services/prayerBooks';
import {hydratePublicContent} from './src/services/contentStore';
import {syncPublicContent} from './src/services/contentSync';
import {hydrateBibleContent} from './src/services/bibleStore';
import {syncBibleContent} from './src/services/bibleSync';
import {warmSearchData} from './src/services/searchIndex';
import {syncYearMarkers2026} from './src/services/calendarYearMarkers';

const ONBOARDING_STORAGE_KEY = '@molitvoslov/onboarding-version';
const ONBOARDING_VERSION = 5;

const MIN_STARTUP_MS = 650;
const CONTENT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const StartupLoadingScreen = () => (
  <ImageBackground
    source={require('./assets/home/hero.png')}
    resizeMode="cover"
    style={styles.startupImage}
  >
    <View style={styles.startupShade}>
      <View style={styles.startupBrand}>
        <Text style={styles.startupCross}>☦</Text>
        <Text style={styles.startupTitle}>Молитвослов</Text>
      </View>

      <View style={styles.startupLoader}>
        <PrayerBeadsLoader light text="Подготавливаем молитвослов..." />
      </View>
    </View>
  </ImageBackground>
);

export default function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [minimumStartupElapsed, setMinimumStartupElapsed] = useState(false);

  const [fontsLoaded] = useFonts({
    Ponomar: require('./assets/fonts/Ponomar-Regular.ttf'),
  });

  const appReady = databaseReady && fontsLoaded && onboardingReady;

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumStartupElapsed(true);
    }, MIN_STARTUP_MS);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const prepareDatabase = async () => {
      try {
        await initDatabase();
        await Promise.all([hydratePublicContent(), hydrateBibleContent('rst')]);

        setDatabaseReady(true);

        setTimeout(() => {
          warmSearchData();
        }, 900);

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
        // Calendar markers are light-weight and independent of bulky saint records.
        syncYearMarkers2026().catch((error) =>
          console.log('Calendar markers sync отложен:', error?.message || error)
        );
        const [
          publicContentResult,
          bibleContentResult,
          savedItemsResult,
          readingProgressResult,
          memorialsResult,
          prayerBooksResult,
        ] = await Promise.all([
          syncPublicContent(),
          syncBibleContent('rst'),
          syncSavedItems(),
          syncReadingProgress(),
          syncMemorials(),
          syncPrayerBooks(),
        ]);

        if (publicContentResult?.updated) {
          console.log(`Public content updated: ${reason}`);
          warmSearchData();
        } else if (!publicContentResult?.success && publicContentResult?.error) {
          console.log(
            `Public content sync отложен: ${reason}`,
            publicContentResult.error?.message || publicContentResult.error
          );
        }

        if (bibleContentResult?.updated) {
          console.log(`Bible content updated: ${reason}`);
          warmSearchData();
        } else if (!bibleContentResult?.success && bibleContentResult?.error) {
          console.log(
            `Bible content sync отложен: ${reason}`,
            bibleContentResult.error?.message || bibleContentResult.error
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

    // Keep the RU/UK offline content fresh without blocking language switches.
    // Conditional requests (ETag / 304) avoid downloading unchanged bundles.
    let isForeground = true;
    const contentRefreshTimer = setInterval(async () => {
      if (!isForeground) {
        return;
      }

      const [publicResult, bibleResult] = await Promise.all([
        syncPublicContent(),
        syncBibleContent('rst'),
      ]);

      if (publicResult?.updated || bibleResult?.updated) {
        warmSearchData();
      }

      if (!publicResult?.success && publicResult?.error) {
        console.log(
          'Periodic public content sync отложен:',
          publicResult.error?.message || publicResult.error
        );
      }
    }, CONTENT_REFRESH_INTERVAL_MS);

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;

      if (previousOnline === false && online) {
        runSync('network');
      }

      previousOnline = online;
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      isForeground = nextState === 'active';
      if (nextState === 'active') {
        runSync('foreground');
      }
    });

    return () => {
      clearInterval(contentRefreshTimer);
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

  if (!appReady || !minimumStartupElapsed) {
    return <StartupLoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <TextSelectionProvider>
          {showOnboarding ? <OnboardingScreen onComplete={completeOnboarding} /> : <AppNavigator />}
        </TextSelectionProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  startupImage: {
    flex: 1,
    backgroundColor: '#2B190F',
  },
  startupShade: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(42, 23, 12, 0.46)',
  },
  startupBrand: {
    alignItems: 'center',
    marginBottom: 28,
  },
  startupCross: {
    color: '#F0CF92',
    fontFamily: 'serif',
    fontSize: 28,
    lineHeight: 34,
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 5,
  },
  startupTitle: {
    marginTop: 3,
    color: '#FFF0D0',
    fontFamily: 'serif',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  startupLoader: {
    minWidth: 220,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(45, 25, 14, 0.44)',
  },
});
