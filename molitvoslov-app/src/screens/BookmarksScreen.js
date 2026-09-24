import React, {
  useCallback,
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
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  api,
} from '../api';

import {
  BottomNav,
} from '../components/navigation/BottomNav';

import {
  colors,
  radius,
  spacing,
} from '../theme';


export const BookmarksScreen = ({
  navigation,
}) => {
  const [bookmarks, setBookmarks] =
    useState([]);

  const [textsById, setTextsById] =
    useState({});

  const [collectionsById, setCollectionsById] =
    useState({});

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);


  const loadData =
    useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          bookmarksResponse,
          textsResponse,
          collectionsResponse,
        ] = await Promise.all([
          api.get('bookmarks/'),
          api.get('texts/'),
          api.get('collections/'),
        ]);

        const textMap = {};
        textsResponse.data.forEach(
          item => {
            textMap[item.id] =
              item;
          }
        );

        const collectionMap = {};
        collectionsResponse.data.forEach(
          item => {
            collectionMap[item.id] =
              item;
          }
        );

        setBookmarks(
          bookmarksResponse.data
        );

        setTextsById(
          textMap
        );

        setCollectionsById(
          collectionMap
        );
      } catch (err) {
        console.log(
          'Ошибка загрузки закладок:',
          err
        );

        setError(
          'Не удалось загрузить закладки'
        );
      } finally {
        setLoading(false);
      }
    }, []);


  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );


  const openBookmark = item => {
    if (!item.text) {
      return;
    }

    const text =
      textsById[item.text];

    if (!text?.slug) {
      return;
    }

    const position =
      Math.max(
        0,
        Number(
          item.position ||
          0
        )
      );

    const contentLength =
      (
        text.content ||
        ''
      ).length;

    navigation.navigate(
      'Reader',
      {
        slug:
          text.slug,

        focusTarget: {
          id:
            `bookmark:${item.id}`,

          save_type:
            'bookmark',

          anchor_type:
            'text',

          anchor_id:
            text.id,

          start_offset:
            Math.min(
              position,
              contentLength
            ),

          end_offset:
            Math.min(
              position + 1,
              contentLength
            ),

          metadata: {
            slug:
              text.slug,
          },
        },
      }
    );
  };


  const getTitle = item => {
    if (item.text) {
      const text =
        textsById[item.text];

      return (
        text?.title ||
        text?.description ||
        'Текст'
      );
    }

    if (item.collection) {
      return (
        collectionsById[
          item.collection
        ]?.name ||
        'Подборка'
      );
    }

    return 'Закладка';
  };


  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top']}
    >
      <View
        style={styles.screen}
      >
        <View
          style={styles.header}
        >
          <Text
            style={styles.title}
          >
            Закладки
          </Text>

          <Text
            style={styles.subtitle}
          >
            Сохранённые места
            для быстрого возврата
          </Text>
        </View>

        {loading ? (
          <View
            style={styles.center}
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
            data={bookmarks}
            keyExtractor={item =>
              String(item.id)
            }
            contentContainerStyle={
              bookmarks.length
                ? styles.list
                : styles.emptyList
            }
            ListEmptyComponent={
              <View
                style={styles.emptyCard}
              >
                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  Закладок пока нет
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Здесь будут места,
                  которые вы сохраните
                  во время чтения.
                </Text>
              </View>
            }
            renderItem={({item}) => (
              <Pressable
                onPress={() =>
                  openBookmark(item)
                }
                style={({pressed}) => [
                  styles.card,
                  pressed &&
                  styles.pressed,
                ]}
              >
                <View
                  style={
                    styles.cardMark
                  }
                >
                  <Text
                    style={
                      styles.cardSymbol
                    }
                  >
                    ⌑
                  </Text>
                </View>

                <View
                  style={
                    styles.cardContent
                  }
                >
                  <Text
                    style={
                      styles.cardTitle
                    }
                    numberOfLines={2}
                  >
                    {getTitle(item)}
                  </Text>

                  <Text
                    style={
                      styles.cardMeta
                    }
                  >
                    Закладка
                    {item.position
                      ? ` · позиция ${item.position}`
                      : ''}
                  </Text>
                </View>

                {!!item.text && (
                  <Text
                    style={
                      styles.arrow
                    }
                  >
                    ›
                  </Text>
                )}
              </Pressable>
            )}
          />
        )}
      </View>

      <BottomNav
        navigation={navigation}
        active="bookmarks"
      />
    </SafeAreaView>
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
      fontSize: 30,
      fontWeight: '700',
      fontFamily: 'serif',
      color:
        colors.text,
    },

    subtitle: {
      marginTop: 5,
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
      padding:
        spacing.lg,
      borderRadius:
        radius.lg,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    emptyTitle: {
      fontSize: 19,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    emptyText: {
      marginTop:
        spacing.sm,
      fontSize: 14,
      lineHeight: 21,
      color:
        colors.textSecondary,
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      padding:
        spacing.md,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    pressed: {
      opacity: 0.65,
    },

    cardMark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.accentSoft,
    },

    cardSymbol: {
      fontSize: 20,
      color:
        colors.accent,
    },

    cardContent: {
      flex: 1,
      marginLeft:
        spacing.md,
    },

    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    cardMeta: {
      marginTop: 3,
      fontSize: 12,
      color:
        colors.textSecondary,
    },

    arrow: {
      marginLeft:
        spacing.sm,
      fontSize: 26,
      color:
        colors.textMuted,
    },

    error: {
      color:
        colors.liturgical,
    },
  });
