import React, {useRef, useState} from 'react';
import {
  Animated,
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

const SLIDE_COUNT = 6;

const artwork = {
  page: require('../../assets/home/page_bg3.png'),
  hero: require('../../assets/home/hero.png'),
  matthew: require('../../assets/bible/evangelists/matthew-bg.png'),
  morning: require('../../assets/home/morning.png'),
  akathists: require('../../assets/home/akathists.png'),
  canons: require('../../assets/home/canons.png'),
  psalter: require('../../assets/home/psalter.png'),
};

const ChapterCell = ({number, active}) => (
  <View style={[styles.chapterCell, active && styles.chapterCellActive]}>
    <Text style={[styles.chapterNumber, active && styles.chapterNumberActive]}>{number}</Text>
  </View>
);

const PrayerCard = ({image, title, subtitle}) => (
  <ImageBackground
    source={image}
    resizeMode="cover"
    style={styles.prayerCard}
    imageStyle={styles.prayerCardImage}
  >
    <LinearGradient
      colors={['rgba(45, 24, 12, 0.08)', 'rgba(45, 24, 12, 0.78)']}
      locations={[0.2, 1]}
      style={styles.prayerCardShade}
    >
      <Text style={styles.prayerCardTitle}>{title}</Text>
      <Text style={styles.prayerCardSubtitle}>{subtitle}</Text>
    </LinearGradient>
  </ImageBackground>
);

const SlideIntro = () => (
  <View style={styles.visualFill}>
    <ImageBackground
      source={artwork.hero}
      resizeMode="cover"
      style={styles.introArtwork}
      imageStyle={styles.introArtworkImage}
    >
      <LinearGradient
        colors={['rgba(54, 29, 14, 0.08)', 'rgba(54, 29, 14, 0.22)', 'rgba(54, 29, 14, 0.72)']}
        locations={[0, 0.5, 1]}
        style={styles.introShade}
      >
        <View style={styles.introBrand}>
          <Text style={styles.introCross}>☦</Text>
          <Text style={styles.introBrandTitle}>Молитвослов</Text>
          <View style={styles.ornament}>
            <View style={styles.ornamentLineLight} />
            <Text style={styles.ornamentMarkLight}>✦</Text>
            <View style={styles.ornamentLineLight} />
          </View>
        </View>
      </LinearGradient>
    </ImageBackground>
  </View>
);

const SlideBible = () => (
  <View style={styles.visualFill}>
    <ImageBackground
      source={artwork.matthew}
      resizeMode="cover"
      style={styles.gospelCard}
      imageStyle={styles.gospelCardImage}
    >
      <LinearGradient
        colors={['rgba(34, 18, 9, 0.18)', 'rgba(34, 18, 9, 0.45)', 'rgba(34, 18, 9, 0.82)']}
        locations={[0, 0.48, 1]}
        style={styles.gospelShade}
      >
        <View style={styles.gospelTop}>
          <Text style={styles.gospelEyebrow}>СВЯЩЕННОЕ ПИСАНИЕ</Text>
          <Text style={styles.gospelTitle}>Евангелие от Матфея</Text>
        </View>

        <View style={styles.resumeDemo}>
          <View style={styles.resumeTextWrap}>
            <Text style={styles.resumeLabel}>Продолжить чтение</Text>
            <Text style={styles.resumePosition}>Глава 5 · Нагорная проповедь</Text>
          </View>
          <Text style={styles.resumePercent}>34%</Text>
        </View>

        <View style={styles.chapterGrid}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((number) => (
            <ChapterCell key={number} number={number} active={number === 5} />
          ))}
        </View>
      </LinearGradient>
    </ImageBackground>
  </View>
);

const SlideLibrary = () => (
  <View style={styles.visualFill}>
    <View style={styles.libraryStack}>
      <PrayerCard
        image={artwork.morning}
        title="Утренние молитвы"
        subtitle="Начните день с Богом"
      />
      <PrayerCard image={artwork.akathists} title="Акафисты" subtitle="Молитвенные песнопения" />
      <PrayerCard image={artwork.canons} title="Каноны" subtitle="Покаянные и просительные" />
      <PrayerCard image={artwork.psalter} title="Псалтирь" subtitle="Молитва и утешение" />
    </View>

    <View style={styles.savedBadge}>
      <Text style={styles.savedBadgeIcon}>♡</Text>
      <View>
        <Text style={styles.savedBadgeTitle}>Сохраняйте важное</Text>
        <Text style={styles.savedBadgeText}>Любимые тексты всегда под рукой</Text>
      </View>
    </View>
  </View>
);

