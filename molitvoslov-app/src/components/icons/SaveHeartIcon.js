import React from 'react';
import {StyleSheet, Text} from 'react-native';

import {colors} from '../../theme';

export const SaveHeartIcon = ({active = false, size = 20}) => (
  <Text
    accessibilityElementsHidden
    importantForAccessibility="no"
    style={[
      styles.icon,
      {
        fontSize: size,
        lineHeight: size + 2,
      },
      active && styles.active,
    ]}
  >
    ♡
  </Text>
);

const styles = StyleSheet.create({
  icon: {
    color: '#9A8068',
    fontWeight: '400',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  active: {
    color: colors.accentDark,
  },
});
