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
    <View pointerEvents="box-none" style={styles.wrapper}>
      <LinearGradient
        colors={['#3D2416', '#5A341D']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={[
          styles.container,
          {
            paddingBottom: Math.max(insets.bottom, 8),
          },
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
    bottom: 6,
    zIndex: 30,
  },

  container: {
    overflow: 'hidden',
    paddingTop: 6,
    paddingHorizontal: 6,
    borderRadius: 24,
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
    gap: 4,
  },

  item: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },

  itemActive: {
    backgroundColor: 'rgba(173, 108, 49, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(239, 199, 127, 0.14)',
  },

  pressed: {
    opacity: 0.66,
  },

  symbol: {
    color: '#E3C692',
    fontFamily: 'serif',
    fontSize: 24,
    lineHeight: 26,
  },

  symbolActive: {
    color: '#FFF5DF',
  },

  label: {
    marginTop: 2,
    color: '#E7D2AB',
    fontFamily: 'serif',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },

  labelActive: {
    color: '#FFF2D2',
    fontWeight: '800',
  },
});
