// Read-only preview of the UOC 2025–2027 catalogue on the developer emulator.
// Fetches from the local Python preview server; the production calendar is untouched.
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';

const API = 'http://10.0.2.2:8765';
const EXAMPLES = [
  ['2026-01-02', 'Іоанн Кронштадтський'],
  ['2026-07-12', 'Петро і Павло'],
  ['2026-11-22', '22 листопада'],
  ['2026-12-19', 'Святитель Миколай'],
  ['2027-05-02', 'Пасха'],
];

const loadJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Локальний каталог недоступний (' + response.status + ')');
  }
  return response.json();
};

const buildFeast = (card, previewLanguage = 'uk') => {
  const selected = (kind) => {
    const hymns = (card.hymns || []).filter((h) => h.kind === kind);
    return hymns.find((h) => h.display_choice && h.language === 'uk')
      || hymns.find((h) => h.display_choice && h.language === 'civil')
      || hymns.find((h) => h.display_choice)
      || hymns[0];
  };
  const tropar = selected('tropar');
  const kondak = selected('kondak');
  const prayer = selected('prayer');
  const magnification = selected('magnification');
  const icon = (card.images || []).find((x) => x.url && x.url.startsWith('https://'))?.url || '';
  return {
    id: card.card_id,
    title: card.title_ru || card.title_uk,
    title_uk: card.title_uk,
    icon_url: icon,
    life_content: card.life_ru || '',
    life_content_uk: card.life_uk || '',
    troparion_content: tropar?.content || '',
    troparion_content_uk: tropar?.language === 'uk' ? tropar.content : '',
    troparion_title: tropar?.heading || '',
    kontakion_content: kondak?.content || '',
    kontakion_content_uk: kondak?.language === 'uk' ? kondak.content : '',
    kontakion_title: kondak?.heading || '',
    prayer_content: prayer?.content || '',
    prayer_content_uk: prayer?.language === 'uk' ? prayer.content : '',
    magnification_content: magnification?.content || '',
    magnification_content_uk: magnification?.language === 'uk' ? magnification.content : '',
    preview_card: true,
    preview_language: previewLanguage,
  };
};

