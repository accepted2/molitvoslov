import React, {
  useCallback,
  useState,
} from 'react';
import {AppBackground} from '../components/layout/AppBackground';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View,} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {useFocusEffect,} from '@react-navigation/native';

import {BottomNav,} from '../components/navigation/BottomNav';

import {deleteSavedItem, getSavedItems,} from '../services/savedItems';

import {colors, radius, spacing, }from '../theme';


export const FavoritesScreen = ({
  navigation,
}) => {
  const [
    items,
    setItems,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 62;
  const loadData =
    useCallback(async () => {
      try {
        setLoading(true);

        setError(null);

        const saved =
          await getSavedItems();

        setItems(
          saved
        );
      } catch (err) {
        console.log(
          'Ошибка загрузки сохранённого:',
          err
        );

        setError(
          'Не удалось загрузить избранное'
        );
      } finally {
        setLoading(false);
      }
    }, []);
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [
      loadData,
    ])
  );
  const removeItem =
    async itemId => {
      try {
        await deleteSavedItem(
          itemId
        );

        setItems(
          current =>
            current.filter(
              item =>
                item.id !==
                itemId
            )
        );
      } catch (err) {
        console.log(
          'Ошибка удаления сохранения:',
          err
        );
      }
    };
  const makeFocusTarget =
    item => ({
      id:
        item.id,

      save_type:
        item.save_type,

      anchor_type:
        item.anchor_type,

      anchor_id:
        item.anchor_id,

      start_offset:
        item.start_offset,

      end_offset:
        item.end_offset,

      metadata:
        item.metadata ||
        {},
    });
  const openItem =
    item => {
      const metadata =
        item.metadata || {};

      if (
        item.source_type ===
          'prayer_rule' &&
        metadata.slug
      ) {
        navigation.navigate(
          'PrayerRule',
          {
            slug:
              metadata.slug,

            focusTarget:
              makeFocusTarget(
                item
              ),
          }
        );

        return;
      }

      if (
        item.source_type ===
          'category' &&
        metadata.category_slug
      ) {
        navigation.navigate(
          'Book',
          {
            categoryId:
              item.source_id,

            categorySlug:
              metadata
                .category_slug,

            categoryName:
              metadata
                .category_name ||
              item.source_title,

            focusTarget:
              makeFocusTarget(
                item
              ),
          }
        );

        return;
      }

      if (
        item.source_type ===
          'text' &&
        metadata.slug
      ) {
        navigation.navigate(
          'Reader',
          {
            slug:
              metadata.slug,

            focusTarget:
              makeFocusTarget(
                item
              ),
          }
        );

        return;
      }


      if (
        item.source_type ===
          'akathist' &&
        metadata.slug
      ) {
        navigation.navigate(
          'Akathist',
          {
            akathistId:
              item.source_id,

            slug:
              metadata.slug,

            title:
              item.source_title ||
              'Акафист',

            focusTarget:
              makeFocusTarget(
                item
              ),
          }
        );

        return;
      }
      if (
        item.source_type ===
          'canon' &&
        metadata.slug
      ) {
        navigation.navigate(
          'Canon',
          {
            canonId:
              item.source_id,

            slug:
              metadata.slug,

            title:
              item.source_title ||
              'Канон',

            focusTarget:
              makeFocusTarget(
                item
              ),
          }
        );

        return;
      }




      if (
        item.source_type ===
        'psalter'
      ) {
        if (
          metadata
            .kathisma_number
        ) {
          navigation.navigate(
            'Kathisma',
            {
              kathismaNumber:
                metadata
                  .kathisma_number,

              kathismaTitle:
                metadata
                  .kathisma_title ||
                `Кафизма ${metadata.kathisma_number}`,

              focusTarget:
                makeFocusTarget(
                  item
                ),
            }
          );

          return;
        }

        navigation.navigate(
          'Psalter'
        );
      }
    };
  const getItemTitle =
    item =>
      item.item_title ||
      item.source_title ||
      item.save_type_display ||
      'Сохранённое';


  return (

      <AppBackground imageOpacity={0.72}>
        <StatusBar
          style="light"
          translucent
          backgroundColor="transparent"
        />
      <View
        style={styles.screen}
      >
        {loading ? (
          <View style={styles.center}
          >
            <ActivityIndicator
              color={colors.accent}
            />
          </View>
        ) : error ? (
          <View
            style={styles.center}
          >
            <Text
              style={styles.error}
            >
              {error}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => String(item.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              items.length
                ? styles.list
                : styles.emptyList,
              {
                paddingTop: headerHeight + 20,
                paddingBottom: 115 + insets.bottom,
              },
            ]}
            ListEmptyComponent={
              <View
                style={
                  styles.emptyCard
                }
              >
                <Text
                  style={
                    styles.emptyHeart
                  }
                >
                  ♡
                </Text>

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  Избранное пока пусто
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Выделите слово,
                  предложение или абзац
                  во время чтения,
                  либо сохраните целую
                  молитву, псалом,
                  кафизму, акафист
                  или канон.
                </Text>
              </View>
            }
            renderItem={({
              item,
            }) => (
              <View
                style={
                  styles.card
                }
              >
                <View
                  style={
                    styles.cardTop
                  }
                >
                  <Text
                    style={
                      styles.typeBadge
                    }
                  >
                    {
                      (
                        item
                          .save_type_display ||
                        item.save_type
                      ).toUpperCase()
                    }
                  </Text>

                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      removeItem(
                        item.id
                      )
                    }
                    style={({pressed}) => [
                      styles.deleteButton,

                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <Text
                      style={
                        styles.deleteText
                      }
                    >
                      Удалить
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() =>
                    openItem(
                      item
                    )
                  }
                  style={({pressed}) => [
                    styles.cardBody,

                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <Text
                    style={
                      styles.cardTitle
                    }
                  >
                    {
                      getItemTitle(
                        item
                      )
                    }
                  </Text>

                  {!!item.text && (
                    <Text
                      style={
                        styles.quote
                      }
                      numberOfLines={8}
                    >
                      «{item.text}»
                    </Text>
                  )}

                  {!!item.source_title && (
                    <Text
                      style={
                        styles.source
                      }
                    >
                      {
                        item.source_title
                      }
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          />
        )}
        <FixedSectionHeader
          title="Избранное"
          navigation={navigation}
          topInset={insets.top}
          showBack={false}
        />
        <BottomNav
          navigation={navigation}
          active="favorites"
        />
      </View>

      </AppBackground>

  );
};


const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    screen: {
      flex: 1,
      backgroundColor: 'transparent',
    },

    header: {
      paddingHorizontal:
        spacing.md,
      paddingTop:
        spacing.md,
      paddingBottom:
        spacing.sm,
    },

    title: {
      fontSize: 27,
      fontWeight: '700',
      fontFamily: 'serif',
      color:
        colors.text,
    },

    subtitle: {
      marginTop: 5,
      maxWidth: 290,
      fontSize: 14,
      lineHeight: 20,
      color:
        colors.textSecondary,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    list: {
      padding:
        spacing.md,
      paddingTop:
        spacing.sm,
      gap:
        spacing.sm,
    },

    emptyList: {
      flexGrow: 1,
      justifyContent:
        'center',
      padding:
        spacing.md,
    },

    emptyCard: {
      alignItems: 'center',
      padding:
        spacing.md,
      borderRadius:
        radius.lg,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    emptyHeart: {
      fontSize: 34,
      color:
        colors.accent,
    },

    emptyTitle: {
      marginTop:
        spacing.sm,
      fontSize: 19,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    emptyText: {
      maxWidth: 270,
      marginTop:
        spacing.sm,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      color:
        colors.textSecondary,
    },

    card: {
      borderRadius: 17,
      backgroundColor: 'rgba(255, 244, 222, 0.94)',
      borderWidth: 1,
      borderColor: 'rgba(126, 82, 38, 0.22)',
      overflow: 'hidden',
    },

    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal:
        spacing.md,
      paddingTop:
        spacing.sm,
    },

    typeBadge: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '800',
      letterSpacing: 0.8,
      color:
        colors.accent,
    },

    deleteButton: {
      paddingVertical: 4,
      paddingHorizontal: 4,
    },

    deleteText: {
      fontSize: 11,
      color:
        colors.textMuted,
    },

    cardBody: {
      paddingHorizontal:
        spacing.md,
      paddingTop:
        spacing.xs,
      paddingBottom:
        spacing.sm,
    },

    pressed: {
      opacity: 0.6,
    },

    cardTitle: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    quote: {
      marginTop:
        spacing.sm,
      fontSize: 15,
      lineHeight: 23,
      color:
        colors.textSecondary,
      fontFamily: 'serif',
    },

    source: {
      marginTop:
        spacing.sm,
      fontSize: 12,
      lineHeight: 17,
      color:
        colors.textMuted,
    },

    error: {
      color:
        colors.liturgical,
    },
  });
