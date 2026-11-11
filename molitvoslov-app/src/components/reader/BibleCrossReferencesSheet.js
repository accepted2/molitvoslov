import React, {useEffect, useMemo, useState} from 'react';
import {Linking, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {bibleContent} from '../../services/bibleContent';
import {BIBLE_CROSS_REFERENCE_ATTRIBUTION, BIBLE_PSALM_VERSIFICATION_ATTRIBUTION} from '../../services/bibleCrossReferences';

const cleanPreview = (value) =>
  String(value || '')
    .replace(/\*{2}\(\s*([^()]*)\s*\)\*{2}/gu, (full, label) => {
      const normalized = label.normalize('NFD').replace(/[\p{M}\p{Cf}]/gu, '').trim();
      return /^(?:за|зачало)\s*\d+$/iu.test(normalized) ? ' ' : full;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();

// Display Church Slavonic book titles only inside the cross-reference sheet.
// Keep bibleContent.getDisplayName unchanged: other navigation screens
// intentionally use Russian book names even in the traditional Bible tab.
const CSL_REFERENCE_BOOK_TITLES = {
  GEN: 'Книга Бытія',
  EXO: 'Книга Исходъ',
  LEV: 'Книга Левитъ',
  NUM: 'Книга Числъ',
  DEU: 'Книга Второзаконія',
  JOS: 'Книга Іисуса Навина',
  JDG: 'Книга Судей Израилевыхъ',
  RUT: 'Книга Руѳи',
  '1SA': 'Первая книга Царствъ',
  '2SA': 'Вторая книга Царствъ',
  '1KI': 'Третія книга Царствъ',
  '2KI': 'Четвертая книга Царствъ',
  '1CH': 'Первая книга Паралипоменонъ',
  '2CH': 'Вторая книга Паралипоменонъ',
  EZR: 'Первая книга Ездры',
  NEH: 'Книга Нееміи',
  '1ES': 'Вторая книга Ездры',
  TOB: 'Книга Товита',
  JDT: 'Книга Іудиѳи',
  EST: 'Книга Есѳири',
  JOB: 'Книга Іова',
  PSA: 'Псалтирь',
  PRO: 'Притчи Соломоновы',
  ECC: 'Книга Екклесіаста',
  SNG: 'Пѣснь пѣсней Соломона',
  WIS: 'Премудрость Соломонова',
  SIR: 'Премудрость Іисуса сына Сирахова',
  ISA: 'Книга пророка Исаіи',
  JER: 'Книга пророка Іереміи',
  LAM: 'Плачъ Іереміинъ',
  LJE: 'Посланіе Іереміино',
  BAR: 'Книга пророка Варуха',
  EZK: 'Книга пророка Іезекіиля',
  DAN: 'Книга пророка Даніила',
  HOS: 'Книга пророка Осіи',
  JOL: 'Книга пророка Іоиля',
  AMO: 'Книга пророка Амоса',
  OBA: 'Книга пророка Авдія',
  JON: 'Книга пророка Іоны',
  MIC: 'Книга пророка Михея',
  NAM: 'Книга пророка Наума',
  HAB: 'Книга пророка Аввакума',
  ZEP: 'Книга пророка Софоніи',
  HAG: 'Книга пророка Аггея',
  ZEC: 'Книга пророка Захаріи',
  MAL: 'Книга пророка Малахіи',
  '1MA': 'Первая книга Маккавейская',
  '2MA': 'Вторая книга Маккавейская',
  '3MA': 'Третія книга Маккавейская',
  '2ES': 'Третія книга Ездры',
  MAT: 'Еѵангеліе ѿ Матѳея',
  MRK: 'Еѵангеліе ѿ Марка',
  LUK: 'Еѵангеліе ѿ Луки',
  JHN: 'Еѵангеліе ѿ Іоанна',
  ACT: 'Дѣянія святыхъ Апостолъ',
  JAS: 'Соборное посланіе Іакова',
  '1PE': 'Первое соборное посланіе Петра',
  '2PE': 'Второе соборное посланіе Петра',
  '1JN': 'Первое соборное посланіе Іоанна',
  '2JN': 'Второе соборное посланіе Іоанна',
  '3JN': 'Третіе соборное посланіе Іоанна',
  JUD: 'Соборное посланіе Іуды',
  ROM: 'Посланіе къ Римляномъ',
  '1CO': 'Первое посланіе къ Коринѳяномъ',
  '2CO': 'Второе посланіе къ Коринѳяномъ',
  GAL: 'Посланіе къ Галатомъ',
  EPH: 'Посланіе къ Ефесеемъ',
  PHP: 'Посланіе къ Филипписіемъ',
  COL: 'Посланіе къ Колоссаемъ',
  '1TH': 'Первое посланіе къ Солуняномъ',
  '2TH': 'Второе посланіе къ Солуняномъ',
  '1TI': 'Первое посланіе къ Тимоѳею',
  '2TI': 'Второе посланіе къ Тимоѳею',
  TIT: 'Посланіе къ Титу',
  PHM: 'Посланіе къ Филимону',
  HEB: 'Посланіе ко Евреемъ',
  REV: 'Откровеніе Іоанна Богослова',
};

const getReferenceBookTitle = (book, translationCode) => {
  if (translationCode !== 'csl_traditional') {
    return bibleContent.getDisplayName(book, translationCode);
  }
  return CSL_REFERENCE_BOOK_TITLES[book?.code] || book?.name ||
    bibleContent.getDisplayName(book, 'rst');
};

const formatRange = (item) => {
  const origin = item.chapter + ':' + item.verse;
  if (item.endChapter === item.chapter && item.endVerse === item.verse) return origin;
  if (item.endChapter === item.chapter) return origin + '–' + item.endVerse;
  return origin + '–' + item.endChapter + ':' + item.endVerse;
};

export const BibleCrossReferencesSheet = ({
  visible,
  references,
  originBook,
  originChapter,
  originVerse,
  translationCode,
  onClose,
  onOpen,
  isNight = false,
}) => {
  const [visibleCount, setVisibleCount] = useState(24);
  useEffect(() => {
    setVisibleCount(24);
  }, [visible, originBook?.code, originChapter, originVerse]);

  const gesture = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, move) =>
        move.dy > 12 && Math.abs(move.dy) > Math.abs(move.dx),
      onPanResponderRelease: (_, move) => {
        if (move.dy > 70) onClose();
      },
    }),
    [onClose]
  );

  const entries = useMemo(() => {
    const requestedBooks = new Map(
      bibleContent.getBooks(null, translationCode).map((book) => [book.code, book])
    );
    const russianBooks = new Map(
      bibleContent.getBooks(null, 'rst').map((book) => [book.code, book])
    );
    return (references || []).map((ref) => {
      // Psalm references have already been converted from KJV to Septuagint
      // chapter AND verse numbering by bibleCrossReferences.js. Prefer CSL
      // text in CSL mode, falling back to RST only when a verse is missing.
      let book = requestedBooks.get(ref.bookCode) || russianBooks.get(ref.bookCode);
      if (!book) return null;
      let code = book === requestedBooks.get(ref.bookCode) ? translationCode : 'rst';
      let chapter = bibleContent.getChapter(book.id, ref.chapter, code);
      let first = (chapter?.verses || []).find((verse) => Number(verse.number) === ref.verse);
      if (!first && code !== 'rst' && russianBooks.has(ref.bookCode)) {
        book = russianBooks.get(ref.bookCode);
        code = 'rst';
        chapter = bibleContent.getChapter(book.id, ref.chapter, code);
        first = (chapter?.verses || []).find((verse) => Number(verse.number) === ref.verse);
      }
      if (!first) return null;

      const verseTexts = [];
      let lastShown = null;
      const endChapter = Math.min(ref.endChapter, ref.chapter + 1);
      for (let n = ref.chapter; n <= endChapter && verseTexts.length < 12; n += 1) {
        const target = bibleContent.getChapter(book.id, n, code);
        if (!target) break;
        for (const verse of target.verses || []) {
          if (n === ref.chapter && Number(verse.number) < ref.verse) continue;
          if (n === ref.endChapter && Number(verse.number) > ref.endVerse) break;
          verseTexts.push(cleanPreview(verse.text));
          lastShown = {chapter: n, verse: Number(verse.number)};
          if (verseTexts.length >= 12) break;
        }
      }
      const hasMore = lastShown && (lastShown.chapter < ref.endChapter ||
        (lastShown.chapter === ref.endChapter && lastShown.verse < ref.endVerse));
      return {
        ...ref,
        book,
        translationCode: code,
        title: getReferenceBookTitle(book, translationCode) + ' ' + formatRange(ref),
        text: verseTexts.join(' ') + (hasMore ? '…' : ''),
        russianPsalter: code === 'rst' && translationCode === 'csl_traditional',
      };
    }).filter(Boolean);
  }, [references, translationCode]);

  const visibleEntries = entries.slice(0, visibleCount);
  const remainingCount = Math.max(0, entries.length - visibleEntries.length);

  const origin = originBook
    ? getReferenceBookTitle(originBook, translationCode) +
      ' ' + originChapter + ':' + originVerse
    : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть параллельные места"
          style={styles.backdrop}
          onPress={onClose}
        />
        <View style={[styles.sheet, isNight && styles.sheetNight]}>
          <View {...gesture.panHandlers} style={styles.gestureArea}>
            <View style={[styles.handle, isNight && styles.handleNight]} />
          </View>
          <View style={styles.headingRow}>
            <View style={styles.headingText}>
              <Text style={[styles.heading, isNight && styles.lightText]}>Параллельные места</Text>
              <Text style={[styles.origin, translationCode === 'csl_traditional' && styles.originTraditional, isNight && styles.secondaryLight]} numberOfLines={2}>
                {origin}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Закрыть" hitSlop={12}>
              <Ionicons name="close" size={23} color={isNight ? '#DCC6AE' : '#67482E'} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {entries.length === 0 ? (
              <Text style={[styles.empty, isNight && styles.secondaryLight]}>
                Для этого стиха нет доступных параллельных мест.
              </Text>
            ) : visibleEntries.map((entry, index) => (
              <Pressable
                key={entry.bookCode + '.' + formatRange(entry) + ':' + index}
                accessibilityRole="button"
                accessibilityLabel={'Открыть ' + entry.title}
                style={[styles.reference, isNight && styles.referenceNight]}
                onPress={() => onOpen(entry)}
              >
                <Text style={[
                  styles.refTitle,
                  translationCode === 'csl_traditional' && styles.refTitleTraditional,
                  isNight && styles.refTitleNight,
                ]}>
                  {entry.title}
                </Text>
                <Text style={[
                  styles.refText,
                  entry.translationCode === 'csl_traditional' && styles.refTextTraditional,
                  isNight && styles.lightText,
                ]}>
                  {entry.text}
                  <Text style={[styles.inlineArrow, isNight && styles.inlineArrowNight]}> →</Text>
                </Text>
                {entry.russianPsalter && (
                  <Text style={[styles.translationHint, isNight && styles.secondaryLight]}>
                    Текст приведён по Синодальному переводу
                  </Text>
                )}
              </Pressable>
            ))}
            {remainingCount > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Показать ещё параллельные места. Осталось ' + remainingCount}
                onPress={() => setVisibleCount((count) => count + 24)}
                style={styles.loadMore}
              >
                <Text style={[styles.loadMoreText, isNight && styles.refTitleNight]}>
                  {'Показать ещё ' + Math.min(24, remainingCount) + ' (осталось ' + remainingCount + ')'}
                </Text>
              </Pressable>
            )}
            <Text style={[styles.license, isNight && styles.secondaryLight]}>
              Параллельные места: OpenBible.info (CC BY 4.0).\n              Псалтирь: таблица соответствия стихов STEP Bible / Tyndale House (CC BY 4.0).
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(BIBLE_CROSS_REFERENCE_ATTRIBUTION.url)}
            >
              <Text style={[styles.source, isNight && styles.sourceNight]}>
                Источник параллельных мест и лицензия
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(BIBLE_PSALM_VERSIFICATION_ATTRIBUTION.url)}
            >
              <Text style={[styles.source, isNight && styles.sourceNight]}>
                STEP Bible: нумерация псалмов и лицензия
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.43)'},
  sheet: {
    maxHeight: '83%', minHeight: 280, backgroundColor: '#FBF0D9',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingBottom: 24, borderTopWidth: 1, borderColor: '#E4D1B5',
  },
  sheetNight: {backgroundColor: '#211A16', borderColor: '#49392A'},
  gestureArea: {height: 28, alignItems: 'center', justifyContent: 'center'},
  handle: {height: 4, width: 45, borderRadius: 10, backgroundColor: '#BEA386'},
  handleNight: {backgroundColor: '#80674E'},
  headingRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 19,
    paddingTop: 6, paddingBottom: 11,
  },
  headingText: {flex: 1, paddingRight: 14},
  heading: {fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: '#51351F'},
  origin: {fontSize: 12, marginTop: 4, color: '#876C53'},
  originTraditional: {fontFamily: 'Ponomar', fontSize: 13, lineHeight: 21},
  list: {paddingHorizontal: 18, paddingBottom: 24},
  reference: {paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#CDB89B'},
  referenceNight: {borderColor: '#4A392A'},
  refTitle: {color: '#81522E', fontWeight: '700', fontSize: 15},
  refTitleTraditional: {fontFamily: 'Ponomar', fontWeight: '400', fontSize: 17, lineHeight: 25},
  refTitleNight: {color: '#E0B786'},
  refText: {color: '#3E2A1D', fontFamily: 'serif', fontSize: 16, lineHeight: 24, marginTop: 5},
  refTextTraditional: {fontFamily: 'Ponomar', fontSize: 18, lineHeight: 31},
  inlineArrow: {fontFamily: 'serif', fontSize: 17, color: '#865A34'},
  inlineArrowNight: {color: '#D4A97A'},
  lightText: {color: '#E7D7C6'},
  secondaryLight: {color: '#BDA791'},
  translationHint: {fontSize: 11, color: '#826A51', marginTop: 5},
  empty: {color: '#826A51', fontSize: 14, paddingVertical: 22},
  loadMore: {paddingVertical: 18, alignItems: 'center'},
  loadMoreText: {fontSize: 14, color: '#81522E', fontWeight: '600'},
  license: {marginTop: 18, fontSize: 11, color: '#826A51'},
  source: {paddingVertical: 9, fontSize: 12, color: '#825426', textDecorationLine: 'underline'},
  sourceNight: {color: '#D2A472'},
});
