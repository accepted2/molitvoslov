import React from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {getBundledCalendarIconSource} from '../data/calendarIconAssets';
import {useLanguage} from '../context/LanguageContext';

const Section = ({title, subtitle, body}) => !body ? null : (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    <Text selectable style={styles.text}>{body}</Text>
  </View>
);

export const SaintDetailScreen = ({route, navigation}) => {
  const {language} = useLanguage();
  const {feast, date} = route.params || {};
  const insets = useSafeAreaInsets();
  const uk = language === 'uk';
  const title = (uk && feast?.title_uk) || feast?.title || '';
  const bundled = getBundledCalendarIconSource(feast);
  const source = bundled || (feast?.icon_url ? {uri: feast.icon_url} : null);
  const life = (uk && feast?.life_content_uk) || feast?.life_content;
  const troparion = (uk && feast?.troparion_content_uk) || feast?.troparion_content;
  const kontakion = (uk && feast?.kontakion_content_uk) || feast?.kontakion_content;

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <ScrollView contentContainerStyle={[styles.content, {paddingTop: insets.top + 76, paddingBottom: insets.bottom + 36}]}>
        {!!source && <Image source={source} resizeMode="contain" style={styles.image} />}
        <Text style={styles.title}>{title}</Text>
        {!!date && <Text style={styles.date}>{date}</Text>}
        <Section title={uk ? 'Житіє' : 'Житие'} subtitle={feast?.life_title} body={life} />
        <Section title={uk ? 'Тропар' : 'Тропарь'}
          subtitle={feast?.troparion_echo ? 'Глас ' + feast.troparion_echo : feast?.troparion_title}
          body={troparion} />
        <Section title="Кондак"
          subtitle={feast?.kontakion_echo ? 'Глас ' + feast.kontakion_echo : feast?.kontakion_title}
          body={kontakion} />
        {!life && !troparion && !kontakion && (
          <Text style={styles.empty}>{uk ? 'Додаткових текстів поки немає.' : 'Дополнительных текстов пока нет.'}</Text>
        )}
      </ScrollView>
      <FixedSectionHeader title={title || (uk ? 'Святий' : 'Святой')} navigation={navigation} topInset={insets.top} />
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  content: {paddingHorizontal: 16},
  image: {width: '100%', height: 250, marginBottom: 16},
  title: {fontFamily: 'serif', fontSize: 22, lineHeight: 30, textAlign: 'center', fontWeight: '700', color: '#4C2F1B'},
  date: {textAlign: 'center', color: '#89674D', marginTop: 8},
  section: {marginTop: 16, padding: 16, borderRadius: 15, backgroundColor: 'rgba(255,246,229,0.96)', borderWidth: 1, borderColor: 'rgba(126,82,38,0.20)'},
  sectionTitle: {fontFamily: 'serif', color: '#5A3822', fontSize: 19, fontWeight: '700'},
  subtitle: {color: '#89674D', marginTop: 4, fontSize: 12},
  text: {fontFamily: 'serif', color: '#3E2A1D', fontSize: 16, lineHeight: 26, marginTop: 12},
  empty: {color: '#89674D', textAlign: 'center', marginTop: 30},
});
