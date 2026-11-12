import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {buildReaderHeaderChrome} from '../../services/readerHeaderChrome';
import {useInterfaceScale} from '../../context/InterfaceScaleContext';

export const FixedSectionHeader = ({
  title,
  titleTextStyle = null,
  navigation,
  topInset = 0,
  showBack = true,
  showTitle = true,
  minimal = false,
  showMenu = false,
  onMenuPress,
  dark = false,
  gradientColor = null,
  titleOffsetY = 0,
  readingHidden = false,
  compactReading = false,
  languageSwitcher = null,
  onLanguageChange,
  headerAction = null,
  onHeaderHeightChange,
}) => {
  const uiScale = useInterfaceScale();
  const insets = useSafeAreaInsets();
  const {width: screenWidth} = useWindowDimensions();
  const visibility = useRef(new Animated.Value(0)).current;
  const [languageOpen, setLanguageOpen] = useState(false);
  const chromeBackground = gradientColor || (dark ? '#171310' : '#FFF4DE');
  const chrome = buildReaderHeaderChrome(chromeBackground, dark);
  const chromeDark = chrome.dark;
  const [titleLines, setTitleLines] = useState(1);
  const [measuredTitleWidth, setMeasuredTitleWidth] = useState(0);
  const extraTitleHeight = showTitle ? Math.max(0, titleLines - 1) * Math.ceil((compactReading ? 20 : 25) * uiScale) : 0;
  // Readers extend under the translucent status bar; the native safe-area
  // inset accounts for different camera cutouts without device-specific px.
  // Category screens deliberately keep their original header layout.
  const safeTop = compactReading ? Math.max(insets.top, topInset, 0) : topInset;
  const contentTop = safeTop + (compactReading ? 4 : 0);
  const headerHeight = contentTop + (compactReading ? 44 : (minimal ? 45 : 36)) + extraTitleHeight;
  // Feathered local halo follows the measured width of the heading.
  const haloWidth = Math.min(
    Math.max(92, screenWidth - 16),
    Math.max(144, measuredTitleWidth + 91 + (languageSwitcher?.activeKey ? 66 : 0))
  );
  const haloHeight = (compactReading ? 54 : 52) + extraTitleHeight;
  useEffect(() => {
    onHeaderHeightChange?.(headerHeight);
  }, [headerHeight, onHeaderHeightChange]);
  const languageOptions = Array.isArray(languageSwitcher?.options) ? languageSwitcher.options : [];
  const selectedLanguage = languageOptions.find(option => option.key === languageSwitcher?.activeKey);
  // Freeze the reading header while the language menu is open. A scroll/idle
  // hide event must not dismiss the menu before the user can choose a language.
  const headerHidden = readingHidden && !languageOpen;
  // Same localized contrast for category menus and compact prayer readers.
  const headerHaloActive = !minimal && showTitle;
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

        {/* Feathered parchment only behind the arrow and heading.
            It does not intercept taps or darken the rest of the artwork. */}
        {headerHaloActive && (
          <LinearGradient
            pointerEvents="none"
            colors={chromeDark
              ? [
                  'rgba(26, 20, 15, 0)',
                  'rgba(26, 20, 15, 0.75)',
                  'rgba(26, 20, 15, 0.78)',
                  'rgba(26, 20, 15, 0)',
                ]
              : [
                  'rgba(250, 239, 213, 0)',
                  'rgba(250, 239, 213, 0.82)',
                  'rgba(250, 239, 213, 0.84)',
                  'rgba(250, 239, 213, 0)',
                ]}
            locations={[0, 0.13, 0.75, 1]}
            start={{x: 0, y: 0.5}}
            end={{x: 1, y: 0.5}}
            style={[styles.localHeaderHalo, {
              left: 4,
              top: Math.max(0, contentTop - 6),
              width: haloWidth,
              height: haloHeight,
            }]}
          />
        )}

        <View
          pointerEvents="box-none"
          style={[
            styles.headerContent,
            {
              height: headerHeight,
              paddingTop: contentTop,
            },
          ]}
        >
          {showBack && (
            <Pressable
              hitSlop={16}
              onPress={() => navigation.goBack()}
              style={({pressed}) => [
                styles.backButton,
                minimal && styles.backButtonMinimal,
                pressed && styles.pressed,
              ]}
            >
              {compactReading ? (
                <Ionicons name="chevron-back" size={23} color={chromeDark ? '#D7B88C' : '#6F4727'} />
              ) : (
                <Text style={[
                    styles.backArrow,
                    chromeDark && styles.backArrowDark,
                    headerHaloActive && (chromeDark ? styles.categoryArrowContrastDark : styles.categoryArrowContrast),
                  ]}>‹</Text>
              )}
            </Pressable>
          )}

          {showTitle && (
            <View
              pointerEvents="box-none"
              style={[
                styles.titleWrap,
                compactReading && styles.titleWrapReading,
                compactReading && {height: 44 + extraTitleHeight},
                !showBack && styles.titleWrapRoot,
                titleOffsetY !== 0 && !compactReading && {
                  transform: [{translateY: titleOffsetY}],
                },
              ]}
            >
              <View style={styles.titleLine}>
                <Text
                  style={[styles.title, styles.titleFlex, compactReading && styles.titleReading, chromeDark && styles.titleDark, {
                    fontSize: (compactReading ? 17 : 21) * uiScale,
                    lineHeight: (compactReading ? 20 : 25) * uiScale,
                  },
                    headerHaloActive && (chromeDark ? styles.categoryTitleContrastDark : styles.categoryTitleContrast),
                    titleTextStyle]}
                  onTextLayout={(event) => {
                    const count = event.nativeEvent?.lines?.length || 1;
                    setTitleLines((previous) => previous === count ? previous : count);
                  }}
                  onLayout={(event) => {
                    const width = Math.ceil(event.nativeEvent?.layout?.width || 0);
                    if (width > 0) {
                      setMeasuredTitleWidth((previous) => previous === width ? previous : width);
                    }
                  }}
                >
                  {title}
                </Text>
                {!!selectedLanguage && !!onLanguageChange && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Выбрать язык чтения"
                    accessibilityState={{expanded: languageOpen}}
                    onPress={() => setLanguageOpen(true)}
                    style={({pressed}) => [styles.languagePill, {backgroundColor: chrome.pill, borderColor: chrome.border}, pressed && styles.pressed]}
                  >
                    <Text style={[styles.languagePillText, {fontSize: 10 * uiScale, lineHeight: 14 * uiScale}, chromeDark && styles.languagePillTextDark]} numberOfLines={1}>{selectedLanguage.label}</Text>
                    <Ionicons name="chevron-down" size={13} color={chromeDark ? '#D7B88C' : '#744A2B'} style={styles.languageChevronIcon} />
                  </Pressable>
                )}
                {!!headerAction?.label && !!headerAction?.onPress && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={headerAction.accessibilityLabel || headerAction.label}
                    onPress={headerAction.onPress}
                    hitSlop={8}
                    style={({pressed}) => [
                      styles.headerActionButton,
                      {backgroundColor: chrome.pill, borderColor: chrome.border},
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.headerActionText, {fontSize: 11 * uiScale, lineHeight: 15 * uiScale}, chromeDark && styles.headerActionTextDark]}
                    >
                      {headerAction.label}
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={[styles.ornament, compactReading && styles.ornamentReading]}>
                <View style={[styles.line, chromeDark && styles.lineDark]} />
                <Text style={[styles.mark, chromeDark && styles.markDark]}>✦</Text>
                <View style={[styles.line, chromeDark && styles.lineDark]} />
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
                pressed && styles.pressed,
              ]}
            >
              {compactReading ? (
                <Ionicons name="ellipsis-vertical" size={20} color={chromeDark ? '#D7B88C' : '#6F4727'} />
              ) : (
                <Text style={[
                    styles.menuText,
                    chromeDark && styles.menuTextDark,
                    headerHaloActive && (chromeDark ? styles.categoryArrowContrastDark : styles.categoryArrowContrast),
                  ]}>⋮</Text>
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
          <View style={[styles.languageDropdownPosition, {top: headerHeight + 2}]}>
            <View style={[styles.languageDropdown, {backgroundColor: chrome.dropdown, borderColor: chrome.border}]}>
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
                    option.key === languageSwitcher?.activeKey && {backgroundColor: chrome.active},
                    option.disabled && styles.languageDropdownDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.languageDropdownText, {color: chrome.foreground}]}>{option.label}</Text>
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
  localHeaderHalo: {
    position: 'absolute',
    borderRadius: 23,
    overflow: 'hidden',
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
  titleWrapReading: {
    height: 44,
    marginLeft: 5,
    paddingTop: 0,
    paddingRight: 0,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  titleReading: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'left',

    includeFontPadding: false,
  },
  ornamentReading: {
    width: 122,
    marginTop: 2,
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
    marginTop: -12,
    color: '#6F4727',
    fontFamily: 'serif',
    fontSize: 34,
    lineHeight: 46,
  },
  // A small light halo retains letter edges over detailed backgrounds.
  categoryArrowContrast: {
    color: '#432819',
    textShadowColor: 'rgba(255, 246, 222, 0.97)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  categoryArrowContrastDark: {
    color: '#F2E2C9',
    textShadowColor: 'rgba(0, 0, 0, 0.82)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
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
  headerActionButton: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.25)',
    backgroundColor: '#F4E4CA',
  },
  headerActionText: {
    color: '#744A2B',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    includeFontPadding: false,
  },
  headerActionTextDark: {
    color: '#EADBC7',
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
  languagePillTextDark: {
    color: '#EADBC7',
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
    flexWrap: 'wrap',
  },
  categoryTitleContrast: {
    color: '#382419',
    textShadowColor: 'rgba(255, 246, 222, 0.96)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  categoryTitleContrastDark: {
    color: '#F2E2C9',
    textShadowColor: 'rgba(0, 0, 0, 0.82)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
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
