import React, {useRef, useState} from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaView} from 'react-native-safe-area-context';

import {CategoryIcon} from '../components/icons/CategoryIcon';

const SLIDE_COUNT = 10;

const artwork = {
  page: require('../../assets/home/page_bg3.png'),
  page2: require('../../assets/home/page_bg2.png'),
  page4: require('../../assets/home/page_bg4.png'),
  hero: require('../../assets/home/hero.png'),
  matthew: require('../../assets/bible/evangelists/matthew-bg.png'),
  morning: require('../../assets/home/morning.png'),
  akathists: require('../../assets/home/akathists.png'),
  canons: require('../../assets/home/canons.png'),
  psalter: require('../../assets/home/psalter.png'),
  calendarSaint: require('../../assets/calendar-icons/331e36b994aad994b582.webp'),
};

const CALENDAR_SAMPLE = {
  date: '1 октября 2026',
  saint: 'Преподобный Евме́ний, епископ Гортинский',
  fast: 'Апостольский пост — Горячая пища с маслом',
  gospel: 'Мф.24:13–28',
  apostle: 'Еф.5:33–6:9',
};

const DAYS = [
  ['29', '30', '1', '2', '3', '4', '5'],
  ['6', '7', '8', '9', '10', '11', '12'],
  ['13', '14', '15', '16', '17', '18', '19'],
  ['20', '21', '22', '23', '24', '25', '26'],
  ['27', '28', '29', '30', '31', '1', '2'],
];

const SlideCaption = ({eyebrow, title, text}) => (
  <View style={styles.caption}>
    <Text style={styles.captionEyebrow}>{eyebrow}</Text>
    <Text style={styles.captionTitle}>{title}</Text>
    <Text style={styles.captionText}>{text}</Text>
  </View>
);

const AppScreenPreview = ({title, children, background = artwork.page}) => (
  <ImageBackground
    source={background}
    resizeMode="cover"
    style={styles.appScreen}
    imageStyle={styles.appScreenBackground}
  >
    <LinearGradient
      pointerEvents="none"
      colors={['#FFF4DE', 'rgba(255,244,222,0.74)', 'rgba(255,244,222,0)']}
      locations={[0, 0.5, 1]}
      style={styles.appScreenHeaderFade}
    />

    <View style={styles.appScreenHeader}>
      <View style={styles.appScreenBack}>
        <Text style={styles.appScreenBackText}>‹</Text>
      </View>
      <View style={styles.appScreenTitleWrap}>
        <Text style={styles.appScreenTitle}>{title}</Text>
        <View style={styles.appScreenOrnament}>
          <View style={styles.appScreenLine} />
          <Text style={styles.appScreenMark}>✦</Text>
          <View style={styles.appScreenLine} />
        </View>
      </View>
    </View>

    <View style={styles.appScreenContent}>{children}</View>
  </ImageBackground>
);

const LibraryCard = ({image, icon, title, subtitle}) => (
  <View style={styles.libraryCard}>
    <ImageBackground
      source={image}
      resizeMode="cover"
      style={styles.libraryArtwork}
      imageStyle={styles.libraryArtworkImage}
    />

    <LinearGradient
      pointerEvents="none"
      colors={[
        '#FFF2DB',
        'rgba(255,242,219,0.98)',
        'rgba(255,242,219,0.86)',
        'rgba(255,242,219,0.48)',
        'rgba(255,242,219,0.06)',
      ]}
      locations={[0, 0.24, 0.48, 0.72, 1]}
      start={{x: 0, y: 0.5}}
      end={{x: 1, y: 0.5}}
      style={styles.libraryFade}
    />

    <View style={styles.libraryIcon}>
      <CategoryIcon type={icon} size={42} />
    </View>

    <View style={styles.libraryText}>
      <Text style={styles.libraryTitle}>{title}</Text>
      <Text style={styles.librarySubtitle}>{subtitle}</Text>
    </View>
  </View>
);

const ChapterCell = ({number, active}) => (
  <View style={[styles.chapterCell, active && styles.chapterCellActive]}>
    <Text style={[styles.chapterNumber, active && styles.chapterNumberActive]}>{number}</Text>
  </View>
);

