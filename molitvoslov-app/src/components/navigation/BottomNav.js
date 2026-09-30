import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';

const ITEMS = [
  {key: 'home', route: 'Menu', label: 'Главная', symbol: '⌂'},
  {key: 'favorites', route: 'Favorites', label: 'Избранное', symbol: '♡'},
  {key: 'memorial', route: 'Memorial', label: 'Помянник', symbol: '†'},
  {key: 'account', route: 'Account', label: 'Аккаунт', symbol: '○'},
];

export const BottomNav = ({navigation, active}) => {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none"
          style={[
            styles.wrapper,
            {
              bottom: Math.max(insets.bottom + 5, 8),
            },
          ]}>
      <LinearGradient
        colors={['#3D2416', '#5A341D']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={[
          styles.container,

        ]}
      >
        <View style={styles.itemsRow}>
          {ITEMS.map((item) => {
            const isActive = item.key === active;

            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{selected: isActive}}
                onPress={() => navigation.navigate(item.route)}
                style={({pressed}) => [
                  styles.item,
                  isActive && styles.itemActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.symbol, isActive && styles.symbolActive]}>{item.symbol}</Text>
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
    left: 10,
    right: 10,

    zIndex: 30,
    maxWidth: 400,
    alignSelf: 'center',
  },

  container: {
    overflow: 'hidden',

    paddingVertical: 4,
    paddingHorizontal: 5,

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
    gap: 2,

    width: 350,
    maxWidth: '100%',
    alignSelf: 'center',

    height: 44,
    alignItems: 'center',
  },

  item: {
    flex: 1,

    height: 40,

    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 0,
    paddingVertical: 2,

    borderRadius: 16,
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
    fontSize: 20,
    lineHeight: 21,
  },

  symbolActive: {
    color: '#2C170B',
    fontSize: 21,
  },

  label: {
    marginTop: 0,

    color: '#E7D2AB',
    fontFamily: 'serif',

    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
  },

  labelActive: {
    color: '#2C170B',
    fontWeight: '800',
  },
});
