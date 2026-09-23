import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
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
  api,
} from '../api';

import {
  deleteReadingProgress,
  getReadingProgress,
} from '../services/readingProgress';

import {
  BottomNav,
} from '../components/navigation/BottomNav';

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

  return `${weekdays[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
};


const HomeCard = ({
  title,
  subtitle,
  onPress,
  featured = false,
}) => (
  <Pressable
    onPress={onPress}
    style={({pressed}) => [
      styles.homeCard,
      featured &&
      styles.homeCardFeatured,
      pressed &&
      styles.pressed,
    ]}
  >
    <Text
      style={styles.cardTitle}
      numberOfLines={2}
    >
      {title}
    </Text>

    {!!subtitle && (
      <Text
        style={styles.cardSubtitle}
        numberOfLines={2}
      >
        {subtitle}
      </Text>
    )}
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


  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['top']}
      >
        <StatusBar
          style="dark"
        />

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
      <StatusBar
        style="dark"
      />

      <View
        style={styles.screen}
      >
        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.content
          }
        >
          <View
            style={styles.brandRow}
          >
            <View
              style={styles.brandMark}
            >
              <Text
                style={
                  styles.brandCross
                }
              >
                ☦
              </Text>
            </View>

            <View
              style={styles.brandText}
            >
              <Text
                style={
                  styles.brandTitle
                }
              >
                Молитвослов
              </Text>

              <Text
                style={styles.today}
              >
                {formatToday()}
              </Text>
            </View>
          </View>


          <View
            style={styles.quoteBlock}
          >
            <Text
              style={styles.quoteLabel}
            >
              ЦИТАТА ДНЯ
            </Text>

            <Text
              style={styles.quoteText}
            >
              {
                dailyQuote?.text ||
                'Молитва и духовное чтение помогают хранить внимание сердца.'
              }
            </Text>

            {!!(
              dailyQuote?.reference ||
              dailyQuote?.source
            ) && (
              <Text
                style={styles.quoteSource}
              >
                {
                  dailyQuote?.reference ||
                  dailyQuote?.source
                }
              </Text>
            )}
          </View>


          <View
            style={
              styles.readingSection
            }
          >
            <Text
              style={
                styles.readingSectionTitle
              }
            >
              Продолжить чтение
            </Text>

            {activeReadings.length ? (
              <View
                style={
                  styles.readingCard
                }
              >
                {activeReadings.map(
                  (
                    item,
                    index
                  ) => (
                    <View
                      key={item.id}
                    >
                      <View
                        style={
                          styles.readingRow
                        }
                      >
                        <Pressable
                          style={({pressed}) => [
                            styles.readingMain,
                            pressed &&
                            styles.pressed,
                          ]}
                          onPress={
                            item.onPress
                          }
                        >
                          <View
                            style={
                              styles.readingText
                            }
                          >
                            <Text
                              style={
                                styles.readingType
                              }
                            >
                              {item.type}
                            </Text>

                            <Text
                              style={
                                styles.readingTitle
                              }
                              numberOfLines={1}
                            >
                              {item.title}
                            </Text>

                            <Text
                              style={
                                styles.readingPosition
                              }
                              numberOfLines={2}
                            >
                              {item.position}
                            </Text>

                            <View
                              style={
                                styles.progressRow
                              }
                            >
                              <View
                                style={
                                  styles.progressTrack
                                }
                              >
                                <View
                                  style={[
                                    styles.progressFill,
                                    {
                                      width:
                                        `${Math.max(
                                          0,
                                          Math.min(
                                            item.progress,
                                            100
                                          )
                                        )}%`,
                                    },
                                  ]}
                                />
                              </View>

                              <Text
                                style={
                                  styles.progressPercent
                                }
                              >
                                {item.progress}%
                              </Text>
                            </View>
                          </View>

                          <Text
                            style={
                              styles.readingArrow
                            }
                          >
                            ›
                          </Text>
                        </Pressable>

                        <Pressable
                          hitSlop={8}
                          onPress={() =>
                            finishReading(
                              item.id
                            )
                          }
                          style={({pressed}) => [
                            styles.finishButton,
                            pressed &&
                            styles.pressed,
                          ]}
                        >
                          <Text
                            style={
                              styles.finishText
                            }
                          >
                            ✓
                          </Text>
                        </Pressable>
                      </View>

                      {index <
                        activeReadings.length -
                          1 && (
                        <View
                          style={
                            styles.readingDivider
                          }
                        />
                      )}
                    </View>
                  )
                )}
              </View>
            ) : (
              <View
                style={
                  styles.noReadingCard
                }
              >
                <Text
                  style={
                    styles.noReadingText
                  }
                >
                  Начатых чтений пока нет.
                  Откройте молитву, акафист
                  или Псалтирь — место
                  сохранится автоматически.
                </Text>
              </View>
            )}

            {!!activeReadings.length && (
              <Text
                style={
                  styles.finishHint
                }
              >
                ✓ — отметить чтение завершённым
              </Text>
            )}
          </View>


          <View
            style={styles.section}
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Молитвенное правило
            </Text>

            <View
              style={styles.grid}
            >
              {PRAYER_RULES.map(
                item => (
                  <HomeCard
                    key={item.key}
                    title={
                      item.title
                    }
                    subtitle={
                      item.subtitle
                    }
                    featured
                    onPress={() =>
                      navigation.navigate(
                        'PrayerRule',
                        {
                          slug:
                            item.slug,
                        }
                      )
                    }
                  />
                )
              )}
            </View>
          </View>


          <View
            style={styles.section}
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Библиотека
            </Text>

            <View
              style={styles.grid}
            >
              <HomeCard
                title="Акафисты"
                subtitle={
                  akathists.length
                    ? `${akathists.length} текстов`
                    : 'Господу, Богородице и святым'
                }
                onPress={() =>
                  navigation.navigate(
                    'AkathistList'
                  )
                }
              />

              <HomeCard
                title="Каноны"
                subtitle={
                  canons.length
                    ? `${canons.length} текстов`
                    : 'Покаянные и святым'
                }
                onPress={() =>
                  navigation.navigate(
                    'CanonList'
                  )
                }
              />

              <HomeCard
                title="Псалтирь"
                subtitle="20 кафизм"
                onPress={() =>
                  navigation.navigate(
                    'Psalter'
                  )
                }
              />

              {libraryCategories.map(
                category => {
                  const count =
                    getSubcategories(
                      category
                    ).length;

                  return (
                    <HomeCard
                      key={
                        category.id
                      }
                      title={
                        category.name
                      }
                      subtitle={
                        count > 0
                          ? `${count} разделов`
                          : 'Открыть'
                      }
                      onPress={() =>
                        openCategory(
                          category
                        )
                      }
                    />
                  );
                }
              )}
            </View>
          </View>


          {!!error && (
            <View
              style={
                styles.errorCard
              }
            >
              <Text
                style={
                  styles.errorText
                }
              >
                {error}
              </Text>
            </View>
          )}
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
        colors.background,
    },

    screen: {
      flex: 1,
    },

    content: {
      paddingHorizontal:
        spacing.md,
      paddingTop:
        spacing.sm,
      paddingBottom:
        spacing.xl,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.background,
    },

    loadingText: {
      marginTop:
        spacing.md,
      color:
        colors.textSecondary,
      fontSize: 15,
    },

    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop:
        spacing.xs,
    },

    brandMark: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.surfaceMuted,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    brandCross: {
      fontSize: 23,
      color:
        colors.liturgical,
    },

    brandText: {
      flex: 1,
      marginLeft:
        spacing.md,
    },

    brandTitle: {
      fontSize: 27,
      lineHeight: 32,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    today: {
      marginTop: 1,
      fontSize: 13,
      color:
        colors.textSecondary,
      textTransform:
        'capitalize',
    },

    quoteBlock: {
      marginTop:
        spacing.sm,
      marginBottom:
        spacing.md,
      paddingVertical: 2,
    },

    quoteLabel: {
      marginBottom: 7,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '800',
      letterSpacing: 1,
      color:
        colors.accent,
    },

    quoteText: {
      maxWidth: 330,
      fontSize: 16,
      lineHeight: 23,
      color:
        colors.textSecondary,
      fontFamily: 'serif',
    },

    quoteSource: {
      marginTop: 7,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      color:
        colors.textMuted,
    },

    readingSection: {
      marginBottom:
        spacing.xl,
    },

    readingSectionTitle: {
      ...typography.sectionTitle,
      marginBottom:
        spacing.sm,
      color:
        colors.text,
      fontFamily: 'serif',
    },

    readingCard: {
      borderRadius:
        radius.lg,
      backgroundColor:
        colors.surfaceMuted,
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
      overflow: 'hidden',
    },

    readingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 78,
    },

    readingMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical:
        10,
      paddingLeft:
        spacing.md,
      paddingRight:
        spacing.xs,
    },



    readingText: {
      flex: 1,
    },

    readingType: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform:
        'uppercase',
      color:
        colors.accent,
    },

    readingTitle: {
      marginTop: 2,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    readingPosition: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 17,
      color:
        colors.textSecondary,
    },

    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },

    progressTrack: {
      flex: 1,
      height: 5,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor:
        'rgba(138, 90, 56, 0.14)',
    },

    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor:
        colors.accent,
    },

    progressPercent: {
      width: 34,
      marginLeft: 8,
      fontSize: 11,
      textAlign: 'right',
      color:
        colors.textSecondary,
    },

    readingArrow: {
      marginLeft:
        spacing.xs,
      fontSize: 26,
      color:
        colors.accent,
    },

    finishButton: {
      width: 38,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    finishText: {
      width: 26,
      height: 26,
      borderRadius: 13,
      textAlign: 'center',
      textAlignVertical:
        'center',
      fontSize: 14,
      lineHeight: 25,
      fontWeight: '800',
      color:
        colors.accentDark,
      backgroundColor:
        colors.surface,
      overflow: 'hidden',
    },

    readingDivider: {
      height: 1,
      marginLeft:
        spacing.md,
      backgroundColor:
        colors.borderStrong,
    },

    noReadingCard: {
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surfaceMuted,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    noReadingText: {
      fontSize: 14,
      lineHeight: 21,
      color:
        colors.textSecondary,
    },

    finishHint: {
      marginTop:
        spacing.xs,
      paddingHorizontal:
        spacing.xs,
      fontSize: 11,
      color:
        colors.textMuted,
    },

    section: {
      marginBottom:
        spacing.xl,
    },

    sectionTitle: {
      ...typography.sectionTitle,
      marginBottom:
        spacing.md,
      color:
        colors.text,
      fontFamily: 'serif',
    },

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent:
        'space-between',
      rowGap:
        spacing.md,
    },

    homeCard: {
      width: '48.5%',
      minHeight: 84,
      padding:
        spacing.sm,
      borderRadius:
        radius.lg,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      shadowColor:
        colors.shadow,
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.05,
      shadowRadius: 7,
      elevation: 1,
    },

    homeCardFeatured: {
      backgroundColor:
        colors.surfaceWarm,
    },

    pressed: {
      opacity: 0.68,
    },





    cardTitle: {
      ...typography.cardTitle,
      color:
        colors.text,
      fontFamily: 'serif',
    },

    cardSubtitle: {
      ...typography.caption,
      marginTop:
        spacing.xs,
      color:
        colors.textSecondary,
    },

    errorCard: {
      padding:
        spacing.md,
      marginBottom:
        spacing.xl,
      borderRadius:
        radius.md,
      backgroundColor:
        '#F6E9E7',
    },

    errorText: {
      color:
        colors.liturgical,
      fontSize: 14,
      lineHeight: 20,
    },
  });
