import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  contentApi as api,
} from '../services/contentApi';

import {
  useReadingProgress,
} from '../hooks/useReadingProgress';

import {
  getSavedItems,
} from '../services/savedItems';

import PrayerRuleReader
  from '../components/reader/PrayerRuleReader';

import {
  colors,
  radius,
  spacing,
} from '../theme';


const MODE_CHURCH =
  'church';

const MODE_BOTH =
  'both';

const MODE_RUSSIAN =
  'russian';


const LanguageButton = ({
  title,
  active,
  disabled,
  onPress,
}) => (
  <Pressable
    disabled={
      disabled
    }
    onPress={
      onPress
    }
    style={({pressed}) => [
      styles.languageButton,

      active &&
        styles
          .languageButtonActive,

      disabled &&
        styles
          .languageButtonDisabled,

      pressed &&
        !disabled &&
        styles.pressed,
    ]}
  >
    <Text
      style={[
        styles.languageButtonText,

        active &&
          styles
            .languageButtonTextActive,
      ]}
      numberOfLines={1}
    >
      {title}
    </Text>
  </Pressable>
);


export const PrayerRuleScreen = ({
  route,
}) => {
  const {
    slug,
    focusTarget = null,
  } = route.params;

  const [
    rule,
    setRule,
  ] = useState(null);

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);

  const [
    viewMode,
    setViewMode,
  ] = useState(
    MODE_BOTH
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);


  const {
    savedProgress,
    progressReady,
    scheduleSave,
  } = useReadingProgress({
    sourceType:
      'prayer_rule',

    sourceId:
      rule?.id,
  });


  useEffect(() => {
    loadRule();
  }, [
    slug,
  ]);


  const hasRussianTranslation =
    useMemo(
      () =>
        (
          rule?.items ||
          []
        ).some(
          item =>
            item.item_type ===
              'text' &&
            !!item.text
              ?.translation
              ?.trim()
        ),
      [
        rule,
      ]
    );


  useEffect(() => {
    if (
      rule &&
      !hasRussianTranslation &&
      viewMode !==
        MODE_CHURCH
    ) {
      setViewMode(
        MODE_CHURCH
      );
    }
  }, [
    rule,
    hasRussianTranslation,
    viewMode,
  ]);


  const loadRule =
    async () => {
      try {
        setLoading(true);
        setError(null);
        setRule(null);
        setSavedItems([]);

        const response =
          await api.get(
            `prayer-rules/${slug}/`
          );

        const ruleData =
          response.data;

        setRule(
          ruleData
        );

        try {
          const saved =
            await getSavedItems({
              source_type:
                'prayer_rule',

              source_id:
                ruleData.id,
            });

          setSavedItems(
            saved
          );
        } catch (
          savedError
        ) {
          console.log(
            'Ошибка загрузки сохранённых фрагментов:',
            savedError.response?.data ||
            savedError.message
          );
        }
      } catch (loadError) {
        console.log(
          'Ошибка загрузки молитвенного правила:',
          loadError.response?.data ||
          loadError.message
        );

        setError(
          'Не удалось загрузить молитвенное правило'
        );
      } finally {
        setLoading(false);
      }
    };



  if (
    loading ||
    (
      rule &&
      !progressReady
    )
  ) {
    return (
      <View
        style={styles.center}
      >
        <ActivityIndicator
          size="large"
          color={
            colors.accent
          }
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Загрузка...
        </Text>
      </View>
    );
  }


  if (
    error ||
    !rule
  ) {
    return (
      <View
        style={styles.center}
      >
        <Text
          style={styles.error}
        >
          {
            error ||
            'Молитвенное правило не найдено'
          }
        </Text>
      </View>
    );
  }


  return (
    <View
      style={styles.container}
    >
      <View
        style={
          styles.languageSwitcher
        }
      >
        <LanguageButton
          title="ЦС"
          active={
            viewMode ===
            MODE_CHURCH
          }
          onPress={() =>
            setViewMode(
              MODE_CHURCH
            )
          }
        />

        <LanguageButton
          title="ЦС + Рус."
          active={
            viewMode ===
            MODE_BOTH
          }
          disabled={
            !hasRussianTranslation
          }
          onPress={() =>
            setViewMode(
              MODE_BOTH
            )
          }
        />

        <LanguageButton
          title="Рус."
          active={
            viewMode ===
            MODE_RUSSIAN
          }
          disabled={
            !hasRussianTranslation
          }
          onPress={() =>
            setViewMode(
              MODE_RUSSIAN
            )
          }
        />
      </View>

      <PrayerRuleReader
        rule={
          rule
        }
        savedItems={
          savedItems
        }
        savedProgress={
          savedProgress
        }
        focusTarget={
          focusTarget
        }
        viewMode={
          viewMode
        }
        onProgress={
          scheduleSave
        }
      />
    </View>
  );
};


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#FFF4DE',
    },

    languageSwitcher: {
      flexDirection:
        'row',
      marginHorizontal:
        spacing.md,
      marginTop:
        spacing.sm,
      marginBottom: 6,
      padding: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        'rgba(123, 79, 36, 0.18)',
      backgroundColor:
        'rgba(161, 110, 53, 0.10)',
    },

    languageButton: {
      flex: 1,
      minHeight: 38,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius: 10,
    },

    languageButtonActive: {
      backgroundColor:
        '#7A4F2D',
      shadowColor:
        '#5A3822',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },

    languageButtonDisabled: {
      opacity: 0.32,
    },

    languageButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color:
        '#765238',
    },

    languageButtonTextActive: {
      color:
        '#FFF8EA',
    },

    pressed: {
      opacity: 0.65,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        '#FFF4DE',
    },

    loadingText: {
      marginTop: 10,
      color:
        '#765238',
    },

    error: {
      paddingHorizontal: 24,
      textAlign: 'center',
      color:
        colors.liturgical,
      fontSize: 15,
      lineHeight: 22,
    },
  });
