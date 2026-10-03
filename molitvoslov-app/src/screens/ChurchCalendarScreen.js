import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {requestWidgetUpdate} from 'react-native-android-widget';
import NetInfo from '@react-native-community/netinfo';

import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {PrayerBeadsLoader} from '../components/feedback/PrayerBeadsLoader';
import {CategoryIcon} from '../components/icons/CategoryIcon';
import {
  formatFast,
  getBibleReadingVerses,
  getCalendarDay,
  getCalendarReadingItems,
  getCalendarMonth,
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
import {
  getBundledCalendarMonth,
  getOfflineCalendarDay,
  getOfflineCalendarMonth,
} from '../services/calendarOfflineStore';
import {getBundledCalendarIconSource} from '../data/calendarIconAssets';
import {ChurchCalendarWidget} from '../widgets/ChurchCalendarWidget';
import {colors} from '../theme';

const buildCells = (year, month) => {
  const first = new Date(year, month - 1, 1);
  const firstWeekday = (first.getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  const previousCount = new Date(year, month - 1, 0).getDate();
  const total = Math.ceil((firstWeekday + count) / 7) * 7;

  return Array.from({length: total}, (_item, index) => {
    const raw = index - firstWeekday + 1;
    let value = raw;
    let cellMonth = month;
    let cellYear = year;
    let outside = false;

    if (raw < 1) {
      value = previousCount + raw;
      cellMonth = month - 1;
      outside = true;
    } else if (raw > count) {
      value = raw - count;
      cellMonth = month + 1;
      outside = true;
    }

    if (cellMonth < 1) {
      cellMonth = 12;
      cellYear -= 1;
    } else if (cellMonth > 12) {
      cellMonth = 1;
      cellYear += 1;
    }

    return {
      day: value,
      month: cellMonth,
      year: cellYear,
      outside,
      date: `${cellYear}-${String(cellMonth).padStart(2, '0')}-${String(value).padStart(2, '0')}`,
    };
  });
};

const SoftChevron = ({expanded}) => (
  <Text style={[styles.readingArrow, expanded && styles.readingArrowExpanded]}>›</Text>
);

const displayTitle = (feast, copy) => feast?.short_title || feast?.title || copy.saintMemory;

const FeastImage = ({feast}) => {
  const [failed, setFailed] = useState(false);
  const [imageHeight, setImageHeight] = useState(120);

  const source = getBundledCalendarIconSource(feast);
  const imageWidth = 98;

  useEffect(() => {
    setFailed(false);

    if (!source) {
      return;
    }

    const resolved = Image.resolveAssetSource(source);

    if (resolved?.width && resolved?.height) {
      const calculatedHeight = imageWidth * (resolved.height / resolved.width);

      setImageHeight(Math.max(105, Math.min(170, calculatedHeight)));
    } else {
      setImageHeight(120);
    }
  }, [feast?.icon_url, feast?.source_id]);

  if (!source || failed) {
    return (
      <View style={styles.feastImageFallback}>
        <Text style={styles.feastImageCross}>☦</Text>
      </View>
    );
  }

  return (
    <Image
      source={source}
      resizeMode="cover"
      onLoad={(event) => {
        const {width, height} = event.nativeEvent.source || {};

        if (width && height) {
          const calculatedHeight = imageWidth * (height / width);

          setImageHeight(Math.max(105, Math.min(170, calculatedHeight)));
        }
      }}
      style={[
        styles.feastImage,
        {
          width: imageWidth,
          height: imageHeight,
        },
      ]}
      onError={() => setFailed(true)}
    />
  );
};

const normalizeCalendarText = (value) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const FormattedCalendarText = ({text}) => {
  const normalized = normalizeCalendarText(text);

  if (!normalized) {
    return null;
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <View style={styles.textBlockContent}>
      {paragraphs.map((paragraph, index) => (
        <Text
          key={`${index}-${paragraph.slice(0, 24)}`}
          style={[
            styles.textBlockParagraph,
            index === paragraphs.length - 1 && styles.textBlockParagraphLast,
          ]}
          selectable
        >
          {paragraph}
        </Text>
      ))}
    </View>
  );
};

const ExpandableTextBlock = ({title, subtitle, text}) => {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  return (
    <View style={styles.textBlock}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        style={({pressed}) => [styles.textBlockHeader, pressed && styles.pressed]}
      >
        <View style={styles.textBlockHeaderText}>
          <Text style={styles.textBlockTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.textBlockSubtitle}>{subtitle}</Text>}
        </View>

        <SoftChevron expanded={expanded} />
      </Pressable>

      {expanded && <FormattedCalendarText text={text} />}
    </View>
  );
};

const ReadingLink = ({kind, title, label, sequence, navigation, copy, language, onLayout}) => {
  const [expanded, setExpanded] = useState(false);

  if (!title) return null;

  const target = resolveBibleReference(title);
  const verses = getBibleReadingVerses(title);
  const chapters = new Set(verses.map((verse) => verse.chapterNumber));
  let previousChapter = null;

  return (
    <View style={styles.readingCard} onLayout={onLayout}>
      <Pressable
        disabled={!target}
        onPress={() => openCalendarBibleReference(navigation, title)}
        style={({pressed}) => [
          styles.readingLink,
          !target && styles.readingLinkDisabled,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.readingIcon}>
          <CategoryIcon type={kind === 'gospel' ? 'bible' : 'canons'} size={32} />
        </View>

        <View style={styles.readingTextWrap}>
          <Text style={styles.readingKind}>
            {kind === 'gospel' ? copy.gospel : copy.apostle}
            {!!sequence && ` · ${sequence}`}
          </Text>
          {!!label && <Text style={styles.readingLabel}>{label}</Text>}
          <Text style={styles.readingTitle}>{title}</Text>

          {target ? (
            <Text style={styles.readingHint}>{copy.openBible}</Text>
          ) : (
            <Text style={styles.readingHintMuted}>{copy.unrecognized}</Text>
          )}
        </View>

        {!!target && <Text style={styles.readingArrow}>›</Text>}
      </Pressable>

      {!!verses.length && (
        <>
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            style={({pressed}) => [styles.readingExpand, pressed && styles.pressed]}
          >
            <Text style={styles.readingExpandText}>{expanded ? copy.hideText : copy.readText}</Text>
            <SoftChevron expanded={expanded} />
          </Pressable>

          {expanded && (
            <View style={styles.readingContent}>
              {verses.map((verse, index) => {
                const showChapter = chapters.size > 1 && verse.chapterNumber !== previousChapter;

                previousChapter = verse.chapterNumber;

                return (
                  <View key={`${verse.chapterNumber}-${verse.verseNumber}-${index}`}>
                    {showChapter && (
                      <Text style={styles.readingChapter}>
                        {language === 'uk' ? 'Глава' : 'Глава'} {verse.chapterNumber}
                      </Text>
                    )}

                    <Text style={styles.readingVerseText} selectable>
                      <Text style={styles.readingVerseNumber}>{verse.verseNumber} </Text>
                      {verse.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const ReadingGroup = ({kind, readings, navigation, copy, language, onLayout}) => {
  const [showAll, setShowAll] = useState(false);

  if (!readings.length) {
    return null;
  }

  const visibleReadings = showAll ? readings : readings.slice(0, 2);
  const hiddenCount = Math.max(0, readings.length - visibleReadings.length);

  return (
    <View onLayout={onLayout}>
      {visibleReadings.map((reading, index) => (
        <ReadingLink
          key={reading.id || reading.sync_uid || `${kind}-${index}-${reading.title}`}
          kind={kind}
          title={reading.title}
          label={reading.label}
          sequence={readings.length > 1 ? `${index + 1}/${readings.length}` : ''}
          navigation={navigation}
          copy={copy}
          language={language}
        />
      ))}

      {readings.length > 2 && (
        <Pressable
          onPress={() => setShowAll((value) => !value)}
          style={({pressed}) => [styles.readingMore, pressed && styles.pressed]}
        >
          <Text style={styles.readingMoreText}>
            {showAll
              ? language === 'uk'
                ? 'Згорнути додаткові читання'
                : 'Скрыть дополнительные чтения'
              : language === 'uk'
                ? `Ще читань: ${hiddenCount}`
                : `Ещё чтений: ${hiddenCount}`}
          </Text>
          <SoftChevron expanded={showAll} />
        </Pressable>
      )}
    </View>
  );
};

export const ChurchCalendarScreen = ({route, navigation}) => {
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const scrollRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const readingLayouts = useRef({
    dayCard: null,
    readings: null,
    gospel: null,
    apostle: null,
  });

  const [readingLayoutVersion, setReadingLayoutVersion] = useState(0);

  const saveReadingLayout = (name, y) => {
    if (readingLayouts.current[name] === y) {
      return;
    }

    readingLayouts.current[name] = y;

    setReadingLayoutVersion((value) => value + 1);
  };

  const initial = useMemo(() => {
    const raw = route.params?.date;
    const parsed = raw ? new Date(raw + 'T12:00:00') : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [route.params?.date]);

  const [visibleYear, setVisibleYear] = useState(initial.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(initial.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(toCalendarDate(initial));
  const [language, setLanguageState] = useState('ru');
  const [monthData, setMonthData] = useState(null);
  const [dayData, setDayData] = useState(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadingDay, setLoadingDay] = useState(true);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const raw = route.params?.date;

    if (!raw) {
      return;
    }

    const parsed = new Date(`${raw}T12:00:00`);

    if (Number.isNaN(parsed.getTime())) {
      return;
    }

    setVisibleYear(parsed.getFullYear());
    setVisibleMonth(parsed.getMonth() + 1);
    setSelectedDate(toCalendarDate(parsed));
  }, [route.params?.date]);

  const wide = width >= 760;
  const headerHeight = insets.top + 56;
  const locale = CALENDAR_MONTHS[language];
  const copy = calendarText(language);
  const gospelReadings = useMemo(() => getCalendarReadingItems(dayData, 'gospel'), [dayData]);
  const apostleReadings = useMemo(() => getCalendarReadingItems(dayData, 'apostle'), [dayData]);

  useEffect(() => {
    const section = route.params?.section;

    if (!dayData || (section !== 'gospel' && section !== 'apostle')) {
      return;
    }

    const dayCardY = readingLayouts.current.dayCard;

    const readingsY = readingLayouts.current.readings;

    const readingY = readingLayouts.current[section];

    if (
      typeof dayCardY !== 'number' ||
      typeof readingsY !== 'number' ||
      typeof readingY !== 'number'
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const targetY = dayCardY + readingsY + readingY - headerHeight - 12;

      scrollRef.current?.scrollTo({
        y: Math.max(0, targetY),
        animated: true,
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [dayData, headerHeight, readingLayoutVersion, route.params?.section]);

  useEffect(() => {
    getCalendarLanguage()
      .then((value) => setLanguageState(value))
      .catch(() => setLanguageState('ru'));
  }, []);

  useEffect(() => {
    let previousOnline = null;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;

      if (online && previousOnline === false) {
        setRefreshVersion((value) => value + 1);
      }

      if (state.isConnected !== null) {
        previousOnline = online;
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = /inactive|background/.test(appStateRef.current || '');

      appStateRef.current = nextState;

      if (wasBackground && nextState === 'active') {
        setRefreshVersion((value) => value + 1);
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    let refreshTimer = null;
    const controller = new AbortController();
    const bundled = getBundledCalendarMonth(visibleYear, visibleMonth, language);
    let hasOfflineData = Boolean(bundled);

    if (bundled) {
      setMonthData(bundled);
      setError('');
      setLoadingMonth(false);
    } else {
      setLoadingMonth(true);
    }

    const refreshFromNetwork = async () => {
      try {
        const fresh = await getCalendarMonth(visibleYear, visibleMonth, {
          language,
          force: true,
          skipOffline: true,
          signal: controller.signal,
        });

        if (!active || controller.signal.aborted) return;

        setMonthData(fresh);
        setError('');
      } catch (err) {
        if (!active || controller.signal.aborted || err?.name === 'AbortError' || hasOfflineData) {
          return;
        }

        setError(err?.message || 'Не удалось загрузить календарь');
      } finally {
        if (active) {
          setLoadingMonth(false);
        }
      }
    };

    const loadMonth = async () => {
      try {
        const offline = await getOfflineCalendarMonth(visibleYear, visibleMonth, language);

        if (!active) return;

        if (offline) {
          hasOfflineData = true;
          setMonthData(offline);
          setError('');
          setLoadingMonth(false);
        }

        /*
         * Не запускаем HTTP-запрос на каждый промежуточный месяц,
         * если пользователь быстро листает стрелками.
         */
        refreshTimer = setTimeout(refreshFromNetwork, 180);
      } catch (err) {
        if (!active) return;

        if (!hasOfflineData) {
          setError(err?.message || 'Не удалось загрузить календарь');
          setLoadingMonth(false);
        }
      }
    };

    loadMonth();

    return () => {
      active = false;
      controller.abort();

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [language, refreshVersion, visibleMonth, visibleYear]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadDay = async () => {
      setLoadingDay(true);
      let hasOfflineData = false;

      try {
        const offline = await getOfflineCalendarDay(selectedDate, language);

        if (active && offline) {
          hasOfflineData = true;
          setDayData(offline);
          setError('');
          setLoadingDay(false);
        }

        const fresh = await getCalendarDay(selectedDate, {
          language,
          force: true,
          skipOffline: true,
          signal: controller.signal,
        });

        if (!active || controller.signal.aborted) return;

        setDayData(fresh);
        setError('');
      } catch (err) {
        if (!active || controller.signal.aborted || err?.name === 'AbortError' || hasOfflineData) {
          return;
        }

        setDayData(null);
        setError(err?.message || 'Не удалось загрузить день');
      } finally {
        if (active) {
          setLoadingDay(false);
        }
      }
    };

    loadDay();

    return () => {
      active = false;
      controller.abort();
    };
  }, [language, refreshVersion, selectedDate]);

  const daysMap = useMemo(
    () => new Map((monthData?.days || []).map((day) => [day.date_gregorian, day])),
    [monthData]
  );

  const cells = useMemo(() => buildCells(visibleYear, visibleMonth), [visibleMonth, visibleYear]);

  const today = toCalendarDate(new Date());
  const mainFeast = dayData?.main_feast || dayData?.all_feasts?.[0] || null;
  const otherFeasts = (dayData?.all_feasts || []).filter(
    (feast) => feast.source_id !== mainFeast?.source_id
  );

  const changeLanguage = async (nextLanguage) => {
    const next = await setCalendarLanguage(nextLanguage);
    setLanguageState(next);

    try {
      const widgetDay = await getCalendarDay(new Date(), {
        language: next,
        force: true,
      });

      await requestWidgetUpdate({
        widgetName: 'ChurchCalendar',
        renderWidget: (widgetInfo) => (
          <ChurchCalendarWidget
            day={widgetDay}
            language={next}
            width={widgetInfo.width}
            height={widgetInfo.height}
          />
        ),
      });
    } catch (err) {
      console.log('Не удалось обновить виджет календаря:', err?.message || err);
    }
  };

  const moveMonth = (delta) => {
    const next = new Date(visibleYear, visibleMonth - 1 + delta, 1);
    setVisibleYear(next.getFullYear());
    setVisibleMonth(next.getMonth() + 1);
  };

  const selectCell = (cell) => {
    setSelectedDate(cell.date);

    if (cell.month !== visibleMonth || cell.year !== visibleYear) {
      setVisibleMonth(cell.month);
      setVisibleYear(cell.year);
    }
  };

  const calendar = (
    <View style={styles.calendarCard}>
      <View style={styles.languageRow}>
        <Text style={styles.calendarSectionTitle}>{copy.calendarTitle}</Text>

        <View style={styles.languageSwitch}>
          {['ru', 'uk'].map((item) => {
            const active = language === item;

            return (
              <Pressable
                key={item}
                onPress={() => changeLanguage(item)}
                style={[styles.languageButton, active && styles.languageButtonActive]}
              >
                <Text
                  style={[styles.languageButtonText, active && styles.languageButtonTextActive]}
                >
                  {item === 'ru' ? 'РУ' : 'УК'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.calendarHeader}>
        <Pressable
          hitSlop={8}
          onPress={() => moveMonth(-1)}
          style={({pressed}) => [styles.monthArrowButton, pressed && styles.pressed]}
        >
          <Text style={styles.monthArrow}>‹</Text>
        </Pressable>

        <Text style={styles.monthTitle}>
          {locale.nominative[visibleMonth - 1]} {visibleYear}
        </Text>

        <Pressable
          hitSlop={8}
          onPress={() => moveMonth(1)}
          style={({pressed}) => [styles.monthArrowButton, pressed && styles.pressed]}
        >
          <Text style={styles.monthArrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {locale.miniWeekdays.map((weekday, index) => (
          <Text key={weekday} style={[styles.weekday, index >= 5 && styles.weekendText]}>
            {weekday}
          </Text>
        ))}
      </View>

      {loadingMonth ? (
        <View style={styles.calendarLoading}>
          <PrayerBeadsLoader compact />
        </View>
      ) : (
        <View style={styles.grid}>
          {cells.map((cell, index) => {
            const selected = selectedDate === cell.date;
            const isToday = today === cell.date;
            const weekend = index % 7 >= 5;

            return (
              <Pressable
                key={cell.date}
                onPress={() => selectCell(cell)}
                style={({pressed}) => [
                  styles.dayCell,
                  selected && styles.dayCellSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.dayBubble, isToday && styles.dayBubbleToday]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      cell.outside && styles.dayOutside,
                      weekend && !cell.outside && styles.weekendText,
                      isToday && styles.dayNumberToday,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const feastList = (
    <View style={styles.otherSaintsCard}>
      <Text style={styles.sectionEyebrow}>{copy.alsoToday}</Text>

      {otherFeasts.length ? (
        otherFeasts.map((feast) => (
          <View key={feast.source_id} style={styles.otherSaintRow}>
            <View style={styles.otherSaintDot} />
            <Text style={styles.otherSaintText}>{displayTitle(feast, copy)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.otherSaintEmpty}>{copy.noOtherMemories}</Text>
      )}
    </View>
  );

  const dayContent = (
    <View
      style={styles.dayCard}
      onLayout={(event) => saveReadingLayout('dayCard', event.nativeEvent.layout.y)}
    >
      {loadingDay ? (
        <View style={styles.dayLoading}>
          <PrayerBeadsLoader text={language === 'uk' ? 'Завантаження дня...' : 'Загрузка дня...'} />
        </View>
      ) : dayData ? (
        <>
          <Text style={styles.dayDate}>
            {new Date(dayData.date_gregorian + 'T12:00:00').toLocaleDateString(
              language === 'uk' ? 'uk-UA' : 'ru-RU',
              {day: 'numeric', month: 'long', year: 'numeric'}
            )}
          </Text>

          <View style={styles.feastHero}>
            <View style={styles.feastImageWrap}>
              <FeastImage feast={mainFeast} />
            </View>

            <View style={styles.feastHeroText}>
              <Text style={styles.feastMemory}>
                {language === 'uk' ? 'ПАМ’ЯТЬ СВЯТОГО / СВЯТО' : 'ПАМЯТЬ СВЯТОГО / ПРАЗДНИК'}
              </Text>
              <Text style={styles.feastTitle}>{displayTitle(mainFeast, copy)}</Text>

              {!!formatFast(dayData, language) && (
                <View style={styles.fastBadge}>
                  <Text style={styles.fastBadgeText}>{formatFast(dayData, language)}</Text>
                </View>
              )}
            </View>
          </View>

          {!!mainFeast?.life_content && (
            <ExpandableTextBlock
              title={copy.life}
              subtitle={mainFeast.life_title}
              text={mainFeast.life_content}
            />
          )}

          {!!mainFeast?.troparion_content && (
            <ExpandableTextBlock
              title={copy.troparion}
              subtitle={
                mainFeast.troparion_echo
                  ? `Глас ${mainFeast.troparion_echo}`
                  : mainFeast.troparion_title
              }
              text={mainFeast.troparion_content}
            />
          )}

          {!!mainFeast?.kontakion_content && (
            <ExpandableTextBlock
              title={copy.kontakion}
              subtitle={
                mainFeast.kontakion_echo
                  ? `Глас ${mainFeast.kontakion_echo}`
                  : mainFeast.kontakion_title
              }
              text={mainFeast.kontakion_content}
            />
          )}

          <View
            style={styles.readingsSection}
            onLayout={(event) => saveReadingLayout('readings', event.nativeEvent.layout.y)}
          >
            <Text style={styles.sectionEyebrow}>{copy.readings}</Text>

            <ReadingGroup
              kind="gospel"
              readings={gospelReadings}
              navigation={navigation}
              copy={copy}
              language={language}
              onLayout={(event) => saveReadingLayout('gospel', event.nativeEvent.layout.y)}
            />

            <ReadingGroup
              kind="apostle"
              readings={apostleReadings}
              navigation={navigation}
              copy={copy}
              language={language}
              onLayout={(event) => saveReadingLayout('apostle', event.nativeEvent.layout.y)}
            />

            {!gospelReadings.length && !apostleReadings.length && (
              <Text style={styles.noReadings}>{copy.noReadings}</Text>
            )}
          </View>
        </>
      ) : (
        <Text style={styles.errorText}>{error || copy.noData}</Text>
      )}
    </View>
  );

  return (
    <AppBackground imageOpacity={0.42}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + 14,
            paddingBottom: 34 + insets.bottom,
          },
        ]}
      >
        {!!error && !dayData && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {wide ? (
          <View style={styles.wideLayout}>
            <View style={styles.sidebar}>
              {calendar}
              {feastList}
            </View>
            <View style={styles.mainColumn}>{dayContent}</View>
          </View>
        ) : (
          <>
            {calendar}
            {feastList}
            {dayContent}
          </>
        )}
      </ScrollView>

      <FixedSectionHeader
        title={copy.calendarTitle}
        navigation={navigation}
        topInset={insets.top}
      />
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 10,
  },
  wideLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  sidebar: {
    width: 320,
    gap: 10,
  },
  mainColumn: {
    flex: 1,
  },
  calendarCard: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(123,79,36,0.18)',
    backgroundColor: 'rgba(255,245,224,0.98)',
  },
  languageRow: {
    minHeight: 34,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarSectionTitle: {
    flex: 1,
    color: '#5C3A24',
    fontFamily: 'serif',
    fontSize: 14,
    fontWeight: '700',
  },
  languageSwitch: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 10,
    backgroundColor: '#E7D2B0',
  },
  languageButton: {
    minWidth: 30,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  languageButtonActive: {
    backgroundColor: '#8E5D32',
  },
  languageButtonText: {
    color: '#7A5B43',
    fontSize: 10,
    fontWeight: '800',
  },
  languageButtonTextActive: {
    color: '#FFF4DE',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  monthArrowButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrow: {
    color: '#6F4727',
    fontSize: 28,
    lineHeight: 30,
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#4B3020',
    fontFamily: 'serif',
    fontSize: 19,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    color: '#7E6B5B',
    fontSize: 11,
    fontWeight: '700',
  },
  weekendText: {
    color: '#A54A3A',
  },
  calendarLoading: {
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dayCellSelected: {
    backgroundColor: 'rgba(184,123,56,0.11)',
  },
  dayBubble: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  dayBubbleToday: {
    backgroundColor: '#9A642E',
  },
  dayNumber: {
    color: '#493225',
    fontSize: 13,
  },
  dayNumberToday: {
    color: '#FFF7E7',
    fontWeight: '800',
  },
  dayOutside: {
    color: '#B7ADA4',
  },
  otherSaintsCard: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(123,79,36,0.15)',
    backgroundColor: 'rgba(255,245,224,0.95)',
  },
  sectionEyebrow: {
    color: '#89623F',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  otherSaintRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  otherSaintDot: {
    width: 5,
    height: 5,
    marginTop: 7,
    marginRight: 8,
    borderRadius: 3,
    backgroundColor: '#A66B32',
  },
  otherSaintText: {
    flex: 1,
    color: '#503524',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 18,
  },
  otherSaintEmpty: {
    marginTop: 8,
    color: '#8A7563',
    fontSize: 12,
  },
  dayCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(123,79,36,0.17)',
    backgroundColor: '#FFF4DE',
  },
  dayLoading: {
    minHeight: 340,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDate: {
    marginBottom: 12,
    color: '#765238',
    fontFamily: 'serif',
    fontSize: 15,
  },
  feastHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(123,79,36,0.19)',
  },
  feastImageWrap: {
    width: '98',
    // maxWidth: '120',
    // height: 142,
    alignSelf: 'center',
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#EED7B3',
  },

  feastImage: {
    borderRadius: 13,
  },
  feastImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feastImageCross: {
    color: '#8E5D32',
    fontSize: 38,
  },
  feastHeroText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 13,
  },
  feastMemory: {
    color: '#A16E35',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  feastTitle: {
    marginTop: 4,
    color: '#3F291B',
    fontFamily: 'serif',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
  },
  fastBadge: {
    alignSelf: 'flex-start',
    marginTop: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#EAD7B8',
  },
  fastBadgeText: {
    color: '#6C4A31',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  textBlock: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D3B68B',
    backgroundColor: '#EAD7B8',
    overflow: 'hidden',
  },
  textBlockHeader: {
    minHeight: 56,
    paddingLeft: 14,
    paddingRight: 7,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textBlockHeaderText: {
    flex: 1,
  },
  textBlockTitle: {
    color: '#5C3A24',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  textBlockSubtitle: {
    marginTop: 2,
    color: '#8A6547',
    fontSize: 11,
  },
  textBlockContent: {
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 17,
    backgroundColor: '#FFF4DE',
  },
  textBlockParagraph: {
    marginBottom: 12,
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 25,
    textAlign: 'justify',
  },
  textBlockParagraphLast: {
    marginBottom: 0,
  },
  readingsSection: {
    marginTop: 16,
  },
  readingCard: {
    marginTop: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D3B68B',
    backgroundColor: '#EAD7B8',
    overflow: 'hidden',
  },
  readingLink: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  readingLinkDisabled: {
    opacity: 0.72,
  },
  readingIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#F5E2C4',
    overflow: 'hidden',
  },
  readingTextWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  readingKind: {
    color: '#8B5B30',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  readingLabel: {
    marginTop: 2,
    color: '#76543A',
    fontSize: 10,
    fontWeight: '700',
  },
  readingTitle: {
    marginTop: 2,
    color: '#4A3020',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  readingHint: {
    marginTop: 3,
    color: '#8B5B30',
    fontSize: 10,
    fontWeight: '700',
  },
  readingHintMuted: {
    marginTop: 3,
    color: '#8A7563',
    fontSize: 10,
  },
  readingArrow: {
    marginLeft: 7,
    color: '#8B5B30',
    fontSize: 24,
  },
  readingArrowExpanded: {
    transform: [{rotate: '90deg'}],
  },
  readingExpand: {
    minHeight: 42,
    paddingLeft: 12,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(123,79,36,0.16)',
    backgroundColor: '#DFC59D',
  },
  readingExpandText: {
    color: '#6C472B',
    fontSize: 11,
    fontWeight: '800',
  },
  readingContent: {
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#FFF4DE',
  },
  readingChapter: {
    marginTop: 7,
    marginBottom: 5,
    color: '#7A4F2D',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  readingVerseText: {
    marginBottom: 6,
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'justify',
  },
  readingVerseNumber: {
    color: '#A16E35',
    fontFamily: 'serif',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  readingMore: {
    minHeight: 42,
    marginTop: 8,
    paddingLeft: 12,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(123,79,36,0.16)',
    backgroundColor: 'rgba(234,215,184,0.75)',
  },
  readingMoreText: {
    color: '#6C472B',
    fontSize: 11,
    fontWeight: '800',
  },
  noReadings: {
    marginTop: 10,
    color: '#8A7563',
    fontSize: 12,
  },
  errorBanner: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F5E0C9',
  },
  errorBannerText: {
    color: '#7B4D2D',
    fontSize: 12,
  },
  errorText: {
    paddingVertical: 40,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.64,
  },
});
