import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

export const FixedSectionHeader = ({
  title,
  navigation,
  topInset = 0,
  showBack = true,
  showTitle = true,
  minimal = false,
  showMenu = false,
  onMenuPress,
  dark = false,
  titleOffsetY = 0,
  readingHidden = false,
  compactReading = false,
  languageSwitcher = null,
  onLanguageChange,
}) => {
  const headerHeight = topInset + (minimal ? 46 : 56);
  const visibility = useRef(new Animated.Value(0)).current;
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageOptions = Array.isArray(languageSwitcher?.options) ? languageSwitcher.options : [];
  const selectedLanguage = languageOptions.find(option => option.key === languageSwitcher?.activeKey);
  // Freeze the reading header while the language menu is open. A scroll/idle
  // hide event must not dismiss the menu before the user can choose a language.
  const headerHidden = readingHidden && !languageOpen;
  useEffect(() => {
    Animated.timing(visibility, {
      toValue: headerHidden ? 1 : 0,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headerHidden, visibility]);

  return (
    <>
      {!minimal && (
        <LinearGradient
          pointerEvents="none"
          colors={
            dark
              ? ['#171310', 'rgba(23, 19, 16, 0.82)', 'rgba(23, 19, 16, 0)']
              : ['#FFF4DE', 'rgba(255, 244, 222, 0.72)', 'rgba(255, 244, 222, 0)']
          }
          locations={[0, 0.42, 1]}
          start={{x: 0.5, y: 0}}
          end={{x: 0.5, y: 1}}
          style={[styles.fixedGradient, {height: headerHeight + 10}]}
        />
      )}

      <Animated.View
        pointerEvents={headerHidden ? 'none' : 'box-none'}
        style={[
          styles.fixedHeader,
          {transform: [{translateY: visibility.interpolate({inputRange: [0, 1], outputRange: [0, -(headerHeight + 16)]})}], opacity: visibility.interpolate({inputRange: [0, 1], outputRange: [1, 0]})},
          {
            height: minimal ? headerHeight : headerHeight + 10,
          },
        ]}
      >

        <View
          pointerEvents="box-none"
          style={[
            styles.headerContent,
            {
              height: headerHeight,
              paddingTop: topInset,
            },
          ]}
        >
          {showBack && (
            <Pressable
              hitSlop={16}
              onPress={() => navigation.goBack()}
              style={({pressed}) => [
                styles.backButton,
                compactReading && styles.backButtonReading,
                minimal && styles.backButtonMinimal,
                pressed && styles.pressed,
              ]}
            >
              {compactReading ? (
                <Ionicons name="chevron-back" size={29} color={dark ? '#D7B88C' : '#6F4727'} />
              ) : (
                <Text style={[styles.backArrow, dark && styles.backArrowDark]}>‹</Text>
              )}
            </Pressable>
          )}

          {showTitle && (
            <View
              pointerEvents="box-none"
              style={[
                styles.titleWrap,
                compactReading && styles.titleWrapReading,
                !showBack && styles.titleWrapRoot,
                titleOffsetY !== 0 && !compactReading && {
                  transform: [{translateY: titleOffsetY}],
                },
              ]}
            >
              <View style={styles.titleLine}>
                <Text
                  style={[styles.title, styles.titleFlex, compactReading && styles.titleReading, dark && styles.titleDark]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {title}
                </Text>
                {!!selectedLanguage && !!onLanguageChange && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Выбрать язык чтения"
                    accessibilityState={{expanded: languageOpen}}
                    onPress={() => setLanguageOpen(true)}
                    style={({pressed}) => [styles.languagePill, pressed && styles.pressed]}
                  >
                    <Text style={styles.languagePillText} numberOfLines={1}>{selectedLanguage.label}</Text>
                    <Ionicons name="chevron-down" size={13} color="#744A2B" style={styles.languageChevronIcon} />
                  </Pressable>
                )}
              </View>

              <View style={[styles.ornament, compactReading && styles.ornamentReading]}>
                <View style={[styles.line, dark && styles.lineDark]} />
                <Text style={[styles.mark, dark && styles.markDark]}>✦</Text>
                <View style={[styles.line, dark && styles.lineDark]} />
              </View>
            </View>
          )}

          {showMenu && (
            <Pressable
              hitSlop={12}
              onPress={onMenuPress}
              style={({pressed}) => [
                styles.menuButton,
                !showTitle && styles.menuButtonWithoutTitle,
                minimal && styles.menuButtonMinimal,
                compactReading && styles.menuButtonReading,
                pressed && styles.pressed,
              ]}
            >
              {compactReading ? (
                <Ionicons name="ellipsis-vertical" size={25} color={dark ? '#D7B88C' : '#6F4727'} />
              ) : (
                <Text style={[styles.menuText, dark && styles.menuTextDark]}>⋮</Text>
              )}
            </Pressable>
          )}
        </View>
      </Animated.View>
      <Modal
        visible={languageOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLanguageOpen(false)}
      >
        <Pressable style={styles.languageModalDismiss} onPress={() => setLanguageOpen(false)}>
          <View style={[styles.languageDropdownPosition, {top: topInset + 53}]}>
            <View style={styles.languageDropdown}>
              {languageOptions.map((option) => (
                <Pressable
                  key={option.key}
                  disabled={!!option.disabled}
                  accessibilityRole="button"
                  accessibilityState={{selected: option.key === languageSwitcher?.activeKey, disabled: !!option.disabled}}
                  onPress={() => {
                    setLanguageOpen(false);
                    if (option.key !== languageSwitcher?.activeKey) onLanguageChange?.(option.key);
                  }}
                  style={({pressed}) => [
                    styles.languageDropdownItem,
                    option.key === languageSwitcher?.activeKey && styles.languageDropdownActive,
                    option.disabled && styles.languageDropdownDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.languageDropdownText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fixedGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Independent from header animation. Never blocks reader scroll/taps.
    zIndex: 999,
    elevation: 19,
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Above WebView actions on Android; the Back arrow must win taps
    // when its touch area overlaps a prayer's favorite heart.
    zIndex: 1000,
    elevation: 20,
  },

  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  // The three compact controls use the same 44px line box and vertical
  // offset. The ornament is positioned separately so it cannot lift the text.
  backButtonReading: {
    transform: [{translateY: -5}],
  },
  titleWrapReading: {
    height: 44,
    marginLeft: 5,
    transform: [{translateY: -5}],
    paddingTop: 0,
    paddingRight: 0,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  titleReading: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    textAlign: 'left',
    includeFontPadding: false,
  },
  ornamentReading: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 122,
    marginTop: 0,
  },
  titleWrapRoot: {
    marginLeft: 8,
  },

  backButton: {
    zIndex: 2,
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backButtonMinimal: {
    marginTop: -5,
  },

  backArrow: {
    marginTop: -2,
    color: '#6F4727',
    fontFamily: 'serif',
    fontSize: 34,
    lineHeight: 46,
  },

  titleWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 2,
    paddingTop: 1,
    paddingRight: 10,
  },

  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 5,
  },
  titleFlex: {
    flexShrink: 1,
    minWidth: 0,
  },
  languagePill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    minHeight: 23,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.22)',
    backgroundColor: '#FFF4DE',
  },
  languagePillText: {
    fontSize: 10,
    lineHeight: 14,
    includeFontPadding: false,
    fontWeight: '700',
    color: '#744A2B',
  },
  languageChevronIcon: {
    marginLeft: 3,
  },
  languageModalDismiss: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  languageDropdownPosition: {
    position: 'absolute',
    right: 49,
    minWidth: 155,
    maxWidth: 220,
  },
  languageDropdown: {
    padding: 5,
    borderRadius: 12,
    backgroundColor: '#FFF4DE',
    borderColor: 'rgba(126,82,38,0.3)',
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#442917',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
  },
  languageDropdownItem: {
    minHeight: 37,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  languageDropdownActive: {
    backgroundColor: '#E8DCCB',
  },
  languageDropdownDisabled: {
    opacity: 0.4,
  },
  languageDropdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#54351C',
  },
  title: {
    color: '#432A19',
    fontFamily: 'serif',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '700',
  },

  ornament: {
    width: 118,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },

  line: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(139, 88, 40, 0.38)',
  },

  mark: {
    marginHorizontal: 6,
    color: '#98622E',
    fontSize: 7,
  },

  menuButton: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuButtonWithoutTitle: {
    marginLeft: 'auto',
  },

  menuButtonMinimal: {
    marginTop: -5,
  },
  menuButtonReading: {
    transform: [{translateY: -5}],
  },

  menuText: {
    marginTop: -3,
    color: '#6F4727',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },

  backArrowDark: {
    color: '#D7B88C',
  },

  titleDark: {
    color: '#EADBC7',
  },

  lineDark: {
    backgroundColor: 'rgba(205, 163, 108, 0.30)',
  },

  markDark: {
    color: '#C59762',
  },

  menuTextDark: {
    color: '#D7B88C',
  },

  pressed: {
    opacity: 0.6,
  },
});