const MonthGrid = ({compact = false}) => (
  <View>
    <View style={styles.weekRow}>
      {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => (
        <Text key={day} style={[styles.weekday, index >= 5 && styles.weekend]}>
          {day}
        </Text>
      ))}
    </View>

    {DAYS.map((week, rowIndex) => (
      <View key={rowIndex} style={styles.monthWeek}>
        {week.map((day, index) => {
          const selected = rowIndex === 0 && day === '1';
          const outside = (rowIndex === 0 && index < 2) || (rowIndex === 4 && index > 4);

          return (
            <View key={index} style={[styles.dayCell, compact && styles.dayCellCompact]}>
              <View style={[styles.dayBubble, selected && styles.dayBubbleSelected]}>
                <Text
                  style={[
                    styles.dayNumber,
                    index >= 5 && styles.weekend,
                    outside && styles.dayOutside,
                    selected && styles.dayNumberSelected,
                  ]}
                >
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    ))}
  </View>
);

const IntroPreview = () => (
  <View style={styles.introCenter}>
    <Text style={styles.introCross}>☦</Text>
    <Text style={styles.introTitle}>Молитвослов</Text>
    <View style={styles.introOrnament}>
      <View style={styles.introLine} />
      <Text style={styles.introMark}>✦</Text>
      <View style={styles.introLine} />
    </View>
    <Text style={styles.introSubtitle}>Молитва · Писание · Церковный календарь</Text>
  </View>
);

const BiblePreview = () => (
  <View style={styles.biblePreview}>
    <Text style={styles.bibleKicker}>СВЯЩЕННОЕ ПИСАНИЕ</Text>
    <Text style={styles.bibleTitle}>Евангелие от Матфея</Text>

    <View style={styles.resumeCard}>
      <View style={styles.resumeTextWrap}>
        <Text style={styles.resumeLabel}>Продолжить чтение</Text>
        <Text style={styles.resumeMeta}>Глава 5 · Нагорная проповедь</Text>
      </View>
      <Text style={styles.resumePercent}>34%</Text>
    </View>

    <View style={styles.chapterGrid}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((number) => (
        <ChapterCell key={number} number={number} active={number === 5} />
      ))}
    </View>
  </View>
);

const LibraryPreview = () => (
  <View style={styles.libraryStack}>
    <LibraryCard
      image={artwork.morning}
      icon="morning"
      title="Утренние молитвы"
      subtitle="Начало дня"
    />
    <LibraryCard
      image={artwork.akathists}
      icon="akathists"
      title="Акафисты"
      subtitle="Молитвенные песнопения"
    />
    <LibraryCard
      image={artwork.canons}
      icon="canons"
      title="Каноны"
      subtitle="Покаянные и просительные"
    />
    <LibraryCard image={artwork.psalter} icon="psalter" title="Псалтирь" subtitle="Кафизмы" />
  </View>
);

const CalendarPreview = () => (
  <AppScreenPreview title="Церковный календарь">
    <View style={styles.calendarScreenPreview}>
      <View style={styles.calendarCard}>
        <View style={styles.calendarLanguageRow}>
          <Text style={styles.calendarSectionTitle}>Церковный календарь</Text>
          <View style={styles.languageSwitch}>
            <View style={[styles.languageButton, styles.languageButtonActive]}>
              <Text style={styles.languageButtonTextActive}>РУ</Text>
            </View>
            <View style={styles.languageButton}>
              <Text style={styles.languageButtonText}>УК</Text>
            </View>
          </View>
        </View>

        <View style={styles.monthHeader}>
          <Text style={styles.monthArrow}>‹</Text>
          <Text style={styles.monthTitle}>Октябрь 2026</Text>
          <Text style={styles.monthArrow}>›</Text>
        </View>

        <MonthGrid />
      </View>

      <View style={styles.dayCard}>
        <Text style={styles.dayDate}>{CALENDAR_SAMPLE.date}</Text>

        <View style={styles.feastHero}>
          <Image source={artwork.calendarSaint} style={styles.feastIconImage} resizeMode="cover" />

          <View style={styles.feastText}>
            <Text style={styles.feastKicker}>ПАМЯТЬ СВЯТОГО / ПРАЗДНИК</Text>
            <Text style={styles.feastTitle} numberOfLines={3}>
              {CALENDAR_SAMPLE.saint}
            </Text>
            <View style={styles.fastBadge}>
              <Text style={styles.fastBadgeText}>{CALENDAR_SAMPLE.fast}</Text>
            </View>
          </View>
        </View>

        <View style={styles.calendarReadingRows}>
          <View style={styles.calendarReadingRow}>
            <Text style={styles.calendarReadingLabel}>ЕВАНГЕЛИЕ</Text>
            <Text style={styles.calendarReadingValue}>{CALENDAR_SAMPLE.gospel}</Text>
            <Text style={styles.calendarReadingArrow}>›</Text>
          </View>

          <View style={styles.calendarReadingRow}>
            <Text style={styles.calendarReadingLabel}>АПОСТОЛ</Text>
            <Text style={styles.calendarReadingValue}>{CALENDAR_SAMPLE.apostle}</Text>
            <Text style={styles.calendarReadingArrow}>›</Text>
          </View>
        </View>
      </View>
    </View>
  </AppScreenPreview>
);

const CalendarWidgetPreview = () => (
  <View style={styles.calendarWidget}>
    <View style={styles.widgetInfoColumn}>
      <Text style={styles.widgetCalendarTitle}>Церковный календарь</Text>
      <Text style={styles.widgetDate}>1 октября</Text>

      <View style={styles.widgetFeast}>
        <Image source={artwork.calendarSaint} style={styles.widgetSaintImage} resizeMode="cover" />
        <Text style={styles.widgetFeastText} numberOfLines={4}>
          {CALENDAR_SAMPLE.saint}
        </Text>
      </View>

      <View style={styles.widgetInfoLine}>
        <Text style={styles.widgetInfoLabel}>ПОСТ</Text>
        <Text style={styles.widgetInfoValue} numberOfLines={2}>
          {CALENDAR_SAMPLE.fast}
        </Text>
      </View>
      <View style={styles.widgetInfoLine}>
        <Text style={styles.widgetInfoLabel}>ЕВ.</Text>
        <Text style={styles.widgetInfoValue}>{CALENDAR_SAMPLE.gospel} ›</Text>
      </View>
      <View style={styles.widgetInfoLine}>
        <Text style={styles.widgetInfoLabel}>АП.</Text>
        <Text style={styles.widgetInfoValue}>{CALENDAR_SAMPLE.apostle} ›</Text>
      </View>
    </View>

    <View style={styles.widgetMonthColumn}>
      <View style={styles.widgetMonthHeader}>
        <Text style={styles.widgetMonthArrow}>‹</Text>
        <Text style={styles.widgetMonthTitle}>Октябрь</Text>
        <Text style={styles.widgetMonthArrow}>›</Text>
      </View>
      <MonthGrid compact />
    </View>
  </View>
);

const QuoteWidgetPreview = () => (
  <ImageBackground
    source={artwork.hero}
    resizeMode="cover"
    style={styles.quoteWidget}
    imageStyle={styles.quoteWidgetImage}
  >
    <View style={styles.quoteWidgetShade}>
      <Text style={styles.quoteWidgetText}>«Просите, и дано будет вам; ищите, и найдёте».</Text>
      <Text style={styles.quoteWidgetSource}>Мф. 7:7</Text>
    </View>
  </ImageBackground>
);

const WidgetsPreview = () => (
  <ImageBackground
    source={artwork.hero}
    resizeMode="cover"
    style={styles.homeScreenPreview}
    imageStyle={styles.homeScreenWallpaper}
  >
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(28,18,11,0.16)', 'rgba(28,18,11,0.36)']}
      style={StyleSheet.absoluteFillObject}
    />

    <View style={styles.homeStatus}>
      <Text style={styles.homeTime}>11:17</Text>
      <Text style={styles.homeStatusIcons}>◉  ▴  ▰</Text>
    </View>

    <View style={styles.homeWidgets}>
      <CalendarWidgetPreview />
      <QuoteWidgetPreview />
    </View>

    <View style={styles.homeDock}>
      {['☦', '✉', '◉', '⌂'].map((icon, itemIndex) => (
        <View key={itemIndex} style={styles.homeDockIcon}>
          <Text style={styles.homeDockIconText}>{icon}</Text>
        </View>
      ))}
    </View>
  </ImageBackground>
);

const FavoriteCard = ({badge, title, text, meta, progress}) => (
  <View style={styles.favoriteCard}>
    <View style={styles.favoriteCardTop}>
      <Text style={styles.favoriteBadge}>{badge}</Text>
      <Text style={styles.favoriteHeart}>♡</Text>
    </View>
    <Text style={styles.favoriteTitle}>{title}</Text>
    {!!text && (
      <Text style={styles.favoriteQuote} numberOfLines={2}>
        {text}
      </Text>
    )}
    {!!progress && (
      <View style={styles.favoriteProgressTrack}>
        <View style={[styles.favoriteProgressFill, {width: progress}]} />
      </View>
    )}
    {!!meta && <Text style={styles.favoriteMeta}>{meta}</Text>}
  </View>
);

const FavoritesPreview = () => (
  <AppScreenPreview title="Избранное" background={artwork.page}>
    <View style={styles.favoritesPreview}>
    <View style={styles.favoriteTabs}>
      <View style={[styles.favoriteTab, styles.favoriteTabActive]}>
        <Text style={styles.favoriteTabTextActive}>Сохранённое</Text>
      </View>
      <View style={styles.favoriteTab}>
        <Text style={styles.favoriteTabText}>Места</Text>
      </View>
      <View style={styles.favoriteTab}>
        <Text style={styles.favoriteTabText}>Фрагменты</Text>
      </View>
    </View>

    <FavoriteCard badge="МОЛИТВА" title="Утренняя молитва" meta="Сохранённый полный текст" />

    <FavoriteCard
      badge="ФРАГМЕНТ"
      title="Евангелие от Иоанна"
      text="«И свет во тьме светит, и тьма не объяла его…»"
      meta="Сохранённый фрагмент"
    />

    <FavoriteCard
      badge="МЕСТО ЧТЕНИЯ"
      title="Евангелие от Матфея"
      progress="62%"
      meta="Глава 8 · 62%"
    />

    <View style={styles.syncBadge}>
      <Text style={styles.syncCloud}>☁</Text>
      <View style={styles.syncTextWrap}>
        <Text style={styles.syncTitle}>Синхронизация</Text>
        <Text style={styles.syncText}>
          Избранное, закладки и прогресс можно сохранить между устройствами
        </Text>
      </View>
    </View>
    </View>
  </AppScreenPreview>
);

const MemorialBookCard = ({title, health, repose}) => (
  <View style={styles.memorialBookCard}>
    <View style={styles.memorialMark}>
      <Text style={styles.memorialMarkText}>†</Text>
    </View>
    <View style={styles.memorialBookText}>
      <Text style={styles.memorialBookTitle}>{title}</Text>
      <Text style={styles.memorialBookMeta}>
        О здравии: {health} · Об упокоении: {repose}
      </Text>
    </View>
    <Text style={styles.memorialChevron}>›</Text>
  </View>
);

const MemorialPreview = () => (
  <AppScreenPreview title="Помянник" background={artwork.page}>
    <View style={styles.memorialPreview}>
    <View style={styles.introCard}>
      <Text style={styles.introCardTitle}>Поминальные записки</Text>
      <Text style={styles.introCardText}>
        Храните имена о здравии и упокоении, а также фотографии бумажных записок.
      </Text>
    </View>

    <View style={styles.createButton}>
      <Text style={styles.createButtonPlus}>+</Text>
      <Text style={styles.createButtonText}>Новый помянник</Text>
    </View>

    <Text style={styles.sectionLabel}>МОИ ПОМЯННИКИ</Text>
    <MemorialBookCard title="Мой помянник" health={8} repose={4} />
    <MemorialBookCard title="Родные" health={6} repose={3} />
    </View>
  </AppScreenPreview>
);

const PrayerBookCard = ({title, count}) => (
  <View style={styles.prayerBookCard}>
    <View style={styles.prayerBookIcon}>
      <Text style={styles.prayerBookIconText}>✚</Text>
    </View>
    <View style={styles.prayerBookText}>
      <Text style={styles.prayerBookTitle}>{title}</Text>
      <Text style={styles.prayerBookMeta}>{count} молитв</Text>
    </View>
    <Text style={styles.prayerBookChevron}>›</Text>
  </View>
);

const PrayerBooksPreview = () => (
  <AppScreenPreview title="Мой молитвослов" background={artwork.page}>
    <View style={styles.prayerBooksPreview}>
    <View style={styles.introCard}>
      <Text style={styles.introCardTitle}>Личные молитвенные сборники</Text>
      <Text style={styles.introCardText}>
        Добавляйте полные тексты из избранного, молитвы из библиотеки, свои тексты и фотографии.
      </Text>
    </View>

    <View style={styles.createButton}>
      <Text style={styles.createButtonPlus}>＋</Text>
      <Text style={styles.createButtonText}>Новый молитвослов</Text>
    </View>

    <Text style={styles.sectionLabel}>МОИ МОЛИТВОСЛОВЫ</Text>
    <PrayerBookCard title="На каждый день" count={12} />
    <PrayerBookCard title="Перед дорогой" count={5} />
    <PrayerBookCard title="Мой молитвослов" count={9} />
    </View>
  </AppScreenPreview>
);

const ReadingModesPreview = () => (
  <AppScreenPreview title="Кафизма 1" background={artwork.page}>
    <View style={styles.readerPreview}>
      <View style={styles.readerTabs}>
        {[
          ['ЦС', false],
          ['ЦС + Рус.', true],
          ['Рус.', false],
          ['ЦС традиц.', false],
        ].map(([label, active]) => (
          <View key={label} style={[styles.readerTab, active && styles.readerTabActive]}>
            <Text style={[styles.readerTabText, active && styles.readerTabTextActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.readerSectionHeader}>
        <Text style={styles.readerPsalmTitle}>Псалом 1</Text>
        <Text style={styles.readerSave}>♡  В избранное</Text>
      </View>

      <View style={styles.parallelReader}>
        <View style={styles.readerColumn}>
          <Text style={styles.readerColumnLabel}>Церковнославянский</Text>
          <Text style={styles.churchText}>
            1. Блаже́н муж, и́же не и́де на сове́т нечести́вых, и на пути́ гре́шных не ста, и на
            седа́лищи губи́телей не се́де.
          </Text>
          <Text style={styles.churchText}>
            2. Но в зако́не Госпо́дни во́ля его́, и в зако́не Его́ поучи́тся день и нощь.
          </Text>
        </View>

        <View style={styles.readerDivider} />

        <View style={styles.readerColumn}>
          <Text style={styles.readerColumnLabel}>Русский</Text>
          <Text style={styles.russianText}>
            1. Блажен муж, который не ходит на совет нечестивых и не стоит на пути грешных.
          </Text>
          <Text style={styles.russianText}>
            2. Но в законе Господа воля его, и о законе Его размышляет он день и ночь.
          </Text>
        </View>
      </View>

      <View style={styles.readerHint}>
        <Text style={styles.readerHintIcon}>↔</Text>
        <Text style={styles.readerHintText}>
          Выбирайте один текст или читайте церковнославянский и русский параллельно.
        </Text>
      </View>
    </View>
  </AppScreenPreview>
);

const FinishPreview = () => (
  <View style={styles.finishCenter}>
    <Text style={styles.finishCross}>☦</Text>
    <Text style={styles.finishTitle}>Всё готово</Text>
    <Text style={styles.finishText}>
      Откройте Молитвослов и начните с того, что нужно вам сегодня.
    </Text>
  </View>
);

const slides = [
  {
    key: 'intro',
    background: artwork.hero,
    backgroundOpacity: 1,
    preview: <IntroPreview />,
    eyebrow: 'ДОБРО ПОЖАЛОВАТЬ',
    title: 'Молитвослов всегда рядом',
    text: 'Молитва, Священное Писание и церковный календарь в одном приложении.',
  },
  {
    key: 'bible',
    background: artwork.matthew,
    backgroundOpacity: 1,
    imageStyle: {transform: [{translateY: 28}, {scale: 1.08}]},
    preview: <BiblePreview />,
    eyebrow: 'СВЯЩЕННОЕ ПИСАНИЕ',
    title: 'Читайте и продолжайте с того же места',
    text: 'Евангелие, Псалтирь и другие книги. Приложение запоминает место чтения.',
  },
  {
    key: 'library',
    background: artwork.page,
    backgroundOpacity: 0.72,
    preview: <LibraryPreview />,
    eyebrow: 'МОЛИТВЫ',
    title: 'Все основные разделы в одном месте',
    text: 'Утренние молитвы, акафисты, каноны, Псалтирь и другие тексты в привычном интерфейсе.',
  },
  {
    key: 'calendar',
    background: artwork.page,
    backgroundOpacity: 0.66,
    preview: <CalendarPreview />,
    eyebrow: 'ЦЕРКОВНЫЙ ДЕНЬ',
    title: 'Календарь на каждый день',
    text: 'Память святых, пост, Евангелие и Апостол — так же, как в основном календаре приложения.',
  },
  {
    key: 'widgets',
    background: artwork.page,
    backgroundOpacity: 0.62,
    preview: <WidgetsPreview />,
    eyebrow: 'ВИДЖЕТЫ',
    title: 'Главное — прямо на домашнем экране',
    text: 'Церковный календарь и цитата дня доступны без лишних переходов.',
  },
  {
    key: 'favorites',
    background: artwork.page4,
    backgroundOpacity: 0.58,
    preview: <FavoritesPreview />,
    eyebrow: 'ИЗБРАННОЕ И ЗАКЛАДКИ',
    title: 'Сохраняйте то, к чему хотите вернуться',
    text: 'Полные молитвы, акафисты, цитаты, фрагменты, закладки и прогресс чтения остаются под рукой.',
  },
  {
    key: 'memorial',
    background: artwork.page2,
    backgroundOpacity: 0.58,
    preview: <MemorialPreview />,
    eyebrow: 'ПОМЯННИК',
    title: 'Создавайте свои помянники',
    text: 'Храните отдельные списки имён о здравии и упокоении и используйте их во время молитвы.',
  },
  {
    key: 'prayerbooks',
    background: artwork.page4,
    backgroundOpacity: 0.58,
    preview: <PrayerBooksPreview />,
    eyebrow: 'МОЙ МОЛИТВОСЛОВ',
    title: 'Соберите собственный молитвослов',
    text: 'Создавайте несколько сборников и добавляйте в них молитвы, свои тексты и нужные материалы.',
  },
  {
    key: 'reading-modes',
    background: artwork.page2,
    backgroundOpacity: 0.58,
    preview: <ReadingModesPreview />,
    eyebrow: 'РЕЖИМЫ ЧТЕНИЯ',
    title: 'Читайте так, как вам удобно',
    text: 'Церковнославянский, русский, параллельный текст и традиционное написание доступны прямо в читалке.',
  },
  {
    key: 'finish',
    background: artwork.hero,
    backgroundOpacity: 1,
    preview: <FinishPreview />,
    eyebrow: 'МОЛИТВОСЛОВ',
    title: 'Откройте то, что нужно сегодня',
    text: 'Все основные возможности готовы к использованию.',
  },
];

export const OnboardingScreen = ({onComplete}) => {
  const {width} = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);

  const finish = () => {
    onComplete?.();
  };

  const next = () => {
    if (index >= SLIDE_COUNT - 1) {
      finish();
      return;
    }

    scrollRef.current?.scrollTo({
      x: width * (index + 1),
      animated: true,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{nativeEvent: {contentOffset: {x: scrollX}}}], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            setIndex(Math.max(0, Math.min(nextIndex, SLIDE_COUNT - 1)));
          }}
        >
          {slides.map((slide, slideIndex) => {
            const inputRange = [
              (slideIndex - 1) * width,
              slideIndex * width,
              (slideIndex + 1) * width,
            ];

            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.45, 1, 0.45],
              extrapolate: 'clamp',
            });

            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.985, 1, 0.985],
              extrapolate: 'clamp',
            });

            const translateX = scrollX.interpolate({
              inputRange,
              outputRange: [16, 0, -16],
              extrapolate: 'clamp',
            });

            return (
              <View key={slide.key} style={[styles.slide, {width}]}>
                <ImageBackground
                  source={slide.background}
                  resizeMode="cover"
                  style={styles.slideBackground}
                  imageStyle={[{opacity: slide.backgroundOpacity}, slide.imageStyle]}
                >
                  <LinearGradient
                    pointerEvents="none"
                    colors={[
                      'rgba(255,244,222,0.58)',
                      'rgba(255,244,222,0.06)',
                      'rgba(48,26,13,0.08)',
                      'rgba(48,26,13,0.86)',
                    ]}
                    locations={[0, 0.22, 0.58, 1]}
                    style={StyleSheet.absoluteFillObject}
                  />

                  <Animated.View
                    style={[
                      styles.previewArea,
                      {
                        opacity,
                        transform: [{translateX}, {scale}],
                      },
                    ]}
                  >
                    {slide.preview}
                  </Animated.View>

                  <SlideCaption eyebrow={slide.eyebrow} title={slide.title} text={slide.text} />
                </ImageBackground>
              </View>
            );
          })}
        </Animated.ScrollView>

        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.brandMini}>
            <Text style={styles.brandMiniCross}>☦</Text>
            <Text style={styles.brandMiniText}>Молитвослов</Text>
          </View>

          {index < SLIDE_COUNT - 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Пропустить знакомство"
              onPress={finish}
              style={({pressed}) => [styles.skipButton, pressed && styles.pressed]}
            >
              <Text style={styles.skipText}>Пропустить</Text>
            </Pressable>
          ) : (
            <View style={styles.skipPlaceholder} />
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {slides.map((slide, dotIndex) => (
              <View key={slide.key} style={[styles.dot, dotIndex === index && styles.dotActive]} />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={next}
            style={({pressed}) => [
              styles.nextButton,
              index === SLIDE_COUNT - 1 && styles.nextButtonFinal,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.nextButtonText}>
              {index === SLIDE_COUNT - 1 ? 'Открыть Молитвослов' : 'Далее'}
            </Text>
            {index < SLIDE_COUNT - 1 && <Text style={styles.nextArrow}>›</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1DFC2',
  },
  screen: {
    flex: 1,
    backgroundColor: '#F1DFC2',
  },
  slide: {
    flex: 1,
  },
  slideBackground: {
    flex: 1,
    backgroundColor: '#E5C99F',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  brandMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandMiniCross: {
    color: '#6B3E22',
    fontFamily: 'serif',
    fontSize: 18,
    textShadowColor: 'rgba(255,244,222,0.62)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  brandMiniText: {
    color: '#4B2D1C',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(255,244,222,0.72)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  skipButton: {
    minHeight: 36,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  skipText: {
    color: '#6D472D',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(255,244,222,0.72)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  skipPlaceholder: {
    width: 84,
  },
  previewArea: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    bottom: 245,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 104,
  },
  captionEyebrow: {
    color: '#E8BE78',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(0,0,0,0.64)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  captionTitle: {
    marginTop: 5,
    color: '#FFF2D8',
    fontFamily: 'serif',
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.78)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 5,
  },
  captionText: {
    marginTop: 7,
    maxWidth: 390,
    color: '#F2DFC2',
    fontSize: 13,
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.76)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  footer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 8,
    zIndex: 20,
  },
  dots: {
    height: 18,
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,232,190,0.42)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#EDC27B',
  },
  nextButton: {
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: '#4C2915',
    borderWidth: 1,
    borderColor: 'rgba(235,195,126,0.40)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: '#2D1609',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonFinal: {
    backgroundColor: '#5A3018',
  },
  nextButtonText: {
    color: '#F7E2B8',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  nextArrow: {
    marginLeft: 8,
    marginTop: -2,
    color: '#F7E2B8',
    fontSize: 24,
    lineHeight: 26,
  },
  pressed: {
    opacity: 0.68,
  },

  introCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCross: {
    color: '#F2CC83',
    fontSize: 50,
    textShadowColor: 'rgba(42,20,8,0.58)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  introTitle: {
    marginTop: 4,
    color: '#FFF0D0',
    fontFamily: 'serif',
    fontSize: 38,
    fontWeight: '700',
    textShadowColor: 'rgba(42,20,8,0.72)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 7,
  },
  introOrnament: {
    width: 175,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  introLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EAC37C',
  },
  introMark: {
    marginHorizontal: 8,
    color: '#EAC37C',
    fontSize: 11,
  },
  introSubtitle: {
    marginTop: 12,
    color: '#F3E0BE',
    fontFamily: 'serif',
    fontSize: 13,
    textShadowColor: 'rgba(42,20,8,0.72)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },

  biblePreview: {
    alignSelf: 'stretch',
    padding: 17,
    borderRadius: 22,
    backgroundColor: 'rgba(45,23,10,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(233,185,99,0.45)',
  },
  bibleKicker: {
    color: '#EAC57E',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  bibleTitle: {
    marginTop: 3,
    color: '#FFF0D2',
    fontFamily: 'serif',
    fontSize: 23,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.68)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  resumeCard: {
    minHeight: 56,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(48,24,10,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(230,180,92,0.46)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  resumeTextWrap: {
    flex: 1,
  },
  resumeLabel: {
    color: '#F3D395',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '700',
  },
  resumeMeta: {
    marginTop: 2,
    color: '#E5D2B6',
    fontSize: 10,
  },
  resumePercent: {
    color: '#F0C776',
    fontSize: 11,
    fontWeight: '800',
  },
  chapterGrid: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chapterCell: {
    width: '23%',
    height: 39,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(222,170,85,0.42)',
    backgroundColor: 'rgba(52,27,13,0.56)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterCellActive: {
    borderColor: '#E7B75D',
    backgroundColor: 'rgba(132,79,27,0.86)',
  },
  chapterNumber: {
    color: '#FBE8C2',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  chapterNumberActive: {
    color: '#FFE2A0',
  },

  libraryStack: {
    alignSelf: 'stretch',
    gap: 8,
  },
  libraryCard: {
    position: 'relative',
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: '#FFF2DB',
    borderWidth: 1,
    borderColor: 'rgba(112,67,30,0.24)',
    shadowColor: '#4A2817',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.12,
    shadowRadius: 7,
    elevation: 2,
  },
  libraryArtwork: {
    position: 'absolute',
    top: 0,
    right: -26,
    bottom: 0,
    width: '90%',
  },
  libraryArtworkImage: {
    opacity: 0.98,
  },
  libraryFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: '12%',
    bottom: 0,
  },
  libraryIcon: {
    zIndex: 3,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F5E2C4',
    overflow: 'hidden',
  },
  libraryText: {
    zIndex: 3,
    flex: 1,
    marginLeft: 11,
  },
  libraryTitle: {
    color: '#4A2D1C',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  librarySubtitle: {
    marginTop: 2,
    color: '#7E6047',
    fontSize: 10,
  },

  calendarScreenPreview: {
    alignSelf: 'stretch',
    gap: 8,
  },
  calendarCard: {
    padding: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(123,79,36,0.18)',
    backgroundColor: 'rgba(255,245,224,0.98)',
  },
  calendarLanguageRow: {
    minHeight: 29,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarSectionTitle: {
    flex: 1,
    color: '#5C3A24',
    fontFamily: 'serif',
    fontSize: 13,
    fontWeight: '700',
  },
  languageSwitch: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 9,
    backgroundColor: '#E7D2B0',
  },
  languageButton: {
    minWidth: 27,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  languageButtonActive: {
    backgroundColor: '#8E5D32',
  },
  languageButtonText: {
    color: '#7A5B43',
    fontSize: 9,
    fontWeight: '800',
  },
  languageButtonTextActive: {
    color: '#FFF4DE',
    fontSize: 9,
    fontWeight: '800',
  },
  monthHeader: {
    height: 29,
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthArrow: {
    width: 34,
    color: '#6F4727',
    fontSize: 25,
    textAlign: 'center',
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#4B3020',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    color: '#7E6B5B',
    fontSize: 8,
    fontWeight: '700',
  },
  weekend: {
    color: '#A54A3A',
  },
  monthWeek: {
    flexDirection: 'row',
  },
  dayCell: {
    width: '14.2857%',
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellCompact: {
    height: 18,
  },
  dayBubble: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  dayBubbleSelected: {
    backgroundColor: '#9A642E',
  },
  dayNumber: {
    color: '#493225',
    fontSize: 9,
  },
  dayNumberSelected: {
    color: '#FFF7E7',
    fontWeight: '800',
  },
  dayOutside: {
    color: '#B7ADA4',
  },
  dayCard: {
    padding: 11,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(123,79,36,0.17)',
    backgroundColor: '#FFF4DE',
  },
  dayDate: {
    marginBottom: 7,
    color: '#765238',
    fontFamily: 'serif',
    fontSize: 12,
  },
  feastHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  feastIcon: {
    width: 58,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#EED7B3',
  },
  feastIconText: {
    color: '#8E5D32',
    fontSize: 26,
  },
  feastText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  feastKicker: {
    color: '#A16E35',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  feastTitle: {
    marginTop: 3,
    color: '#3F291B',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
  },
  fastBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: '#EAD7B8',
  },
  fastBadgeText: {
    color: '#6C4A31',
    fontSize: 8,
    fontWeight: '700',
  },
  readingMiniRow: {
    minHeight: 51,
    marginTop: 8,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D3B68B',
    backgroundColor: '#EAD7B8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  readingMiniIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F5E2C4',
    overflow: 'hidden',
  },
  readingMiniText: {
    flex: 1,
    marginLeft: 8,
  },
  readingMiniKind: {
    color: '#8B5B30',
    fontSize: 7,
    fontWeight: '800',
  },
  readingMiniTitle: {
    marginTop: 1,
    color: '#4A3020',
    fontFamily: 'serif',
    fontSize: 11,
    fontWeight: '700',
  },
  readingMiniArrow: {
    color: '#8B5B30',
    fontSize: 21,
  },

  widgetsStack: {
    alignSelf: 'stretch',
    gap: 10,
  },
  calendarWidget: {
    minHeight: 235,
    padding: 11,
    flexDirection: 'row',
    gap: 9,
    borderRadius: 21,
    backgroundColor: '#F6E3C3',
    borderWidth: 1,
    borderColor: '#C99A5B',
    shadowColor: '#4A2A15',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  widgetInfoColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 7,
  },
  widgetCalendarTitle: {
    color: '#7B512F',
    fontFamily: 'serif',
    fontSize: 9,
    fontWeight: '700',
  },
  widgetDate: {
    marginTop: 2,
    color: '#2D1C12',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
  },
  widgetFeast: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  widgetSaintIcon: {
    width: 34,
    height: 46,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: '#E7C897',
  },
  widgetSaintCross: {
    color: '#8B572D',
    fontSize: 17,
  },
  widgetFeastText: {
    flex: 1,
    color: '#40291A',
    fontFamily: 'serif',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  widgetInfoLine: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  widgetInfoLabel: {
    width: 30,
    color: '#A46D38',
    fontSize: 7,
    fontWeight: '700',
  },
  widgetInfoValue: {
    flex: 1,
    color: '#4D3424',
    fontSize: 8,
  },
  widgetMonthColumn: {
    width: '46%',
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#D5B487',
  },
  widgetMonthHeader: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  widgetMonthArrow: {
    width: 19,
    color: '#8A5B31',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  widgetMonthTitle: {
    flex: 1,
    color: '#4C3020',
    fontFamily: 'serif',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  quoteWidget: {
    minHeight: 100,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#3D2416',
    borderWidth: 1,
    borderColor: 'rgba(215,164,94,0.28)',
  },
  quoteWidgetImage: {
    borderRadius: 18,
  },
  quoteWidgetShade: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(52,30,17,0.48)',
  },
  quoteWidgetText: {
    color: '#F8E7C5',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 18,
  },
  quoteWidgetSource: {
    marginTop: 4,
    color: '#E5C58F',
    fontFamily: 'serif',
    fontSize: 9,
  },

  favoritesPreview: {
    alignSelf: 'stretch',
    gap: 7,
  },
  favoriteTabs: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255,244,222,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.20)',
  },
  favoriteTab: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  favoriteTabActive: {
    backgroundColor: '#E8DCCB',
  },
  favoriteTabText: {
    color: '#756E65',
    fontFamily: 'serif',
    fontSize: 10,
    fontWeight: '700',
  },
  favoriteTabTextActive: {
    color: '#684229',
    fontFamily: 'serif',
    fontSize: 10,
    fontWeight: '700',
  },
  favoriteCard: {
    paddingHorizontal: 11,
    paddingTop: 7,
    paddingBottom: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(255,244,222,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.22)',
  },
  favoriteCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  favoriteBadge: {
    color: '#8A5A38',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  favoriteHeart: {
    color: '#8A5A38',
    fontSize: 17,
  },
  favoriteTitle: {
    marginTop: 2,
    color: '#302C27',
    fontFamily: 'serif',
    fontSize: 13,
    fontWeight: '700',
  },
  favoriteQuote: {
    marginTop: 4,
    color: '#756E65',
    fontFamily: 'serif',
    fontSize: 10,
    lineHeight: 14,
  },
  favoriteMeta: {
    marginTop: 4,
    color: '#978E83',
    fontSize: 9,
  },
  favoriteProgressTrack: {
    height: 4,
    marginTop: 7,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(112,86,55,0.14)',
  },
  favoriteProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A46A37',
  },
  syncBadge: {
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: '#4A2C1A',
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncCloud: {
    width: 34,
    color: '#E6BF7D',
    fontSize: 22,
  },
  syncTextWrap: {
    flex: 1,
  },
  syncTitle: {
    color: '#F5DEB3',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
  },
  syncText: {
    marginTop: 1,
    color: '#CDB596',
    fontSize: 8,
    lineHeight: 11,
  },

  memorialPreview: {
    alignSelf: 'stretch',
  },
  introCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(112,86,55,0.14)',
    borderRadius: 16,
    backgroundColor: 'rgba(255,244,222,0.94)',
  },
  introCardTitle: {
    color: '#5C3822',
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '700',
  },
  introCardText: {
    marginTop: 5,
    color: '#654731',
    fontFamily: 'serif',
    fontSize: 11,
    lineHeight: 16,
  },
  createButton: {
    minHeight: 47,
    marginTop: 9,
    borderRadius: 12,
    backgroundColor: '#684229',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonPlus: {
    marginRight: 7,
    color: '#FFF8EA',
    fontSize: 22,
  },
  createButtonText: {
    color: '#FFF8EA',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionLabel: {
    marginTop: 13,
    marginBottom: 6,
    marginLeft: 3,
    color: '#74563F',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  memorialBookCard: {
    minHeight: 70,
    marginBottom: 7,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(112,86,55,0.14)',
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,240,216,0.94)',
  },
  memorialMark: {
    width: 39,
    height: 46,
    marginRight: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(138,90,56,0.11)',
  },
  memorialMarkText: {
    color: '#684229',
    fontFamily: 'serif',
    fontSize: 21,
  },
  memorialBookText: {
    flex: 1,
  },
  memorialBookTitle: {
    color: '#302C27',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  memorialBookMeta: {
    marginTop: 4,
    color: '#756E65',
    fontSize: 10,
  },
  memorialChevron: {
    color: '#8A5A38',
    fontSize: 23,
  },

  prayerBooksPreview: {
    alignSelf: 'stretch',
  },
  prayerBookCard: {
    minHeight: 63,
    marginBottom: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.20)',
    backgroundColor: 'rgba(255,244,222,0.96)',
  },
  prayerBookIcon: {
    width: 37,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F0D8AE',
  },
  prayerBookIconText: {
    color: '#7A4F2D',
    fontSize: 17,
  },
  prayerBookText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  prayerBookTitle: {
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '700',
  },
  prayerBookMeta: {
    marginTop: 3,
    color: '#8A6B52',
    fontSize: 10,
  },
  prayerBookChevron: {
    color: '#9A714C',
    fontSize: 23,
  },

  finishCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishCross: {
    color: '#EDC47D',
    fontSize: 48,
    textShadowColor: 'rgba(40,19,8,0.58)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  finishTitle: {
    marginTop: 8,
    color: '#FFF0CF',
    fontFamily: 'serif',
    fontSize: 35,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(40,19,8,0.68)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  finishText: {
    marginTop: 10,
    maxWidth: 290,
    color: '#F0DDBD',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    textShadowColor: 'rgba(40,19,8,0.72)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },

  appScreen: {
    alignSelf: 'stretch',
    minHeight: 445,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: '#B78A58',
    borderWidth: 1,
    borderColor: 'rgba(114,73,39,0.20)',
    shadowColor: '#3B2010',
    shadowOffset: {width: 0, height: 7},
    shadowOpacity: 0.18,
    shadowRadius: 13,
    elevation: 5,
  },
  appScreenBackground: {
    opacity: 0.72,
  },
  appScreenHeaderFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  appScreenHeader: {
    height: 59,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 4,
  },
  appScreenBack: {
    width: 34,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appScreenBackText: {
    marginTop: -3,
    color: '#6F4727',
    fontFamily: 'serif',
    fontSize: 31,
    lineHeight: 38,
  },
  appScreenTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  appScreenTitle: {
    color: '#432A19',
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  appScreenOrnament: {
    width: 105,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  appScreenLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(139,88,40,0.38)',
  },
  appScreenMark: {
    marginHorizontal: 5,
    color: '#98622E',
    fontSize: 6,
  },
  appScreenContent: {
    flex: 1,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },

  feastIconImage: {
    width: 58,
    height: 78,
    borderRadius: 11,
    backgroundColor: '#EED7B3',
  },
  calendarReadingRows: {
    marginTop: 8,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D3B68B',
    backgroundColor: '#EAD7B8',
  },
  calendarReadingRow: {
    minHeight: 37,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(123,79,36,0.18)',
  },
  calendarReadingLabel: {
    width: 73,
    color: '#8B5B30',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  calendarReadingValue: {
    flex: 1,
    color: '#4A3020',
    fontFamily: 'serif',
    fontSize: 11,
    fontWeight: '700',
  },
  calendarReadingArrow: {
    marginLeft: 5,
    color: '#8B5B30',
    fontSize: 19,
  },

  widgetSaintImage: {
    width: 34,
    height: 46,
    marginRight: 6,
    borderRadius: 7,
    backgroundColor: '#E7C897',
  },
  homeScreenPreview: {
    alignSelf: 'stretch',
    minHeight: 445,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#5A3A25',
    shadowColor: '#2B160A',
    shadowOffset: {width: 0, height: 7},
    shadowOpacity: 0.22,
    shadowRadius: 13,
    elevation: 5,
  },
  homeScreenWallpaper: {
    opacity: 0.82,
  },
  homeStatus: {
    height: 28,
    paddingHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeTime: {
    color: '#FFF3DB',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  homeStatusIcons: {
    color: '#FFF3DB',
    fontSize: 10,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  homeWidgets: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
  },
  homeDock: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(37,22,13,0.36)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  homeDockIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,244,222,0.88)',
  },
  homeDockIconText: {
    color: '#5E3A22',
    fontSize: 14,
    fontWeight: '700',
  },

  readerPreview: {
    flex: 1,
    paddingTop: 3,
  },
  readerTabs: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255,244,222,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.20)',
  },
  readerTab: {
    flex: 1,
    minHeight: 33,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  readerTabActive: {
    backgroundColor: '#8A5A38',
  },
  readerTabText: {
    color: '#756E65',
    fontFamily: 'serif',
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'center',
  },
  readerTabTextActive: {
    color: '#FFF4DE',
  },
  readerSectionHeader: {
    minHeight: 42,
    marginTop: 9,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,244,222,0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readerPsalmTitle: {
    color: '#4A3020',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  readerSave: {
    color: '#8A5A38',
    fontSize: 9,
    fontWeight: '700',
  },
  parallelReader: {
    flex: 1,
    marginTop: 8,
    padding: 10,
    borderRadius: 15,
    backgroundColor: '#FFF4DE',
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.16)',
    flexDirection: 'row',
  },
  readerColumn: {
    flex: 1,
    minWidth: 0,
  },
  readerDivider: {
    width: 1,
    marginHorizontal: 8,
    backgroundColor: 'rgba(126,82,38,0.18)',
  },
  readerColumnLabel: {
    marginBottom: 6,
    color: '#8A5A38',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  churchText: {
    marginBottom: 8,
    color: '#3F2B1E',
    fontFamily: 'Ponomar',
    fontSize: 12,
    lineHeight: 19,
  },
  russianText: {
    marginBottom: 8,
    color: '#4A382C',
    fontFamily: 'serif',
    fontSize: 11,
    lineHeight: 18,
  },
  readerHint: {
    minHeight: 48,
    marginTop: 8,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: '#EAD7B8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  readerHintIcon: {
    width: 31,
    color: '#8A5A38',
    fontSize: 20,
    textAlign: 'center',
  },
  readerHintText: {
    flex: 1,
    color: '#654731',
    fontSize: 9,
    lineHeight: 13,
  },

});
