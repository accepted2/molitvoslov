import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
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
} from '../theme';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader}
  from '../components/navigation/FixedSectionHeader';


const MODE_CHURCH =
  'church';

const MODE_BOTH =
  'both';

const MODE_RUSSIAN =
  'russian';


export const PrayerRuleScreen = ({
  route,
  navigation,
}) => {
  const {
    slug,
    focusTarget = null,
  } = route.params;

  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

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


  const viewSwitcher = {
    activeKey:
      viewMode,

    options: [
      {
        key:
          MODE_CHURCH,
        label:
          'ЦС',
      },
      {
        key:
          MODE_BOTH,
        label:
          'ЦС + Рус.',
        disabled:
          !hasRussianTranslation,
      },
      {
        key:
          MODE_RUSSIAN,
        label:
          'Рус.',
        disabled:
          !hasRussianTranslation,
      },
    ],
  };


  return (
    <View
      style={styles.container}
    >
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

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
        viewSwitcher={
          viewSwitcher
        }
        topContentInset={
          headerHeight
        }
        onProgress={
          scheduleSave
        }
        onViewModeChange={
          setViewMode
        }
      />

      <FixedSectionHeader
        title={
          rule.name ||
          'Молитвенное правило'
        }
        navigation={
          navigation
        }
        topInset={
          insets.top
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
