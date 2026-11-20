import React, {useState} from 'react';
import {Linking, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {AppBackground} from '../components/layout/AppBackground';
import {
  PRAYER_LEARNING_SOURCES,
  PRAYER_LEARNING_LESSONS,
  PRAYER_LEARNING_LETTERS,
  PRAYER_LEARNING_NUMBERS,
} from '../data/prayerLearningContent';

const SOURCE_LABELS = {
  alphabet: 'Азбука веры · таблицы языка',
  pronouncing: 'Т. Л. Миронова · церковнославянское чтение',
  numbers: 'Азбука веры · числовые обозначения',
  ignatius: 'Свт. Игнатий · Письма к разным лицам',
  theophan: 'Свт. Феофан · Как научиться молиться',
  nil: 'Прп. Нил Синайский · Слово о молитве',
};

const SourceLinks = ({sourceKeys = []}) => (
  <View style={styles.sourceList}>
    {sourceKeys.map(key => (
      <Pressable
        key={key}
        accessibilityRole="link"
        onPress={() => Linking.openURL(PRAYER_LEARNING_SOURCES[key]).catch(
          err => console.warn('[prayer learning] source:', err?.message || err)
        )}
        hitSlop={6}
        style={({pressed}) => [styles.sourceButton, pressed && styles.pressed]}
      >
        <Text style={styles.sourceLabel}>{SOURCE_LABELS[key] || 'Первоисточник'} ↗</Text>
      </Pressable>
    ))}
  </View>
);

export const PrayerLearningScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [expanded, setExpanded] = useState({start: true});
  const [letter, setLetter] = useState(null);

  const toggleSection = id => {
    setExpanded(prev => ({...prev, [id]: !prev[id]}));
  };
  const selectedLetter = PRAYER_LEARNING_LETTERS.find(x => x.glyph === letter);

  return (
    <AppBackground imageOpacity={0.65}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <SafeAreaView edges={['left', 'right']} style={styles.page}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: headerHeight + 14,
            paddingBottom: Math.max(108, insets.bottom + 94),
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>Учимся молиться</Text>
          <Text style={styles.lead}>
            Основы церковнославянского чтения и святоотеческие наставления
            о внимательной, благоговейной молитве.
          </Text>
          <Text style={styles.notice}>
            Это учебные пояснения, а не новый молитвенный чин.
            Краткие цитаты отделены от пересказов и снабжены ссылками на произведения.
          </Text>

          {PRAYER_LEARNING_LESSONS.map((lesson, index) => {
            const isOpen = !!expanded[lesson.id];
            return (
              <View style={styles.card} key={lesson.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{expanded: isOpen}}
                  onPress={() => toggleSection(lesson.id)}
                  style={({pressed}) => [styles.header, pressed && styles.pressed]}
                >
                  <Text style={styles.index}>{index + 1}</Text>
                  <View style={styles.headerTexts}>
                    <Text style={styles.lessonTitle}>{lesson.title}</Text>
                    <Text style={styles.lessonSubtitle}>{lesson.subtitle}</Text>
                  </View>
                  <Text style={styles.chevron}>{isOpen ? '⌃' : '⌄'}</Text>
                </Pressable>

                {isOpen && (
                  <View style={styles.body}>
                    {(lesson.paragraphs || []).map((paragraph, paragraphIndex) => (
                      <Text style={styles.paragraph} key={paragraphIndex}>
                        {paragraph}
                      </Text>
                    ))}

                    {(lesson.quotations || []).map((quote, quoteIndex) => (
                      <View style={styles.quoteCard} key={quoteIndex}>
                        <Text style={styles.quoteText}>«{quote.text}»</Text>
                        <Text style={styles.quoteAttribution}>
                          {quote.author} · {quote.work}
                        </Text>
                      </View>
                    ))}

                    {lesson.id === 'alphabet' && (
                      <>
                        <View style={styles.letterGrid}>
                          {PRAYER_LEARNING_LETTERS.map(item => (
                            <Pressable
                              key={item.glyph}
                              accessibilityRole="button"
                              onPress={() => setLetter(item.glyph)}
                              style={({pressed}) => [
                                styles.letter,
                                letter === item.glyph && styles.letterActive,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={styles.letterGlyph}>{item.glyph}</Text>
                            </Pressable>
                          ))}
                        </View>
                        {!!selectedLetter && (
                          <View style={styles.detail}>
                            <Text style={styles.detailGlyph}>{selectedLetter.glyph}</Text>
                            <View style={{flex: 1}}>
                              <Text style={styles.detailTitle}>{selectedLetter.name}</Text>
                              <Text style={styles.detailText}>
                                Чтение: {selectedLetter.sound}
                              </Text>
                            </View>
                          </View>
                        )}
                      </>
                    )}

                    {lesson.id === 'numbers' && (
                      <View style={styles.numberGrid}>
                        {PRAYER_LEARNING_NUMBERS.map(item => (
                          <View key={item.number} style={styles.number}>
                            <Text style={styles.numberGlyph}>{item.glyph}</Text>
                            <Text style={styles.numberValue}>{item.number}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <SourceLinks sourceKeys={lesson.sourceKeys} />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
        <FixedSectionHeader
          title="Учимся молиться"
          gradientColor="#FFF4DE"
          navigation={navigation}
          topInset={insets.top}
          onHeaderHeightChange={setHeaderHeight}
        />
        <BottomNav navigation={navigation} active={null} />
      </SafeAreaView>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  page: {flex: 1},
  scroll: {flex: 1},
  pageTitle: {fontFamily: 'serif', color: '#54351E', fontSize: 26, fontWeight: '700'},
  lead: {color: '#584433', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 10},
  notice: {fontSize: 12, lineHeight: 18, color: '#80684F', marginBottom: 14},
  card: {
    backgroundColor: 'rgba(255, 249, 236, 0.97)',
    borderColor: 'rgba(121, 84, 55, 0.18)',
    borderWidth: 1, borderRadius: 13, marginBottom: 11, overflow: 'hidden',
  },
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14},
  index: {
    fontFamily: 'serif', color: '#965D37', fontWeight: '700',
    fontSize: 21, width: 24, textAlign: 'center',
  },
  headerTexts: {flex: 1, minWidth: 0},
  lessonTitle: {fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: '#50341F'},
  lessonSubtitle: {fontSize: 12, color: '#8C7155', marginTop: 3},
  chevron: {fontSize: 22, color: '#8A5637'},
  body: {borderTopWidth: 1, borderTopColor: 'rgba(121,84,55,0.13)', padding: 15},
  paragraph: {fontSize: 15.5, lineHeight: 24, color: '#443427', marginBottom: 12, textAlign: 'justify'},
  quoteCard: {
    paddingHorizontal: 11, paddingVertical: 12, marginVertical: 7,
    borderLeftWidth: 2, borderLeftColor: '#A87551',
    backgroundColor: '#F6E9D2', borderRadius: 5,
  },
  quoteText: {fontFamily: 'serif', fontSize: 16, fontStyle: 'italic', lineHeight: 23, color: '#473023'},
  quoteAttribution: {fontSize: 12, lineHeight: 18, color: '#855D45', marginTop: 8},
  sourceList: {marginTop: 9, gap: 3},
  sourceButton: {paddingVertical: 7},
  sourceLabel: {color: '#875236', textDecorationLine: 'underline', fontSize: 12.5},
  letterGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10},
  letter: {
    minWidth: 54, height: 51, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 7, backgroundColor: '#F3E6D0', borderRadius: 8,
    borderWidth: 1, borderColor: '#DED0B8',
  },
  letterActive: {backgroundColor: '#E6CB9F', borderColor: '#966945'},
  letterGlyph: {fontFamily: 'serif', color: '#5D3C26', fontSize: 18},
  detail: {
    flexDirection: 'row', alignItems: 'center', gap: 15, padding: 12,
    backgroundColor: '#F2DFC4', borderRadius: 10, marginTop: 12,
  },
  detailGlyph: {fontFamily: 'serif', fontSize: 31, color: '#663B25'},
  detailTitle: {fontSize: 16, fontWeight: '700', color: '#523822'},
  detailText: {fontSize: 13, color: '#795C45', marginTop: 3},
  numberGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9},
  number: {
    width: 68, minHeight: 65, alignItems: 'center', justifyContent: 'center',
    borderRadius: 9, backgroundColor: '#F4E4CA',
    borderWidth: 1, borderColor: '#E0CCAF',
  },
  numberGlyph: {fontFamily: 'serif', color: '#5C3522', fontSize: 21},
  numberValue: {fontSize: 12, color: '#7E5B41', marginTop: 3},
  pressed: {opacity: 0.65},
});