const SlideCalendar = () => (
  <View style={styles.visualFill}>
    <View style={styles.calendarDemo}>
      <View style={styles.calendarHeader}>
        <View>
          <Text style={styles.calendarKicker}>ЦЕРКОВНЫЙ КАЛЕНДАРЬ</Text>
          <Text style={styles.calendarDate}>2 октября</Text>
        </View>
        <Text style={styles.calendarCross}>☦</Text>
      </View>

      <View style={styles.calendarMemory}>
        <View style={styles.calendarSaint}>
          <Text style={styles.calendarSaintCross}>✦</Text>
        </View>
        <View style={styles.calendarMemoryText}>
          <Text style={styles.calendarMemoryLabel}>ПАМЯТЬ ДНЯ</Text>
          <Text style={styles.calendarMemoryTitle} numberOfLines={2}>
            Святые и праздники сегодняшнего дня
          </Text>
        </View>
      </View>

      <View style={styles.calendarRows}>
        {[
          ['ПОСТ', 'Правило поста на сегодня'],
          ['ЕВАНГЕЛИЕ', 'Дневное чтение'],
          ['АПОСТОЛ', 'Апостольское чтение'],
        ].map(([label, value]) => (
          <View key={label} style={styles.calendarRow}>
            <Text style={styles.calendarRowLabel}>{label}</Text>
            <Text style={styles.calendarRowValue}>{value}</Text>
          </View>
        ))}
      </View>
    </View>

    <View style={styles.widgetRow}>
      <View style={styles.widgetCard}>
        <Text style={styles.widgetIcon}>▣</Text>
        <Text style={styles.widgetTitle}>Календарь</Text>
        <Text style={styles.widgetText}>На главном экране</Text>
      </View>

      <View style={styles.widgetCard}>
        <Text style={styles.widgetIcon}>❧</Text>
        <Text style={styles.widgetTitle}>Цитата дня</Text>
        <Text style={styles.widgetText}>Всегда перед глазами</Text>
      </View>
    </View>
  </View>
);

const SlidePersonal = () => (
  <View style={styles.visualFill}>
    <View style={styles.personalStack}>
      <View style={[styles.personalCard, styles.personalCardOne]}>
        <Text style={styles.personalType}>ПРОДОЛЖИТЬ ЧТЕНИЕ</Text>
        <Text style={styles.personalTitle}>Евангелие от Иоанна</Text>
        <Text style={styles.personalMeta}>Глава 8</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, {width: '62%'}]} />
        </View>
      </View>

      <View style={[styles.personalCard, styles.personalCardTwo]}>
        <Text style={styles.personalType}>ПОМЯННИК</Text>
        <Text style={styles.personalTitle}>Имена для молитвы</Text>
        <Text style={styles.personalMeta}>Живые и усопшие</Text>
      </View>

      <View style={[styles.personalCard, styles.personalCardThree]}>
        <Text style={styles.personalType}>ЛИЧНЫЙ МОЛИТВОСЛОВ</Text>
        <Text style={styles.personalTitle}>Мои молитвы</Text>
        <Text style={styles.personalMeta}>Собственные подборки</Text>
      </View>
    </View>

    <View style={styles.syncBadge}>
      <Text style={styles.syncIcon}>☁</Text>
      <View style={styles.syncTextWrap}>
        <Text style={styles.syncTitle}>Синхронизация</Text>
        <Text style={styles.syncText}>
          Прогресс и личные данные можно сохранить между устройствами
        </Text>
      </View>
    </View>
  </View>
);

