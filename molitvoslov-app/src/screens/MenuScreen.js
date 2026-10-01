import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {LinearGradient} from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {getWidgetInfo, requestPinWidget, requestWidgetUpdate} from 'react-native-android-widget';

import {getDailyQuote} from '../services/dailyQuote';
import {QuoteOfDayWidget} from '../widgets/QuoteOfDayWidget';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {BottomNav} from '../components/navigation/BottomNav';
import {CategoryIcon} from '../components/icons/CategoryIcon';
import {SaveHeartIcon} from '../components/icons/SaveHeartIcon';
import {homeArtwork} from '../data/homeArtwork';
import {contentApi as api} from '../services/contentApi';
import {bibleContent} from '../services/bibleContent';
import {deleteReadingProgress, getReadingProgress} from '../services/readingProgress';
import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';
import {
  formatFast,
  getCalendarDay,
  openCalendarBibleReference,
  resolveBibleReference,
  toCalendarDate,
} from '../services/churchCalendar';
import {
  CALENDAR_MONTHS,
  calendarText,
  getCalendarLanguage,
  setCalendarLanguage,
} from '../services/calendarPreferences';
import {ChurchCalendarWidget} from '../widgets/ChurchCalendarWidget';
import {colors, spacing} from '../theme';

const CATEGORY_ICONS = {
  morning: 'morning',
  evening: 'evening',
  akathists: 'akathists',
  canons: 'canons',
  communion: 'communion',
  psalter: 'psalter',
  misc: 'canons',
  bible: 'bible',
};

