import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {LinearGradient} from 'expo-linear-gradient';
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
import {getWidgetInfo, requestPinWidget, requestWidgetUpdate,} from 'react-native-android-widget';

import {getDailyQuote} from '../services/dailyQuote';
import {QuoteOfDayWidget} from '../widgets/QuoteOfDayWidget';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {BottomNav} from '../components/navigation/BottomNav';
import {CategoryIcon} from '../components/icons/CategoryIcon';
import {homeArtwork} from '../data/homeArtwork';
import {contentApi as api} from '../services/contentApi';
import {bibleContent} from '../services/bibleContent';
import {deleteReadingProgress, getReadingProgress} from '../services/readingProgress';
import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';
import {colors, spacing} from '../theme';

const CATEGORY_ICONS = {
  morning: 'morning',
  evening: 'evening',
  akathists: 'akathists',
  canons: 'canons',
  communion: 'communion',
  psalter: 'psalter',
};

const resolveCategoryIcon = (...values) => {
  const value = values
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (value.includes('utren') || value.includes('утрен')) {
    return CATEGORY_ICONS.morning;
  }

  if (
    value.includes('vechern') ||
    value.includes('son-griad') ||
    value.includes('вечер') ||
    value.includes('сон грядущ')
  ) {
    return CATEGORY_ICONS.evening;
  }

  if (
    value.includes('akath') ||
    value.includes('akaf') ||
    value.includes('акаф')
  ) {
    return CATEGORY_ICONS.akathists;
  }

  if (
    value.includes('canon') ||
    value.includes('kanon') ||
    value.includes('канон')
  ) {
    return CATEGORY_ICONS.canons;
  }

  if (
    value.includes('communion') ||
    value.includes('prichast') ||
    value.includes('причащ')
  ) {
    return CATEGORY_ICONS.communion;
  }

  if (value.includes('psalt') || value.includes('псалт')) {
    return CATEGORY_ICONS.psalter;
  }

  return null;
};

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

