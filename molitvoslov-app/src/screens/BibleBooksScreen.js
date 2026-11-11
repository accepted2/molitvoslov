import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, SectionList, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {bibleContent} from '../services/bibleContent';
import {useBibleContentGeneration} from '../hooks/useBibleContentGeneration';
import {getReadingProgress} from '../services/readingProgress';
import {colors} from '../theme';
import {useLanguage} from '../context/LanguageContext';
import {bibleUiText, isTraditionalBible, traditionalBibleTextStyle, formatBibleNumber} from '../services/bibleUi';

const NEW_SECTION_ORDER = ['gospels', 'acts', 'epistles', 'revelation'];

export const BibleBooksScreen = ({route, navigation}) => {
  const {t} = useLanguage();
  const bibleGeneration = useBibleContentGeneration();
  const testament = route.params?.testament === 'new' ? 'new' : 'old';
  const translationCode = route.params?.translationCode === 'csl_traditional'
    ? 'csl_traditional'
    : 'rst';
  const isTraditional = isTraditionalBible(translationCode);
  const ui = (key, fallback, params) => bibleUiText(translationCode, key, fallback, params);


  const [readingProgress, setReadingProgress] = useState([]);

  const insets = useSafeAreaInsets();

  const [headerHeight, setHeaderHeight] = React.useState(insets.top + 56);
  React.useEffect(() => {setHeaderHeight(insets.top + 56);}, [insets.top]);

  useFocusEffect(
    useCallback(() => {
      getReadingProgress()
        .then((progress) =>
          setReadingProgress(progress.filter((item) => item.source_type === 'bible'))
        )
        .catch(() => setReadingProgress([]));
    }, [])
  );

  const progressByBook = useMemo(
    () => new Map(readingProgress.map((item) => [Number(item.source_id), item])),
    [readingProgress]
  );

  const books = useMemo(
    () => bibleContent.getBooks(testament, translationCode),
    [testament, translationCode, bibleGeneration]
  );

  const sections = useMemo(() => {
    const sectionTitles = {
      old: ui('sectionOld', t('bible.sectionOld')),
      gospels: ui('sectionGospels', t('bible.sectionGospels')),
      acts: ui('sectionActs', t('bible.sectionActs')),
      epistles: ui('sectionEpistles', t('bible.sectionEpistles')),
      revelation: ui('sectionRevelation', t('bible.sectionRevelation')),
    };

    if (testament === 'old') {
      return [
        {
          key: 'old',
          title: sectionTitles.old,
          data: books,
        },
      ];
    }

    return NEW_SECTION_ORDER.map((key) => ({
      key,
      title: sectionTitles[key],
      data: books.filter((book) => book.section === key),
    })).filter((section) => section.data.length);
  }, [books, testament, t, translationCode]);

  const title = testament === 'new'
    ? ui('newTestament', t('bible.newTestament'))
    : ui('oldTestament', t('bible.oldTestament'));

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingTop: headerHeight + 14,
          paddingBottom: 92 + insets.bottom,
        }}
        renderSectionHeader={({section}) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isTraditional && traditionalBibleTextStyle]}>{section.title}</Text>
          </View>
        )}
        renderItem={({item}) => {
          const progress = progressByBook.get(Number(item.id));

          const info = progress?.anchor_info || {};

          const chapterNumber = Number(info.chapter_number || 0);

          return (
            <Pressable
              onPress={() =>
                navigation.navigate('BibleBook', {
                  bookId: item.id,
                  translationCode,
                })
              }
              style={({pressed}) => [
                styles.item,

                !!progress && styles.itemStarted,

                pressed && styles.pressed,
              ]}
            >
              <View style={styles.itemText}>
                <Text style={[styles.bookName, isTraditional && traditionalBibleTextStyle]}>{bibleContent.getDisplayName(item, translationCode)}</Text>

                <Text style={[styles.chapterCount, isTraditional && traditionalBibleTextStyle]}>
                  {ui('chapters', t('bible.chapters', {count: item.chapters?.length || 0}), {count: item.chapters?.length || 0})}
                  {chapterNumber ? ' · ' + ui('stoppedChapter', t('bible.stoppedChapter', {chapter: chapterNumber}), {chapter: chapterNumber}) : ''}
                </Text>
              </View>

              {!!progress && (
                <Text style={[styles.progressPercent, isTraditional && traditionalBibleTextStyle]}>
                  {formatBibleNumber(translationCode, Number(progress.progress_percent || 0))}%
                </Text>
              )}

              <Text style={styles.arrow}>›</Text>
            </Pressable>
          );
        }}
      />

      <FixedSectionHeader onHeaderHeightChange={setHeaderHeight} title={title} titleTextStyle={isTraditional ? traditionalBibleTextStyle : null} navigation={navigation} topInset={insets.top} />

      <BottomNav navigation={navigation} active={null} />
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 5,
    paddingHorizontal: 14,
  },
  sectionTitle: {
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: '700',
    color: colors.accentDark,
  },

  item: {
    minHeight: 58,
    marginHorizontal: 10,
    marginVertical: 2,
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.18)',
    backgroundColor: 'rgba(248, 233, 207, 0.96)',
  },

  itemStarted: {
    borderColor: 'rgba(126, 82, 38, 0.30)',
  },
  itemText: {
    flex: 1,
  },
  bookName: {
    fontFamily: 'serif',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.text,
  },
  chapterCount: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  progressPercent: {
    marginLeft: 8,
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: '700',
  },
  arrow: {
    marginLeft: 8,
    fontSize: 24,
    color: '#9A714C',
  },
  pressed: {
    opacity: 0.62,
  },
});