export const UocCalendarPreviewScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const [dateValue, setDateValue] = useState('2026-11-22');
  const [previewLanguage, setPreviewLanguage] = useState('uk');
  const [day, setDay] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDate = useCallback(async (value) => {
    if (!/^202[567]-\d{2}-\d{2}$/.test(value)) {
      setError('Дата має вигляд РРРР-ММ-ДД, 2025–2027.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      setDay(await loadJson(API + '/api/day/' + value));
      setDateValue(value);
    } catch (e) {
      setDay(null);
      setError('Запусти локальний uoc_preview_server.py. ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {loadDate('2026-11-22');}, [loadDate]);

  const openCard = useCallback(async (cardId) => {
    setLoading(true);
    setError('');
    try {
      const card = await loadJson(API + '/api/card/' + cardId);
      navigation.navigate('SaintDetail', {feast: buildFeast(card, previewLanguage), date: dateValue});
    } catch (e) {
      setError(e?.message || 'Не вдалося відкрити картку.');
    } finally {
      setLoading(false);
    }
  }, [dateValue, navigation, previewLanguage]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{paddingTop: insets.top + 80, paddingBottom: Math.max(24, insets.bottom), paddingHorizontal: 14}}>
        <View style={styles.panel}>
          <Text style={styles.eyebrow}>УПЦ · ЮЛІАНСЬКИЙ КАЛЕНДАР · ТІЛЬКИ ПЕРЕГЛЯД</Text>
          <Text style={styles.heading}>Нові картки святих</Text>
          <Text style={styles.meta}>Стара база, читання та налаштування застосунку не змінюються.</Text>
          <View style={styles.dateRow}>
            <Pressable onPress={() => setPreviewLanguage('uk')} style={[styles.example, previewLanguage === 'uk' && styles.languageSelected]}><Text>UK</Text></Pressable>
            <Pressable onPress={() => setPreviewLanguage('ru')} style={[styles.example, previewLanguage === 'ru' && styles.languageSelected]}><Text>RU</Text></Pressable>
          </View>
          <View style={styles.dateRow}>
            <TextInput value={dateValue} onChangeText={setDateValue}
              autoCorrect={false} keyboardType="numbers-and-punctuation"
              placeholder="2026-11-22" style={styles.dateInput}
              accessibilityLabel="Дата календаря" />
            <Pressable onPress={() => loadDate(dateValue)} style={styles.button}>
              <Text style={styles.buttonText}>Відкрити</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 10}}>
            {EXAMPLES.map(([value, label]) => (
              <Pressable key={value} onPress={() => loadDate(value)} style={styles.example}>
                <Text style={styles.exampleText}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {loading && <ActivityIndicator style={{marginVertical: 16}} color="#794b26" />}

        {!!day && (
          <>
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>ГОЛОВНА ПАМ’ЯТЬ З ІСНУЮЧОГО КАЛЕНДАРЯ</Text>
              <Text style={styles.heading}>{day.app_main_uk || day.app_main_ru || 'Не визначена'}</Text>
              <Text style={styles.meta}>
                {day.day} · {day.julian_day}.{day.julian_month} старого стилю
              </Text>
              {!day.main_card_id && (
                <Text style={styles.warning}>
                  Головна пам’ять ще не підтверджена як та сама картка Благовеста.
                  Запасного святого автоматично не підміняємо.
                </Text>
              )}
              {day.provisional && (
                <Text style={styles.warning}>Дати пам’ятей 2025 року потребують підтвердження джерелом.</Text>
              )}
              <Text style={styles.meta}>Читання не змінюємо: вони залишаються в існуючому календарі «Молитвослов».</Text>
            </View>
            <Text style={styles.listHeading}>Святі та свята цього дня · {day.cards?.length || 0}</Text>
            {(day.cards || []).map((card) => (
              <Pressable onPress={() => openCard(card.card_id)}
                key={card.card_id} style={styles.card}>
                {card.image && (
                  <Image source={{uri: card.image}} style={styles.iconImage}
                    resizeMode="contain" />
                )}
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.badge}>
                    {card.card_id === day.main_card_id ? 'ОСНОВНА КАРТКА'
                      : card.card_id === day.secondary_card_id ? 'ЗАПАСНИЙ КАНДИДАТ'
                      : 'ПАМ’ЯТЬ ДНЯ'}
                  </Text>
                  <Text style={styles.cardTitle}>{card.title_uk}</Text>
                  <Text style={styles.meta} numberOfLines={2}>{card.title_ru}</Text>
                  <Text style={styles.meta}>
                    {card.life_uk ? 'Житіє UK · ' : ''}{card.life_ru ? 'Житіє RU · ' : ''}
                    {card.hymns} піснеспівів · {card.icons} зображень
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </>
        )}
        <Text style={styles.note}>
          Ікони з джерела ще не перевірено на фактичну роздільність. Відкриття картки
          показує оригінальний текст та наявні піснеспіви без редагування БД.
        </Text>
      </ScrollView>
      <FixedSectionHeader title="Перегляд календаря УПЦ" navigation={navigation} topInset={insets.top} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F0DFC1'},
  panel: {padding: 17, borderRadius: 20, backgroundColor: '#FFF8EB', borderColor: '#E8D5B4', borderWidth: 1, marginBottom: 12},
  eyebrow: {color: '#94663E', fontSize: 10, letterSpacing: 0.6, fontWeight: '800'},
  heading: {fontSize: 20, lineHeight: 28, fontFamily: 'serif', fontWeight: '700', color: '#3D221A', marginTop: 8},
  meta: {color: '#886F56', fontSize: 12, marginTop: 7, lineHeight: 18},
  dateRow: {flexDirection: 'row', gap: 8, marginTop: 16},
  dateInput: {flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8B995', borderRadius: 10, paddingHorizontal: 12, fontSize: 15, color: '#462D19'},
  button: {backgroundColor: '#6A4329', paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center'},
  buttonText: {color: '#FFF6E6', fontWeight: '700'},
  example: {paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: '#EAD6B7', marginRight: 7},
  exampleText: {color: '#583C26', fontSize: 12},
  languageSelected: {backgroundColor: '#D4AA79', borderColor: '#A87740', borderWidth: 1},
  listHeading: {fontFamily: 'serif', fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 6, color: '#482E1B'},
  card: {borderWidth: 1, borderColor: '#E8D5B4', backgroundColor: '#FFF9EE', borderRadius: 15, padding: 12, flexDirection: 'row', gap: 12, marginVertical: 5, alignItems: 'center'},
  iconImage: {width: 68, height: 84, borderRadius: 6, backgroundColor: '#EFE0C6'},
  cardTitle: {fontFamily: 'serif', fontSize: 16, lineHeight: 21, color: '#3E2818', fontWeight: '700', marginTop: 4},
  badge: {fontSize: 10, letterSpacing: 0.2, color: '#966536', fontWeight: '700'},
  chevron: {fontSize: 26, color: '#99734E'},
  warning: {fontSize: 12, lineHeight: 19, marginTop: 12, color: '#A04D32'},
  error: {padding: 12, color: '#B44526', backgroundColor: '#FFF5E9', borderRadius: 10, marginBottom: 12},
  note: {fontSize: 11, color: '#806854', lineHeight: 17, marginVertical: 16},
});
