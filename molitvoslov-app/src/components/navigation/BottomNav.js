import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';

const ITEMS = [
  {key: 'home', route: 'Menu', label: 'Главная', icon: 'home'},
  {key: 'favorites', route: 'Favorites', label: 'Избранное', icon: 'favorite'},
  {key: 'prayerbooks', route: 'PrayerBooks', label: 'Молитвослов', icon: 'book'},
  {key: 'memorial', route: 'Memorial', label: 'Помянник', icon: 'candle'},
  {key: 'account', route: 'Account', label: 'Аккаунт', icon: 'account'},
];

const NavIcon = ({type, active}) => {
  const color = active ? '#2C170B' : '#E3C692';

  if (type === 'book') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.bookIcon, {borderColor: color}]}>
          <View style={[styles.bookSpine, {backgroundColor: color}]} />
        </View>
      </View>
    );
  }

  if (type === 'candle') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.candleFlame, {backgroundColor: color}]} />
        <View style={[styles.candleBody, {borderColor: color}]} />
        <View style={[styles.candleBase, {backgroundColor: color}]} />
      </View>
    );
  }

  if (type === 'account') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.accountHead, {borderColor: color}]} />
        <View style={[styles.accountShoulders, {borderColor: color}]} />
      </View>
    );
  }

  return (
    <Text style={[styles.symbol, active && styles.symbolActive]}>
      {type === 'favorite' ? '♡' : '⌂'}
    </Text>
  );
};

export const BottomNav = ({navigation, active}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          bottom: Math.max(insets.bottom + 5, 8),
        },
      ]}
    >
      <LinearGradient
        colors={['#3D2416', '#5A341D']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.container}
      >
        <View style={styles.itemsRow}>
          {ITEMS.map((item) => {
            const isActive = item.key === active;

            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{selected: isActive}}
                accessibilityLabel={item.label}
                onPress={() => navigation.navigate(item.route)}
                style={({pressed}) => [
                  styles.item,
                  isActive && styles.itemActive,
                  pressed && styles.pressed,
                ]}
              >
                <NavIcon type={item.icon} active={isActive} />
                <Text style={[styles.label, isActive && styles.labelActive]}>{item.label}</Text>
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
    left: 8,
    right: 8,
    zIndex: 30,
    maxWidth: 410,
    alignSelf: 'center',
  },

  container: {
    overflow: 'hidden',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(246, 216, 162, 0.16)',
    shadowColor: '#2C170B',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },

  itemsRow: {
    flexDirection: 'row',
    gap: 1,
    width: 382,
    maxWidth: '100%',
    alignSelf: 'center',
    height: 46,
    alignItems: 'center',
  },

  item: {
    flex: 1,
    height: 41,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 2,
    borderRadius: 15,
  },

  itemActive: {
    backgroundColor: 'rgb(244, 220, 168)',
    borderWidth: 1,
    borderColor: 'rgba(239, 199, 127, 0.14)',
  },

  pressed: {
    opacity: 0.66,
  },

  symbol: {
    color: '#E3C692',
    fontFamily: 'serif',
    fontSize: 19,
    lineHeight: 20,
  },

  symbolActive: {
    color: '#2C170B',
    fontSize: 20,
  },

  iconBox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bookIcon: {
    width: 18,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 3,
    position: 'relative',
  },

  bookSpine: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    left: 7.5,
    width: 1,
    opacity: 0.9,
  },

  candleFlame: {
    width: 6,
    height: 8,
    marginBottom: 1,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 1,
    transform: [{rotate: '35deg'}],
  },

  candleBody: {
    width: 8,
    height: 8,
    borderWidth: 1.5,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  candleBase: {
    width: 13,
    height: 1.5,
    marginTop: 1,
    borderRadius: 1,
  },

  accountHead: {
    width: 7,
    height: 7,
    marginBottom: 2,
    borderWidth: 1.5,
    borderRadius: 4,
  },

  accountShoulders: {
    width: 16,
    height: 8,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
  },

  label: {
    marginTop: 0,
    color: '#E7D2AB',
    fontFamily: 'serif',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '600',
  },

  labelActive: {
    color: '#2C170B',
    fontWeight: '800',
  },
});
