import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useFocusEffect,
} from '@react-navigation/native';

import {
  api,
} from '../api';

import {
  useReadingProgress,
} from '../hooks/useReadingProgress';


import {
  deleteSavedItem,
  getSavedItems,
  saveItem,
} from '../services/savedItems';

import ExpandablePrayerBlock
  from '../components/reader/ExpandablePrayerBlock';

import {
  colors,
  radius,
  spacing,
} from '../theme';


export default function PsalterScreen({
  navigation,
}) {

  const [
    psalter,
    setPsalter,
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
    reloadProgress,
  } = useReadingProgress({
    sourceType:
      'psalter',

    sourceId:
      psalter?.id,
  });

  const listRef =
    useRef(null);


  useEffect(() => {
    loadPsalter();
  }, []);


  useFocusEffect(
    useCallback(() => {
      if (
        psalter?.id
      ) {
        reloadProgress();

        loadSavedKathismas(
          psalter.id
        );
      }
    }, [
      psalter?.id,
      reloadProgress,
    ])
  );


  const loadSavedKathismas =
    async psalterId => {
      try {
        const saved =
          await getSavedItems({
            source_type:
              'psalter',

            source_id:
              psalterId,

            anchor_type:
              'kathisma',
          });

        setSavedItems(
          saved
        );
      } catch (err) {
        console.log(
          'Ошибка загрузки сохранённых кафизм:',
          err
        );
      }
    };


  const loadPsalter =
    async () => {
      try {
        setLoading(true);

        setError(null);

        const response =
          await api.get(
            'psalters/psaltir/'
          );

        const data =
          response.data;

        setPsalter(
          data
        );

        await loadSavedKathismas(
          data.id
        );
      } catch (err) {
        console.log(
          'Ошибка загрузки Псалтири:',
          err
        );

        setError(
          'Не удалось загрузить Псалтирь'
        );
      } finally {
        setLoading(
          false
        );
      }
    };


  const openKathisma =
    kathisma => {
      navigation.navigate(
        'Kathisma',
        {
          kathismaNumber:
            kathisma.number,

          kathismaTitle:
            kathisma.title ||
            `Кафизма ${kathisma.number}`,
        }
      );
    };


  const getSavedKathisma =
    kathismaId =>
      savedItems.find(
        item =>
          item.anchor_type ===
            'kathisma' &&
          Number(
            item.anchor_id
          ) ===
            Number(
              kathismaId
            )
      );


  const toggleKathismaSaved =
    async kathisma => {
      const existing =
        getSavedKathisma(
          kathisma.id
        );

      try {
        if (existing) {
          await deleteSavedItem(
            existing.id
          );

          setSavedItems(
            current =>
              current.filter(
                item =>
                  item.id !==
                  existing.id
              )
          );

          return;
        }

        const saved =
          await saveItem({
            save_type:
              'kathisma',

            source_type:
              'psalter',

            source_id:
              psalter.id,

            anchor_type:
              'kathisma',

            anchor_id:
              kathisma.id,

            source_title:
              psalter.name ||
              'Псалтирь',

            item_title:
              `Кафизма ${kathisma.number}`,

            text: '',

            metadata: {
              kathisma_number:
                kathisma.number,

              kathisma_title:
                kathisma.title ||
                '',
            },
          });

        setSavedItems(
          current => [
            saved,
            ...current,
          ]
        );
      } catch (err) {
        console.log(
          'Ошибка сохранения кафизмы:',
          err.response?.data ||
          err.message
        );
      }
    };


  const progressInfo =
    savedProgress
      ?.anchor_info;

  const currentKathismaNumber =
    progressInfo
      ?.kathisma_number;

  const currentKathisma =
    psalter
      ?.kathismas
      ?.find(
        kathisma =>
          Number(
            kathisma.number
          ) ===
            Number(
              currentKathismaNumber
            )
      );


  if (loading) {
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
      </View>
    );
  }


  if (error) {
    return (
      <View
        style={styles.center}
      >
        <Text
          style={styles.error}
        >
          {error}
        </Text>
      </View>
    );
  }


  const handlePrayersCollapse =
    () => {
      requestAnimationFrame(
        () => {
          listRef.current
            ?.scrollToOffset({
              offset: 0,
              animated: true,
            });
        }
      );
    };


  return (
    <View
      style={styles.container}
    >
      <FlatList
        ref={listRef}
        data={
          psalter?.kathismas ||
          []
        }
        keyExtractor={
          item =>
            String(
              item.id
            )
        }
        contentContainerStyle={
          styles.listContent
        }
        ListHeaderComponent={
          <View
            style={styles.header}
          >
            <ExpandablePrayerBlock
              title="Молитвы перед чтением Псалтири"
              text={
                psalter
                  ?.prayers_before
              }
              onCollapse={
                handlePrayersCollapse
              }
              saveProps={{
                sourceType:
                  'psalter',

                sourceId:
                  psalter?.id,

                anchorType:
                  'psalter_prayers_before',

                anchorId:
                  psalter?.id,

                sourceTitle:
                  psalter?.name ||
                  'Псалтирь',

                itemTitle:
                  'Молитвы перед чтением Псалтири',

                metadata: {
                  section:
                    'prayers_before',
                },
              }}
            />

            {currentKathisma &&
              progressInfo && (
                <Pressable
                  style={({pressed}) => [
                    styles.continueCard,

                    pressed &&
                      styles.pressed,
                  ]}
                  onPress={() =>
                    openKathisma(
                      currentKathisma
                    )
                  }
                >
                  <Text
                    style={
                      styles
                        .continueLabel
                    }
                  >
                    Продолжить чтение
                  </Text>

                  <Text
                    style={
                      styles
                        .continueTitle
                    }
                  >
                    Кафизма{' '}
                    {
                      progressInfo
                        .kathisma_number
                    }
                  </Text>

                  <Text
                    style={
                      styles
                        .continuePosition
                    }
                  >
                    Псалом{' '}
                    {
                      progressInfo
                        .psalm_number
                    }
                    {
                      progressInfo
                        .verse_number
                        ? ` · стих ${progressInfo.verse_number}`
                        : ''
                    }
                  </Text>
                </Pressable>
              )}
          </View>
        }
        renderItem={({
          item,
        }) => {
          const isCurrent =
            Number(
              item.number
            ) ===
              Number(
                currentKathismaNumber
              );

          const saved =
            !!getSavedKathisma(
              item.id
            );

          return (
            <View
              style={[
                styles.kathisma,

                isCurrent &&
                  styles
                    .kathismaCurrent,

                saved &&
                  styles
                    .kathismaSaved,
              ]}
            >
              <Pressable
                onPress={() =>
                  openKathisma(
                    item
                  )
                }
                style={({pressed}) => [
                  styles.kathismaMain,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles
                      .kathismaNumber
                  }
                >
                  Кафизма{' '}
                  {item.number}
                </Text>

                <Text
                  style={
                    styles.psalmRange
                  }
                >
                  {
                    item.first_psalm ===
                    item.last_psalm
                      ? `Псалом ${item.first_psalm}`
                      : `Псалмы ${item.first_psalm}–${item.last_psalm}`
                  }
                </Text>

                {isCurrent &&
                  progressInfo && (
                    <Text
                      style={
                        styles
                          .currentPosition
                      }
                    >
                      Здесь остановились ·
                      Псалом{' '}
                      {
                        progressInfo
                          .psalm_number
                      }
                      {
                        progressInfo
                          .verse_number
                          ? `, стих ${progressInfo.verse_number}`
                          : ''
                      }
                    </Text>
                  )}

                {!!item.title && (
                  <Text
                    style={
                      styles
                        .kathismaTitle
                    }
                  >
                    {item.title}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() =>
                  toggleKathismaSaved(
                    item
                  )
                }
                style={({pressed}) => [
                  styles.saveButton,

                  saved &&
                    styles
                      .saveButtonActive,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.saveButtonText,

                    saved &&
                      styles
                        .saveButtonTextActive,
                  ]}
                >
                  {
                    saved
                      ? 'В избранном'
                      : 'В избранное'
                  }
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    listContent: {
      padding:
        spacing.sm,
      paddingBottom: 32,
      gap: 9,
    },

    header: {
      gap: 10,
      marginBottom: 2,
    },

    continueCard: {
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surfaceMuted,
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
    },

    continueLabel: {
      marginBottom: 7,
      fontSize: 12,
      fontWeight: '700',
      textTransform:
        'uppercase',
      letterSpacing: 0.8,
      color:
        colors.accent,
    },

    continueTitle: {
      fontSize: 21,
      fontWeight: '700',
      color:
        colors.text,
    },

    continuePosition: {
      marginTop: 5,
      fontSize: 15,
      color:
        colors.textSecondary,
    },

    kathisma: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor:
        colors.surface,
      borderRadius:
        radius.md,
      borderWidth: 1,
      borderColor:
        'transparent',
      overflow: 'hidden',
    },

    kathismaCurrent: {
      backgroundColor:
        '#FAF4E8',
      borderColor:
        colors.borderStrong,
    },

    kathismaSaved: {
      borderColor:
        'rgba(138, 90, 56, 0.30)',
    },

    kathismaMain: {
      flex: 1,
      paddingVertical: 12,
      paddingLeft: 13,
      paddingRight: 8,
    },

    kathismaNumber: {
      fontSize: 18,
      fontWeight: '600',
      color:
        colors.text,
    },

    psalmRange: {
      marginTop: 4,
      fontSize: 14,
      color:
        colors.textSecondary,
    },

    kathismaTitle: {
      marginTop: 6,
      fontSize: 14,
      color:
        colors.textSecondary,
    },

    currentPosition: {
      marginTop: 7,
      fontSize: 13,
      fontWeight: '600',
      color:
        colors.accent,
    },

    saveButton: {
      width: 76,
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 8,
      borderLeftWidth: 1,
      borderLeftColor:
        colors.border,
      backgroundColor:
        'rgba(255, 255, 255, 0.24)',
    },

    saveButtonActive: {
      backgroundColor:
        colors.surfaceWarm,
    },

    saveButtonText: {
      fontSize: 11,
      fontWeight: '700',
      color:
        colors.textMuted,
    },

    saveButtonTextActive: {
      color:
        colors.accentDark,
    },

    pressed: {
      opacity: 0.62,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.background,
    },

    error: {
      fontSize: 16,
      color:
        colors.liturgical,
    },
  });
