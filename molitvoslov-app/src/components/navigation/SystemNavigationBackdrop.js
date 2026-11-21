import React from 'react';
import {Platform, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

// Draw under Android's system navigation buttons in edge-to-edge mode.
// The system owns their glyphs: Android can display them light or dark only.
// This surface does not replace the OS navigation buttons or steal gestures.
// The app does not mount this layer by default; if reused, it must stay
// transparent to let the active screen draw behind Android's gesture area.
export const SystemNavigationBackdrop = () => {
  const {bottom} = useSafeAreaInsets();
  if (Platform.OS !== 'android' || bottom <= 0) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.backdrop, {height: bottom}]}
    />
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
});
