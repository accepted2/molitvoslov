import React, {useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
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
  innerScroll = false,
  height = 320,
}) => {
  const [open, setOpen] = useState(initialOpen);
  if (!text) return null;
  return (
    <View style={styles.accordion}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{expanded: open}}
        style={styles.accordionHeader}
      >
        <View style={styles.accordionIcon}>
          <Text style={styles.accordionIconText}>{icon}</Text>
        </View>
        <View style={styles.accordionHeading}>
          <Text style={styles.accordionTitle}>{title}</Text>
          {!open && !!subtitle && (
            <Text style={styles.preview} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          {!open && !subtitle && (
            <Text style={styles.preview} numberOfLines={1}>
              {text}
            </Text>
          )}
        </View>
        <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open && (
        <>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {innerScroll ? (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={[styles.lifeScroll, {height}]}
              contentContainerStyle={styles.lifeScrollContent}
            >
              <Text selectable style={styles.body}>
                {text}
              </Text>
            </ScrollView>
          ) : (
            <Text selectable style={styles.body}>
              {text}
            </Text>
          )}
        </>
      )}
    </View>
  );
};

export const SaintDetailScreen = ({route, navigation}) => {
  const {language} = useLanguage();
  const {feast, date} = route.params || {};
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
  const lifeHeight = Math.max(235, Math.min(390, height * 0.39));

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, {paddingTop: insets.top + 78, paddingBottom: 26}]}
      >
        <View style={[styles.heroCard, large && styles.heroCardWide]}>
          {!!image && (
            <Image
              source={image}
              style={[styles.image, {width: heroImageWidth, height: heroImageWidth * 1.24}]}
              resizeMode="contain"
            />
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
          icon="▤"
          text={life}
          initialOpen
          innerScroll={String(life || '').length > 550}
          height={lifeHeight}
        />
        <Accordion
          title={uk ? 'Тропар' : 'Тропарь'}
          icon="♫"
          text={troparion}
          subtitle={feast?.troparion_echo ? 'Глас ' + feast.troparion_echo : feast?.troparion_title}
        />
        <Accordion
          title="Кондак"
          icon="▦"
          text={kontakion}
          subtitle={feast?.kontakion_echo ? 'Глас ' + feast.kontakion_echo : feast?.kontakion_title}
        />
        {!!prayer && <Accordion title={uk ? 'Молитва' : 'Молитва'} icon="☦" text={prayer} />}
        {!!date && (
          <View style={styles.dateCard}>
            <Text style={styles.dateIcon}>▣</Text>
            <View style={{flex: 1}}>
              <Text style={styles.dateTitle}>{uk ? 'Дата вшанування' : 'Дата празднования'}</Text>
              <Text style={styles.dateSubtitle}>{formatDate(date, language)}</Text>
            </View>
          </View>
        )}
        {!life && !troparion && !kontakion && !prayer && (
          <Text style={styles.empty}>
            {uk ? 'Додаткових текстів поки немає.' : 'Дополнительных текстов пока нет.'}
          </Text>
        )}
      </ScrollView>
      <View style={[styles.bottomBar, {paddingBottom: Math.max(insets.bottom, 12)}]}>
        <Pressable style={styles.bottomButton} accessibilityRole="button"
          onPress={() => navigation.navigate('ChurchCalendar', date ? {date} : {})}>
          <Text style={styles.bottomButtonText}>
            ▣  {uk ? 'Перейти до календаря' : 'Перейти в календарь'}  ›
          </Text>
        </Pressable>
      </View>
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
  image: {borderRadius: 7, backgroundColor: '#F5E4C6'},
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
    backgroundColor: '#FFF8EB',
    borderRadius: 19,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E8D5B4',
    shadowColor: '#5C391B',
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 1,
  },
  accordionHeader: {flexDirection: 'row', alignItems: 'center', minHeight: 44},
  accordionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3E4C9',
    marginRight: 12,
  },
  accordionIconText: {fontSize: 23, color: '#7B5028'},
  accordionHeading: {flex: 1},
  accordionTitle: {fontFamily: 'serif', fontWeight: '700', fontSize: 20, color: '#3D221A'},
  preview: {marginTop: 3, color: '#7A6653', fontSize: 12},
  chevron: {fontSize: 24, color: '#8B5F32', paddingHorizontal: 5},
  subtitle: {fontFamily: 'serif', color: '#916A46', fontSize: 13, marginTop: 8},
  lifeScroll: {marginTop: 10, borderRadius: 13, backgroundColor: '#FFFCF6'},
  lifeScrollContent: {paddingHorizontal: 12, paddingBottom: 16},
  body: {
    fontFamily: 'serif',
    color: '#422F24',
    fontSize: 16,
    lineHeight: 26,
    marginTop: 10,
    textAlign: 'left',
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 19,
    padding: 15,
    backgroundColor: '#FFF8EB',
    borderWidth: 1,
    borderColor: '#E8D5B4',
  },
  dateIcon: {fontSize: 28, color: '#7B5028', marginRight: 16},
  dateTitle: {fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: '#3D221A'},
  dateSubtitle: {fontSize: 13, color: '#8A6847', marginTop: 5},
  empty: {textAlign: 'center', marginTop: 14, color: '#8A6847'},
  bottomBar: {paddingHorizontal: 13, paddingTop: 9, backgroundColor: '#F0DFC1'},
  bottomButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70441F',
    borderRadius: 26,
  },
  bottomButtonText: {fontFamily: 'serif', fontSize: 17, color: '#FFF5E6', fontWeight: '700'},
});
