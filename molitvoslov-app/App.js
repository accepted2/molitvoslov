import React, {useCallback, useEffect, useState} from 'react';

import {ActivityIndicator, AppState, ImageBackground, StyleSheet, Text, View} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import NetInfo from '@react-native-community/netinfo';

import {SafeAreaProvider} from 'react-native-safe-area-context';

import {useFonts} from 'expo-font';
import {LinearGradient} from 'expo-linear-gradient';

import {AppNavigator} from './src/navigation/AppNavigator';
import {OnboardingScreen} from './src/screens/OnboardingScreen';

import {TextSelectionProvider} from './src/context/TextSelectionContext';

import {initDatabase} from './src/db/database';

import {syncSavedItems} from './src/services/savedItems';

import {syncReadingProgress} from './src/services/readingProgress';

import {syncMemorials} from './src/services/memorials';

import {syncPrayerBooks} from './src/services/prayerBooks';

const ONBOARDING_STORAGE_KEY = '@molitvoslov/onboarding-version';
const ONBOARDING_VERSION = 5;

const StartupScreen = () => (
  <ImageBackground
    source={require('./assets/home/hero.png')}
    resizeMode="cover"
    style={styles.startupImage}
  >
    <LinearGradient
      colors={['rgba(58, 32, 17, 0.18)', 'rgba(67, 39, 21, 0.06)', 'rgba(61, 35, 18, 0.54)']}
      locations={[0, 0.48, 1]}
      style={styles.startupOverlay}
    >
      <View style={styles.startupBrand}>
        <Text style={styles.startupCross}>☦</Text>
        <Text style={styles.startupTitle}>Молитвослов</Text>
        <View style={styles.startupOrnament}>
          <View style={styles.startupLine} />
          <Text style={styles.startupMark}>✦</Text>
          <View style={styles.startupLine} />
        </View>
      </View>

      <View style={styles.startupLoading}>
        <ActivityIndicator size="small" color="#F7E1B7" />
      </View>
    </LinearGradient>
  </ImageBackground>
);

export default function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [fontsLoaded] = useFonts({
    Ponomar: require('./assets/fonts/Ponomar-Regular.ttf'),
  });

  useEffect(() => {
    const prepareDatabase = async () => {
      try {
        await initDatabase();

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
        const [savedItemsResult, readingProgressResult, memorialsResult, prayerBooksResult] =
          await Promise.all([
            syncSavedItems(),
            syncReadingProgress(),
            syncMemorials(),
            syncPrayerBooks(),
          ]);

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

  if (!databaseReady || !fontsLoaded || !onboardingReady) {
    return <StartupScreen />;
  }

  return (
    <SafeAreaProvider>
      <TextSelectionProvider>
        {showOnboarding ? <OnboardingScreen onComplete={completeOnboarding} /> : <AppNavigator />}
      </TextSelectionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  startupImage: {
    flex: 1,
    backgroundColor: '#F7ECD8',
  },
  startupOverlay: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 90,
    paddingBottom: 44,
    justifyContent: 'space-between',
  },
  startupBrand: {
    alignItems: 'center',
    marginTop: '20%',
  },
  startupCross: {
    color: '#E7B96F',
    fontFamily: 'serif',
    fontSize: 46,
    lineHeight: 52,
    textShadowColor: 'rgba(52, 30, 17, 0.45)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 5,
  },
  startupTitle: {
    marginTop: 4,
    color: '#F8E7C5',
    fontFamily: 'serif',
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '600',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(45, 25, 13, 0.70)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 7,
  },
  startupOrnament: {
    width: 180,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  startupLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(231, 185, 111, 0.82)',
  },
  startupMark: {
    marginHorizontal: 9,
    color: '#E7B96F',
    fontSize: 12,
  },
  startupLoading: {
    alignItems: 'center',
  },
});
