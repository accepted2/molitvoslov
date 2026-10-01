import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {READER_LANGUAGE_MODES, buildReaderLanguageOptions} from '../services/readerLanguageModes';
import {colors, radius, spacing} from '../theme';

export const MiscPrayerPlaceholderScreen = ({route, navigation}) => {
  const {
    title = 'Молитва',
    churchText = '',
    russianText = '',
    traditionalText = '',
  } = route.params || {};

  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.BOTH);
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;

  const options = useMemo(
    () =>
      buildReaderLanguageOptions({
        hasRussian: !!russianText.trim(),
        hasTraditional: !!traditionalText.trim(),
      }),
    [russianText, traditionalText]
  );

  const visibleTexts =
    viewMode === READER_LANGUAGE_MODES.RUSSIAN
      ? [{key: 'russian', label: 'Русский', text: russianText}]
      : viewMode === READER_LANGUAGE_MODES.TRADITIONAL
        ? [
            {
              key: 'traditional',
              label: 'Церковнославянский · традиционное написание',
              text: traditionalText,
            },
          ]
        : viewMode === READER_LANGUAGE_MODES.BOTH
          ? [
              {key: 'church', label: 'Церковнославянский', text: churchText},
              {key: 'russian', label: 'Русский', text: russianText},
            ]
          : [{key: 'church', label: 'Церковнославянский', text: churchText}];

  return (
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + 18,
          paddingHorizontal: spacing.md,
          paddingBottom: 40 + insets.bottom,
        }}
      >
        <View style={styles.switcher}>
          {options.map((option) => {
            const active = option.key === viewMode;

            return (
              <Pressable
                key={option.key}
                disabled={option.disabled}
                onPress={() => setViewMode(option.key)}
                style={({pressed}) => [
                  styles.switchButton,
                  active && styles.switchButtonActive,
                  option.disabled && styles.switchButtonDisabled,
                  pressed && !option.disabled && styles.pressed,
                ]}
              >
                <Text style={[styles.switchText, active && styles.switchTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.title}>{title}</Text>

        {visibleTexts.map((item) => (
          <View key={item.key} style={styles.textBlock}>
            {viewMode === READER_LANGUAGE_MODES.BOTH && (
              <Text style={styles.languageLabel}>{item.label}</Text>
            )}
            <Text style={styles.prayerText}>{item.text || 'Текст будет добавлен позже.'}</Text>
          </View>
        ))}
      </ScrollView>

      <FixedSectionHeader
        title={title}
        navigation={navigation}
        topInset={insets.top}
        showTitle={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFF4DE',
  },

  switcher: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  switchButton: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: radius.sm,
  },

  switchButtonActive: {
    backgroundColor: colors.accentSoft,
  },

  switchButtonDisabled: {
    opacity: 0.35,
  },

  switchText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },

  switchTextActive: {
    color: colors.accentDark,
  },

  title: {
    marginTop: 24,
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    textAlign: 'center',
  },

  textBlock: {
    marginTop: 20,
  },

  languageLabel: {
    marginBottom: 8,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  prayerText: {
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 30,
    textAlign: 'justify',
  },

  pressed: {
    opacity: 0.65,
  },
});
