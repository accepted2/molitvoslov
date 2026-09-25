import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
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
  StatusBar,
} from 'expo-status-bar';

import {
  contentApi as api,
} from '../services/contentApi';

import {
  deleteReadingProgress,
  getReadingProgress,
} from '../services/readingProgress';

import {
  BottomNav,
} from '../components/navigation/BottomNav';

import {
  homeArtwork,
} from '../data/homeArtwork';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../theme';


const PRAYER_RULES = [
  {
    key: 'morning',
    title: 'Утренние',
    subtitle: 'Начало дня',
    symbol: '☀',
    slug: 'molitvy-utrennie',
  },
  {
    key: 'evening',
    title: 'Вечерние',
    subtitle: 'Перед сном',
    symbol: '☾',
    slug: 'molitvy-na-son-griadushchim',
  },
];


const formatToday = () => {
  const weekdays = [
    'Воскресенье',
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
  ];

  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];

  const date = new Date();

  return `${weekdays[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} года`;
};


const DecorativeCard = ({
  title,
  subtitle,
  symbol,
  artwork,
  onPress,
  dark = false,
}) => (
  <Pressable
    onPress={onPress}
    style={({pressed}) => [
      styles.libraryCard,
      dark &&
      styles.libraryCardDark,
      pressed &&
      styles.pressed,
    ]}
  >
    <ImageBackground
      source={{
        uri: artwork,
      }}
      resizeMode="cover"
      style={styles.libraryArtwork}
      imageStyle={
        styles.libraryArtworkImage
      }
    >
      <View
        style={[
          styles.libraryArtworkWash,
          dark &&
          styles.libraryArtworkWashDark,
        ]}
      />
    </ImageBackground>

    <View
      style={[
        styles.libraryIcon,
        dark &&
        styles.libraryIconDark,
      ]}
    >
      <Text
        style={[
          styles.libraryIconText,
          dark &&
          styles.libraryIconTextDark,
        ]}
      >
        {symbol}
      </Text>
    </View>

    <View style={styles.libraryText}>
      <Text
        style={[
          styles.libraryTitle,
          dark &&
          styles.libraryTitleDark,
        ]}
        numberOfLines={2}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={[
            styles.librarySubtitle,
            dark &&
            styles.librarySubtitleDark,
          ]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      )}
    </View>

    <View
      style={[
        styles.libraryChevron,
        dark &&
        styles.libraryChevronDark,
      ]}
    >
      <Text
        style={[
          styles.libraryChevronText,
          dark &&
          styles.libraryChevronTextDark,
        ]}
      >
        ›
      </Text>
    </View>
  </Pressable>
);


