import React, {useEffect, useState} from 'react';
import {
  Image,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {LinearGradient} from 'expo-linear-gradient';
import {Feather} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {getBundledCalendarIconSource} from '../data/calendarIconAssets';
import {useLanguage} from '../context/LanguageContext';
import {getOfflineCalendarDay} from '../services/calendarOfflineStore';
import {findSaintForSharedLink} from '../services/saintShareResolver';
import {CalendarSaveWholeButton, CalendarSelectableBody, makeCalendarSaveContext} from '../components/reader/CalendarSaveText';
import {shareContent} from '../services/contentSharing';

const formatDate = (value, language) => {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(
    language === 'uk' ? 'uk-UA' : 'ru-RU',
    {day: 'numeric', month: 'long'}
  );
};

const getStoryHeading = (title, uk) => {
  const name = String(title || '');
  if (/(?:икон|образ|знамени)/i.test(name) && /(?:богородиц|икон|образ|знамени)/i.test(name)) {
    return uk ? 'Історія ікони' : 'История иконы';
  }
  if (/рождеств|крещени|богоявлени|сретени|преображени|воздвижени|успени|введени|покров|вход господ|вознесени|пятидесятниц|пасх|воскресени христ|благовещени|обрезани господ/i.test(name)) {
    return uk ? 'Історія свята' : 'История праздника';
  }
  return uk ? 'Житіє' : 'Житие';
};

const Accordion = ({
  title,
  subtitle,
  text,
  icon,
  initialOpen = false,
  focusHighlight = false,
  innerScroll = false,
  height = 320,
  feast,
  date,
  section,
  sourceTitle,
}) => {
  const [open, setOpen] = useState(initialOpen || focusHighlight);
  const [wholeSaved, setWholeSaved] = useState(false);
  const actionsRef=React.useRef(null);
  const [hasMoreText, setHasMoreText] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const [scrollMetrics, setScrollMetrics] = useState({content: 0, viewport: height, y: 0});
  useEffect(() => { if (focusHighlight) setOpen(true); }, [focusHighlight]);
  if (!text) return null;
  const saveContext = makeCalendarSaveContext({
    feast, date, section, title: sourceTitle, sectionTitle: title,
    fontFamily: styles.body.fontFamily,
  });
  const content = (
    <View style={styles.readingContent}>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <CalendarSelectableBody text={text} saveContext={saveContext} textStyle={styles.body} />
    </View>
  );
  return (
    <View style={[styles.accordion, focusHighlight && styles.accordionFocused]}>
      <View style={styles.accordionHeaderRow}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          onLongPress={()=>actionsRef.current?.openMenu()}
          delayLongPress={340}
          accessibilityRole="button"
          accessibilityState={{expanded: open}}
          style={[styles.accordionHeader, styles.accordionHeaderTap]}
        >
        <View style={styles.accordionIcon}>
          {icon === 'life' ? <Feather name="book-open" size={22} color="#7A4F2D" /> : <Text style={styles.accordionIconText}>{icon}</Text>}
        </View>
        <View style={styles.accordionHeading}>
          <Text style={styles.accordionTitle}>{title}</Text>
          {!open && !!subtitle && <Text style={styles.preview} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <View style={[styles.chevron, open && styles.chevronOpen]} />
        </Pressable>
        <CalendarSaveWholeButton
          ref={actionsRef}
          text={text}
          saveContext={saveContext}
          menuVariant
          onSavedChange={setWholeSaved}
          onShare={()=>shareContent({
            title:(sourceTitle||'Святой дня')+' — '+title,
            text,
            screen:'SaintDetail',
            params:{date,focusSection:section,feastUid:feast?.sync_uid},
          })}
        />
      </View>
      {open && (
        <View style={styles.expandedWrap}>
          {innerScroll ? (
            <View style={styles.lifeInset}>
              <View style={[styles.lifeScrollFrame, {maxHeight: height}]}>
                <ScrollView
                  nestedScrollEnabled
                  // showsVerticalScrollIndicator
                  // persistentScrollbar
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={hasMoreText}
                  scrollEventThrottle={32}
                  onLayout={(event) => {
                    const viewport = event.nativeEvent.layout.height;
                    setScrollMetrics((old) => ({...old, viewport}));
                    setHasMoreText(scrollMetrics.content > viewport + 2);
                  }}
                  onContentSizeChange={(_width, contentHeight) => {
                    setHasMoreText(contentHeight > scrollMetrics.viewport + 2);
                    setScrollMetrics((old) => ({...old, content: contentHeight}));
                  }}
                  onScroll={({nativeEvent}) => {
                    const {contentOffset, contentSize, layoutMeasurement} = nativeEvent;
                    setAtBottom(contentOffset.y + layoutMeasurement.height >= contentSize.height - 14);
                    setScrollMetrics({y: contentOffset.y, content: contentSize.height,
                      viewport: layoutMeasurement.height});
                  }}
                  contentContainerStyle={styles.lifeScrollContent}
                >
                  {content}
                </ScrollView>
                {hasMoreText && (
                  <View pointerEvents="none" style={styles.lifeScrollTrack}>
                    <View style={[styles.lifeScrollThumb, {
                      height: Math.max(22, scrollMetrics.viewport * scrollMetrics.viewport /
                        Math.max(scrollMetrics.content, scrollMetrics.viewport)),
                      transform: [{translateY: Math.max(0, scrollMetrics.y) *
                        Math.max(0, scrollMetrics.viewport - Math.max(22,
                          scrollMetrics.viewport * scrollMetrics.viewport /
                          Math.max(scrollMetrics.content, scrollMetrics.viewport))) /
                        Math.max(1, scrollMetrics.content - scrollMetrics.viewport)}],
                    }]} />
                  </View>
                )}
                {hasMoreText && !atBottom && (
                  <LinearGradient pointerEvents="none"
                    colors={['rgba(255,244,222,0)', 'rgba(255,244,222,0.90)', '#FFF4DE']}
                    style={styles.lifeScrollFade} />
                )}
              </View>
            </View>
          ) : content}
        </View>
      )}
    </View>
  );
};

export const SaintDetailScreen = ({route, navigation}) => {
  const {language} = useLanguage();
  const {feast, date, focusSection, feastId, feastUid, feastTitle} = route.params || {};
  const [calendarFeast, setCalendarFeast] = useState(feast || null);
  const [sharedCardLoading, setSharedCardLoading] = useState(!feast && !!date);
  const [sharedCardNotFound, setSharedCardNotFound] = useState(false);
  useEffect(() => {
    let active = true;
    setCalendarFeast(feast || null);
    const shouldLoad = !feast && !!date;
    setSharedCardLoading(shouldLoad);
    setSharedCardNotFound(false);
    if (!shouldLoad) return () => {active = false;};
    // A direct HTTPS/Telegram link contains a date and optional feast identity,
    // but not the full feast. Restore the card from bundled offline calendar.
    getOfflineCalendarDay(date, language)
      .then(day => {
        if (!active) return;
        const matched = findSaintForSharedLink(day, {
          feastUid, feastId, feastTitle, focusSection,
        });
        if (matched) setCalendarFeast(matched);
        else setSharedCardNotFound(true);
      })
      .catch(error => {
        if (active) setSharedCardNotFound(true);
        console.warn('Saint card offline:', error?.message || error);
      })
      .finally(() => {
        if (active) setSharedCardLoading(false);
      });
    return () => {active = false;};
  }, [date, feastId, feastUid, feastTitle, focusSection, language, feast]);
  const resolvedFeast = calendarFeast || feast || {};
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const {width, height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const uk = language === 'uk';
  const title = (uk && resolvedFeast?.title_uk) || resolvedFeast?.title || '';
  const bundled = getBundledCalendarIconSource(resolvedFeast);
  const image = bundled || (resolvedFeast?.icon_url ? {uri: resolvedFeast.icon_url} : null);
  const life = (uk && resolvedFeast?.life_content_uk) || resolvedFeast?.life_content;
  const troparion = (uk && resolvedFeast?.troparion_content_uk) || resolvedFeast?.troparion_content;
  const kontakion = (uk && resolvedFeast?.kontakion_content_uk) || resolvedFeast?.kontakion_content;
  const prayer = (uk && resolvedFeast?.prayer_content_uk) || resolvedFeast?.prayer_content;
  const large = width >= 560;
  const heroImageWidth = large ? 180 : Math.min(132, width * 0.34);
  const lifeHeight = Math.min(420, height * 0.78);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, {paddingTop: insets.top + 78, paddingBottom: 26}]}
      >
        <View style={[styles.heroCard, large && styles.heroCardWide]}>
          {!!image && (
            <Pressable onPress={() => setImageViewerOpen(true)} accessibilityRole="button"
              accessibilityLabel={uk ? 'Збільшити ікону' : 'Увеличить икону'}>
              <Image source={image}
                style={[styles.image, {width: heroImageWidth, height: heroImageWidth * 1.24}]}
                resizeMode="contain" />

            </Pressable>
          )}
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>
              {uk ? 'ПАМ’ЯТЬ СВЯТОГО / СВЯТО' : 'ПАМЯТЬ СВЯТОГО / ПРАЗДНИК'}
            </Text>
            <Text style={[styles.saintTitle, large && styles.saintTitleWide]}>{title}</Text>
            <View style={styles.chips}>
              <Text style={styles.chip}>☦ {uk ? 'День пам’яті' : 'День памяти'}{date ? ` · ${formatDate(date, language)}` : ''}</Text>
            </View>
          </View>
        </View>

        <Accordion
          title={getStoryHeading(title, uk)}
          feast={resolvedFeast}
          date={date}
          sourceTitle={title}
          section="life"
          icon="life"
          text={life}
          initialOpen={focusSection === "life"}
          focusHighlight={focusSection === "life"}
          innerScroll
          height={lifeHeight}
        />
        <Accordion
          title={uk ? 'Тропар' : 'Тропарь'}
          feast={resolvedFeast}
          date={date}
          sourceTitle={title}
          section="troparion"
          focusHighlight={focusSection === 'troparion'}
          icon="♪"
          text={troparion}
          subtitle={resolvedFeast?.troparion_echo ? 'Глас ' + resolvedFeast.troparion_echo : resolvedFeast?.troparion_title}
        />
        <Accordion
          title="Кондак"
          feast={resolvedFeast}
          date={date}
          sourceTitle={title}
          section="kontakion"
          focusHighlight={focusSection === "kontakion"}
          icon="✧"
          text={kontakion}
          subtitle={resolvedFeast?.kontakion_echo ? 'Глас ' + resolvedFeast.kontakion_echo : resolvedFeast?.kontakion_title}
        />
        {!!prayer && <Accordion title={uk ? 'Молитва' : 'Молитва'} icon="✝" text={prayer}
          feast={resolvedFeast} date={date} sourceTitle={title} section="prayer" />}
        {!life && !troparion && !kontakion && !prayer && (
          <Text style={styles.empty}>
            {sharedCardLoading
              ? (uk ? 'Завантаження відомостей...' : 'Загружаем сведения...')
              : sharedCardNotFound
                ? (uk ? 'Не вдалося знайти цю пам’ять. Відкрийте календар на вибрану дату.'
                  : 'Не удалось найти эту запись. Откройте календарь на выбранную дату.')
                : (uk ? 'Додаткових текстів поки немає.' : 'Дополнительных текстов пока нет.')}
          </Text>
        )}
      </ScrollView>
      <View style={[styles.bottomBar, {paddingBottom: Math.max(insets.bottom, 12)}]}>
        <Pressable
          style={styles.bottomButton}
          accessibilityRole="button"
          onPress={() => navigation.navigate('ChurchCalendar', date ? {date} : {})}
        >
          <Text style={styles.bottomButtonIcon}>☷</Text>
          <Text style={styles.bottomButtonText}>{uk ? 'Перейти до календаря' : 'Перейти в календарь'}</Text>
          <Text style={styles.bottomButtonArrow}>›</Text>
        </Pressable>
      </View>
      <Modal visible={imageViewerOpen} transparent animationType="fade"
        onRequestClose={() => setImageViewerOpen(false)} statusBarTranslucent>
        <View style={styles.imageViewer}>
          <Pressable style={[styles.imageClose, {top: Math.max(insets.top, 20)}]}
            onPress={() => setImageViewerOpen(false)} accessibilityLabel={uk ? 'Закрити' : 'Закрыть'}>
            <Text style={styles.imageCloseText}>✕</Text>
          </Pressable>
          {!!image && <Image source={image} resizeMode="contain" style={styles.fullscreenImage} />}
        </View>
      </Modal>
      <FixedSectionHeader
        title={uk ? 'Святий дня' : 'Святой дня'}
        navigation={navigation}
        topInset={insets.top}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F0DFC1'},
  content: {paddingHorizontal: 13, gap: 12},
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 22,
    backgroundColor: '#FFF7E7',
    borderWidth: 1,
    borderColor: '#E8D5B4',
    gap: 12,
    shadowColor: '#5C391B',
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 2,
  },
  heroCardWide: {padding: 20, gap: 20},
  image: {borderRadius: 9, backgroundColor: '#F5E4C6'},
  imageHint: {textAlign: 'center', color: '#765238', fontSize: 11, marginTop: 5},
  heroText: {flex: 1, minWidth: 0},
  eyebrow: {fontSize: 10, letterSpacing: 0.5, color: '#9A6B37', fontWeight: '800'},
  saintTitle: {
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 23,
    color: '#3D221A',
    fontWeight: '700',
    marginTop: 9,
  },
  saintTitleWide: {fontSize: 24, lineHeight: 31},
  date: {fontFamily: 'serif', fontSize: 14, color: '#855A34', marginTop: 9},
  chips: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 10},
  chip: {
    overflow: 'hidden',
    backgroundColor: '#EED3A1',
    borderRadius: 16,
    color: '#6B451E',
    fontWeight: '700',
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontSize: 11,
  },
  accordion: {
    borderRadius: 14, borderWidth: 1, borderColor: '#D3B68B',
    backgroundColor: '#EAD7B8', overflow: 'hidden',
  },
  accordionFocused: {borderColor: '#A16E35', borderWidth: 2},
  accordionSaved: {borderColor: 'rgba(123, 79, 36, 0.18)'}, 
  accordionHeaderRow: {flexDirection: 'row', alignItems: 'center', paddingRight: 9},
  accordionHeaderTap: {flex: 1, minWidth: 0, paddingRight: 2},
  accordionHeader: {
    minHeight: 65, padding: 12, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EAD7B8',
  },
  accordionIcon: {
    width: 40, height: 40, borderRadius: 11, marginRight: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5E2C4',
  },
  accordionIconText: {fontSize: 19, color: '#7A4F2D', fontWeight: '700'},
  accordionHeading: {flex: 1, minWidth: 0},
  accordionTitle: {fontFamily: 'serif', fontSize: 17, lineHeight: 22, color: '#4A3020', fontWeight: '700'},
  preview: {marginTop: 2, color: '#76543A', fontSize: 12},
  chevron: {
    width: 10, height: 10, marginHorizontal: 10, marginTop: -5,
    borderRightWidth: 2, borderBottomWidth: 2, borderColor: '#765238',
    transform: [{rotate: '45deg'}],
  },
  chevronOpen: {transform: [{rotate: '225deg'}], marginTop: 5},
  expandedWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(123,79,36,0.16)', backgroundColor: '#FFF4DE',
  },
  expandedWrapSaved: {backgroundColor: 'rgba(161, 110, 53, 0.075)'},
  lifeInsetSaved: {backgroundColor: 'rgba(161, 110, 53, 0.075)'},
  readingContent: {paddingHorizontal: 10, paddingTop: 2, paddingBottom: 8},
  lifeInset: {marginHorizontal: 2, marginTop: 4, marginBottom: 8,
    borderRadius: 0, borderWidth: 1, borderColor: '#E7D6B6', backgroundColor: '#FFF4DE', overflow: 'hidden'},
  lifeScrollContent: {
    paddingHorizontal: 0,
    paddingTop:0,
    paddingBottom: 38,
  },

  lifeScrollFrame: {
    position: 'relative',
  },

  lifeScrollTrack: {
    position: 'absolute',
    right: 5,
    top: 12,
    bottom: 12,
    width: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(122,79,45,0.10)',
  },

  lifeScrollThumb: {
    width: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(122,79,45,0.60)',
  },
  lifeScrollFade: {position: 'absolute', left: 0, right: 0, bottom: 0, height: 46},
  subtitle: {
    fontFamily: 'serif', color: '#7A4F2D', fontSize: 14, lineHeight: 21,
    fontWeight: '700', marginBottom: 10,
  },
  body: {
    fontFamily: 'serif', color: '#3E2A1D', fontSize: 17, lineHeight: 29,
    textAlign: 'justify', marginBottom: 12,
  },
  empty: {textAlign: 'center', marginTop: 14, color: '#8A6847'},
  bottomBar: {paddingHorizontal: 13, paddingTop: 9, backgroundColor: '#F0DFC1'},
  bottomButton: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70441F',
    borderRadius: 26,
    marginBottom: 30,
  },
  bottomButtonText: {fontFamily: 'serif', fontSize: 16, color: '#FFF5E6', fontWeight: '700'},
  bottomButtonIcon: {fontSize: 23, fontWeight: '600', color: '#FFF5E6',},
  bottomButtonArrow: {fontSize: 25, color: '#FFF5E6'},
  imageViewer: {flex: 1, backgroundColor: 'rgba(14, 12, 10, 0.97)',
    alignItems: 'center', justifyContent: 'center'},
  fullscreenImage: {width: '96%', height: '86%'},
  imageClose: {position: 'absolute', right: 18, zIndex: 10, width: 44, height: 44,
    borderRadius: 22, backgroundColor: '#3E3630', alignItems: 'center', justifyContent: 'center'},
  imageCloseText: {fontSize: 24, color: '#FFFFFF'},
});
