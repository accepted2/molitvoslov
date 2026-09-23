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
  symbol,
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
    <View
      style={[
        styles.symbolCircle,
        featured &&
        styles.symbolCircleFeatured,
      ]}
    >
      <Text
        style={[
          styles.symbolText,
          featured &&
          styles.symbolTextFeatured,
        ]}
      >
        {symbol}
      </Text>
    </View>

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

  const [prayerRules, setPrayerRules] =
    useState([]);

  const [
    readingProgress,
    setReadingProgress,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);


  const loadLibrary =
    useCallback(async () => {
      try {
        const [
          categoriesResponse,
          akathistsResponse,
          prayerRulesResponse,
        ] = await Promise.all([
          api.get('categories/'),
          api.get('akathists/'),
          api.get(
            'prayer-rules/'
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

        setPrayerRules(
          prayerRulesResponse.data
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
              ? `Кафизма ${info.kathisma_number} · Псалом ${info.psalm_number} · стих ${info.verse_number}`
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
          .map(
            makeReadingItem
          )
          .filter(Boolean),
      [
        readingProgress,
        categories,
        akathists,
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


          <Text
            style={styles.intro}
          >
            Молитвы и духовное чтение
            в спокойном ритме дня
          </Text>


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
                              styles.readingMark
                            }
                          >
                            <Text
                              style={
                                styles.readingSymbol
                              }
                            >
                              {item.symbol}
                            </Text>
                          </View>

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
                    symbol={
                      item.symbol
                    }
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
                symbol="☦"
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
                symbol="¶"
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
                      symbol={
                        category.icon ||
                        '✦'
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
      width: 48,
      height: 48,
      borderRadius: 24,
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
      fontSize: 26,
      color:
        colors.liturgical,
    },

    brandText: {
      flex: 1,
      marginLeft:
        spacing.md,
    },

    brandTitle: {
      fontSize: 28,
      lineHeight: 33,
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

    intro: {
      maxWidth: 310,
      marginTop:
        spacing.md,
      marginBottom:
        spacing.lg,
      fontSize: 16,
      lineHeight: 24,
      color:
        colors.textSecondary,
      fontFamily: 'serif',
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
      minHeight: 92,
    },

    readingMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical:
        13,
      paddingLeft:
        spacing.md,
      paddingRight:
        spacing.xs,
    },

    readingMark: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.surface,
    },

    readingSymbol: {
      fontSize: 20,
      color:
        colors.accent,
    },

    readingText: {
      flex: 1,
      marginLeft:
        spacing.sm,
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

    readingArrow: {
      marginLeft:
        spacing.xs,
      fontSize: 26,
      color:
        colors.accent,
    },

    finishButton: {
      width: 44,
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
      marginLeft: 64,
      backgroundColor:
        colors.borderStrong,
    },

    noReadingCard: {
      padding:
        spacing.md,
      borderRadius:
        radius.lg,
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
      width: '48%',
      minHeight: 154,
      padding:
        spacing.md,
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
      shadowRadius: 10,
      elevation: 1,
    },

    homeCardFeatured: {
      backgroundColor:
        colors.surfaceWarm,
    },

    pressed: {
      opacity: 0.68,
    },

    symbolCircle: {
      width: 42,
      height: 42,
      marginBottom:
        spacing.md,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.accentSoft,
    },

    symbolCircleFeatured: {
      backgroundColor:
        colors.surface,
    },

    symbolText: {
      fontSize: 22,
      color:
        colors.accent,
    },

    symbolTextFeatured: {
      color:
        colors.liturgical,
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
