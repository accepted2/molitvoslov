import React from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  colors,
} from '../../theme';


const ITEMS = [
  {
    key: 'home',
    route: 'Menu',
    label: 'Главная',
    symbol: '⌂',
  },
  {
    key: 'favorites',
    route: 'Favorites',
    label: 'Избранное',
    symbol: '♡',
  },
  {
    key: 'account',
    route: 'Account',
    label: 'Аккаунт',
    symbol: '○',
  },
];


export const BottomNav = ({
  navigation,
  active,
}) => {
  const insets =
    useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom:
            Math.max(
              insets.bottom,
              8
            ),
        },
      ]}
    >
      {ITEMS.map(item => {
        const isActive =
          item.key === active;

        return (
          <Pressable
            key={item.key}
            onPress={() =>
              navigation.navigate(
                item.route
              )
            }
            style={({pressed}) => [
              styles.item,
              pressed &&
              styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.symbol,
                isActive &&
                styles.symbolActive,
              ]}
            >
              {item.symbol}
            </Text>

            <Text
              style={[
                styles.label,
                isActive &&
                styles.labelActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};


const styles =
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor:
        colors.surface,
      borderTopWidth: 1,
      borderTopColor:
        colors.border,
      paddingTop: 8,
      paddingHorizontal: 8,
    },

    item: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    pressed: {
      opacity: 0.6,
    },

    symbol: {
      fontSize: 23,
      lineHeight: 25,
      color:
        colors.textMuted,
    },

    symbolActive: {
      color:
        colors.accent,
    },

    label: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: '600',
      color:
        colors.textMuted,
    },

    labelActive: {
      color:
        colors.accentDark,
    },
  });
