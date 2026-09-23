import React, {
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  api,
} from '../api';

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


export const PrayerRuleScreen = ({
  route,
}) => {
  const {
    slug,
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


  const handleSaved =
    savedItem => {
      setSavedItems(
        current => {
          if (
            current.some(
              item =>
                item.id ===
                savedItem.id
            )
          ) {
            return current;
          }

          return [
            savedItem,
            ...current,
          ];
        }
      );
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
      onSaved={
        handleSaved
      }
      onProgress={
        scheduleSave
      }
    />
  );
};


const styles =
  StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.background,
    },

    loadingText: {
      marginTop: 10,
      color:
        colors.textSecondary,
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
