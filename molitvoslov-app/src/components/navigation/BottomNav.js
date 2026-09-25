import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';

const ITEMS = [
  {key: 'home', route: 'Menu', label: 'Главная', symbol: '⌂'},
  {key: 'favorites', route: 'Favorites', label: 'Избранное', symbol: '♡'},
  {key: 'account', route: 'Account', label: 'Аккаунт', symbol: '○'},
];

export const BottomNav = ({navigation, active}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={styles.wrapper}
    >
      <LinearGradient
        pointerEvents="box-none"
        colors={[
          'rgba(239, 211, 160, 0)',
          'rgba(239, 211, 160, 0.18)',
          'rgba(239, 211, 160, 0.48)',
          'rgba(239, 211, 160, 0.78)',
          'rgba(239, 211, 160, 0.94)',
        ]}
        locations={[0, 0.22, 0.45, 0.7, 1]}
        style={[
          styles.container,
          {
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        <View style={styles.ornamentRow}>
          <View style={styles.ornamentLine} />
          <Text style={styles.ornamentCross}>✥</Text>
          <View style={styles.ornamentLine} />
        </View>

        <View style={styles.itemsRow}>
          {ITEMS.map(item => {
            const isActive = item.key === active;

            return (
              <Pressable
                key={item.key}
                onPress={() => navigation.navigate(item.route)}
                style={({pressed}) => [
                  styles.item,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.symbol,
                    isActive && styles.symbolActive,
                  ]}
                >
                  {item.symbol}
                </Text>

                <Text
                  style={[
                    styles.label,
                    isActive && styles.labelActive,
                  ]}
                >
                  {item.label}
                </Text>

                <View
                  style={[
                    styles.activeDot,
                    !isActive && styles.activeDotHidden,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
  },

  container: {
    paddingTop: 20,
    paddingHorizontal: 18,
  },

  ornamentRow: {
    height: 13,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },

  ornamentLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(83, 48, 23, 0.26)',
  },

  ornamentCross: {
    marginHorizontal: 8,
    color: 'rgba(83, 48, 23, 0.55)',
    fontSize: 10,
  },

  itemsRow: {
    flexDirection: 'row',
  },

  item: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pressed: {
    opacity: 0.58,
  },

  symbol: {
    color: '#4B2E1B',
    fontFamily: 'serif',
    fontSize: 23,
    lineHeight: 26,
  },

  symbolActive: {
    color: '#341A09',
  },

  label: {
    marginTop: 2,
    color: '#5A3922',
    fontFamily: 'serif',
    fontSize: 11,
    fontWeight: '700',
  },

  labelActive: {
    color: '#341A09',
    fontWeight: '800',
  },

  activeDot: {
    width: 4,
    height: 4,
    marginTop: 4,
    borderRadius: 2,
    backgroundColor: '#7C421E',
  },

  activeDotHidden: {
    opacity: 0,
  },
});