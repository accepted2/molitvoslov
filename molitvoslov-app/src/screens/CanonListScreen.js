import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {AppBackground} from '../components/layout/AppBackground';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';


import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
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



export const CanonListScreen = ({navigation,}) =>
{
  const [canons, setCanons,] = useState([]);

  const [savedCanons, setSavedCanons,] = useState([]);

  const [loading, setLoading,] = useState(true);

  const [error, setError,] = useState(null);


  const loadSavedCanons =
    useCallback(async () => {
      try {
        const saved =
          await getSavedItems({
            source_type:
              'canon',

            save_type:
              'canon',
          });

        setSavedCanons(
          saved.filter(
            item =>
              item.anchor_type ===
              'canon'
          )
        );
      } catch (loadError) {
        console.log(
          'Ошибка загрузки избранных канонов:',
          loadError.response?.data ||
          loadError.message
        );
      }
    }, []);
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 62;

  const loadCanons =
    useCallback(async () => {
      try {
        setLoading(
          true
        );

        setError(
          null
        );

        const [
          response,
        ] = await Promise.all([
          api.get(
            'canons/'
          ),

          loadSavedCanons(),
        ]);

        setCanons(
          response.data
        );
      } catch (loadError) {
        console.log(
          'Ошибка загрузки канонов:',
          loadError.response?.data ||
          loadError.message
        );

        setError(
          'Не удалось загрузить каноны'
        );
      } finally {
        setLoading(
          false
        );
      }
    }, [
      loadSavedCanons,
    ]);

  useEffect(() => {
    loadCanons();
  }, [
    loadCanons,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadSavedCanons();
    }, [
      loadSavedCanons,
    ])
  );

  const getSavedCanon =
    canonId =>
      savedCanons.find(
        item =>
          Number(
            item.anchor_id
          ) ===
            Number(
              canonId
            )
      );

  const toggleFavorite =
    async canon => {
      const existing =
        getSavedCanon(
          canon.id
        );

      try {
        if (existing) {
          await deleteSavedItem(
            existing.id
          );

          setSavedCanons(
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
              'canon',

            source_type:
              'canon',

            source_id:
              canon.id,

            anchor_type:
              'canon',

            anchor_id:
              canon.id,

            source_title:
              canon.title,

            item_title:
              canon.title,

            text:
              '',

            metadata: {
              slug:
                canon.slug,
            },
          });

        setSavedCanons(
          current => [
            saved,
            ...current,
          ]
        );
      } catch (saveError) {
        console.log(
          'Ошибка сохранения канона:',
          saveError.response?.data ||
          saveError.message
        );
      }
    };

  const openCanon =
    canon => {
      navigation.navigate(
        'Canon',
        {
          canonId:
            canon.id,

          slug:
            canon.slug,

          title:
            canon.title,
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
  if (error) {
    return (
      <View
        style={
          styles.center
        }
      >
        <Text
          style={
            styles.error
          }
        >
          {error}
        </Text>
      </View>
    );
  }


  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />
    <View
      style={
        styles.container
      }
    >
      <FlatList
        data={canons}
        keyExtractor={
          item =>
            String(
              item.id
            )
        }
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + 20,
            paddingBottom: 80 + insets.bottom,
          }
        ]}
        renderItem={({item,
        }) => {
          const saved =
            !!getSavedCanon(
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
                  openCanon(
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
                    {
                      item.title
                    }
                  </Text>

                  {!!item.tone && (
                    <Text
                      style={
                        styles.tone
                      }
                    >
                      {
                        item.tone
                      }
                    </Text>
                  )}

                  {!!item.description && (
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
                accessibilityRole="button"
                accessibilityLabel={
                  saved
                    ? 'Убрать канон из избранного'
                    : 'Добавить канон в избранное'
                }
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
              Каноны пока не добавлены
            </Text>
          </View>
        }
      />
      <FixedSectionHeader
        title="Каноны"
        navigation={navigation}
        topInset={insets.top}
      />

      <BottomNav
        navigation={navigation}
        active={null}
      />
    </View>
    </AppBackground>
  );

};


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    listContent: {
      paddingTop: 100,
      paddingBottom: 18,
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
    error: {
      paddingHorizontal: 24,
      textAlign: 'center',
      color:
        colors.liturgical,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginVertical: 5,
      minHeight: 66,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: 'rgba(126, 82, 38, 0.22)',
      backgroundColor: 'rgba(255, 246, 227, 0.94)',
      shadowColor: '#51301B',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.09,
      shadowRadius: 5,
      elevation: 2,
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
    tone: {
      marginTop: 3,
      fontSize: 11,
      fontWeight: '700',
      color:
        colors.accent,
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