const SlideFinish = () => (
  <View style={styles.visualFill}>
    <ImageBackground
      source={artwork.hero}
      resizeMode="cover"
      style={styles.finishArtwork}
      imageStyle={styles.finishArtworkImage}
    >
      <LinearGradient
        colors={['rgba(50, 27, 14, 0.22)', 'rgba(50, 27, 14, 0.46)', 'rgba(50, 27, 14, 0.82)']}
        style={styles.finishShade}
      >
        <Text style={styles.finishCross}>☦</Text>
        <Text style={styles.finishTitle}>Всё готово</Text>
        <Text style={styles.finishText}>
          Откройте Молитвослов и начните с того, что нужно вам сегодня.
        </Text>
      </LinearGradient>
    </ImageBackground>
  </View>
);

const slides = [
  {
    eyebrow: 'ДОБРО ПОЖАЛОВАТЬ',
    title: 'Молитвослов всегда рядом',
    text: 'Молитва, Священное Писание и церковный календарь в одном месте.',
    visual: <SlideIntro />,
  },
  {
    eyebrow: 'СВЯЩЕННОЕ ПИСАНИЕ',
    title: 'Читайте и продолжайте с того же места',
    text: 'Евангелие, Апостол, Псалтирь и другие книги. Место чтения сохраняется автоматически.',
    visual: <SlideBible />,
  },
  {
    eyebrow: 'МОЛИТВЫ',
    title: 'Соберите молитвослов под себя',
    text: 'Молитвенные правила, акафисты, каноны и любимые тексты — в удобных подборках.',
    visual: <SlideLibrary />,
  },
  {
    eyebrow: 'ЦЕРКОВНЫЙ ДЕНЬ',
    title: 'Календарь и виджеты всегда под рукой',
    text: 'Память святых, пост, Евангелие, Апостол и ежедневные виджеты прямо на главном экране.',
    visual: <SlideCalendar />,
  },
  {
    eyebrow: 'ЛИЧНОЕ ПРОСТРАНСТВО',
    title: 'Ваше чтение и молитвы не потеряются',
    text: 'Прогресс, помянник и личные молитвословы можно хранить локально и синхронизировать.',
    visual: <SlidePersonal />,
  },
  {
    eyebrow: 'МОЛИТВОСЛОВ',
    title: 'Откройте то, что нужно сегодня',
    text: 'Все основные возможности уже готовы к использованию.',
    visual: <SlideFinish />,
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

      <ImageBackground source={artwork.page} resizeMode="cover" style={styles.screen}>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,248,235,0.74)', 'rgba(247,236,216,0.90)']}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.topBar}>
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
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            });

            const translateY = scrollX.interpolate({
              inputRange,
              outputRange: [14, 0, 14],
              extrapolate: 'clamp',
            });

            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.985, 1, 0.985],
              extrapolate: 'clamp',
            });

            return (
              <View key={slideIndex} style={[styles.slide, {width}]}>
                <Animated.View
                  style={[
                    styles.slideInner,
                    {
                      opacity,
                      transform: [{translateY}, {scale}],
                    },
                  ]}
                >
                  <View style={styles.visualArea}>{slide.visual}</View>

                  <View style={styles.copy}>
                    <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
                    <Text style={styles.title}>{slide.title}</Text>
                    <Text style={styles.body}>{slide.text}</Text>
                  </View>
                </Animated.View>
              </View>
            );
          })}
        </Animated.ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {slides.map((_, dotIndex) => (
              <View key={dotIndex} style={[styles.dot, dotIndex === index && styles.dotActive]} />
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
      </ImageBackground>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3E4CC',
  },
  screen: {
    flex: 1,
    backgroundColor: '#F3E4CC',
  },
  topBar: {
    height: 54,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  brandMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandMiniCross: {
    color: '#8B5A32',
    fontFamily: 'serif',
    fontSize: 18,
  },
  brandMiniText: {
    color: '#4A2D1B',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  skipText: {
    color: '#805738',
    fontSize: 13,
    fontWeight: '600',
  },
  skipPlaceholder: {
    width: 84,
  },
  slide: {
    flex: 1,
  },
  slideInner: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 8,
  },
  visualArea: {
    flex: 1,
    minHeight: 330,
    justifyContent: 'center',
  },
  visualFill: {
    width: '100%',
    maxWidth: 410,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  copy: {
    minHeight: 174,
    paddingTop: 12,
    paddingHorizontal: 2,
    justifyContent: 'flex-start',
  },
  eyebrow: {
    color: '#9A693A',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    marginTop: 7,
    color: '#3B281D',
    fontFamily: 'serif',
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
  },
  body: {
    marginTop: 9,
    maxWidth: 390,
    color: '#766457',
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 8,
  },
  dots: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(110, 74, 43, 0.22)',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#9A693A',
  },
  nextButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#4B2B18',
    borderWidth: 1,
    borderColor: 'rgba(231, 190, 118, 0.38)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: '#2D180C',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.16,
    shadowRadius: 9,
    elevation: 4,
  },
  nextButtonFinal: {
    backgroundColor: '#5A321A',
  },
  nextButtonText: {
    color: '#F6DFB2',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  nextArrow: {
    marginLeft: 9,
    marginTop: -2,
    color: '#F6DFB2',
    fontSize: 25,
    lineHeight: 27,
  },
  pressed: {
    opacity: 0.68,
  },

  introArtwork: {
    height: 350,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#5A321A',
    shadowColor: '#3A1D0C',
    shadowOffset: {width: 0, height: 9},
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 7,
  },
  introArtworkImage: {
    borderRadius: 28,
  },
  introShade: {
    flex: 1,
    padding: 24,
    justifyContent: 'flex-end',
  },
  introBrand: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  introCross: {
    color: '#EDC980',
    fontFamily: 'serif',
    fontSize: 42,
    textShadowColor: 'rgba(40, 19, 8, 0.55)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 5,
  },
  introBrandTitle: {
    marginTop: 2,
    color: '#FFF0CF',
    fontFamily: 'serif',
    fontSize: 31,
    fontWeight: '700',
    textShadowColor: 'rgba(40, 19, 8, 0.65)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  ornament: {
    width: 155,
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ornamentLineLight: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(238, 201, 128, 0.75)',
  },
  ornamentMarkLight: {
    marginHorizontal: 8,
    color: '#EDC980',
    fontSize: 10,
  },

  gospelCard: {
    height: 365,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#3A2113',
    shadowColor: '#2B160A',
    shadowOffset: {width: 0, height: 9},
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 7,
  },
  gospelCardImage: {
    borderRadius: 28,
  },
  gospelShade: {
    flex: 1,
    padding: 18,
    justifyContent: 'flex-end',
  },
  gospelTop: {
    marginBottom: 12,
  },
  gospelEyebrow: {
    color: '#EAC783',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  gospelTitle: {
    marginTop: 3,
    color: '#FFF0D1',
    fontFamily: 'serif',
    fontSize: 21,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  resumeDemo: {
    minHeight: 54,
    marginBottom: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(49, 25, 12, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(231, 181, 96, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  resumeTextWrap: {
    flex: 1,
  },
  resumeLabel: {
    color: '#F4D393',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '700',
  },
  resumePosition: {
    marginTop: 2,
    color: '#E3D1B5',
    fontSize: 10,
  },
  resumePercent: {
    marginLeft: 8,
    color: '#F0C774',
    fontSize: 11,
    fontWeight: '800',
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chapterCell: {
    width: '23%',
    height: 39,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(223, 174, 91, 0.38)',
    backgroundColor: 'rgba(52, 27, 13, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterCellActive: {
    borderColor: '#E7B65D',
    backgroundColor: 'rgba(129, 78, 27, 0.82)',
  },
  chapterNumber: {
    color: '#FCE8C1',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  chapterNumberActive: {
    color: '#FFE3A4',
  },

  libraryStack: {
    gap: 8,
  },
  prayerCard: {
    height: 68,
    overflow: 'hidden',
    borderRadius: 17,
    backgroundColor: '#7A4A29',
  },
  prayerCardImage: {
    borderRadius: 17,
  },
  prayerCardShade: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 9,
    justifyContent: 'flex-end',
  },
  prayerCardTitle: {
    color: '#FFF0D3',
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  prayerCardSubtitle: {
    marginTop: 1,
    color: '#E7D3B2',
    fontSize: 9,
  },
  savedBadge: {
    marginTop: 11,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 246, 229, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(139, 91, 49, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedBadgeIcon: {
    width: 38,
    color: '#9A5E33',
    fontSize: 28,
  },
  savedBadgeTitle: {
    color: '#4B2F1E',
    fontFamily: 'serif',
    fontSize: 13,
    fontWeight: '700',
  },
  savedBadgeText: {
    marginTop: 2,
    color: '#8A7565',
    fontSize: 10,
  },

  calendarDemo: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 246, 228, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(139, 91, 49, 0.20)',
    shadowColor: '#5A351D',
    shadowOffset: {width: 0, height: 7},
    shadowOpacity: 0.13,
    shadowRadius: 13,
    elevation: 4,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarKicker: {
    color: '#A06A3B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  calendarDate: {
    marginTop: 2,
    color: '#3F2A1C',
    fontFamily: 'serif',
    fontSize: 23,
    fontWeight: '700',
  },
  calendarCross: {
    color: '#A66A36',
    fontSize: 28,
  },
  calendarMemory: {
    minHeight: 73,
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#F1DFC2',
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarSaint: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: '#D5B47B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarSaintCross: {
    color: '#6A421F',
    fontSize: 20,
  },
  calendarMemoryText: {
    flex: 1,
    marginLeft: 11,
  },
  calendarMemoryLabel: {
    color: '#A06A3B',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  calendarMemoryTitle: {
    marginTop: 3,
    color: '#4A3120',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  calendarRows: {
    marginTop: 9,
  },
  calendarRow: {
    minHeight: 35,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(122, 82, 47, 0.17)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarRowLabel: {
    width: 82,
    color: '#A06A3B',
    fontSize: 8,
    fontWeight: '800',
  },
  calendarRowValue: {
    flex: 1,
    color: '#675244',
    fontSize: 10,
  },
  widgetRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 9,
  },
  widgetCard: {
    flex: 1,
    minHeight: 66,
    borderRadius: 17,
    padding: 10,
    backgroundColor: '#4B2D1A',
  },
  widgetIcon: {
    color: '#E6BF7D',
    fontSize: 15,
  },
  widgetTitle: {
    marginTop: 3,
    color: '#F7E3BB',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
  },
  widgetText: {
    marginTop: 1,
    color: '#CEB797',
    fontSize: 8,
  },

  personalStack: {
    minHeight: 252,
    justifyContent: 'center',
  },
  personalCard: {
    minHeight: 92,
    borderRadius: 19,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(139, 91, 49, 0.16)',
    shadowColor: '#5A351D',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.11,
    shadowRadius: 9,
    elevation: 3,
  },
  personalCardOne: {
    backgroundColor: '#FFF0D8',
    zIndex: 3,
  },
  personalCardTwo: {
    marginTop: -13,
    marginHorizontal: 12,
    paddingTop: 25,
    backgroundColor: '#F4DFC0',
    zIndex: 2,
  },
  personalCardThree: {
    marginTop: -13,
    marginHorizontal: 24,
    paddingTop: 25,
    backgroundColor: '#E8CFA9',
    zIndex: 1,
  },
  personalType: {
    color: '#A06A3B',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  personalTitle: {
    marginTop: 3,
    color: '#422B1D',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  personalMeta: {
    marginTop: 2,
    color: '#806B5B',
    fontSize: 9,
  },
  progressTrack: {
    height: 4,
    marginTop: 9,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: 'rgba(115, 78, 47, 0.14)',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A46A37',
  },
  syncBadge: {
    marginTop: 13,
    minHeight: 65,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#4A2C1A',
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncIcon: {
    width: 40,
    color: '#E6BF7D',
    fontSize: 25,
  },
  syncTextWrap: {
    flex: 1,
  },
  syncTitle: {
    color: '#F5DEB3',
    fontFamily: 'serif',
    fontSize: 13,
    fontWeight: '700',
  },
  syncText: {
    marginTop: 2,
    color: '#CDB596',
    fontSize: 9,
    lineHeight: 13,
  },

  finishArtwork: {
    height: 350,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#4A2B18',
    shadowColor: '#351A0B',
    shadowOffset: {width: 0, height: 9},
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 7,
  },
  finishArtworkImage: {
    borderRadius: 28,
  },
  finishShade: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishCross: {
    color: '#EBC57E',
    fontSize: 42,
  },
  finishTitle: {
    marginTop: 8,
    color: '#FFF0CF',
    fontFamily: 'serif',
    fontSize: 31,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 5,
  },
  finishText: {
    marginTop: 11,
    maxWidth: 280,
    color: '#E9D6B5',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
