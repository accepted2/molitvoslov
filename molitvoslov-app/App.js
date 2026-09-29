import React, {useEffect, useState} from 'react';

import {ActivityIndicator, AppState, View} from 'react-native';

import NetInfo from '@react-native-community/netinfo';

import {SafeAreaProvider} from 'react-native-safe-area-context';

import {AppNavigator} from './src/navigation/AppNavigator';

import {TextSelectionProvider} from './src/context/TextSelectionContext';

import {initDatabase} from './src/db/database';

import {syncSavedItems} from './src/services/savedItems';

import {syncReadingProgress} from './src/services/readingProgress';

import {syncMemorials} from './src/services/memorials';

export default function App() {
  const [databaseReady, setDatabaseReady] = useState(false);

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
    if (!databaseReady) {
      return;
    }

    let previousOnline = null;

    const runSync = async (reason) => {
      try {
        const [savedItemsResult, readingProgressResult, memorialsResult] = await Promise.all([
          syncSavedItems(),
          syncReadingProgress(),
          syncMemorials(),
        ]);

        const noUser =
          savedItemsResult?.reason === 'no-user' &&
          readingProgressResult?.reason === 'no-user' &&
          memorialsResult?.reason === 'no-user';

        if (noUser) {
          return;
        }

        if (
          savedItemsResult?.success &&
          readingProgressResult?.success &&
          memorialsResult?.success
        ) {
          console.log(`Cloud sync OK: ${reason}`);

          return;
        }

        const error =
          savedItemsResult?.error ||
          readingProgressResult?.error ||
          memorialsResult?.error;

        if (error) {
          console.log(`Cloud sync отложен: ${reason}`, error?.message || error);
        }
      } catch (error) {
        console.log(`Cloud sync ошибка: ${reason}`, error?.message || error);
      }
    };

    /*
     * После запуска.
     */
    runSync('startup');

    /*
     * Только при реальном переходе:
     *
     * offline -> online
     *
     * Первое событие NetInfo не запускает
     * второй sync поверх startup.
     */
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;

      if (previousOnline === false && online) {
        runSync('network');
      }

      previousOnline = online;
    });

    /*
     * При возврате приложения
     * из фона.
     */
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

  if (!databaseReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <TextSelectionProvider>
        <AppNavigator />
      </TextSelectionProvider>
    </SafeAreaProvider>
  );
}
