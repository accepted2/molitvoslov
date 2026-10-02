import React, {useCallback, useEffect, useState} from 'react';

import {AppState, ImageBackground, StyleSheet, Text, View} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import NetInfo from '@react-native-community/netinfo';

import {SafeAreaProvider} from 'react-native-safe-area-context';

import {useFonts} from 'expo-font';
import {LinearGradient} from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import {StatusBar} from 'expo-status-bar';

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
    <StatusBar style="light" translucent backgroundColor="transparent" />

    <LinearGradient
      colors={[
        'rgba(255,244,222,0.18)',
        'rgba(255,244,222,0.02)',
        'rgba(48,26,13,0.08)',
        'rgba(48,26,13,0.76)',
      ]}
      locations={[0, 0.24, 0.62, 1]}
      style={styles.startupOverlay}
    >
      <View style={styles.startupTopBrand}>
        <Text style={styles.startupTopCross}>☦</Text>
        <Text style={styles.startupTopTitle}>Молитвослов</Text>
      </View>

      <View style={styles.startupBrand}>
        <Text style={styles.startupCross}>☦</Text>
        <Text style={styles.startupTitle}>Молитвослов</Text>

        <View style={styles.startupOrnament}>
          <View style={styles.startupLine} />
          <Text style={styles.startupMark}>✦</Text>
          <View style={styles.startupLine} />
        </View>

        <Text style={styles.startupSubtitle}>Молитва · Писание · Церковный календарь</Text>
      </View>

      <View style={styles.startupIntro}>
        <Text style={styles.startupEyebrow}>ДОБРО ПОЖАЛОВАТЬ</Text>
        <Text style={styles.startupIntroTitle}>Молитвослов всегда рядом</Text>
        <Text style={styles.startupIntroText}>
          Молитва, Священное Писание и церковный календарь в одном приложении.
        </Text>
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
    SplashScreen.hideAsync().catch(() => {});
  }, []);

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
    backgroundColor: '#E7C995',
  },
  startupOverlay: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 46,
    paddingBottom: 34,
  },
  startupTopBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  startupTopCross: {
    color: '#F4D49B',
    fontFamily: 'serif',
    fontSize: 17,
    textShadowColor: 'rgba(45, 25, 13, 0.62)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  startupTopTitle: {
    color: '#FFF0D0',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(45, 25, 13, 0.62)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  startupBrand: {
    position: 'absolute',
    top: '31%',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  startupCross: {
    color: '#F2CC83',
    fontFamily: 'serif',
    fontSize: 48,
    lineHeight: 54,
    textShadowColor: 'rgba(42, 20, 8, 0.58)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  startupTitle: {
    marginTop: 3,
    color: '#FFF0D0',
    fontFamily: 'serif',
    fontSize: 38,
    lineHeight: 45,
    fontWeight: '700',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(42, 20, 8, 0.72)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 7,
  },
  startupOrnament: {
    width: 175,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  startupLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EAC37C',
  },
  startupMark: {
    marginHorizontal: 8,
    color: '#EAC37C',
    fontSize: 11,
  },
  startupSubtitle: {
    marginTop: 12,
    color: '#F4DDB5',
    fontFamily: 'serif',
    fontSize: 13,
    textShadowColor: 'rgba(45, 25, 13, 0.72)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  startupIntro: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 58,
  },
  startupEyebrow: {
    color: '#E8BE78',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(0,0,0,0.64)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  startupIntroTitle: {
    marginTop: 5,
    color: '#FFF2D8',
    fontFamily: 'serif',
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.78)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 5,
  },
  startupIntroText: {
    marginTop: 7,
    maxWidth: 390,
    color: '#FFF2D8',
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.76)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
});