const DecorativeCard = ({title, subtitle, symbol, iconSource, artwork, onPress}) => (
  <Pressable
    onPress={onPress}
    style={({pressed}) => [styles.libraryCard, pressed && styles.pressed]}
  >
    <ImageBackground
      source={artwork}
      resizeMode="cover"
      style={styles.libraryArtwork}
      imageStyle={styles.libraryArtworkImage}
    />

    <LinearGradient
      pointerEvents="none"
      colors={[
        '#FFF2DB',
        'rgba(255, 242, 219, 0.98)',
        'rgba(255, 242, 219, 0.82)',
        'rgba(255, 242, 219, 0.48)',
        'rgba(255, 242, 219, 0.16)',
        'rgba(255, 242, 219, 0)',
      ]}
      locations={[0, 0.18, 0.4, 0.62, 0.82, 1]}
      start={{x: 0, y: 0.5}}
      end={{x: 1, y: 0.5}}
      style={styles.libraryImageFade}
    />
    <LinearGradient
      pointerEvents="none"
      colors={[
        'rgba(255, 242, 219, 0)',
        'rgba(255, 242, 219, 0.45)',
        'rgba(255, 242, 219, 0.82)',
        '#FFF2DB',
      ]}
      locations={[0, 0.35, 0.7, 1]}
      start={{x: 0, y: 0.5}}
      end={{x: 1, y: 0.5}}
      style={styles.libraryRightFade}
    />

    <View style={styles.libraryIcon}>
      {iconSource ? (
        <CategoryIcon type={iconSource} />
      ) : (
        <Text style={styles.libraryIconText}>{symbol}</Text>
      )}
    </View>

    <View style={styles.libraryText}>
      <Text style={styles.libraryTitle} numberOfLines={2}>
        {title}
      </Text>

      {!!subtitle && (
        <Text style={styles.librarySubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      )}
    </View>

    <View style={styles.libraryChevron}>
      <Text style={styles.libraryChevronText}>›</Text>
    </View>
  </Pressable>
);

export const MenuScreen = ({navigation}) => {
  const [categories, setCategories] = useState([]);
  const [akathists, setAkathists] = useState([]);
  const [canons, setCanons] = useState([]);
  const [prayerRules, setPrayerRules] = useState([]);
  const [readingProgress, setReadingProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyQuote, setDailyQuote] = useState(null);
  const [savedDailyQuote, setSavedDailyQuote] = useState(null);
  const [error, setError] = useState(null);

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const loadLibrary = useCallback(async () => {
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
        api.get('prayer-rules/'),
        api.get('daily-quotes/today/'),
      ]);

      const sortedCategories = [...categoriesResponse.data].sort(
        (a, b) => Number(a.order || 0) - Number(b.order || 0)
      );

      setCategories(sortedCategories);
      setAkathists(akathistsResponse.data);
      setCanons(canonsResponse.data);
      setPrayerRules(prayerRulesResponse.data);

      const quote =
        quoteResponse.data;

      setDailyQuote(
        quote
      );

      if (quote?.id) {
        const savedQuotes =
          await getSavedItems({
            source_type:
              'daily_quote',
            source_id:
              quote.id,
            anchor_type:
              'daily_quote',
            anchor_id:
              quote.id,
            save_type:
              'quote',
          });

        setSavedDailyQuote(
          savedQuotes[0] ||
          null
        );
      } else {
        setSavedDailyQuote(
          null
        );
      }

      setError(null);
    } catch (err) {
      console.log('Ошибка загрузки библиотеки:', err);
      setError('Не удалось загрузить библиотеку');
    }
  }, []);

  const loadProgress = useCallback(async () => {
    try {
      const progressList = await getReadingProgress();
      setReadingProgress(progressList);
    } catch (err) {
      console.log('Ошибка загрузки прогресса:', err);
    }
  }, []);

  const updateQuoteWidget = useCallback(async () => {
    try {
      const quote = getDailyQuote();

      await requestWidgetUpdate({
        widgetName: 'QuoteOfDay',

        renderWidget: widgetInfo => (
          <QuoteOfDayWidget
            quote={quote}
            width={widgetInfo.width}
            height={widgetInfo.height}
          />
        ),
      });
    } catch (err) {
      console.log('Ошибка обновления виджета цитаты:', err);
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

        await updateQuoteWidget();
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [
    loadLibrary,
    loadProgress,
    updateQuoteWidget,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadProgress();

      if (dailyQuote?.id) {
        getSavedItems({
          source_type:
            'daily_quote',
          source_id:
            dailyQuote.id,
          anchor_type:
            'daily_quote',
          anchor_id:
            dailyQuote.id,
          save_type:
            'quote',
        })
          .then(
            saved =>
              setSavedDailyQuote(
                saved[0] ||
                null
              )
          )
          .catch(
            err =>
              console.log(
                'Ошибка загрузки сохранённой цитаты:',
                err
              )
          );
      }
    }, [
      loadProgress,
      dailyQuote?.id,
    ])
  );

  const rootCategories = useMemo(
    () => categories.filter(category => !category.parent),
    [categories]
  );

  const libraryCategories = useMemo(
    () =>
      rootCategories.filter(
        category =>
          ![
            'utrennie-molitvy',
            'molitvy-na-son-griadushchim',
            'psaltir',
            'akafisty',
          ].includes(category.slug)
      ),
    [rootCategories]
  );

  const getSubcategories = category =>
    categories.filter(item => item.parent === category.id);

  const openCategory = category => {
    if (category.slug === 'psaltir') {
      navigation.navigate('Psalter');
      return;
    }

    const subcategories = getSubcategories(category);
    if (subcategories.length > 0) {
      navigation.navigate('CategoryMenu', {parentCategory: category, subcategories});
      return;
    }
    navigation.navigate('Book', {
      categoryId: category.id,
      categorySlug: category.slug,
      categoryName: category.name,
    });
  };

  const makeReadingItem = progress => {
    if (progress.source_type === 'bible') {
      const info = progress.anchor_info || {};
      const book = bibleContent.getBook(progress.source_id);

      if (!book) return null;

      const chapterNumber = Number(info.chapter_number || 1);
      const verseNumber = info.verse_number
        ? Number(info.verse_number)
        : null;

      return {
        id: progress.id,
        type: 'Библия',
        symbol: '☷',
        title: book.short_name || book.name,
        position: verseNumber
          ? 'Глава ' + chapterNumber + ' · стих ' + verseNumber
          : 'Глава ' + chapterNumber,
        onPress: () =>
          navigation.navigate('BibleChapter', {
            bookId: book.id,
            chapterNumber,
          }),
      };
    }

    if (progress.source_type === 'psalter') {
      const info = progress.anchor_info;

      return {
        id: progress.id,
        type: 'Псалтирь',
        symbol: '¶',
        iconSource: CATEGORY_ICONS.psalter,
        title: 'Псалтирь',
        position: info
          ? info.verse_number
            ? `Кафизма ${info.kathisma_number} · Псалом ${info.psalm_number} · стих ${info.verse_number}`
            : `Кафизма ${info.kathisma_number} · Псалом ${info.psalm_number}`
          : 'Продолжить с сохранённого места',
        onPress: () => navigation.navigate('Psalter'),
      };
    }

    if (progress.source_type === 'akathist') {
      const akathist = akathists.find(item => Number(item.id) === Number(progress.source_id));
      if (!akathist) return null;

      const section = akathist.sections?.find(
        item => Number(item.id) === Number(progress.anchor_id)
      );
      let position = 'Продолжить акафист';

      if (section) {
        const names = {kontakion: 'Кондак', ikos: 'Икос', prayer: 'Молитва'};
        position = `${names[section.section_type] || 'Раздел'}${
          section.number ? ` ${section.number}` : ''
        }`;
      }

      return {
        id: progress.id,
        type: 'Акафист',
        symbol: '☦',
        iconSource: CATEGORY_ICONS.akathists,
        title: akathist.title,
        position,
        onPress: () =>
          navigation.navigate('Akathist', {
            akathistId: akathist.id,
            slug: akathist.slug,
            title: akathist.title,
          }),
      };
    }

    if (progress.source_type === 'canon') {
      const canon = canons.find(item => Number(item.id) === Number(progress.source_id));
      if (!canon) return null;

      const info = progress.anchor_info;
      let position = 'Продолжить канон';

      if (info) {
        const parts = [];
        if (info.ode_number) parts.push(`Песнь ${info.ode_number}`);
        if (info.heading) {
          parts.push(info.heading);
        } else if (info.section_type_display) {
          parts.push(info.section_type_display);
        }
        if (parts.length) position = parts.join(' · ');
      }

      return {
        id: progress.id,
        type: 'Канон',
        symbol: '☦',
        iconSource: CATEGORY_ICONS.canons,
        title: canon.title,
        position,
        onPress: () =>
          navigation.navigate('Canon', {
            canonId: canon.id,
            slug: canon.slug,
            title: canon.title,
          }),
      };
    }

    if (progress.source_type === 'prayer_rule') {
      const rule = prayerRules.find(item => Number(item.id) === Number(progress.source_id));
      if (!rule) return null;

      const ruleItem = rule.items?.find(
        item => Number(item.id) === Number(progress.anchor_id)
      );
      const position = ruleItem?.text?.title || ruleItem?.title || 'Продолжить правило';

      return {
        id: progress.id,
        type: 'Молитвенное правило',
        symbol: '✦',
        iconSource:
          resolveCategoryIcon(
            rule.slug,
            rule.name
          ) || CATEGORY_ICONS.canons,
        title: rule.name,
        position,
        onPress: () => navigation.navigate('PrayerRule', {slug: rule.slug}),
      };
    }

    if (progress.source_type === 'category') {
      const category = categories.find(item => Number(item.id) === Number(progress.source_id));
      if (!category) return null;

      return {
        id: progress.id,
        type: 'Молитвы',
        symbol: '†',
        iconSource:
          resolveCategoryIcon(
            category.slug,
            category.name
          ) || CATEGORY_ICONS.canons,
        title: category.name,
        position: 'Продолжить с сохранённого места',
        onPress: () =>
          navigation.navigate('Book', {
            categoryId: category.id,
            categorySlug: category.slug,
            categoryName: category.name,
          }),
      };
    }

    return null;
  };

  const activeReadings = useMemo(
    () =>
      readingProgress
        .map(progress => {
          const item = makeReadingItem(progress);
          if (!item) return null;

          return {...item, progress: Number(progress.progress_percent || 0)};
        })
        .filter(Boolean),
    [readingProgress, categories, akathists, canons, prayerRules]
  );

  const finishReading = async progressId => {
    try {
      await deleteReadingProgress(progressId);
      setReadingProgress(current => current.filter(item => item.id !== progressId));
    } catch (err) {
      console.log('Ошибка завершения чтения:', err);
    }
  };

  const latestReading = activeReadings[0] || null;

  const toggleDailyQuoteSaved =
    async () => {
      if (
        !dailyQuote?.id ||
        !dailyQuote?.text
      ) {
        return;
      }

      try {
        if (savedDailyQuote) {
          await deleteSavedItem(
            savedDailyQuote.id
          );

          setSavedDailyQuote(
            null
          );

          return;
        }

        const saved =
          await saveItem({
            save_type:
              'quote',
            source_type:
              'daily_quote',
            source_id:
              Number(
                dailyQuote.id
              ),
            anchor_type:
              'daily_quote',
            anchor_id:
              Number(
                dailyQuote.id
              ),
            source_title:
              'Цитата дня',
            item_title:
              dailyQuote.reference ||
              dailyQuote.source ||
              'Цитата дня',
            text:
              dailyQuote.text,
            start_offset:
              0,
            end_offset:
              dailyQuote.text.length,
            metadata: {
              source:
                dailyQuote.source ||
                '',
              reference:
                dailyQuote.reference ||
                '',
              quote_date:
                dailyQuote.quote_date ||
                dailyQuote.date ||
                '',
            },
          });

        setSavedDailyQuote(
          saved
        );
      } catch (err) {
        console.log(
          'Ошибка сохранения цитаты:',
          err
        );

        Alert.alert(
          'Не удалось сохранить цитату',
          err.message ||
          'Попробуйте ещё раз.'
        );
      }
    };

  const showWidgetInfo = async () => {
    try {
      const widgets = await getWidgetInfo('QuoteOfDay');

      if (widgets.length > 0) {
        Alert.alert(
          'Виджет уже добавлен',
          'На главном экране уже установлен виджет «Цитата дня».'
        );
        return;
      }

      const requested = await requestPinWidget({
        widgetName: 'QuoteOfDay',
      });

      if (!requested) {
        Alert.alert(
          'Добавление виджета',
          'Зажмите свободное место на главном экране телефона, ' +
          'откройте «Виджеты» → «Молитвослов» → «Цитата дня».'
        );
      }
    } catch (err) {
      console.log('Ошибка добавления виджета:', err);

      Alert.alert(
        'Не удалось добавить виджет',
        'Попробуйте добавить его через меню виджетов Android.'
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <StatusBar
          style="light"
          translucent
          backgroundColor="transparent"
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Загрузка молитвослова...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <StatusBar  style="light"
                  translucent
                  backgroundColor="transparent"/>

      <View style={styles.screen}>
        <ImageBackground
          source={homeArtwork.page_bg}
          style={styles.pageBackground}
          imageStyle={styles.pageBackgroundImage}
          resizeMode="cover"
        >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              // paddingTop: headerHeight + 20,
              paddingBottom: 80 + insets.bottom,
            }
          ]}
        >
          <ImageBackground
            source={homeArtwork.hero_biblical}
            resizeMode="cover"
            style={styles.hero}
            imageStyle={styles.heroImage}
          >
            {/*<View style={styles.heroWash} />*/}

            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(45, 27, 16, 0.42)',
                'rgba(45, 27, 16, 0.16)',
                'rgba(45, 27, 16, 0)',
              ]}
              locations={[0, 0.55, 1]}
              style={styles.heroTopGradient}
            />
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(183, 138, 88, 0)',
                'rgba(183, 138, 88, 0.08)',
                'rgba(183, 138, 88, 0.22)',
                'rgba(183, 138, 88, 0.5)',
                'rgba(183, 138, 88, 0.82)',
              ]}
              locations={[0, 0.32, 0.56, 0.78, 1]}
              style={styles.heroBottomGradient}
            />

            <View style={styles.heroOrnament}>
              <Text style={styles.heroCross}>☦</Text>
              <Text style={styles.heroFlourish}>─── ✦ ───</Text>
            </View>
            <Text style={styles.brandTitle}>Молитвослов</Text>
            <Text style={styles.today}>{formatToday()}</Text>
            <Text style={styles.heroDivider}>─────  ✥  ─────</Text>
          </ImageBackground>

          <View style={styles.pageBody}>
            <View style={styles.quoteCard}>
              <ImageBackground
                source={homeArtwork.quote}
                resizeMode="cover"
                style={styles.quoteArtwork}
                imageStyle={styles.quoteArtworkImage}
              />
              {/*<View pointerEvents="none" style={styles.quoteFade1} />*/}
              {/*<View pointerEvents="none" style={styles.quoteFade2} />*/}
              {/*<View pointerEvents="none" style={styles.quoteFade3} />*/}

              <View style={styles.quoteContent}>
                <View style={styles.quoteHeader}>
                  <View style={styles.quoteHeadingWrap}>
                    <Text style={styles.quoteFeather}>🪶</Text>
                    <Text style={styles.quoteLabel}>Цитата дня</Text>
                  </View>

                  <View
                    style={
                      styles.quoteActions
                    }
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        savedDailyQuote
                          ? 'Убрать цитату из избранного'
                          : 'Добавить цитату в избранное'
                      }
                      hitSlop={8}
                      onPress={
                        toggleDailyQuoteSaved
                      }
                      style={({pressed}) => [
                        styles.quoteSaveButton,
                        savedDailyQuote &&
                          styles.quoteSaveButtonActive,
                        pressed &&
                          styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.quoteSaveIcon,
                          savedDailyQuote &&
                            styles.quoteSaveIconActive,
                        ]}
                      >
                        {
                          savedDailyQuote
                            ? '★'
                            : '☆'
                        }
                      </Text>
                    </Pressable>

                    <Pressable
                      hitSlop={8}
                      onPress={showWidgetInfo}
                      style={({pressed}) => [styles.widgetButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.widgetPhone}>📱</Text>
                      <Text style={styles.widgetText}>На экран</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.quoteRule}>
                  <View style={styles.quoteRuleLine} />
                  <Text style={styles.quoteRuleMark}>✦</Text>
                  <View style={styles.quoteRuleLine} />
                </View>

                <Text style={styles.quoteText}>
                  {dailyQuote?.text ||
                    'Молитва и духовное чтение помогают хранить внимание сердца.'}
                </Text>

                {!!(dailyQuote?.reference || dailyQuote?.source) && (
                  <Text style={styles.quoteSource}>
                    {dailyQuote?.reference || dailyQuote?.source}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.readingCard}>
              <View style={styles.readingHeader}>
                <View style={styles.readingHeadingWrap}>
                  <Text style={styles.readingBook}>▤</Text>
                  <Text style={styles.readingSectionTitle}>Продолжить чтение</Text>
                </View>

                {!!activeReadings.length && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => navigation.navigate('ContinueReading')}
                    style={({pressed}) => [styles.openReadings, pressed && styles.pressed]}
                  >
                    <Text style={styles.openReadingsText}>Открыть</Text>
                    <Text style={styles.openReadingsArrow}>›</Text>
                  </Pressable>
                )}
              </View>

              {latestReading ? (
                <View style={styles.latestReading}>
                  <Pressable
                    onPress={latestReading.onPress}
                    style={({pressed}) => [
                      styles.latestReadingMain,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.readingCategoryIcon}>
                      {latestReading.iconSource ? (
                        <CategoryIcon type={latestReading.iconSource} />
                      ) : (
                        <Text style={styles.readingCategoryGlyph}>
                          {latestReading.symbol || '✦'}
                        </Text>
                      )}
                    </View>

                    <View style={styles.latestReadingText}>
                      <Text style={styles.latestReadingTitle} numberOfLines={2}>
                        {latestReading.title}
                      </Text>

                      <View style={styles.latestProgressRow}>
                        <View style={styles.latestProgressTrack}>
                          <View
                            style={[
                              styles.latestProgressFill,
                              {
                                width: `${Math.max(
                                  0,
                                  Math.min(latestReading.progress, 100)
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.latestProgressPercent}>{latestReading.progress}%</Text>
                      </View>

                      <Text style={styles.latestReadingPosition} numberOfLines={2}>
                        {latestReading.position}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    hitSlop={8}
                    onPress={() => finishReading(latestReading.id)}
                    style={({pressed}) => [styles.latestRemove, pressed && styles.pressed]}
                  >
                    <Text style={styles.latestRemoveText}>×</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.emptyReading}>
                  <Text style={styles.emptyReadingTitle}>Здесь появится последнее чтение</Text>
                  <Text style={styles.emptyReadingText}>
                    Откройте молитву, акафист, канон, Псалтирь или Библию — место сохранится автоматически.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.libraryList}>
              <DecorativeCard
                title="Утренние молитвы"
                subtitle="Начните день с Богом"
                symbol="☀"
                iconSource={CATEGORY_ICONS.morning}
                artwork={homeArtwork.morning}
                onPress={() => navigation.navigate('PrayerRule', {slug: 'molitvy-utrennie'})}
              />
              <DecorativeCard
                title="Вечерние молитвы"
                subtitle="Завершите день в молитве"
                symbol="☾"
                iconSource={CATEGORY_ICONS.evening}
                artwork={homeArtwork.evening}
                onPress={() =>
                  navigation.navigate('PrayerRule', {slug: 'molitvy-na-son-griadushchim'})
                }
              />
              <DecorativeCard
                title="Акафисты"
                subtitle="Молитвенные хвалебные песнопения"
                symbol="☦"
                iconSource={CATEGORY_ICONS.akathists}
                artwork={homeArtwork.akathists}
                onPress={() => navigation.navigate('AkathistList')}
              />
              <DecorativeCard
                title="Каноны"
                subtitle="Покаянные и просительные каноны"
                symbol="▤"
                iconSource={CATEGORY_ICONS.canons}
                artwork={homeArtwork.canons}
                onPress={() => navigation.navigate('CanonList')}
              />
              <DecorativeCard
                title="Ко Святому Причащению"
                subtitle="Подготовительные молитвы"
                symbol="♱"
                iconSource={CATEGORY_ICONS.communion}
                artwork={homeArtwork.communion}
                onPress={() => navigation.navigate('CommunionPreparation')}
              />
              <DecorativeCard
                title="Псалтирь"
                subtitle="Книга молитвы и духовного утешения"
                symbol="¶"
                iconSource={CATEGORY_ICONS.psalter}
                artwork={homeArtwork.psalter}
                onPress={() => navigation.navigate('Psalter')}
              />
              <DecorativeCard
                title="Библия"
                subtitle="Ветхий и Новый Завет"
                symbol="☷"
                artwork={homeArtwork.hero_biblical}
                onPress={() => navigation.navigate('Bible')}
              />
            </View>

            {!!libraryCategories.length && (
              <View style={styles.extraSection}>
                <View style={styles.extraHeader}>
                  <Text style={styles.extraTitle}>Другие разделы</Text>
                  <Text style={styles.extraOrnament}>✦</Text>
                </View>

                {libraryCategories.map(category => (
                  <Pressable
                    key={category.id}
                    onPress={() => openCategory(category)}
                    style={({pressed}) => [styles.extraCard, pressed && styles.pressed]}
                  >
                    <View>
                      <Text style={styles.extraCardTitle}>{category.name}</Text>
                      <Text style={styles.extraCardSubtitle}>
                        {getSubcategories(category).length > 0
                          ? `${getSubcategories(category).length} разделов`
                          : 'Открыть'}
                      </Text>
                    </View>
                    <Text style={styles.extraArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {!!error && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>
        </ScrollView>
          <BottomNav navigation={navigation} active="home" />
        </ImageBackground>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#B78A58',
  },
  screen: {
    flex: 1,
    backgroundColor: '#B78A58',
  },
  content: {
    paddingBottom: 16,

    backgroundColor: 'transparent',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7ECD8',
  },
  pageBackground: {
    flex: 1,
  },
  pageBackgroundImage: {
    opacity: 0.32,
  },
  loadingText: {
    marginTop: spacing.md,
    color: '#6B5038',
    fontSize: 15,
  },
  hero: {
    height: 270,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 38,
    paddingHorizontal: 22,
    overflow: 'hidden',
    backgroundColor: '#B78A58',
  },
  heroImage: {
    opacity: 1,
  },
  // heroWash: {
  //   ...StyleSheet.absoluteFillObject,
  //   backgroundColor: 'rgba(255, 235, 205, 0.02)',
  // },

  heroTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  heroBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  heroOrnament: {
    alignItems: 'center',
    marginBottom: 0,
  },
  heroCross: {
    color: '#774923',
    fontSize: 25,
    lineHeight: 28,
    textShadowColor: 'rgba(255,255,255,0.65)',
    textShadowRadius: 4,
  },
  heroFlourish: {
    marginTop: -3,
    color: '#8B5A2D',
    fontSize: 11,
    letterSpacing: 1,
  },
  brandTitle: {
    marginTop: 1,
    color: '#432515',
    fontFamily: 'serif',
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(255, 245, 220, 0.85)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
    zIndex: 3,
  },
  today: {
    marginTop: -1,
    color: '#3F2A1E',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'capitalize',
    textShadowColor: 'rgba(255, 245, 220, 0.85)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
    zIndex: 3,
  },
  heroDivider: {
    marginTop: 7,
    color: '#8D5D2E',
    fontSize: 10,
    letterSpacing: 1,
  },
  pageBody: {
    marginTop: -82,
    paddingHorizontal: 10,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
    quoteCard: {
      position: 'relative',
      minHeight: 148,
      padding: 10,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: '#FFF4DE',
      borderWidth: 1,
      borderColor: 'rgba(123, 79, 36, 0.22)',
      shadowColor: '#4A2817',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.14,
      shadowRadius: 9,
      elevation: 3,
    },
  quoteArtwork: {
    position: 'absolute',
    top: 0,
    right:10,
    bottom: 0,
    width: '120%',
  },
  quoteArtworkImage: {
    opacity: 0.45,
    borderTopRightRadius: 17,
    borderBottomRightRadius: 17,
  },

  quoteContent: {
    position: 'relative',
    zIndex: 2,
  },
  quoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  quoteHeadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  quoteFeather: {
    marginRight: 7,
    fontSize: 17,
    lineHeight: 21,
  },
  quoteLabel: {
    color: '#7A4F2D',
    fontFamily: 'serif',
    fontSize: 19,
    fontWeight: '700',
  },
  quoteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quoteSaveButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(126, 78, 34, 0.32)',
    borderRadius: 17,
    backgroundColor: 'rgba(248, 233, 207, 0.88)',
  },
  quoteSaveButtonActive: {
    backgroundColor: '#EED9B8',
    borderColor: 'rgba(126, 78, 34, 0.46)',
  },
  quoteSaveIcon: {
    color: '#9A8068',
    fontSize: 21,
    lineHeight: 22,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  quoteSaveIconActive: {
    color: '#7A4F2D',
  },
  widgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: 'rgba(126, 78, 34, 0.32)',
    borderRadius: 17,
    backgroundColor: 'rgba(248, 233, 207, 0.88)',
  },
  widgetPhone: {
    marginRight: 5,
    fontSize: 13,
    lineHeight: 16,
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
    width: 170,
    marginTop: 5,
    marginBottom: 8,
  },
  quoteRuleLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(146, 98, 47, 0.32)',
  },
  quoteRuleMark: {
    marginHorizontal: 7,
    color: '#A87943',
    fontSize: 9,
  },
  quoteText: {
    maxWidth: '82%',
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '500',
  },
  quoteSource: {
    marginTop: 11,
    color: '#1f0f0f',
    fontFamily: 'serif',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  readingCard: {
    marginTop: 11,
    padding: 13,
    borderRadius: 18,
    backgroundColor: '#5A341D',
    borderWidth: 1,
    borderColor: '#B98545',
    shadowColor: '#3B1D0F',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  readingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F5E2C4',
    overflow: 'hidden',
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
    backgroundColor: 'rgba(244, 222, 177, 0.20)',
  },
  latestProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#E5C583',
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
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(242, 217, 164, 0.35)',
    backgroundColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: '#FFF2DB',
    borderWidth: 1,
    borderColor: 'rgba(112, 67, 30, 0.25)',
    shadowColor: '#4A2817',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.12,
    shadowRadius: 7,
    elevation: 2,
  },
  libraryArtwork: {
    position: 'absolute',
    top: 0,
    right: -30,
    bottom: 0,
    width: '90%',

  },
  libraryArtworkImage: {
    opacity: 0.98,
    // borderTopRightRadius: 16,
    // borderBottomRightRadius: 16,

  },
  libraryImageFade: {
    position: 'absolute',
    top: 0,
    right: '10%',
    bottom: 0,
    left: '10%',
  },
  libraryIcon: {
    zIndex: 3,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F5E2C4',
    overflow: 'hidden',
  },
  libraryRightFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '24%',
    zIndex: 2,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
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
    maxWidth: '60%',
    marginLeft: 11,
    paddingRight: 4,
  },
  libraryTitle: {
    color: '#332116',
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
    textShadowColor: 'rgba(255, 248, 232, 0.95)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  librarySubtitle: {
    marginTop: 2,
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
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(255, 250, 242, 0.92)',
    shadowColor: '#5A321B',
    shadowOffset: {width: 0, height: 1},
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
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: '#F8E9CF',
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.17)',
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
    backgroundColor: '#F5D9CF',
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
