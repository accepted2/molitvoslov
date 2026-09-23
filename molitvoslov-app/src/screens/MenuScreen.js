import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useFocusEffect,
} from '@react-navigation/native';

import {
  StatusBar,
} from 'expo-status-bar';

import {
  api,
} from '../api';

import {
  getReadingProgress,
} from '../services/readingProgress';

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
      featured && styles.homeCardFeatured,
      pressed && styles.pressed,
    ]}
  >
    <View
      style={[
        styles.symbolCircle,
        featured && styles.symbolCircleFeatured,
      ]}
    >
      <Text
        style={[
          styles.symbolText,
          featured && styles.symbolTextFeatured,
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

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  const [psalterProgress, setPsalterProgress] =
    useState(null);


  const loadCategories =
    useCallback(async () => {
      try {
        const response =
          await api.get('categories/');

        const sorted =
          [...response.data].sort(
            (a, b) =>
              Number(a.order || 0) -
              Number(b.order || 0)
          );

        setCategories(sorted);
        setError(null);
      } catch (err) {
        console.log(
          'Ошибка загрузки категорий:',
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

        const psalter =
          progressList.find(
            item =>
              item.source_type ===
              'psalter' &&
              item.anchor_info
          );

        setPsalterProgress(
          psalter || null
        );
      } catch (err) {
        console.log(
          'Ошибка загрузки прогресса на главной:',
          err
        );
      }
    }, []);


  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        await Promise.all([
          loadCategories(),
          loadProgress(),
        ]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [
    loadCategories,
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


  const getSubcategories = category =>
    categories.filter(
      item =>
        item.parent ===
        category.id
    );


  const openCategory = category => {
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
      getSubcategories(category);

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


  const renderContinueCard = () => {
    const info =
      psalterProgress?.anchor_info;

    if (!info) {
      return null;
    }

    return (
      <Pressable
        style={({pressed}) => [
          styles.continueCard,
          pressed && styles.pressed,
        ]}
        onPress={() =>
          navigation.navigate(
            'Psalter'
          )
        }
      >
        <View
          style={
            styles.continueTop
          }
        >
          <Text
            style={
              styles.continueEyebrow
            }
          >
            ПРОДОЛЖИТЬ ЧТЕНИЕ
          </Text>

          <Text
            style={
              styles.continueArrow
            }
          >
            ›
          </Text>
        </View>

        <Text
          style={
            styles.continueTitle
          }
        >
          Псалтирь
        </Text>

        <Text
          style={
            styles.continueMeta
          }
        >
          Кафизма{' '}
          {info.kathisma_number}
          {'  ·  '}
          Псалом{' '}
          {info.psalm_number}
          {'  ·  '}
          стих{' '}
          {info.verse_number}
        </Text>
      </Pressable>
    );
  };


  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <StatusBar
          style="dark"
        />

        <View
          style={styles.center}
        >
          <ActivityIndicator
            size="large"
            color={colors.accent}
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
    >
      <StatusBar
        style="dark"
      />

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
              style={styles.brandCross}
            >
              ☦
            </Text>
          </View>

          <View
            style={styles.brandText}
          >
            <Text
              style={styles.brandTitle}
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


        {renderContinueCard()}


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
              subtitle="Господу, Богородице и святым"
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


        <View
          style={styles.footer}
        >
          <Text
            style={
              styles.footerCross
            }
          >
            ☦
          </Text>

          <Text
            style={
              styles.footerText
            }
          >
            Читайте без спешки
          </Text>
        </View>
      </ScrollView>
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

    content: {
      paddingHorizontal:
        spacing.md,
      paddingTop:
        spacing.sm,
      paddingBottom: 54,
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
      width: 50,
      height: 50,
      borderRadius: 25,
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
      fontSize: 28,
      color:
        colors.liturgical,
    },

    brandText: {
      flex: 1,
      marginLeft:
        spacing.md,
    },

    brandTitle: {
      ...typography.title,
      color:
        colors.text,
      fontFamily: 'serif',
    },

    today: {
      marginTop: 2,
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

    continueCard: {
      padding:
        spacing.lg,
      marginBottom:
        spacing.xl,
      borderRadius:
        radius.lg,
      backgroundColor:
        colors.surfaceMuted,
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
    },

    continueTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom:
        spacing.sm,
    },

    continueEyebrow: {
      flex: 1,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      color:
        colors.accent,
    },

    continueArrow: {
      fontSize: 30,
      lineHeight: 30,
      color:
        colors.accent,
    },

    continueTitle: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    continueMeta: {
      marginTop:
        spacing.xs,
      fontSize: 14,
      lineHeight: 21,
      color:
        colors.textSecondary,
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
      opacity: 0.7,
      transform: [
        {
          scale: 0.985,
        },
      ],
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

    footer: {
      alignItems: 'center',
      paddingTop:
        spacing.sm,
    },

    footerCross: {
      fontSize: 20,
      color:
        colors.textMuted,
    },

    footerText: {
      marginTop:
        spacing.xs,
      fontSize: 12,
      color:
        colors.textMuted,
    },
  });
