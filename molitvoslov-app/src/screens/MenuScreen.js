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
}) => (
  <Pressable
    onPress={onPress}
    style={({pressed}) => [
      styles.libraryCard,
      pressed &&
      styles.pressed,
    ]}
  >
    <ImageBackground
      source={artwork}
      resizeMode="cover"
      style={styles.libraryArtwork}
      imageStyle={
        styles.libraryArtworkImage
      }
    />

    <View
      pointerEvents="none"
      style={styles.libraryFade1}
    />
    <View
      pointerEvents="none"
      style={styles.libraryFade2}
    />
    <View
      pointerEvents="none"
      style={styles.libraryFade3}
    />
    <View
      pointerEvents="none"
      style={styles.libraryFade4}
    />
    <View
      pointerEvents="none"
      style={styles.libraryFade5}
    />

    <View style={styles.libraryIcon}>
      <Text style={styles.libraryIconText}>
        {symbol}
      </Text>
    </View>

    <View style={styles.libraryText}>
      <Text
        style={styles.libraryTitle}
        numberOfLines={2}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={styles.librarySubtitle}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      )}
    </View>

    <View style={styles.libraryChevron}>
      <Text style={styles.libraryChevronText}>
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
            source={homeArtwork.hero_biblical}
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
              <ImageBackground
                source={homeArtwork.quote}
                resizeMode="cover"
                style={styles.quoteArtwork}
                imageStyle={styles.quoteArtworkImage}
              />

              <View
                pointerEvents="none"
                style={styles.quoteFade1}
              />
              <View
                pointerEvents="none"
                style={styles.quoteFade2}
              />
              <View
                pointerEvents="none"
                style={styles.quoteFade3}
              />

              <View style={styles.quoteContent}>
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
              </View>
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
        '#B78A58',
    },

    screen: {
      flex: 1,
      backgroundColor:
        '#B78A58',
    },

    content: {
      paddingBottom: 16,
      backgroundColor:
        '#B78A58',
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        '#F7ECD8',
    },

    loadingText: {
      marginTop:
        spacing.md,
      color:
        '#6B5038',
      fontSize: 15,
    },

    hero: {
      height: 248,
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 22,
      overflow: 'hidden',
      backgroundColor:
        '#D7A767',
    },

    heroImage: {
      opacity: 0.98,
    },

    heroWash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        'rgba(255, 232, 188, 0.08)',
    },

    heroOrnament: {
      alignItems: 'center',
      marginBottom: 0,
    },

    heroCross: {
      color: '#774923',
      fontSize: 25,
      lineHeight: 28,
      textShadowColor:
        'rgba(255,255,255,0.65)',
      textShadowRadius: 4,
    },

    heroFlourish: {
      marginTop: -3,
      color: '#8B5A2D',
      fontSize: 11,
      letterSpacing: 1,
    },

    brandTitle: {
      color: '#452718',
      fontFamily: 'serif',
      fontSize: 39,
      lineHeight: 45,
      fontWeight: '700',
      textAlign: 'center',
      textShadowColor:
        'rgba(255,245,224,0.9)',
      textShadowOffset: {
        width: 0,
        height: 1,
      },
      textShadowRadius: 5,
    },

    today: {
      marginTop: 0,
      color: '#513824',
      fontFamily: 'serif',
      fontSize: 15,
      lineHeight: 20,
      textAlign: 'center',
      textTransform:
        'capitalize',
    },

    heroDivider: {
      marginTop: 7,
      color: '#8D5D2E',
      fontSize: 10,
      letterSpacing: 1,
    },

    pageBody: {
      marginTop: -5,
      paddingHorizontal: 12,
      paddingBottom: 14,
      backgroundColor:
        '#B78A58',
    },

    quoteCard: {
      position: 'relative',
      minHeight: 174,
      padding: 17,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor:
        '#FFF4DE',
      borderWidth: 1,
      borderColor:
        'rgba(123, 79, 36, 0.24)',
      shadowColor:
        '#4A2817',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.14,
      shadowRadius: 9,
      elevation: 3,
    },

    quoteArtwork: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: '49%',
    },

    quoteArtworkImage: {
      opacity: 0.62,
      borderTopRightRadius: 17,
      borderBottomRightRadius: 17,
    },

    quoteFade1: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '49%',
      width: '10%',
      backgroundColor:
        'rgba(255, 244, 222, 0.96)',
    },

    quoteFade2: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '58%',
      width: '10%',
      backgroundColor:
        'rgba(255, 244, 222, 0.65)',
    },

    quoteFade3: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '67%',
      width: '10%',
      backgroundColor:
        'rgba(255, 244, 222, 0.28)',
    },

    quoteContent: {
      position: 'relative',
      zIndex: 2,
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
      marginRight: 7,
      color: '#A16E35',
      fontSize: 20,
    },

    quoteLabel: {
      color: '#7A4F2D',
      fontFamily: 'serif',
      fontSize: 20,
      fontWeight: '700',
    },

    widgetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 31,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor:
        'rgba(126, 78, 34, 0.32)',
      borderRadius: 16,
      backgroundColor:
        'rgba(255,255,255,0.42)',
    },

    widgetIcon: {
      marginRight: 5,
      color: '#85572F',
      fontSize: 11,
    },

    widgetText: {
      color: '#6F4930',
      fontFamily: 'serif',
      fontSize: 12,
      fontWeight: '600',
    },

    quoteRule: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 160,
      marginTop: 9,
      marginBottom: 11,
    },

    quoteRuleLine: {
      flex: 1,
      height: 1,
      backgroundColor:
        'rgba(146, 98, 47, 0.32)',
    },

    quoteRuleMark: {
      marginHorizontal: 7,
      color: '#A87943',
      fontSize: 9,
    },

    quoteText: {
      maxWidth: '78%',
      color: '#3E2A1D',
      fontFamily: 'serif',
      fontSize: 20,
      lineHeight: 27,
      fontWeight: '500',
    },

    quoteSource: {
      marginTop: 10,
      color: '#8A6C51',
      fontFamily: 'serif',
      fontSize: 11,
      lineHeight: 16,
      letterSpacing: 0.7,
      textTransform:
        'uppercase',
    },

    readingCard: {
      marginTop: 11,
      padding: 13,
      borderRadius: 18,
      backgroundColor:
        '#5A341D',
      borderWidth: 1,
      borderColor:
        '#B98545',
      shadowColor:
        '#3B1D0F',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 3,
    },

    readingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 10,
    },

    readingHeadingWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },

    readingBook: {
      marginRight: 8,
      color: '#F2D79E',
      fontSize: 21,
    },

    readingSectionTitle: {
      color: '#F4DCA8',
      fontFamily: 'serif',
      fontSize: 19,
      fontWeight: '700',
    },

    openReadings: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      paddingLeft: 10,
    },

    openReadingsText: {
      color: '#F5E5BE',
      fontFamily: 'serif',
      fontSize: 13,
    },

    openReadingsArrow: {
      marginLeft: 4,
      color: '#F5E5BE',
      fontSize: 20,
      lineHeight: 20,
    },

    latestReading: {
      position: 'relative',
      paddingRight: 2,
    },

    latestReadingMain: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 32,
    },

    readingCategoryIcon: {
      width: 54,
      height: 64,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 12,
      backgroundColor:
        '#F1D99F',
      borderWidth: 1,
      borderColor:
        '#C89C5E',
    },

    readingCategoryGlyph: {
      color: '#6D4223',
      fontFamily: 'serif',
      fontSize: 27,
      fontWeight: '700',
    },

    latestReadingText: {
      flex: 1,
      marginLeft: 11,
    },

    latestReadingTitle: {
      color: '#FFF8E9',
      fontFamily: 'serif',
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
    },

    latestProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 7,
    },

    latestProgressTrack: {
      flex: 1,
      height: 5,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor:
        'rgba(244, 222, 177, 0.20)',
    },

    latestProgressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor:
        '#E5C583',
    },

    latestProgressPercent: {
      width: 36,
      marginLeft: 7,
      color: '#F0DDC0',
      fontSize: 11,
      textAlign: 'right',
    },

    latestReadingPosition: {
      marginTop: 6,
      color: '#E5D2B7',
      fontFamily: 'serif',
      fontSize: 11,
      lineHeight: 15,
    },

    latestRemove: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 13,
      borderWidth: 1,
      borderColor:
        'rgba(242, 217, 164, 0.35)',
      backgroundColor:
        'rgba(255,255,255,0.05)',
    },

    latestRemoveText: {
      color: '#F2D9A4',
      fontSize: 17,
      lineHeight: 19,
    },

    emptyReading: {
      paddingVertical: 8,
      paddingHorizontal: 3,
    },

    emptyReadingTitle: {
      color: '#FFF0CF',
      fontFamily: 'serif',
      fontSize: 16,
      fontWeight: '700',
    },

    emptyReadingText: {
      marginTop: 5,
      color: '#DFCDB2',
      fontSize: 12,
      lineHeight: 18,
    },

    libraryList: {
      marginTop: 11,
      gap: 8,
    },

    libraryCard: {
      position: 'relative',
      minHeight: 80,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 11,
      paddingRight: 10,
      borderRadius: 17,
      overflow: 'hidden',
      backgroundColor:
        '#FFF2DB',
      borderWidth: 1,
      borderColor:
        'rgba(112, 67, 30, 0.25)',
      shadowColor:
        '#4A2817',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.12,
      shadowRadius: 7,
      elevation: 2,
    },

    libraryArtwork: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: '57%',
    },

    libraryArtworkImage: {
      opacity: 1,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
    },

    libraryFade1: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '41%',
      width: '8%',
      backgroundColor:
        '#FFF2DB',
    },

    libraryFade2: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '48%',
      width: '8%',
      backgroundColor:
        'rgba(255, 242, 219, 0.84)',
    },

    libraryFade3: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '55%',
      width: '8%',
      backgroundColor:
        'rgba(255, 242, 219, 0.60)',
    },

    libraryFade4: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '62%',
      width: '8%',
      backgroundColor:
        'rgba(255, 242, 219, 0.34)',
    },

    libraryFade5: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '69%',
      width: '8%',
      backgroundColor:
        'rgba(255, 242, 219, 0.14)',
    },

    libraryIcon: {
      zIndex: 3,
      width: 50,
      height: 50,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 25,
      backgroundColor:
        'rgba(255, 249, 237, 0.96)',
      borderWidth: 1,
      borderColor:
        'rgba(169, 113, 53, 0.34)',
      shadowColor:
        '#7A4B28',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },

    libraryIconText: {
      color: '#94602E',
      fontFamily: 'serif',
      fontSize: 24,
      fontWeight: '600',
    },

    libraryText: {
      zIndex: 3,
      flex: 1,
      maxWidth: '61%',
      marginLeft: 11,
      paddingRight: 4,
    },

    libraryTitle: {
      color: '#332116',
      fontFamily: 'serif',
      fontSize: 17,
      lineHeight: 20,
      fontWeight: '700',
      textShadowColor:
        'rgba(255,248,232,0.9)',
      textShadowRadius: 2,
    },

    librarySubtitle: {
      marginTop: 3,
      color: '#745A45',
      fontFamily: 'serif',
      fontSize: 11,
      lineHeight: 14,
    },

    libraryChevron: {
      position: 'absolute',
      right: 9,
      zIndex: 4,
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 15,
      backgroundColor:
        'rgba(255, 249, 236, 0.90)',
      shadowColor:
        '#5A321B',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 2,
    },

    libraryChevronText: {
      marginTop: -2,
      color: '#875627',
      fontSize: 27,
      lineHeight: 27,
    },

    extraSection: {
      marginTop: 16,
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
      fontSize: 20,
      fontWeight: '700',
    },

    extraOrnament: {
      color: '#9D6D39',
    },

    extraCard: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 8,
      paddingVertical: 9,
      paddingHorizontal: 13,
      borderRadius: 15,
      backgroundColor:
        '#F8E9CF',
      borderWidth: 1,
      borderColor:
        'rgba(126, 82, 38, 0.17)',
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
      fontSize: 25,
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
      opacity: 0.68,
    },
  });
