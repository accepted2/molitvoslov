import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

const ITEMS = [
  {key: 'home', route: 'Menu', label: 'Главная', symbol: '⌂'},
  {key: 'favorites', route: 'Favorites', label: 'Избранное', symbol: '♡'},
  {key: 'account', route: 'Account', label: 'Аккаунт', symbol: '○'},
];

export const BottomNav = ({navigation, active}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, {paddingBottom: Math.max(insets.bottom, 8)}]}>
      {ITEMS.map(item => {
        const isActive = item.key === active;

        return (
          <Pressable
            key={item.key}
            onPress={() => navigation.navigate(item.route)}
            style={({pressed}) => [styles.item, pressed && styles.pressed]}
          >
            <Text style={[styles.symbol, isActive && styles.symbolActive]}>{item.symbol}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>{item.label}</Text>
            <View style={[styles.activeDot, !isActive && styles.activeDotHidden]} />
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F7E9CF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(125, 81, 39, 0.26)',
    shadowColor: '#4B2A18',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  item: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.58,
  },
  symbol: {
    fontSize: 23,
    lineHeight: 25,
    color: '#8A735F',
    fontFamily: 'serif',
  },
  symbolActive: {
    color: '#9A642F',
  },
  label: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#826C58',
    fontFamily: 'serif',
  },
  labelActive: {
    color: '#6D421F',
  },
  activeDot: {
    width: 4,
    height: 4,
    marginTop: 4,
    borderRadius: 2,
    backgroundColor: '#9A642F',
  },
  activeDotHidden: {
    opacity: 0,
  },
});
