import React from 'react';
import {Image, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {getBundledCalendarIconSource} from '../data/calendarIconAssets';
import {useLanguage} from '../context/LanguageContext';

const Section = ({title, subtitle, body, scrollable = false, maxHeight = 320}) =>
  !body ? null : (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {scrollable ? (
        <ScrollView
          nestedScrollEnabled
          style={[styles.lifeScroll, {height: maxHeight}]}
          contentContainerStyle={styles.lifeScrollContent}
          showsVerticalScrollIndicator
          persistentScrollbar
        >
          <Text selectable style={styles.text}>
            {body}
          </Text>
        </ScrollView>
      ) : (
        <Text selectable style={styles.text}>
          {body}
        </Text>
      )}
    </View>
  );

export const SaintDetailScreen = ({route, navigation}) => {
  const {language} = useLanguage();
  const {feast, date} = route.params || {};
  const insets = useSafeAreaInsets();
  const {height: viewportHeight} = useWindowDimensions();
  const uk = language === 'uk';
  const title = (uk && feast?.title_uk) || feast?.title || '';
  const bundled = getBundledCalendarIconSource(feast);
  const source = bundled || (feast?.icon_url ? {uri: feast.icon_url} : null);
  const life = (uk && feast?.life_content_uk) || feast?.life_content;
  const troparion = (uk && feast?.troparion_content_uk) || feast?.troparion_content;
  const kontakion = (uk && feast?.kontakion_content_uk) || feast?.kontakion_content;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + 76, paddingBottom: insets.bottom + 36},
        ]}
      >
        <View style={styles.hero}>
          {!!source && <Image source={source} resizeMode="contain" style={styles.image} />}
          <Text style={styles.title}>{title}</Text>
          {!!date && <Text style={styles.date}>{date}</Text>}
          <View style={styles.heroRule} />
        </View>
        <Section
          title={uk ? 'Житіє' : 'Житие'}
          body={life}
          scrollable={String(life || '').length > 700}
          maxHeight={Math.max(240, Math.min(390, viewportHeight * 0.44))}
        />
        <Section
          title={uk ? 'Тропар' : 'Тропарь'}
          subtitle={feast?.troparion_echo ? 'Глас ' + feast.troparion_echo : feast?.troparion_title}
          body={troparion}
        />
        <Section
          title="Кондак"
          subtitle={feast?.kontakion_echo ? 'Глас ' + feast.kontakion_echo : feast?.kontakion_title}
          body={kontakion}
        />
        {!life && !troparion && !kontakion && (
          <Text style={styles.empty}>
            {uk ? 'Додаткових текстів поки немає.' : 'Дополнительных текстов пока нет.'}
          </Text>
        )}
      </ScrollView>
      <FixedSectionHeader
        title={uk ? 'Житіє святого' : 'Житие святого'}
        navigation={navigation}
        topInset={insets.top}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#FAF1E2'},
  content: {paddingHorizontal: 20, backgroundColor: '#FAF1E2'},
  hero: {alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8},
  image: {width: 130, height: 154, marginBottom: 12},
  title: {
    fontFamily: 'serif',
    fontSize: 23,
    lineHeight: 31,
    textAlign: 'center',
    fontWeight: '700',
    color: '#4C2F1B',
  },
  date: {textAlign: 'center', color: '#89674D', fontSize: 13, marginTop: 7},
  heroRule: {height: 1, width: 84, backgroundColor: '#B5946E', marginTop: 14},
  section: {
    marginTop: 14,
    paddingBottom: 17,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(126,82,38,0.30)',
  },
  sectionTitle: {
    fontFamily: 'serif',
    color: '#5A3822',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {color: '#89674D', marginTop: 6, fontSize: 13, textAlign: 'center'},
  text: {
    fontFamily: 'serif',
    color: '#3E2A1D',
    fontSize: 16,
    lineHeight: 27,
    marginTop: 12,
    textAlign: 'justify',
  },
  lifeScroll: {
    marginTop: 12,
    borderRadius: 9,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#E7D8BF',
  },
  lifeScrollContent: {paddingHorizontal: 13, paddingTop: 2, paddingBottom: 18},
  empty: {color: '#89674D', textAlign: 'center', marginTop: 30},
});
