import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {CommonActions} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';
import {useLanguage} from '../../context/LanguageContext';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
const ITEMS = [
  {key: 'home', route: 'Menu', labelKey: 'nav.home', icon: 'home'},
  {key: 'favorites', route: 'Favorites', labelKey: 'nav.favorites', icon: 'favorite'},
  {key: 'prayerbooks', route: 'PrayerBooks', labelKey: 'nav.prayerBooks', icon: 'book'},
  {key: 'memorial', route: 'Memorial', labelKey: 'nav.memorial', icon: 'candle'},
  {key: 'account', route: 'Account', labelKey: 'nav.account', icon: 'account'},
];

const NavIcon = ({type, active, size}) => {
  const color = active ? '#2C170B' : '#F5DCB5';

  const iconNames = {
    home: 'home',
    favorite: 'heart',
    book: 'book-open',
    account: 'user',
  };

  if (type === 'candle') {
    return <MaterialCommunityIcons name="candle" size={size} color={color} />;
  }

  return <Feather name={iconNames[type] || 'circle'} size={size} color={color} />;
};

export const BottomNav = ({navigation, active, readingHidden = false}) => {
  const visibility = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(visibility, {toValue: readingHidden ? 1 : 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start();
  }, [readingHidden, visibility]);
  const insets = useSafeAreaInsets();
  const {width: windowWidth, fontScale} = useWindowDimensions();
  const {t} = useLanguage();

  // Keep controls usable on narrow / high-density Android phones. Font scale
  // grows the row instead of shrinking long navigation labels.
  const iconSize = windowWidth < 350 ? 20 : 22;
  const rowHeight = Math.max(64, Math.ceil(34 + 30 * Math.max(1, fontScale)));
  const itemHeight = rowHeight - 4;

  const openRootTab = (route) => {
    navigation.dispatch(CommonActions.reset({
      index: route === 'Menu' ? 0 : 1,
      routes: route === 'Menu' ? [{name: 'Menu'}] : [{name: 'Menu'}, {name: route}],
    }));
  };

  return (
    <Animated.View
      pointerEvents={readingHidden ? 'none' : 'box-none'}
      style={[
        styles.wrapper,
        {transform: [{translateY: visibility.interpolate({inputRange: [0, 1], outputRange: [0, 100]})}], opacity: visibility.interpolate({inputRange: [0, 1], outputRange: [1, 0]})},
        {
          bottom: Math.max(insets.bottom + 4, 7),
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(61, 36, 22, 0.98)', 'rgba(90, 52, 29, 0.98)']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.container}
      >
        <View style={[styles.itemsRow, {height: rowHeight}]}>
          {ITEMS.map((item) => {
            const isActive = item.key === active;

            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{selected: isActive}}
                accessibilityLabel={t(item.labelKey)}
                onPress={() => openRootTab(item.route)}
                style={({pressed}) => [
                  styles.item,
                  {height: itemHeight},
                  isActive && styles.itemActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.itemContent}>
                  <View style={styles.navIconWrap}>
                    <NavIcon type={item.icon} active={isActive} size={iconSize} />
                  </View>

                  <Text
                    numberOfLines={2}
                    style={[styles.label, isActive && styles.labelActive]}
                  >
                    {t(item.labelKey)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 30,
    maxWidth: 480,
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
    width: '100%',
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  navIconWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  item: {
    flex: 1,
    minWidth: 0,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 2,
    borderRadius: 12,
  },

  itemActive: {
    backgroundColor: 'rgb(244, 220, 168)',
    borderWidth: 1,
    borderColor: 'rgba(239, 199, 127, 0.14)',
    paddingHorizontal: 1,
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
    marginTop: 2,
    color: '#F5DCB5',
    fontFamily: 'serif',
    paddingHorizontal: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },

  labelActive: {
    color: '#2C170B',
    // fontWeight: '800',
    // paddingHorizontal: 1,
  },
});
