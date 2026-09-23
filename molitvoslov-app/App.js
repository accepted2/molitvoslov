import React from 'react';

import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import {
  AppNavigator,
} from './src/navigation/AppNavigator';

import {
  TextSelectionProvider,
} from './src/context/TextSelectionContext';


export default function App() {
  return (
    <SafeAreaProvider>
      <TextSelectionProvider>
        <AppNavigator />
      </TextSelectionProvider>
    </SafeAreaProvider>
  );
}
