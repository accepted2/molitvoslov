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

const formatDate = (value, language) => {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(
    language === 'uk' ? 'uk-UA' : 'ru-RU',
    {day: 'numeric', month: 'long', year: 'numeric'}
  );
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
}) => {
  const [open, setOpen] = useState(initialOpen || focusHighlight);
  const [hasMoreText, setHasMoreText] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const [scrollMetrics, setScrollMetrics] = useState({content: 0, viewport: height, y: 0});
  useEffect(() => { if (focusHighlight) setOpen(true); }, [focusHighlight]);
  if (!text) return null;
  const paragraphs = String(text).replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const content = (
    <View style={styles.readingContent}>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {paragraphs.map((paragraph, index) => (
        <Text key={index} selectable style={styles.body}>{paragraph}</Text>
      ))}
    </View>
  );
  return (
    <View style={[styles.accordion, focusHighlight && styles.accordionFocused]}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{expanded: open}}
        style={styles.accordionHeader}
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
      {open && (
        <View style={styles.expandedWrap}>
          {innerScroll ? (
            <View style={styles.lifeInset}>
              <View style={[styles.lifeScrollFrame, {maxHeight: height}]}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  persistentScrollbar
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
                    colors={['rgba(255,248,235,0)', 'rgba(255,248,235,0.90)', '#FFF8EB']}
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
  const {feast, date, focusSection} = route.params || {};
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const {width, height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const uk = language === 'uk';
  const title = (uk && feast?.title_uk) || feast?.title || '';
  const bundled = getBundledCalendarIconSource(feast);
  const image = bundled || (feast?.icon_url ? {uri: feast.icon_url} : null);
  const life = (uk && feast?.life_content_uk) || feast?.life_content;
  const troparion = (uk && feast?.troparion_content_uk) || feast?.troparion_content;
  const kontakion = (uk && feast?.kontakion_content_uk) || feast?.kontakion_content;
  const prayer = (uk && feast?.prayer_content_uk) || feast?.prayer_content;
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
              <Text style={styles.imageHint}>{uk ? 'Збільшити' : 'Увеличить'} ↗</Text>
            </Pressable>
          )}
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>
              {uk ? 'ПАМ’ЯТЬ СВЯТОГО / СВЯТО' : 'ПАМЯТЬ СВЯТОГО / ПРАЗДНИК'}
            </Text>
            <Text style={[styles.saintTitle, large && styles.saintTitleWide]}>{title}</Text>
            {!!date && <Text style={styles.date}>{formatDate(date, language)}</Text>}
            <View style={styles.chips}>
              <Text style={styles.chip}>☦ {uk ? 'День пам’яті' : 'День памяти'}</Text>
            </View>
          </View>
        </View>

        <Accordion
          title={uk ? 'Житіє' : 'Житие'}
          icon="life"
          text={life}
          initialOpen={focusSection === "life"}
          focusHighlight={focusSection === "life"}
          innerScroll
          height={lifeHeight}
        />
        <Accordion
          title={uk ? 'Тропар' : 'Тропарь'}
          focusHighlight={focusSection === 'troparion'}
          icon="♪"
          text={troparion}
          subtitle={feast?.troparion_echo ? 'Глас ' + feast.troparion_echo : feast?.troparion_title}
        />
        <Accordion
          title="Кондак"
          focusHighlight={focusSection === "kontakion"}
          icon="✧"
          text={kontakion}
          subtitle={feast?.kontakion_echo ? 'Глас ' + feast.kontakion_echo : feast?.kontakion_title}
        />
        {!!prayer && <Accordion title={uk ? 'Молитва' : 'Молитва'} icon="✝" text={prayer} />}
        {!life && !troparion && !kontakion && !prayer && (
          <Text style={styles.empty}>
            {uk ? 'Додаткових текстів поки немає.' : 'Дополнительных текстов пока нет.'}
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
  readingContent: {paddingHorizontal: 15, paddingTop: 14, paddingBottom: 16},
  lifeInset: {marginHorizontal: 10, marginTop: 10, marginBottom: 12,
    borderRadius: 13, borderWidth: 1, borderColor: '#E7D6B6', backgroundColor: '#FFF8EB', overflow: 'hidden'},
  lifeScrollContent: {paddingHorizontal: 9, paddingBottom: 38},
  lifeScrollFrame: {position: 'relative'},
  lifeScrollTrack: {position: 'absolute', right: 3, top: 5, bottom: 5,
    width: 2, backgroundColor: 'rgba(122,79,45,0.10)', borderRadius: 2},
  lifeScrollThumb: {width: 2, borderRadius: 2, backgroundColor: 'rgba(122,79,45,0.60)'},
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
  },
  bottomButtonText: {fontFamily: 'serif', fontSize: 16, color: '#FFF5E6', fontWeight: '700'},
  bottomButtonIcon: {fontSize: 23, fontWeight: '600', color: '#FFF5E6'},
  bottomButtonArrow: {fontSize: 25, color: '#FFF5E6'},
  imageViewer: {flex: 1, backgroundColor: 'rgba(14, 12, 10, 0.97)',
    alignItems: 'center', justifyContent: 'center'},
  fullscreenImage: {width: '96%', height: '86%'},
  imageClose: {position: 'absolute', right: 18, zIndex: 10, width: 44, height: 44,
    borderRadius: 22, backgroundColor: '#3E3630', alignItems: 'center', justifyContent: 'center'},
  imageCloseText: {fontSize: 24, color: '#FFFFFF'},
});
