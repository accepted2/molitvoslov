import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useFocusEffect,
} from '@react-navigation/native';

import {
  contentApi as api,
} from '../services/contentApi';

import {
  deleteSavedItem,
  getSavedItems,
  saveItem,
} from '../services/savedItems';

import {
  colors,
} from '../theme';


export const AkathistListScreen = ({
  navigation,
}) => {
  const [
    akathists,
    setAkathists,
  ] = useState([]);

  const [
    savedAkathists,
    setSavedAkathists,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);


  const loadSavedAkathists =
    useCallback(async () => {
      try {
        const saved =
          await getSavedItems({
            source_type:
              'akathist',

            save_type:
              'akathist',
          });

        setSavedAkathists(
          saved.filter(
            item =>
              item.anchor_type ===
              'akathist'
          )
        );
      } catch (error) {
        console.log(
          'Ошибка загрузки избранных акафистов:',
          error.response?.data ||
          error.message
        );
      }
    }, []);


  useEffect(() => {
    loadAkathists();
  }, []);


  useFocusEffect(
    useCallback(() => {
      loadSavedAkathists();
    }, [
      loadSavedAkathists,
    ])
  );


  const loadAkathists =
    async () => {
      try {
        setLoading(true);

        const [
          response,
        ] = await Promise.all([
          api.get(
            'akathists/'
          ),

          loadSavedAkathists(),
        ]);

        setAkathists(
          response.data.filter(
            item =>
              item.is_visible
          )
        );
      } catch (error) {
        console.log(
          'Ошибка загрузки акафистов:',
          error.response?.data ||
          error.message
        );
      } finally {
        setLoading(
          false
        );
      }
    };


  const getSavedAkathist =
    akathistId =>
      savedAkathists.find(
        item =>
          Number(
            item.anchor_id
          ) ===
            Number(
              akathistId
            )
      );


  const toggleFavorite =
    async akathist => {
      const existing =
        getSavedAkathist(
          akathist.id
        );

      try {
        if (existing) {
          await deleteSavedItem(
            existing.id
          );

          setSavedAkathists(
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
              'akathist',

            source_type:
              'akathist',

            source_id:
              akathist.id,

            anchor_type:
              'akathist',

            anchor_id:
              akathist.id,

            source_title:
              akathist.title,

            item_title:
              akathist.title,

            text:
              '',

            metadata: {
              slug:
                akathist.slug,
            },
          });

        setSavedAkathists(
          current => [
            saved,
            ...current,
          ]
        );
      } catch (error) {
        console.log(
          'Ошибка сохранения акафиста:',
          error.response?.data ||
          error.message
        );
      }
    };


  const handlePress =
    akathist => {
      navigation.navigate(
        'Akathist',
        {
          akathistId:
            akathist.id,

          slug:
            akathist.slug,

          title:
            akathist.title,
        }
      );
    };


  if (loading) {
    return (
      <View
        style={
          styles.center
        }
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


  return (
    <View
      style={
        styles.container
      }
    >
      <FlatList
        data={
          akathists
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
        renderItem={({
          item,
        }) => {
          const saved =
            !!getSavedAkathist(
              item.id
            );

          return (
            <View
              style={[
                styles.item,

                saved &&
                  styles.itemSaved,
              ]}
            >
              <TouchableOpacity
                style={
                  styles.itemMain
                }
                activeOpacity={
                  0.7
                }
                onPress={() =>
                  handlePress(
                    item
                  )
                }
              >
                <View
                  style={
                    styles.iconContainer
                  }
                >
                  <Text
                    style={
                      styles.icon
                    }
                  >
                    ☦
                  </Text>
                </View>

                <View
                  style={
                    styles.textContainer
                  }
                >
                  <Text
                    style={
                      styles.title
                    }
                  >
                    {item.title}
                  </Text>

                  {!!item.description &&
                    item.description !==
                      item.title && (
                      <Text
                        style={
                          styles.description
                        }
                        numberOfLines={
                          2
                        }
                      >
                        {
                          item.description
                        }
                      </Text>
                    )}
                </View>

                <Text
                  style={
                    styles.arrow
                  }
                >
                  ›
                </Text>
              </TouchableOpacity>

              <Pressable
                hitSlop={6}
                onPress={() =>
                  toggleFavorite(
                    item
                  )
                }
                style={({pressed}) => [
                  styles.favoriteButton,

                  saved &&
                    styles
                      .favoriteButtonActive,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.favoriteText,

                    saved &&
                      styles
                        .favoriteTextActive,
                  ]}
                >
                  {
                    saved
                      ? '★'
                      : '☆'
                  }
                </Text>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <View
            style={
              styles.emptyContainer
            }
          >
            <Text
              style={
                styles.emptyText
              }
            >
              Акафисты пока не добавлены
            </Text>
          </View>
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
        colors.background,
    },

    listContent: {
      paddingVertical: 5,
    },

    center: {
      flex: 1,
      justifyContent:
        'center',
      alignItems:
        'center',
      backgroundColor:
        colors.background,
    },

    loadingText: {
      marginTop: 8,
      color:
        colors.textSecondary,
    },

    item: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginHorizontal: 8,
      marginVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        colors.border,
      backgroundColor:
        colors.surface,
      overflow: 'hidden',
    },

    itemSaved: {
      borderColor:
        colors.borderStrong,
      backgroundColor:
        colors.surfaceWarm,
    },

    itemMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingLeft: 10,
      paddingRight: 5,
    },

    iconContainer: {
      width: 30,
      alignItems: 'center',
      marginRight: 7,
    },

    icon: {
      fontSize: 22,
      color:
        colors.accent,
    },

    textContainer: {
      flex: 1,
    },

    title: {
      fontSize: 16,
      fontWeight: '700',
      color:
        colors.text,
      lineHeight: 21,
      fontFamily: 'serif',
    },

    description: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 17,
      color:
        colors.textSecondary,
    },

    arrow: {
      marginLeft: 5,
      fontSize: 22,
      color:
        colors.textMuted,
    },

    favoriteButton: {
      width: 42,
      alignItems: 'center',
      justifyContent:
        'center',
      borderLeftWidth: 1,
      borderLeftColor:
        colors.border,
      backgroundColor:
        'rgba(255,255,255,0.25)',
    },

    favoriteButtonActive: {
      backgroundColor:
        colors.surfaceMuted,
    },

    favoriteText: {
      fontSize: 23,
      color:
        colors.textMuted,
    },

    favoriteTextActive: {
      color:
        colors.accent,
    },

    pressed: {
      opacity: 0.6,
    },

    emptyContainer: {
      padding: 24,
      alignItems: 'center',
    },

    emptyText: {
      color:
        colors.textSecondary,
      fontSize: 14,
    },
  });