export const MenuScreen = ({
  navigation,
}) => {
  const [categories, setCategories] =
    useState([]);

  const [akathists, setAkathists] =
    useState([]);

  const [canons, setCanons] =
    useState([]);

  const [prayerRules, setPrayerRules] =
    useState([]);

  const [
    readingProgress,
    setReadingProgress,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [dailyQuote, setDailyQuote] =
    useState(null);

  const [error, setError] =
    useState(null);


  const loadLibrary =
    useCallback(async () => {
      try {
        const [
          categoriesResponse,
          akathistsResponse,
          canonsResponse,
          prayerRulesResponse,
          quoteResponse,
        ] = await Promise.all([
          api.get('categories/'),
          api.get('akathists/'),
          api.get('canons/'),
          api.get(
            'prayer-rules/'
          ),
          api.get(
            'daily-quotes/today/'
          ),
        ]);

        const sortedCategories =
          [
            ...categoriesResponse.data,
          ].sort(
            (a, b) =>
              Number(
                a.order || 0
              ) -
              Number(
                b.order || 0
              )
          );

        setCategories(
          sortedCategories
        );

        setAkathists(
          akathistsResponse.data
        );

        setCanons(
          canonsResponse.data
        );

        setPrayerRules(
          prayerRulesResponse.data
        );

        setDailyQuote(
          quoteResponse.data
        );

        setError(null);
      } catch (err) {
        console.log(
          'Ошибка загрузки библиотеки:',
          err
        );

        setError(
          'Не удалось загрузить библиотеку'
        );
      }
    }, []);


  const loadProgress =
    useCallback(async () => {
      try {
        const progressList =
          await getReadingProgress();

        setReadingProgress(
          progressList
        );
      } catch (err) {
        console.log(
          'Ошибка загрузки прогресса:',
          err
        );
      }
    }, []);


  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        await Promise.all([
          loadLibrary(),
          loadProgress(),
        ]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [
    loadLibrary,
    loadProgress,
  ]);


  useFocusEffect(
    useCallback(() => {
      loadProgress();
    }, [loadProgress])
  );


  const rootCategories =
    useMemo(
      () =>
        categories.filter(
          category =>
            !category.parent
        ),
      [categories]
    );


  const libraryCategories =
    useMemo(
      () =>
        rootCategories.filter(
          category =>
            ![
              'utrennie-molitvy',
              'molitvy-na-son-griadushchim',
              'psaltir',
              'akafisty',
            ].includes(
              category.slug
            )
        ),
      [rootCategories]
    );


  const getSubcategories =
    category =>
      categories.filter(
        item =>
          item.parent ===
          category.id
      );


  const openCategory =
    category => {
      if (
        category.slug ===
        'psaltir'
      ) {
        navigation.navigate(
          'Psalter'
        );

        return;
      }

      const subcategories =
        getSubcategories(
          category
        );

      if (
        subcategories.length > 0
      ) {
        navigation.navigate(
          'CategoryMenu',
          {
            parentCategory:
              category,

            subcategories,
          }
        );

        return;
      }

      navigation.navigate(
        'Book',
        {
          categoryId:
            category.id,

          categorySlug:
            category.slug,

          categoryName:
            category.name,
        }
      );
    };


  const makeReadingItem =
    progress => {
      if (
        progress.source_type ===
        'psalter'
      ) {
        const info =
          progress.anchor_info;

        return {
          id: progress.id,
          type: 'Псалтирь',
          symbol: '¶',
          title: 'Псалтирь',
          position:
            info
              ? (
                  info.verse_number
                    ? `Кафизма ${info.kathisma_number} · Псалом ${info.psalm_number} · стих ${info.verse_number}`
                    : `Кафизма ${info.kathisma_number} · Псалом ${info.psalm_number}`
                )
              : 'Продолжить с сохранённого места',
          onPress: () =>
            navigation.navigate(
              'Psalter'
            ),
        };
      }

      if (
        progress.source_type ===
        'akathist'
      ) {
        const akathist =
          akathists.find(
            item =>
              Number(item.id) ===
              Number(
                progress.source_id
              )
          );

        if (!akathist) {
          return null;
        }

        const section =
          akathist.sections?.find(
            item =>
              Number(item.id) ===
              Number(
                progress.anchor_id
              )
          );

        let position =
          'Продолжить акафист';

        if (section) {
          const names = {
            kontakion: 'Кондак',
            ikos: 'Икос',
            prayer: 'Молитва',
          };

          position =
            `${names[section.section_type] || 'Раздел'}${section.number ? ` ${section.number}` : ''}`;
        }

        return {
          id: progress.id,
          type: 'Акафист',
          symbol: '☦',
          title:
            akathist.title,
          position,
          onPress: () =>
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
            ),
        };
      }

      if (
        progress.source_type ===
        'canon'
      ) {
        const canon =
          canons.find(
            item =>
              Number(
                item.id
              ) ===
                Number(
                  progress.source_id
                )
          );

        if (!canon) {
          return null;
        }

        const info =
          progress.anchor_info;

        let position =
          'Продолжить канон';

        if (info) {
          const parts =
            [];

          if (
            info.ode_number
          ) {
            parts.push(
              `Песнь ${info.ode_number}`
            );
          }

          if (
            info.heading
          ) {
            parts.push(
              info.heading
            );
          } else if (
            info.section_type_display
          ) {
            parts.push(
              info.section_type_display
            );
          }

          if (parts.length) {
            position =
              parts.join(
                ' · '
              );
          }
        }

        return {
          id:
            progress.id,

          type:
            'Канон',

          symbol:
            '☦',

          title:
            canon.title,

          position,

          onPress: () =>
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
            ),
        };
      }


      if (
        progress.source_type ===
        'prayer_rule'
      ) {
        const rule =
          prayerRules.find(
            item =>
              Number(item.id) ===
              Number(
                progress.source_id
              )
          );

        if (!rule) {
          return null;
        }

        const ruleItem =
          rule.items?.find(
            item =>
              Number(item.id) ===
              Number(
                progress.anchor_id
              )
          );

        const position =
          ruleItem?.text?.title ||
          ruleItem?.title ||
          'Продолжить правило';

        return {
          id: progress.id,
          type:
            'Молитвенное правило',
          symbol: '✦',
          title:
            rule.name,
          position,
          onPress: () =>
            navigation.navigate(
              'PrayerRule',
              {
                slug:
                  rule.slug,
              }
            ),
        };
      }

      if (
        progress.source_type ===
        'category'
      ) {
        const category =
          categories.find(
            item =>
              Number(item.id) ===
              Number(
                progress.source_id
              )
          );

        if (!category) {
          return null;
        }

        return {
          id: progress.id,
          type: 'Молитвы',
          symbol: '†',
          title:
            category.name,
          position:
            'Продолжить с сохранённого места',
          onPress: () =>
            navigation.navigate(
              'Book',
              {
                categoryId:
                  category.id,

                categorySlug:
                  category.slug,

                categoryName:
                  category.name,
              }
            ),
        };
      }

      return null;
    };


  const activeReadings =
    useMemo(
      () =>
        readingProgress
          .map(progress => {
            const item =
              makeReadingItem(
                progress
              );

            if (!item) {
              return null;
            }

            return {
              ...item,
              progress:
                Number(
                  progress
                    .progress_percent
                  || 0
                ),
            };
          })
          .filter(Boolean),
      [
        readingProgress,
        categories,
        akathists,
        canons,
        prayerRules,
      ]
    );


  const finishReading =
    async progressId => {
      try {
        await deleteReadingProgress(
          progressId
        );

        setReadingProgress(
          current =>
            current.filter(
              item =>
                item.id !==
                progressId
            )
        );
      } catch (err) {
        console.log(
          'Ошибка завершения чтения:',
          err
        );
      }
    };


  const latestReading =
    activeReadings[0] ||
    null;


  const showWidgetInfo =
    () => {
      Alert.alert(
        'Цитата дня на главном экране',
        'Место под виджет уже предусмотрено. Сам Android-виджет подключим отдельным нативным этапом, чтобы цитата обновлялась на главном экране телефона без запуска приложения.'
      );
    };


  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['top']}
      >
        <StatusBar style="dark" />

        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color={colors.accent}
          />

          <Text style={styles.loadingText}>
            Загрузка молитвослова...
          </Text>
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top']}
    >
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <ImageBackground
            source={{
              uri: homeArtwork.hero_biblical,
            }}
            resizeMode="cover"
            style={styles.hero}
            imageStyle={styles.heroImage}
          >
            <View style={styles.heroWash} />

            <View style={styles.heroOrnament}>
              <Text style={styles.heroCross}>
                ☦
              </Text>
              <Text style={styles.heroFlourish}>
                ─── ✦ ───
              </Text>
            </View>

            <Text style={styles.brandTitle}>
              Молитвослов
            </Text>

            <Text style={styles.today}>
              {formatToday()}
            </Text>

            <Text style={styles.heroDivider}>
              ─────  ✥  ─────
            </Text>
          </ImageBackground>


          <View style={styles.pageBody}>
            <View style={styles.quoteCard}>
              <View style={styles.quoteHeader}>
                <View style={styles.quoteHeadingWrap}>
                  <Text style={styles.quoteLeaf}>
                    ❧
                  </Text>

                  <Text style={styles.quoteLabel}>
                    Цитата дня
                  </Text>
                </View>

                <Pressable
                  hitSlop={8}
                  onPress={showWidgetInfo}
                  style={({pressed}) => [
                    styles.widgetButton,
                    pressed &&
                    styles.pressed,
                  ]}
                >
                  <Text style={styles.widgetIcon}>
                    ▣
                  </Text>
                  <Text style={styles.widgetText}>
                    На экран
                  </Text>
                </Pressable>
              </View>

              <View style={styles.quoteRule}>
                <View style={styles.quoteRuleLine} />
                <Text style={styles.quoteRuleMark}>
                  ✦
                </Text>
                <View style={styles.quoteRuleLine} />
              </View>

              <Text style={styles.quoteText}>
                {
                  dailyQuote?.text ||
                  'Молитва и духовное чтение помогают хранить внимание сердца.'
                }
              </Text>

              {!!(
                dailyQuote?.reference ||
                dailyQuote?.source
              ) && (
                <Text style={styles.quoteSource}>
                  {
                    dailyQuote?.reference ||
                    dailyQuote?.source
                  }
                </Text>
              )}

              <Text style={styles.quoteGhost}>
                ИЕРУСАЛИМ  ·  СИНАЙ  ·  ПИСАНИЕ
              </Text>
            </View>


            <View style={styles.readingCard}>
              <View style={styles.readingHeader}>
                <View style={styles.readingHeadingWrap}>
                  <Text style={styles.readingBook}>
                    ▤
                  </Text>

                  <Text style={styles.readingSectionTitle}>
                    Продолжить чтение
                  </Text>
                </View>

                {!!activeReadings.length && (
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      navigation.navigate(
                        'ContinueReading'
                      )
                    }
                    style={({pressed}) => [
                      styles.openReadings,
                      pressed &&
                      styles.pressed,
                    ]}
                  >
                    <Text style={styles.openReadingsText}>
                      Открыть
                    </Text>
                    <Text style={styles.openReadingsArrow}>
                      ›
                    </Text>
                  </Pressable>
                )}
              </View>

              {latestReading ? (
                <View style={styles.latestReading}>
                  <Pressable
                    onPress={latestReading.onPress}
                    style={({pressed}) => [
                      styles.latestReadingMain,
                      pressed &&
                      styles.pressed,
                    ]}
                  >
                    <View style={styles.readingCategoryIcon}>
                      <Text style={styles.readingCategoryGlyph}>
                        {
                          latestReading.type === 'Псалтирь'
                            ? '¶'
                            : latestReading.type === 'Канон'
                              ? '▤'
                              : latestReading.type === 'Акафист'
                                ? '☦'
                                : '✦'
                        }
                      </Text>
                    </View>

                    <View style={styles.latestReadingText}>
                      <Text
                        style={styles.latestReadingTitle}
                        numberOfLines={2}
                      >
                        {latestReading.title}
                      </Text>

                      <View style={styles.latestProgressRow}>
                        <View style={styles.latestProgressTrack}>
                          <View
                            style={[
                              styles.latestProgressFill,
                              {
                                width:
                                  `${Math.max(
                                    0,
                                    Math.min(
                                      latestReading.progress,
                                      100
                                    )
                                  )}%`,
                              },
                            ]}
                          />
                        </View>

                        <Text style={styles.latestProgressPercent}>
                          {latestReading.progress}%
                        </Text>
                      </View>

                      <Text
                        style={styles.latestReadingPosition}
                        numberOfLines={2}
                      >
                        {latestReading.position}
                      </Text>
                    </View>

                    <Text style={styles.latestReadingArrow}>
                      ›
                    </Text>
                  </Pressable>

                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      finishReading(
                        latestReading.id
                      )
                    }
                    style={({pressed}) => [
                      styles.latestRemove,
                      pressed &&
                      styles.pressed,
                    ]}
                  >
                    <Text style={styles.latestRemoveText}>
                      ×
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.emptyReading}>
                  <Text style={styles.emptyReadingTitle}>
                    Здесь появится последнее чтение
                  </Text>

                  <Text style={styles.emptyReadingText}>
                    Откройте молитву, акафист, канон или Псалтирь — место сохранится автоматически.
                  </Text>
                </View>
              )}
            </View>


            <View style={styles.libraryList}>
              <DecorativeCard
                title="Утренние молитвы"
                subtitle="Начните день с Богом"
                symbol="☀"
                artwork={homeArtwork.morning}
                onPress={() =>
                  navigation.navigate(
                    'PrayerRule',
                    {
                      slug:
                        'molitvy-utrennie',
                    }
                  )
                }
              />

              <DecorativeCard
                title="Вечерние молитвы"
                subtitle="Завершите день в молитве"
                symbol="☾"
                artwork={homeArtwork.evening}
                dark
                onPress={() =>
                  navigation.navigate(
                    'PrayerRule',
                    {
                      slug:
                        'molitvy-na-son-griadushchim',
                    }
                  )
                }
              />

              <DecorativeCard
                title="Акафисты"
                subtitle="Молитвенные хвалебные песнопения"
                symbol="☦"
                artwork={homeArtwork.akathists}
                onPress={() =>
                  navigation.navigate(
                    'AkathistList'
                  )
                }
              />

              <DecorativeCard
                title="Каноны"
                subtitle="Покаянные и просительные каноны"
                symbol="▤"
                artwork={homeArtwork.canons}
                dark
                onPress={() =>
                  navigation.navigate(
                    'CanonList'
                  )
                }
              />

              <DecorativeCard
                title="Ко Святому Причащению"
                subtitle="Подготовительные молитвы"
                symbol="♱"
                artwork={homeArtwork.communion}
                onPress={() =>
                  navigation.navigate(
                    'CommunionPreparation'
                  )
                }
              />

              <DecorativeCard
                title="Псалтирь"
                subtitle="Книга молитвы и духовного утешения"
                symbol="¶"
                artwork={homeArtwork.psalter}
                onPress={() =>
                  navigation.navigate(
                    'Psalter'
                  )
                }
              />
            </View>


            {!!libraryCategories.length && (
              <View style={styles.extraSection}>
                <View style={styles.extraHeader}>
                  <Text style={styles.extraTitle}>
                    Другие разделы
                  </Text>

                  <Text style={styles.extraOrnament}>
                    ✦
                  </Text>
                </View>

                {libraryCategories.map(
                  category => (
                    <Pressable
                      key={category.id}
                      onPress={() =>
                        openCategory(
                          category
                        )
                      }
                      style={({pressed}) => [
                        styles.extraCard,
                        pressed &&
                        styles.pressed,
                      ]}
                    >
                      <View>
                        <Text style={styles.extraCardTitle}>
                          {category.name}
                        </Text>

                        <Text style={styles.extraCardSubtitle}>
                          {
                            getSubcategories(
                              category
                            ).length > 0
                              ? `${getSubcategories(category).length} разделов`
                              : 'Открыть'
                          }
                        </Text>
                      </View>

                      <Text style={styles.extraArrow}>
                        ›
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            )}


            {!!error && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>
                  {error}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <BottomNav
          navigation={navigation}
          active="home"
        />
      </View>
    </SafeAreaView>
  );
};


const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        '#D2A96F',
    },

    screen: {
      flex: 1,
      backgroundColor:
        '#D2A96F',
    },

    content: {
      paddingBottom: 18,
      backgroundColor:
        '#D2A96F',
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        '#F4E7CC',
    },

    loadingText: {
      marginTop:
        spacing.md,
      color:
        '#6B5038',
      fontSize: 15,
    },

    hero: {
      height: 270,
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 22,
      overflow: 'hidden',
    },

    heroImage: {
      opacity: 0.96,
    },

    heroWash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        'rgba(255, 239, 204, 0.18)',
    },

    heroOrnament: {
      alignItems: 'center',
      marginBottom: 2,
    },

    heroCross: {
      color: '#7D4D22',
      fontSize: 27,
      lineHeight: 30,
      textShadowColor:
        'rgba(255,255,255,0.55)',
      textShadowRadius: 5,
    },

    heroFlourish: {
      marginTop: -3,
      color: '#8A5A2D',
      fontSize: 12,
      letterSpacing: 1,
    },

    brandTitle: {
      color: '#4B2817',
      fontFamily: 'serif',
      fontSize: 43,
      lineHeight: 50,
      fontWeight: '700',
      textAlign: 'center',
      textShadowColor:
        'rgba(255,244,218,0.78)',
      textShadowOffset: {
        width: 0,
        height: 1,
      },
      textShadowRadius: 5,
    },

    today: {
      marginTop: 1,
      color: '#4F3524',
      fontFamily: 'serif',
      fontSize: 16,
      lineHeight: 22,
      textAlign: 'center',
      textTransform:
        'capitalize',
    },

    heroDivider: {
      marginTop: 8,
      color: '#8D5D2E',
      fontSize: 12,
      letterSpacing: 1,
    },

    pageBody: {
      marginTop: -8,
      paddingHorizontal: 14,
      paddingBottom: 16,
    },

    quoteCard: {
      minHeight: 176,
      padding: 18,
      borderRadius: 20,
      backgroundColor:
        '#F8EED8',
      borderWidth: 1,
      borderColor:
        'rgba(122, 78, 36, 0.24)',
      shadowColor:
        '#3C2418',
      shadowOffset: {
        width: 0,
        height: 5,
      },
      shadowOpacity: 0.14,
      shadowRadius: 12,
      elevation: 4,
      overflow: 'hidden',
    },

    quoteHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: 10,
    },

    quoteHeadingWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },

    quoteLeaf: {
      marginRight: 8,
      color: '#8A5B2E',
      fontSize: 22,
    },

    quoteLabel: {
      color: '#83552E',
      fontFamily: 'serif',
      fontSize: 22,
      fontWeight: '700',
    },

    widgetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 34,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor:
        'rgba(126, 78, 34, 0.48)',
      borderRadius: 17,
      backgroundColor:
        'rgba(255,250,238,0.52)',
    },

    widgetIcon: {
      marginRight: 6,
      color: '#7E502A',
      fontSize: 13,
    },

    widgetText: {
      color: '#684229',
      fontFamily: 'serif',
      fontSize: 13,
      fontWeight: '600',
    },

    quoteRule: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 190,
      marginTop: 10,
      marginBottom: 12,
    },

    quoteRuleLine: {
      flex: 1,
      height: 1,
      backgroundColor:
        'rgba(146, 98, 47, 0.42)',
    },

    quoteRuleMark: {
      marginHorizontal: 8,
      color: '#A87943',
      fontSize: 10,
    },

    quoteText: {
      color: '#3D271A',
      fontFamily: 'serif',
      fontSize: 21,
      lineHeight: 29,
      fontWeight: '500',
    },

    quoteSource: {
      marginTop: 12,
      color: '#876A50',
      fontFamily: 'serif',
      fontSize: 12,
      lineHeight: 18,
      letterSpacing: 1.2,
      textTransform:
        'uppercase',
    },

    quoteGhost: {
      marginTop: 12,
      color: 'rgba(133, 93, 52, 0.25)',
      fontSize: 9,
      letterSpacing: 2,
      textAlign: 'right',
    },

    readingCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: 18,
      backgroundColor:
        '#4B2E1D',
      borderWidth: 1,
      borderColor:
        '#B8874A',
      shadowColor:
        '#2D160B',
      shadowOffset: {
        width: 0,
        height: 5,
      },
      shadowOpacity: 0.22,
      shadowRadius: 10,
      elevation: 4,
    },

    readingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 12,
    },

    readingHeadingWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },

    readingBook: {
      marginRight: 8,
      color: '#F2D79E',
      fontSize: 24,
    },

    readingSectionTitle: {
      color: '#F4DCA8',
      fontFamily: 'serif',
      fontSize: 21,
      fontWeight: '700',
    },

    openReadings: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      paddingLeft: 8,
    },

    openReadingsText: {
      color: '#F7E7C0',
      fontFamily: 'serif',
      fontSize: 14,
    },

    openReadingsArrow: {
      marginLeft: 5,
      color: '#F7E7C0',
      fontSize: 22,
      lineHeight: 22,
    },

    latestReading: {
      position: 'relative',
    },

    latestReadingMain: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 32,
    },

    readingCategoryIcon: {
      width: 62,
      height: 72,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 12,
      backgroundColor:
        '#F0D39B',
      borderWidth: 1,
      borderColor:
        '#C29355',
    },

    readingCategoryGlyph: {
      color: '#6B3F20',
      fontFamily: 'serif',
      fontSize: 31,
      fontWeight: '700',
    },

    latestReadingText: {
      flex: 1,
      marginLeft: 12,
    },

    latestReadingTitle: {
      color: '#FFF7E7',
      fontFamily: 'serif',
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '700',
    },

    latestProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 9,
    },

    latestProgressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor:
        'rgba(244, 222, 177, 0.22)',
      borderWidth: 1,
      borderColor:
        'rgba(244, 222, 177, 0.22)',
    },

    latestProgressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor:
        '#E8C98B',
    },

    latestProgressPercent: {
      width: 39,
      marginLeft: 9,
      color: '#F2DFC0',
      fontSize: 12,
      textAlign: 'right',
    },

    latestReadingPosition: {
      marginTop: 7,
      color: '#E8D8C0',
      fontFamily: 'serif',
      fontSize: 12,
      lineHeight: 17,
    },

    latestReadingArrow: {
      marginLeft: 8,
      color: '#F1D08D',
      fontSize: 32,
      lineHeight: 32,
    },

    latestRemove: {
      position: 'absolute',
      top: -2,
      right: 0,
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        'rgba(242, 217, 164, 0.4)',
      backgroundColor:
        'rgba(255,255,255,0.06)',
    },

    latestRemoveText: {
      color: '#F2D9A4',
      fontSize: 19,
      lineHeight: 21,
    },

    emptyReading: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },

    emptyReadingTitle: {
      color: '#FFF0CF',
      fontFamily: 'serif',
      fontSize: 17,
      fontWeight: '700',
    },

    emptyReadingText: {
      marginTop: 6,
      color: '#DFCDB2',
      fontSize: 13,
      lineHeight: 19,
    },

    libraryList: {
      marginTop: 12,
      gap: 9,
    },

    libraryCard: {
      position: 'relative',
      minHeight: 78,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 12,
      paddingRight: 9,
      borderRadius: 17,
      overflow: 'hidden',
      backgroundColor:
        '#F9EED7',
      borderWidth: 1,
      borderColor:
        'rgba(126, 82, 38, 0.22)',
      shadowColor:
        '#5A321B',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.09,
      shadowRadius: 7,
      elevation: 2,
    },

    libraryCardDark: {
      backgroundColor:
        '#332A26',
      borderColor:
        'rgba(232, 199, 141, 0.32)',
    },

    libraryArtwork: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: '45%',
    },

    libraryArtworkImage: {
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
    },

    libraryArtworkWash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        'rgba(248, 232, 200, 0.16)',
    },

    libraryArtworkWashDark: {
      backgroundColor:
        'rgba(37, 28, 24, 0.18)',
    },

    libraryIcon: {
      zIndex: 2,
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 26,
      backgroundColor:
        'rgba(255, 247, 230, 0.88)',
      borderWidth: 1,
      borderColor:
        'rgba(169, 113, 53, 0.34)',
    },

    libraryIconDark: {
      backgroundColor:
        'rgba(255, 238, 204, 0.12)',
      borderColor:
        'rgba(238, 204, 150, 0.34)',
    },

    libraryIconText: {
      color: '#93602F',
      fontFamily: 'serif',
      fontSize: 25,
      fontWeight: '600',
    },

    libraryIconTextDark: {
      color: '#F1D49B',
    },

    libraryText: {
      zIndex: 2,
      flex: 1,
      marginLeft: 12,
      paddingRight: 60,
    },

    libraryTitle: {
      color: '#392317',
      fontFamily: 'serif',
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '700',
    },

    libraryTitleDark: {
      color: '#FFF3D8',
    },

    librarySubtitle: {
      marginTop: 3,
      color: '#785E48',
      fontFamily: 'serif',
      fontSize: 12,
      lineHeight: 16,
    },

    librarySubtitleDark: {
      color: '#DCC8AA',
    },

    libraryChevron: {
      zIndex: 3,
      width: 31,
      height: 31,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 16,
      backgroundColor:
        'rgba(255, 248, 231, 0.72)',
    },

    libraryChevronDark: {
      backgroundColor:
        'rgba(255, 240, 207, 0.12)',
    },

    libraryChevronText: {
      marginTop: -2,
      color: '#8B5C2E',
      fontSize: 28,
      lineHeight: 28,
    },

    libraryChevronTextDark: {
      color: '#F2D59D',
    },

    extraSection: {
      marginTop: 18,
    },

    extraHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },

    extraTitle: {
      flex: 1,
      color: '#52351F',
      fontFamily: 'serif',
      fontSize: 21,
      fontWeight: '700',
    },

    extraOrnament: {
      color: '#9D6D39',
    },

    extraCard: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 15,
      backgroundColor:
        '#F6E7CA',
      borderWidth: 1,
      borderColor:
        'rgba(126, 82, 38, 0.2)',
    },

    extraCardTitle: {
      color: '#422B1D',
      fontFamily: 'serif',
      fontSize: 16,
      fontWeight: '700',
    },

    extraCardSubtitle: {
      marginTop: 3,
      color: '#846B55',
      fontSize: 11,
    },

    extraArrow: {
      color: '#966535',
      fontSize: 27,
    },

    errorCard: {
      marginTop: 14,
      padding: 12,
      borderRadius: 14,
      backgroundColor:
        '#F5D9CF',
    },

    errorText: {
      color: '#8E3B35',
      fontSize: 13,
      lineHeight: 19,
    },

    pressed: {
      opacity: 0.7,
    },
  });
