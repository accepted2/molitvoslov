import React, {
  useEffect,
  useState,
} from 'react';

import {ActivityIndicator, View,} from 'react-native';

import {SafeAreaProvider,} from 'react-native-safe-area-context';

import {AppNavigator,} from './src/navigation/AppNavigator';

import {TextSelectionProvider,} from './src/context/TextSelectionContext';

import {initDatabase,} from './src/db/database';


export default function App() {
  const [
    databaseReady,
    setDatabaseReady,
  ] = useState(false);


  useEffect(() => {
    const prepareDatabase =
      async () => {
        try {
          await initDatabase();

          setDatabaseReady(true);

          console.log(
            'Локальная база данных готова'
          );
        } catch (error) {
          console.log(
            'Ошибка SQLite:',
            error
          );
        }
      };

    prepareDatabase();
  }, []);


  if (!databaseReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems:
            'center',
          justifyContent:
            'center',
        }}
      >
        <ActivityIndicator
          size="large"
        />
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