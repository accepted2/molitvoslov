import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {AppBackground} from '../components/layout/AppBackground';
import {useScopedReaderAppearance} from '../hooks/useScopedReaderAppearance';
import {resolveReaderAppearance, isDarkReaderBackground} from '../services/scopedReaderAppearance';
import {
  PRAYER_LEARNING_LESSONS,
  PRAYER_LEARNING_LETTERS,
  PRAYER_LEARNING_NUMBERS,
} from '../data/prayerLearningContent';

const COLUMNS = 5;
const GRID_GAP = 7;

export const PrayerLearningScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [expanded, setExpanded] = useState({start: true});
  const [letter, setLetter] = useState(null);
  const [gridWidth, setGridWidth] = useState(0);
  const {appearance} = useScopedReaderAppearance('text', 'prayer-learning');
  const reader = useMemo(() => resolveReaderAppearance(appearance), [appearance]);
  const dark = isDarkReaderBackground(reader.background);
  const ink = reader.text;
  const muted = dark ? '#D9BD9B' : '#75563E';
  const accent = dark ? '#EBC68D' : '#7E4829';
  const frame = dark ? '#6D5949' : '#C8A981';
  const quoteSurface = dark ? '#4E4035' : '#F6E9D2';
  const introSurface = dark ? '#3C332C' : '#FFF4DE';
  const textSize = Math.max(15, reader.fontSize);
  const cellWidth = gridWidth > 0
    ? (gridWidth - (COLUMNS - 1) * GRID_GAP) / COLUMNS
    : undefined;
  const selectedLetter = PRAYER_LEARNING_LETTERS.find(x => x.upper === letter);

  const toggleSection = id => {
    setExpanded(previous => ({...previous, [id]: !previous[id]}));
  };

  return (
    <AppBackground imageOpacity={0.6}>
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
          <View style={[styles.intro, {backgroundColor: introSurface, borderColor: frame}]}>
            <Text style={[styles.pageTitle, {color: ink}]}>
              Учимся молиться
            </Text>
            <Text style={[styles.lead, {color: ink}]}>
              Основы церковнославянского чтения и наставления святых отцов
              о внимании, благоговении и покаянии.
            </Text>
          </View>

          {PRAYER_LEARNING_LESSONS.map((lesson, index) => {
            const isOpen = !!expanded[lesson.id];
            return (
              <View
                style={[styles.card, {backgroundColor: reader.surface, borderColor: frame}]}
                key={lesson.id}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{expanded: isOpen}}
                  onPress={() => toggleSection(lesson.id)}
                  style={({pressed}) => [styles.header, pressed && styles.pressed]}
                >
                  <Text style={[styles.index, {color: accent}]}>{index + 1}</Text>
                  <View style={styles.headerTexts}>
                    <Text style={[styles.lessonTitle, {color: ink}]}>
                      {lesson.title}
                    </Text>
                    <Text style={[styles.lessonSubtitle, {color: muted}]}>
                      {lesson.subtitle}
                    </Text>
                  </View>
                  <Text style={[styles.chevron, {color: accent}]}>
                    {isOpen ? '⌃' : '⌄'}
                  </Text>
                </Pressable>
                {isOpen && (
                  <View style={[styles.body, {borderTopColor: frame}]}>
                    {(lesson.paragraphs || []).map((paragraph, paragraphIndex) => (
                      <Text
                        style={[
                          styles.paragraph,
                          {color: ink, fontSize: textSize, lineHeight: Math.round(textSize * 1.52)},
                        ]}
                        key={paragraphIndex}
                      >
                        {paragraph}
                      </Text>
                    ))}

                    {(lesson.quotations || []).map((quote, quoteIndex) => (
                      <View
                        style={[styles.quoteCard, {
                          backgroundColor: quoteSurface,
                          borderLeftColor: accent,
                        }]}
                        key={quoteIndex}
                      >
                        <Text style={[styles.quoteText, {color: ink, fontSize: textSize}]}>
                          «{quote.text}»
                        </Text>
                        <Text style={[styles.quoteAttribution, {color: muted}]}>
                          {quote.author} · {quote.work}
                        </Text>
                      </View>
                    ))}

                    {(lesson.teachings || []).map((teaching, teachingIndex) => (
                      <View style={styles.teaching} key={teachingIndex}>
                        <Text style={[styles.teachingHeading, {color: accent}]}>
                          {teaching.author}
                        </Text>
                        {(teaching.paragraphs || []).map((paragraph, paragraphIndex) => (
                          <Text
                            style={[
                              styles.paragraph,
                              {color: ink, fontSize: textSize, lineHeight: Math.round(textSize * 1.52)},
                            ]}
                            key={paragraphIndex}
                          >
                            {paragraph}
                          </Text>
                        ))}
                        <Text style={[styles.teachingWork, {color: muted}]}>
                          {teaching.work} · изложение по смыслу
                        </Text>
                      </View>
                    ))}

                    {lesson.id === 'alphabet' && (
                      <>
                        <View
                          onLayout={event => setGridWidth(event.nativeEvent.layout.width)}
                          style={styles.grid}
                        >
                          {PRAYER_LEARNING_LETTERS.map(item => (
                            <Pressable
                              key={item.upper}
                              accessibilityRole="button"
                              accessibilityLabel={item.name}
                              onPress={() => setLetter(item.upper)}
                              style={({pressed}) => [
                                styles.letter,
                                {
                                  width: cellWidth,
                                  backgroundColor:
                                    letter === item.upper ? quoteSurface : reader.background,
                                  borderColor: letter === item.upper ? accent : frame,
                                },
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={[styles.letterUpper, {color: ink}]}>
                                {item.upper}
                              </Text>
                              <Text style={[styles.letterLower, {color: ink}]}>
                                {item.lower}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        {!!selectedLetter && (
                          <View style={[styles.detail, {
                            backgroundColor: reader.background,
                            borderColor: frame,
                          }]}>
                            <View style={styles.detailGlyphWrap}>
                              <Text style={[styles.detailGlyph, {color: ink}]}>
                                {selectedLetter.upper}
                              </Text>
                              <Text style={[styles.detailGlyphSmall, {color: ink}]}>
                                {selectedLetter.lower}
                              </Text>
                            </View>
                            <View style={styles.detailBody}>
                              <Text style={[styles.detailTitle, {color: ink}]}>
                                {selectedLetter.name}
                              </Text>
                              <Text style={[styles.detailText, {color: muted}]}>
                                Чтение: {selectedLetter.sound}
                              </Text>
                            </View>
                          </View>
                        )}
                      </>
                    )}

                    {lesson.id === 'numbers' && (
                      <View
                        style={styles.grid}
                        onLayout={event => setGridWidth(event.nativeEvent.layout.width)}
                      >
                        {PRAYER_LEARNING_NUMBERS.map(item => (
                          <View key={item.number} style={[
                            styles.number,
                            {width: cellWidth, backgroundColor: reader.background, borderColor: frame},
                          ]}>
                            <Text style={[styles.numberGlyph, {color: ink}]}>{item.glyph}</Text>
                            <Text style={[styles.numberValue, {color: muted}]}>{item.number}</Text>
                          </View>
                        ))}
                      </View>
                    )}
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
  intro: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 15,
    marginBottom: 16,
  },
  pageTitle: {fontFamily: 'serif', fontSize: 25, fontWeight: '700'},
  lead: {fontSize: 16, lineHeight: 23, marginTop: 9, textAlign: 'left'},
  card: {borderWidth: 1, borderRadius: 13, marginBottom: 11, overflow: 'hidden'},
  header: {flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14},
  index: {fontFamily: 'serif', fontSize: 20, fontWeight: '700', width: 25, textAlign: 'center'},
  headerTexts: {flex: 1, minWidth: 0},
  lessonTitle: {fontFamily: 'serif', fontSize: 18, fontWeight: '700'},
  lessonSubtitle: {fontSize: 12, marginTop: 4, lineHeight: 18},
  chevron: {fontSize: 21},
  body: {borderTopWidth: 1, paddingHorizontal: 15, paddingTop: 16, paddingBottom: 17},
  paragraph: {
    fontFamily: 'serif', marginBottom: 13, textAlign: 'justify',
    includeFontPadding: false,
  },
  quoteCard: {
    paddingHorizontal: 13, paddingVertical: 12, marginBottom: 14,
    borderLeftWidth: 3, borderRadius: 6,
  },
  quoteText: {fontFamily: 'serif', fontStyle: 'italic', lineHeight: 26},
  quoteAttribution: {fontFamily: 'serif', fontSize: 12, lineHeight: 18, marginTop: 9},
  teaching: {marginTop: 9, paddingTop: 4},
  teachingHeading: {fontFamily: 'serif', fontSize: 16, fontWeight: '700', marginBottom: 10},
  teachingWork: {
    fontFamily: 'serif', fontSize: 12, lineHeight: 19,
    marginBottom: 16, textAlign: 'right',
  },
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, width: '100%'},
  letter: {
    height: 82, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, borderWidth: 1,
  },
  letterUpper: {
    fontFamily: 'Ponomar', fontWeight: '400',
    fontSize: 27, lineHeight: 37, includeFontPadding: false,
  },
  letterLower: {
    fontFamily: 'Ponomar', fontWeight: '400',
    fontSize: 17, lineHeight: 27, includeFontPadding: false,
  },
  detail: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingVertical: 11, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1,
  },
  detailGlyphWrap: {minWidth: 62, alignItems: 'center'},
  detailGlyph: {fontFamily: 'Ponomar', fontWeight: '400', fontSize: 40, lineHeight: 48},
  detailGlyphSmall: {fontFamily: 'Ponomar', fontWeight: '400', fontSize: 19, lineHeight: 25},
  detailBody: {flex: 1},
  detailTitle: {fontFamily: 'serif', fontSize: 17, fontWeight: '700'},
  detailText: {fontSize: 13, marginTop: 6, lineHeight: 19},
  number: {
    minHeight: 76, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  numberGlyph: {
    fontFamily: 'Ponomar', fontWeight: '400', fontSize: 26,
    lineHeight: 40, includeFontPadding: false,
  },
  numberValue: {fontSize: 12, lineHeight: 16, marginTop: 4},
  pressed: {opacity: 0.66},
});