const resolveCategoryIcon = (...values) => {
  const value = values.filter(Boolean).join(' ').toLowerCase();

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

  if (value.includes('akath') || value.includes('akaf') || value.includes('акаф')) {
    return CATEGORY_ICONS.akathists;
  }

  if (value.includes('canon') || value.includes('kanon') || value.includes('канон')) {
    return CATEGORY_ICONS.canons;
  }

  if (value.includes('communion') || value.includes('prichast') || value.includes('причащ')) {
    return CATEGORY_ICONS.communion;
  }

  if (value.includes('psalt') || value.includes('псалт')) {
    return CATEGORY_ICONS.psalter;
  }
  if (value.includes('bible') || value.includes('bibli') || value.includes('библи')) {
    return CATEGORY_ICONS.bible;
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
const createCalendarSnapshot = (
  visibleDate = new Date(),
  selectedDate = visibleDate,
  language = 'ru'
) => {
  const locale = CALENDAR_MONTHS[language === 'uk' ? 'uk' : 'ru'];
  const year = visibleDate.getFullYear();
  const month = visibleDate.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();
  const visibleCellCount = firstWeekday + daysInMonth <= 35 ? 35 : 42;
  const selectedKey = toCalendarDate(selectedDate);
  const todayKey = toCalendarDate(new Date());

  const cells = Array.from({length: visibleCellCount}, (_item, index) => {
    const rawDay = index - firstWeekday + 1;
    let cellYear = year;
    let cellMonth = month;
    let cellDay = rawDay;
    let outside = false;

    if (rawDay < 1) {
      cellMonth -= 1;
      cellDay = daysInPreviousMonth + rawDay;
      outside = true;
    } else if (rawDay > daysInMonth) {
      cellMonth += 1;
      cellDay = rawDay - daysInMonth;
      outside = true;
    }

    if (cellMonth < 0) {
      cellMonth = 11;
      cellYear -= 1;
    } else if (cellMonth > 11) {
      cellMonth = 0;
      cellYear += 1;
    }

    const cellDate = new Date(cellYear, cellMonth, cellDay);
    const dateKey = toCalendarDate(cellDate);

    return {
      day: cellDay,
      month: cellMonth + 1,
      year: cellYear,
      date: dateKey,
      outside,
      today: dateKey === todayKey,
      selected: dateKey === selectedKey,
    };
  });

  return {
    year,
    month,
    monthTitle: `${locale.nominative[month]} ${year}`,
    dayTitle: `${selectedDate.getDate()} ${locale.genitive[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`,
    weekday: locale.weekdays[selectedDate.getDay()],
    miniWeekdays: locale.miniWeekdays,
    isSelectedToday: selectedKey === todayKey,
    cells,
  };
};

const CalendarGlyph = () => (
  <View style={styles.calendarGlyph}>
    <View style={styles.calendarGlyphRingLeft} />
    <View style={styles.calendarGlyphRingRight} />
    <View style={styles.calendarGlyphTopLine} />
    <View style={styles.calendarGlyphRow}>
      <View style={styles.calendarGlyphCell} />
      <View style={styles.calendarGlyphCell} />
      <View style={styles.calendarGlyphCell} />
    </View>
    <View style={styles.calendarGlyphRow}>
      <View style={styles.calendarGlyphCell} />
      <View style={styles.calendarGlyphCell} />
      <View style={styles.calendarGlyphCell} />
    </View>
  </View>
);

const SearchGlyph = () => (
  <View style={styles.searchGlyph}>
    <View style={styles.searchGlyphHandle} />
  </View>
);

const BellGlyph = () => (
  <View style={styles.bellGlyph}>
    <View style={styles.bellGlyphBody} />
    <View style={styles.bellGlyphBase} />
    <View style={styles.bellGlyphClapper} />
  </View>
);

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
  const [calendarToday, setCalendarToday] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarLanguage, setCalendarLanguageState] = useState('ru');
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => new Date());
  const [calendarVisibleMonth, setCalendarVisibleMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [error, setError] = useState(null);

  const insets = useSafeAreaInsets();
  const calendarSnapshot = useMemo(
    () => createCalendarSnapshot(calendarVisibleMonth, calendarSelectedDate, calendarLanguage),
    [calendarVisibleMonth, calendarSelectedDate, calendarLanguage]
  );
  const calendarCopy = useMemo(() => calendarText(calendarLanguage), [calendarLanguage]);
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

      const quote = quoteResponse.data;

      setDailyQuote(quote);

      if (quote?.id) {
        const savedQuotes = await getSavedItems({
          source_type: 'daily_quote',
          source_id: quote.id,
          anchor_type: 'daily_quote',
          anchor_id: quote.id,
          save_type: 'quote',
        });

        setSavedDailyQuote(savedQuotes[0] || null);
      } else {
        setSavedDailyQuote(null);
      }

      setError(null);
    } catch (err) {
      console.log('Ошибка загрузки библиотеки:', err);
      setError('Не удалось загрузить библиотеку');
    }
  }, []);

  const loadCalendarDay = useCallback(
    async (targetDate) => {
      try {
        setCalendarLoading(true);
        const day = await getCalendarDay(targetDate, {
          language: calendarLanguage,
          force: true,
        });
        setCalendarToday(day);
      } catch (err) {
        console.log('Ошибка загрузки церковного календаря:', err?.message || err);
      } finally {
        setCalendarLoading(false);
      }
    },
    [calendarLanguage]
  );

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

        renderWidget: (widgetInfo) => (
          <QuoteOfDayWidget quote={quote} width={widgetInfo.width} height={widgetInfo.height} />
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

        await Promise.all([loadLibrary(), loadProgress()]);

        await updateQuoteWidget();
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [loadLibrary, loadProgress, updateQuoteWidget]);

  useEffect(() => {
    getCalendarLanguage()
      .then((language) => setCalendarLanguageState(language))
      .catch(() => setCalendarLanguageState('ru'));
  }, []);

  useEffect(() => {
    loadCalendarDay(calendarSelectedDate);
  }, [calendarSelectedDate, loadCalendarDay]);

  useFocusEffect(
    useCallback(() => {
      loadProgress();

      getCalendarLanguage()
        .then((language) => {
          if (language !== calendarLanguage) {
            setCalendarLanguageState(language);
          }
        })
        .catch(() => {});

      if (dailyQuote?.id) {
        getSavedItems({
          source_type: 'daily_quote',
          source_id: dailyQuote.id,
          anchor_type: 'daily_quote',
          anchor_id: dailyQuote.id,
          save_type: 'quote',
        })
          .then((saved) => setSavedDailyQuote(saved[0] || null))
          .catch((err) => console.log('Ошибка загрузки сохранённой цитаты:', err));
      }
    }, [loadProgress, dailyQuote?.id, updateQuoteWidget, calendarLanguage])
  );

  const updateCalendarWidget = useCallback(
    async (day = calendarToday, language = calendarLanguage) => {
      try {
        await requestWidgetUpdate({
          widgetName: 'ChurchCalendar',
          renderWidget: (widgetInfo) => (
            <ChurchCalendarWidget
              day={day}
              language={language}
              width={widgetInfo.width}
              height={widgetInfo.height}
            />
          ),
        });
      } catch (error) {
        console.log('Ошибка обновления виджета календаря:', error?.message || error);
      }
    },
    [calendarToday, calendarLanguage]
  );

  const changeCalendarLanguage = async (language) => {
    const next = await setCalendarLanguage(language);
    setCalendarLanguageState(next);

    try {
      const day = await getCalendarDay(calendarSelectedDate, {
        language: next,
        force: true,
      });
      setCalendarToday(day);

      const todayKey = toCalendarDate(new Date());
      const selectedKey = toCalendarDate(calendarSelectedDate);
      const widgetDay =
        selectedKey === todayKey
          ? day
          : await getCalendarDay(new Date(), {
              language: next,
              force: true,
            });

      await updateCalendarWidget(widgetDay, next);
    } catch (error) {
      console.log('Ошибка смены языка календаря:', error?.message || error);
    }
  };

  const showCalendarWidgetInfo = async () => {
    try {
      const widgets = await getWidgetInfo('ChurchCalendar');

      if (widgets.length > 0) {
        Alert.alert(
          calendarCopy.widgetAlready,
          calendarLanguage === 'uk'
            ? 'На головному екрані вже встановлено віджет «Церковний календар».'
            : 'На главном экране уже установлен виджет «Церковный календарь».'
        );
        return;
      }

      const requested = await requestPinWidget({
        widgetName: 'ChurchCalendar',
      });

      if (!requested) {
        Alert.alert(
          calendarLanguage === 'uk' ? 'Додавання віджета' : 'Добавление виджета',
          calendarLanguage === 'uk'
            ? 'Затисніть вільне місце на головному екрані → «Віджети» → «Молитвослов» → «Церковний календар».'
            : 'Зажмите свободное место на главном экране → «Виджеты» → «Молитвослов» → «Церковный календарь».'
        );
      }
    } catch (error) {
      Alert.alert(
        calendarLanguage === 'uk' ? 'Не вдалося додати віджет' : 'Не удалось добавить виджет',
        calendarLanguage === 'uk'
          ? 'Спробуйте додати його через меню віджетів Android.'
          : 'Попробуйте добавить его через меню виджетов Android.'
      );
    }
  };

  const moveMiniCalendarMonth = (delta) => {
    setCalendarVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1)
    );
  };

  const selectMiniCalendarDate = (cell) => {
    const next = new Date(cell.year, cell.month - 1, cell.day);

    setCalendarSelectedDate(next);

    if (cell.outside) {
      setCalendarVisibleMonth(new Date(cell.year, cell.month - 1, 1));
    }
  };

  const openFullCalendar = () => {
    navigation.navigate('ChurchCalendar', {
      date: toCalendarDate(calendarSelectedDate),
    });
  };

  const rootCategories = useMemo(
    () => categories.filter((category) => !category.parent),
    [categories]
  );

  const libraryCategories = useMemo(
    () =>
      rootCategories.filter(
        (category) =>
          ![
            'utrennie-molitvy',
            'molitvy-na-son-griadushchim',
            'psaltir',
            'akafisty',
            'raznye-molitvy',
          ].includes(category.slug)
      ),
    [rootCategories]
  );

  const getSubcategories = (category) => categories.filter((item) => item.parent === category.id);

  const openCategory = (category) => {
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

  const makeReadingItem = (progress) => {
    if (progress.source_type === 'bible') {
      const info = progress.anchor_info || {};
      const book = bibleContent.getBook(progress.source_id);

      if (!book) return null;

      const chapterNumber = Number(info.chapter_number || 1);
      const verseNumber = info.verse_number ? Number(info.verse_number) : null;

      return {
        id: progress.id,
        type: 'Библия',
        symbol: '☷',
        title: bibleContent.getDisplayName(book),
        position: verseNumber
          ? 'Глава ' + chapterNumber + ' · стих ' + verseNumber
          : 'Глава ' + chapterNumber,
        onPress: () =>
          navigation.navigate('BibleChapter', {
            bookId: book.id,
            chapterNumber,
            resume: true,
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
      const akathist = akathists.find((item) => Number(item.id) === Number(progress.source_id));
      if (!akathist) return null;

      const section = akathist.sections?.find(
        (item) => Number(item.id) === Number(progress.anchor_id)
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
      const canon = canons.find((item) => Number(item.id) === Number(progress.source_id));
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
      const rule = prayerRules.find((item) => Number(item.id) === Number(progress.source_id));
      if (!rule) return null;

      const ruleItem = rule.items?.find((item) => Number(item.id) === Number(progress.anchor_id));
      const position = ruleItem?.text?.title || ruleItem?.title || 'Продолжить правило';

      return {
        id: progress.id,
        type: 'Молитвенное правило',
        symbol: '✦',
        iconSource: resolveCategoryIcon(rule.slug, rule.name) || CATEGORY_ICONS.canons,
        title: rule.name,
        position,
        onPress: () => navigation.navigate('PrayerRule', {slug: rule.slug}),
      };
    }

    if (progress.source_type === 'category') {
      const category = categories.find((item) => Number(item.id) === Number(progress.source_id));
      if (!category) return null;

      return {
        id: progress.id,
        type: 'Молитвы',
        symbol: '†',
        iconSource: resolveCategoryIcon(category.slug, category.name) || CATEGORY_ICONS.canons,
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
        .map((progress) => {
          const item = makeReadingItem(progress);
          if (!item) return null;

          return {...item, progress: Number(progress.progress_percent || 0)};
        })
        .filter(Boolean),
    [readingProgress, categories, akathists, canons, prayerRules]
  );

  const finishReading = async (progressId) => {
    try {
      await deleteReadingProgress(progressId);
      setReadingProgress((current) => current.filter((item) => item.id !== progressId));
    } catch (err) {
      console.log('Ошибка завершения чтения:', err);
    }
  };

  const latestReading = activeReadings[0] || null;

  const toggleDailyQuoteSaved = async () => {
    if (!dailyQuote?.id || !dailyQuote?.text) {
      return;
    }

    try {
      if (savedDailyQuote) {
        await deleteSavedItem(savedDailyQuote.id);

        setSavedDailyQuote(null);

        return;
      }

      const saved = await saveItem({
        save_type: 'quote',
        source_type: 'daily_quote',
        source_id: Number(dailyQuote.id),
        anchor_type: 'daily_quote',
        anchor_id: Number(dailyQuote.id),
        source_title: 'Цитата дня',
        item_title: dailyQuote.reference || dailyQuote.source || 'Цитата дня',
        text: dailyQuote.text,
        start_offset: 0,
        end_offset: dailyQuote.text.length,
        metadata: {
          source: dailyQuote.source || '',
          reference: dailyQuote.reference || '',
          quote_date: dailyQuote.quote_date || dailyQuote.date || '',
        },
      });

      setSavedDailyQuote(saved);
    } catch (err) {
      console.log('Ошибка сохранения цитаты:', err);

      Alert.alert('Не удалось сохранить цитату', err.message || 'Попробуйте ещё раз.');
    }
  };

  const showWidgetInfo = async () => {
    try {
      const widgets = await getWidgetInfo('QuoteOfDay');

      if (widgets.length > 0) {
        Alert.alert('Виджет уже добавлен', 'На главном экране уже установлен виджет «Цитата дня».');
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

  const showPlaceholder = useCallback((title) => {
    Alert.alert(title, 'Раздел пока в разработке.');
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Загрузка молитвослова...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

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
                paddingBottom: 96 + insets.bottom,
              },
            ]}
          >
            <ImageBackground
              source={homeArtwork.hero_biblical}
              resizeMode="cover"
              style={[
                styles.hero,
                {
                  paddingTop: Math.max(insets.top + 8, 32),
                },
              ]}
              imageStyle={styles.heroImage}
            >
              <LinearGradient
                pointerEvents="none"
                colors={[
                  'rgba(255, 244, 222, 0)',
                  'rgba(183, 138, 88, 0.18)',
                  'rgba(183, 138, 88, 0.62)',
                  '#D6B07C',
                ]}
                locations={[0, 0.46, 0.76, 1]}
                style={styles.heroBottomGradient}
              />

              <View style={styles.heroTopActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Поиск"
                  onPress={() => showPlaceholder('Поиск')}
                  style={({pressed}) => [styles.heroRoundAction, pressed && styles.pressed]}
                >
                  <SearchGlyph />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Уведомления"
                  onPress={() => showPlaceholder('Уведомления')}
                  style={({pressed}) => [styles.heroRoundAction, pressed && styles.pressed]}
                >
                  <BellGlyph />
                  <View style={styles.notificationDot} />
                </Pressable>
              </View>

              <View style={styles.heroQuoteContent}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    'rgba(52, 30, 17, 0)',
                    'rgba(52, 30, 17, 0.48)',
                    'rgba(52, 30, 17, 0.66)',
                    'rgba(52, 30, 17, 0.48)',
                    'rgba(52, 30, 17, 0)',
                  ]}
                  locations={[0, 0.14, 0.5, 0.86, 1]}
                  start={{x: 0, y: 0.5}}
                  end={{x: 1, y: 0.5}}
                  style={styles.heroQuoteScrollShade}
                />

                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    'rgba(52, 30, 17, 0)',
                    'rgba(52, 30, 17, 0.18)',
                    'rgba(52, 30, 17, 0.28)',
                    'rgba(52, 30, 17, 0.18)',
                    'rgba(52, 30, 17, 0)',
                  ]}
                  locations={[0, 0.18, 0.5, 0.82, 1]}
                  start={{x: 0.5, y: 0}}
                  end={{x: 0.5, y: 1}}
                  style={styles.heroQuoteScrollShade}
                />
                <View style={styles.heroQuoteHeading}>
                  {/*<Text style={styles.heroQuoteMark}>❧</Text>*/}
                  {/*<Text style={styles.heroQuoteLabel}>Цитата дня</Text>*/}
                </View>

                <View style={styles.quoteStaircase}>
                  {!!dailyQuote?.text && (
                    <Text style={styles.heroQuoteText}>{dailyQuote.text}</Text>
                  )}
                </View>

                {!!(dailyQuote?.reference || dailyQuote?.source) && (
                  <Text style={styles.heroQuoteSource}>
                    {dailyQuote?.reference || dailyQuote?.source}
                  </Text>
                )}

                <View style={styles.heroQuoteActions}>
                  <Pressable
                    onPress={toggleDailyQuoteSaved}
                    style={({pressed}) => [styles.heroHeartButton, pressed && styles.pressed]}
                  >
                    <SaveHeartIcon active={!!savedDailyQuote} size={20} tintColor="#F5DCA5" />
                  </Pressable>
                  {/*  <Text style={styles.heroQuoteActionText}>*/}
                  {/*    {savedDailyQuote ? '' : ''}*/}
                  {/*  </Text>*/}
                  {/*</Pressable>*/}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Добавить цитату дня на главный экран"
                    hitSlop={6}
                    onPress={showWidgetInfo}
                    style={({pressed}) => [styles.heroQuoteActionButton, pressed && styles.pressed]}
                  >
                    {/*<View style={styles.widgetGlyph}>*/}
                    {/*  <View style={styles.widgetGlyphSpeaker} />*/}
                    {/*</View>*/}
                    <Text style={styles.heroQuoteActionText}>На экран</Text>
                  </Pressable>
                </View>
              </View>
            </ImageBackground>

            <View style={styles.pageBody}>
              <View style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <Pressable
                    hitSlop={8}
                    onPress={openFullCalendar}
                    style={({pressed}) => [styles.calendarTitleButton, pressed && styles.pressed]}
                  >
                    <CalendarGlyph />

                    <View style={styles.calendarTitleTextWrap}>
                      <View style={styles.calendarTitleLine}>
                        <Text style={styles.calendarTitle}>{calendarCopy.calendarTitle}</Text>

                        <Text style={styles.calendarTitleArrow}>›</Text>
                      </View>

                      <Text style={styles.calendarOpenHint}>
                        {calendarLanguage === 'uk' ? 'Відкрити календар' : 'Открыть календарь'}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.calendarHeaderControls}>
                    <Pressable
                      hitSlop={6}
                      onPress={showCalendarWidgetInfo}
                      style={({pressed}) => [
                        styles.calendarWidgetButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.calendarWidgetButtonIcon}>▣</Text>
                      <Text style={styles.calendarWidgetButtonText}>{calendarCopy.onScreen}</Text>
                    </Pressable>

                    <View style={styles.calendarLanguageSwitch}>
                      {['ru', 'uk'].map((language) => {
                        const active = calendarLanguage === language;

                        return (
                          <Pressable
                            key={language}
                            onPress={() => changeCalendarLanguage(language)}
                            style={[
                              styles.calendarLanguageButton,
                              active && styles.calendarLanguageButtonActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.calendarLanguageText,
                                active && styles.calendarLanguageTextActive,
                              ]}
                            >
                              {language === 'ru' ? 'РУ' : 'УК'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={styles.calendarMainRow}>
                  <View style={styles.calendarTodayColumn}>
                    <Pressable
                      onPress={openFullCalendar}
                      style={({pressed}) => [styles.calendarFeastCard, pressed && styles.pressed]}
                    >
                      {calendarToday?.main_feast?.icon_url ? (
                        <Image
                          source={{uri: calendarToday.main_feast.icon_url}}
                          style={styles.calendarSaintImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.calendarSaintPlaceholder}>
                          <Text style={styles.calendarSaintCross}>☦</Text>
                        </View>
                      )}

                      <View style={styles.calendarFeastTextWrap}>
                        <Text style={styles.calendarFeastLabel}>
                          {calendarLanguage === 'uk' ? 'ПАМ’ЯТЬ ДНЯ' : 'ПАМЯТЬ ДНЯ'}
                        </Text>

                        <Text style={styles.calendarFeastTitle} numberOfLines={6}>
                          {calendarToday?.main_feast?.short_title ||
                            calendarToday?.main_feast?.title ||
                            (calendarLoading
                              ? calendarCopy.loadingMemory
                              : calendarCopy.saintMemory)}
                        </Text>
                      </View>
                    </Pressable>

                    <View style={styles.calendarQuickColumn}>
                      <Pressable
                        onPress={openFullCalendar}
                        style={({pressed}) => [styles.calendarQuickItem, pressed && styles.pressed]}
                      >
                        <Text style={styles.calendarQuickLabel}>
                          {calendarLanguage === 'uk' ? 'ПІСТ' : 'ПОСТ'}
                        </Text>

                        <Text style={styles.calendarQuickText} numberOfLines={2}>
                          {formatFast(calendarToday, calendarLanguage) || calendarCopy.noFastData}
                        </Text>
                      </Pressable>

                      <Pressable
                        disabled={!resolveBibleReference(calendarToday?.gospel_title)}
                        onPress={() =>
                          openCalendarBibleReference(navigation, calendarToday?.gospel_title)
                        }
                        style={({pressed}) => [
                          styles.calendarQuickItem,
                          styles.calendarQuickItemBorderTop,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.calendarQuickLabel}>
                          {calendarLanguage === 'uk' ? 'ЄВАНГЕЛІЄ' : 'ЕВАНГЕЛИЕ'}
                        </Text>

                        <Text
                          style={[
                            styles.calendarQuickText,
                            !!resolveBibleReference(calendarToday?.gospel_title) &&
                              styles.calendarBibleLink,
                          ]}
                          numberOfLines={2}
                        >
                          {calendarToday?.gospel_title || '—'}
                        </Text>
                      </Pressable>

                      <Pressable
                        disabled={!resolveBibleReference(calendarToday?.apostolic_title)}
                        onPress={() =>
                          openCalendarBibleReference(navigation, calendarToday?.apostolic_title)
                        }
                        style={({pressed}) => [
                          styles.calendarQuickItem,
                          styles.calendarQuickItemBorderTop,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.calendarQuickLabel}>АПОСТОЛ</Text>

                        <Text
                          style={[
                            styles.calendarQuickText,
                            !!resolveBibleReference(calendarToday?.apostolic_title) &&
                              styles.calendarBibleLink,
                          ]}
                          numberOfLines={2}
                        >
                          {calendarToday?.apostolic_title || '—'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.miniCalendar}>
                    <View style={styles.miniCalendarHeader}>
                      <Pressable
                        hitSlop={8}
                        onPress={() => moveMiniCalendarMonth(-1)}
                        style={({pressed}) => [
                          styles.miniCalendarArrowButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.miniCalendarArrow}>‹</Text>
                      </Pressable>

                      <Pressable
                        onPress={openFullCalendar}
                        style={({pressed}) => [
                          styles.miniCalendarMonthButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.miniCalendarMonth} numberOfLines={1}>
                          {calendarSnapshot.monthTitle}
                        </Text>
                      </Pressable>

                      <Pressable
                        hitSlop={8}
                        onPress={() => moveMiniCalendarMonth(1)}
                        style={({pressed}) => [
                          styles.miniCalendarArrowButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.miniCalendarArrow}>›</Text>
                      </Pressable>
                    </View>

                    <View style={styles.miniCalendarWeekdays}>
                      {calendarSnapshot.miniWeekdays.map((weekday, index) => (
                        <Text
                          key={weekday}
                          style={[
                            styles.miniCalendarWeekday,
                            index >= 5 && styles.miniCalendarWeekend,
                          ]}
                        >
                          {weekday}
                        </Text>
                      ))}
                    </View>

                    <View style={styles.miniCalendarGrid}>
                      {calendarSnapshot.cells.map((cell, index) => {
                        const weekend = index % 7 >= 5;

                        return (
                          <Pressable
                            key={cell.date}
                            hitSlop={1}
                            onPress={() => selectMiniCalendarDate(cell)}
                            style={({pressed}) => [
                              styles.miniCalendarCell,
                              {
                                height: calendarSnapshot.cells.length === 42 ? '16.6667%' : '20%',
                              },
                              pressed && styles.miniCalendarCellPressed,
                            ]}
                          >
                            <View
                              style={[
                                styles.miniCalendarDayBubble,
                                cell.today && styles.miniCalendarDayBubbleToday,
                                cell.selected &&
                                  !cell.today &&
                                  styles.miniCalendarDayBubbleSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.miniCalendarDayText,
                                  cell.outside && styles.miniCalendarDayOutside,
                                  weekend && !cell.outside && styles.miniCalendarDayWeekend,
                                  cell.today && styles.miniCalendarDayToday,
                                  cell.selected && !cell.today && styles.miniCalendarDaySelected,
                                ]}
                              >
                                {cell.day}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.readingCard}>
                <View style={styles.readingHeader}>
                  <Pressable
                    hitSlop={8}
                    onPress={() => navigation.navigate('ContinueReading')}
                    style={({pressed}) => [styles.readingHeadingWrap, pressed && styles.pressed]}
                  >
                    <Text style={styles.readingBook}>▤</Text>
                    <Text style={styles.readingSectionTitle}>Продолжить чтение</Text>
                  </Pressable>

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
                      style={({pressed}) => [styles.latestReadingMain, pressed && styles.pressed]}
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
                                  width: `${Math.max(0, Math.min(latestReading.progress, 100))}%`,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.latestProgressPercent}>
                            {latestReading.progress}%
                          </Text>
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
                      Откройте молитву, акафист, канон, Псалтирь или Библию — место сохранится
                      автоматически.
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
                  title="Разные молитвы"
                  subtitle="Молитвы на разные случаи"
                  symbol="✦"
                  iconSource={CATEGORY_ICONS.misc}
                  artwork={homeArtwork.communion}
                  onPress={() => navigation.navigate('MiscPrayers')}
                />
                <DecorativeCard
                  title="Библия"
                  subtitle="Ветхий и Новый Завет"
                  iconSource={CATEGORY_ICONS.bible}
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

                  {libraryCategories.map((category) => (
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
    minHeight: 305,
    justifyContent: 'flex-start',
    paddingHorizontal: 18,
    paddingBottom: 22,
    overflow: 'hidden',
    backgroundColor: '#9C7046',
  },

  heroImage: {
    opacity: 1,
    maxHeight: 320,
  },

  heroQuoteShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '30%',
  },
  heroQuoteLocalShade: {
    position: 'absolute',
    top: -8,
    left: -18,
    bottom: -8,
    width: '95%',
    borderRadius: 0,
  },

  heroBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 92,
  },

  heroTopActions: {
    position: 'absolute',
    top: 34,
    right: 16,
    zIndex: 5,
    flexDirection: 'row',
    gap: 9,
  },

  heroRoundAction: {
    position: 'relative',
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(111, 73, 48, 0.22)',
    backgroundColor: 'rgba(255, 245, 224, 0.92)',
    shadowColor: '#2C170B',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.14,
    shadowRadius: 7,
    elevation: 3,
  },

  quoteStaircase: {
    width: '100%',
    alignItems: 'flex-start',
  },

  quoteLine1: {
    width: '68%',
  },

  quoteLine2: {
    width: '88%',
  },

  quoteLine3: {
    width: '96%',
  },

  quoteLine4: {
    width: '100%',
  },
  searchGlyph: {
    width: 15,
    height: 15,
    left: -1,
    top: -1,
    borderWidth: 2,
    borderColor: '#4E2F1C',
    borderRadius: 9,
  },

  searchGlyphHandle: {
    position: 'absolute',
    right: -5,
    bottom: -2,
    width: 6,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#4E2F1C',
    transform: [{rotate: '45deg'}],
  },

  bellGlyph: {
    width: 20,
    height: 22,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },

  bellGlyphBody: {
    width: 14,
    height: 15,
    marginTop: 2,
    borderWidth: 2,
    borderColor: '#4E2F1C',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: 0,
  },

  bellGlyphBase: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#4E2F1C',
  },

  bellGlyphClapper: {
    width: 4,
    height: 4,
    marginTop: 1,
    borderRadius: 2,
    backgroundColor: '#4E2F1C',
  },

  notificationDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#A7552E',
    borderWidth: 1,
    borderColor: '#FFF1D5',
  },

  // heroQuoteContent: {
  //   width: '100%',
  //   marginTop: 24,
  //   zIndex: 3,
  //   textAlign: 'justify',
  //   position: 'relative',
  //   alignSelf: 'flex-start',
  //   paddingVertical: 2,
  //   paddingHorizontal: 3,
  //
  // },

  heroQuoteHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },

  heroQuoteMark: {
    marginRight: 7,
    color: '#F5D48C',
    fontFamily: 'serif',
    fontSize: 20,
    lineHeight: 22,
    textShadowColor: 'rgba(32, 18, 10, 0.55)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },

  heroQuoteLabel: {
    color: '#FFE6B0',
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    textShadowColor: 'rgba(24, 13, 7, 0.85)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },

  heroQuoteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 10,
  },

  heroQuoteActionButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F7DFB4',

    backgroundColor: 'rgba(45, 25, 14, 0.28)',
  },

  heroQuoteActionButtonActive: {
    // backgroundColor: 'rgba(122, 76, 35, 0.62)',
  },

  heroQuoteActionText: {
    marginLeft: 0,
    padding: 5,
    color: '#F7DFB4',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  heroHeartButton: {
    width: 42,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: '50%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 232, 190, 0.65)',

    backgroundColor: 'rgba(45, 25, 14, 0.28)',
  },

  widgetGlyph: {
    width: 13,
    height: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F7DFAF',
    borderRadius: 2,
  },

  widgetGlyphSpeaker: {
    width: 5,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: '#F7DFAF',
  },

  pageBody: {
    marginTop: -12,
    paddingHorizontal: 10,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },

  calendarCard: {
    padding: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.18)',
    backgroundColor: 'rgba(255, 245, 224, 0.97)',
    shadowColor: '#4A2817',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.13,
    shadowRadius: 9,
    elevation: 3,
  },

  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  calendarTitleButton: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  calendarGlyph: {
    position: 'relative',
    width: 18,
    height: 17,
    marginRight: 6,
    paddingTop: 6,
    paddingHorizontal: 3,
    borderWidth: 1.4,
    borderColor: '#9B642C',
    borderRadius: 4,
  },

  calendarGlyphTopLine: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    height: 1.4,
    backgroundColor: '#9B642C',
  },

  calendarGlyphRingLeft: {
    position: 'absolute',
    top: -3,
    left: 4,
    width: 2,
    height: 5,
    borderRadius: 1,
    backgroundColor: '#9B642C',
  },

  calendarGlyphRingRight: {
    position: 'absolute',
    top: -3,
    right: 4,
    width: 2,
    height: 5,
    borderRadius: 1,
    backgroundColor: '#9B642C',
  },

  calendarGlyphRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },

  calendarGlyphCell: {
    width: 3,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#B77A3E',
  },

  calendarTitleTextWrap: {
    minWidth: 0,
    flex: 1,
  },

  calendarTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  calendarTitle: {
    flexShrink: 1,
    color: '#4B2C18',
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
  },

  calendarTitleArrow: {
    marginLeft: 4,
    marginTop: -2,
    color: '#9A642E',
    fontSize: 28,
    lineHeight: 18,
    fontWeight: '700',
  },

  calendarOpenHint: {
    marginTop: 1,
    color: '#9A785B',
    fontFamily: 'serif',
    fontSize: 9,
    lineHeight: 10,
  },

  calendarHeaderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  calendarWidgetButton: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(142, 93, 50, 0.22)',
    backgroundColor: '#F5E2C4',
  },

  calendarWidgetButtonIcon: {
    marginRight: 4,
    color: '#98612D',
    fontSize: 12,
    lineHeight: 12,
    display: 'none',
  },

  calendarWidgetButtonText: {
    color: '#7B4F2A',
    fontFamily: 'serif',
    fontSize: 11,
    lineHeight: 10,
    fontWeight: '700',
  },

  calendarLanguageSwitch: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 8,
    backgroundColor: '#E7D2B0',
  },

  calendarLanguageButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },

  calendarLanguageButtonActive: {
    backgroundColor: '#8E5D32',
  },

  calendarLanguageText: {
    color: '#7B5D45',
    fontSize: 10,
    fontWeight: '800',
  },

  calendarLanguageTextActive: {
    color: '#FFF5E4',
  },

  calendarMainRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,

    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(139, 94, 49, 0.18)',
  },

  calendarTodayColumn: {
    flex: 1,
    minWidth: 0,
    padding: 4,
    borderRadius: 11,
    borderWidth: 1,
    width: '42%',
    alignSelf: 'stretch',
    borderColor: 'rgba(255, 251, 242, 0.72)',
    backgroundColor: 'rgba(139, 94, 49, 0.13)',
  },

  calendarTodayDate: {
    color: '#2F1E13',
    paddingInline: 2,
    fontFamily: 'serif',
    fontStyle: 'italic',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    width: '100%',

    justifyContent: 'space-between',

    flexDirection: 'row',
    alignItems: 'center',

    gap: 8,
  },

  calendarTodayDateLabel: {
    flexShrink: 0,
    color: '#A16E35',
    fontSize: 12,
    fontStyle: 'normal',
    fontFamily: 'serif',
    fontWeight: '800',
  },
  calendarTodayDayTitle: {
    flexShrink: 1,
    color: '#2F1E13',
    fontFamily: 'serif',
    fontStyle: 'italic',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'right',
  },

  calendarTodayWeekday: {
    marginTop: 1,
    color: '#6F5541',
    fontFamily: 'serif',

    fontSize: 10,
    lineHeight: 12,
    textTransform: 'lowercase',
  },
  calendarTodayDateWrapper: {
    padding: 4,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 251, 242, 0.72)',
    backgroundColor: 'rgba(255, 251, 242, 0.72)',
  },

  calendarFeastCard: {
    minWidth: 0,
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 6,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(139, 94, 49, 0.13)',
    backgroundColor: 'rgba(255, 251, 242, 0.72)',
  },

  calendarSaintImage: {
    width: 42,
    height: 59,
    // marginTop: 5,
    borderRadius: 8,
    backgroundColor: '#F0D6A5',
  },

  calendarSaintPlaceholder: {
    width: 42,
    height: 59,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(157, 104, 46, 0.24)',
    backgroundColor: '#F0D6A5',
  },

  calendarSaintCross: {
    color: '#8B5526',
    fontFamily: 'serif',
    fontSize: 19,
    lineHeight: 22,
  },

  calendarFeastTextWrap: {
    minWidth: 0,
    flex: 1,
    marginLeft: 6,
  },

  calendarFeastLabel: {
    color: '#A16E35',
    fontSize: 9,
    lineHeight: 8,

    fontWeight: '800',
    letterSpacing: 0.3,
  },

  calendarFeastTitle: {
    marginTop: 4,
    color: '#3F291B',
    fontFamily: 'serif',
    fontStyle: 'italic',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  calendarQuickColumn: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 94, 49, 0.13)',
    backgroundColor: 'rgba(255, 251, 242, 0.72)',
    overflow: 'hidden',
  },

  miniCalendar: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,

    borderColor: 'rgba(255, 251, 242, 0.72)',
    backgroundColor: 'rgba(139, 94, 49, 0.13)',
  },

  miniCalendarHeader: {
    height: 21,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },

  miniCalendarArrowButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },

  miniCalendarArrow: {
    color: '#6F4727',
    fontFamily: 'serif',
    fontSize: 25,
    lineHeight: 17,
  },

  miniCalendarMonthButton: {
    minWidth: 0,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  miniCalendarMonth: {
    color: '#4B3020',
    fontFamily: 'serif',
    fontSize: 11,
    lineHeight: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  miniCalendarWeekdays: {
    flexDirection: 'row',

    paddingBlock: 2,
  },

  miniCalendarWeekday: {
    width: '14.2857%',
    color: '#807064',
    fontFamily: 'serif',
    fontSize: 11,
    lineHeight: 9,
    textAlign: 'center',
  },

  miniCalendarWeekend: {
    color: '#A33A32',
  },

  miniCalendarGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },

  miniCalendarCell: {
    width: '14.2857%',
    // height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },

  miniCalendarCellPressed: {
    backgroundColor: 'rgba(155,100,44,0.08)',
  },

  miniCalendarDayBubble: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },

  miniCalendarDayBubbleToday: {
    backgroundColor: '#B97A32',
  },

  miniCalendarDayBubbleSelected: {
    borderWidth: 1,
    borderColor: '#B97A32',
    backgroundColor: 'rgba(185,122,50,0.10)',
  },

  miniCalendarDayText: {
    color: '#473226',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 14,
  },

  miniCalendarDayOutside: {
    color: '#B6ACA2',
  },

  miniCalendarDayWeekend: {
    color: '#A33A32',
  },

  miniCalendarDayToday: {
    color: '#FFF7E7',
    fontWeight: '700',
  },

  miniCalendarDaySelected: {
    color: '#7B4D25',
    fontWeight: '800',
  },

  calendarQuickRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingVertical: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(139, 94, 49, 0.18)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(139, 94, 49, 0.12)',
    borderRadius: 10,
    backgroundColor: 'rgba(248, 232, 203, 0.40)',
    overflow: 'hidden',
  },

  calendarQuickItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 45,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },

  calendarQuickItemBorderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(139, 94, 49, 0.18)',
  },

  calendarQuickLabel: {
    color: '#A16E35',
    fontSize: 8,
    paddingBlock: 2,
    lineHeight: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  calendarQuickText: {
    marginTop: 2,
    color: '#624936',
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 12,
  },

  calendarBibleLink: {
    color: '#7B4D2A',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(123,77,42,0.30)',
  },

  readingCard: {
    marginTop: 11,
    paddingInline: 9,
    paddingBlock: 6,
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
    fontSize: 17,
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
  heroQuoteContent: {
    position: 'absolute',
    // alignSelf: 'flex-start',
    // maxWidth: '89%',
    paddingVertical: 7,
    left: 18,
    right: 18,
    bottom: 42,
    paddingHorizontal: 5,
    zIndex: 3,
  },

  heroQuoteScrollShade: {
    position: 'absolute',
    top: -10,
    bottom: -8,
    left: -26,
    right: -54,
    borderRadius: 28,
  },

  heroQuoteText: {
    color: '#F8E7C5',

    fontFamily: 'Ponomar',
    fontSize: 19,
    lineHeight: 24,

    textShadowColor: 'rgba(28, 15, 8, 0.80)',
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 2,
  },

  heroQuoteInitial: {
    color: '#D7A45E',
    fontSize: 25,
    lineHeight: 24,
  },

  heroQuoteSource: {
    marginTop: 5,

    color: '#E5C58F',
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',

    textShadowColor: 'rgba(28, 15, 8, 0.65)',
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 2,
  },
});
