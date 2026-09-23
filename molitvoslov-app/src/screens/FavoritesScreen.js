import React, {
  useCallback,
  useMemo,
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


export const FavoritesScreen = ({
  navigation,
}) => {
  const [collections, setCollections] =
    useState([]);

  const [items, setItems] =
    useState([]);

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
          collectionsResponse,
          itemsResponse,
        ] = await Promise.all([
          api.get('collections/'),
          api.get(
            'collection-items/'
          ),
        ]);

        setCollections(
          collectionsResponse.data
        );

        setItems(
          itemsResponse.data
        );
      } catch (err) {
        console.log(
          'Ошибка загрузки избранного:',
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
    }, [loadData])
  );


  const favoriteCollection =
    useMemo(
      () =>
        collections.find(
          item =>
            item.is_default
        ) ||
        collections.find(
          item =>
            item.name
              ?.trim()
              .toLowerCase() ===
            'избранное'
        ) ||
        null,
      [collections]
    );


  const favoriteItems =
    useMemo(
      () =>
        favoriteCollection
          ? items.filter(
              item =>
                Number(
                  item.collection
                ) ===
                Number(
                  favoriteCollection.id
                )
            )
          : [],
      [
        items,
        favoriteCollection,
      ]
    );


  const openItem = item => {
    if (!item.text?.slug) {
      return;
    }

    navigation.navigate(
      'Reader',
      {
        slug:
          item.text.slug,
      }
    );
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
            Избранное
          </Text>

          <Text
            style={styles.subtitle}
          >
            Любимые молитвы
            и тексты
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
            data={favoriteItems}
            keyExtractor={item =>
              String(item.id)
            }
            contentContainerStyle={
              favoriteItems.length
                ? styles.list
                : styles.emptyList
            }
            ListEmptyComponent={
              <View
                style={styles.emptyCard}
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
                  Здесь появятся
                  молитвы и тексты,
                  которые вы добавите
                  в избранное.
                </Text>
              </View>
            }
            renderItem={({item}) => (
              <Pressable
                onPress={() =>
                  openItem(item)
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
                    ♡
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
                    {
                      item.text?.title ||
                      item.text?.description ||
                      'Молитва'
                    }
                  </Text>

                  <Text
                    style={
                      styles.cardMeta
                    }
                  >
                    Избранное
                  </Text>
                </View>

                <Text
                  style={
                    styles.arrow
                  }
                >
                  ›
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>

      <BottomNav
        navigation={navigation}
        active="favorites"
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
      alignItems: 'center',
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
      maxWidth: 260,
      marginTop:
        spacing.sm,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
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
      fontSize: 22,
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
