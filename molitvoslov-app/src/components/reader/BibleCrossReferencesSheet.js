import React, {useEffect, useMemo, useState} from 'react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {bibleContent} from '../../services/bibleContent';
import {bibleUiText, isTraditionalBible, traditionalBibleTextStyle, formatBibleNumber} from '../../services/bibleUi';

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


const formatRange = (item, code = 'rst') => {
  const number = (value) => formatBibleNumber(code, value);
  const origin = number(item.chapter) + ':' + number(item.verse);
  if (item.endChapter === item.chapter && item.endVerse === item.verse) return origin;
  if (item.endChapter === item.chapter) return origin + '–' + number(item.endVerse);
  return origin + '–' + number(item.endChapter) + ':' + number(item.endVerse);
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
  const insets=useSafeAreaInsets();
  useEffect(() => {
    setVisibleCount(24);
  }, [visible, originBook?.code, originChapter, originVerse]);

  const gesture = useMemo(
    () => PanResponder.create({
      // Capture touches immediately on the grip. Previously the tiny handle
      // could not reliably become responder before the gesture ended.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, move) =>
        move.dy > 8 && Math.abs(move.dy) > Math.abs(move.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, move) => {
        if (move.dy > 60 && move.dy > Math.abs(move.dx)) onClose?.();
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
        title: bibleContent.getDisplayName(book, translationCode) + ' ' + formatRange(ref, translationCode),
        text: verseTexts.join(' ') + (hasMore ? '…' : ''),
        russianPsalter: code === 'rst' && translationCode === 'csl_traditional',
      };
    }).filter(Boolean);
  }, [references, translationCode]);

  const visibleEntries = entries.slice(0, visibleCount);
  const remainingCount = Math.max(0, entries.length - visibleEntries.length);

  const origin = originBook
    ? bibleContent.getDisplayName(originBook, translationCode) +
      ' ' + formatBibleNumber(translationCode, originChapter) + ':' + formatBibleNumber(translationCode, originVerse)
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
        <View style={[styles.sheet, isNight && styles.sheetNight,
          {marginBottom:Math.max(insets.bottom+10,14)}]}>
          <View {...gesture.panHandlers} style={styles.gestureArea}
            accessibilityRole="button" accessibilityLabel="Потяните вниз, чтобы закрыть параллельные места">
            <View style={[styles.handle, isNight && styles.handleNight]} />
            <Text style={[styles.swipeLabel,isNight && styles.secondaryLight]}>Потяните вниз, чтобы закрыть</Text>
          </View>
          <View style={styles.headingRow}>
            <View style={styles.headingText}>
              <Text style={[styles.heading, isTraditionalBible(translationCode) && traditionalBibleTextStyle, isNight && styles.lightText]}>{bibleUiText(translationCode, 'crossReferences', 'Параллельные места')}</Text>
              <Text style={[styles.origin, translationCode === 'csl_traditional' && styles.originTraditional, isNight && styles.secondaryLight]} numberOfLines={2}>
                {origin}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Закрыть" hitSlop={12}>
              <Ionicons name="close" size={23} color={isNight ? '#DCC6AE' : '#67482E'} />
            </Pressable>
          </View>
          <ScrollView
            style={[styles.scrollPane,isNight && styles.scrollPaneNight]}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            persistentScrollbar
            nestedScrollEnabled
            scrollEventThrottle={16}
          >
            {entries.length === 0 ? (
              <Text style={[styles.empty, isTraditionalBible(translationCode) && traditionalBibleTextStyle, isNight && styles.secondaryLight]}>
                {bibleUiText(translationCode, 'noCrossReferences', 'Для этого стиха нет доступных параллельных мест.')}
              </Text>
            ) : visibleEntries.map((entry, index) => (
              <Pressable
                key={entry.bookCode + '.' + formatRange(entry) + ':' + index}
                accessibilityRole="button"
                accessibilityLabel={'Открыть ' + entry.title}
                style={({pressed})=>[styles.reference,isNight && styles.referenceNight,
                pressed && styles.referencePressed]}
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
                  <Text style={[styles.translationHint, isTraditionalBible(translationCode) && traditionalBibleTextStyle, isNight && styles.secondaryLight]}>
                    {bibleUiText(translationCode, 'synodalFallback', 'Текст приведён по Синодальному переводу')}
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
                <Text style={[styles.loadMoreText, isTraditionalBible(translationCode) && traditionalBibleTextStyle, isNight && styles.refTitleNight]}>
                  {bibleUiText(translationCode, 'showMore', 'Показать ещё ' + Math.min(24, remainingCount) + ' (осталось ' + remainingCount + ')', {count: Math.min(24, remainingCount), remaining: remainingCount})}
                </Text>
              </Pressable>
            )}
            {/* Attribution is available under Account > Sources and licenses,
                keeping the verse preview focused on reading. */}
          </ScrollView>
          <View style={[styles.scrollFooter,isNight && styles.scrollFooterNight]}>
            <Ionicons name="chevron-down" size={16} color={isNight?'#D0B49A':'#936641'}/>
            <Text style={[styles.scrollHint,isNight && styles.secondaryLight]}>
              Листайте вниз, чтобы увидеть другие места
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay:{flex:1,justifyContent:'flex-end'},
  backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(36,22,13,0.49)'},
  sheet:{
    maxHeight:'79%',minHeight:280,marginHorizontal:12,
    backgroundColor:'#FFF4DE',borderRadius:22,
    borderWidth:1.5,borderColor:'#D6B98C',
    overflow:'hidden',elevation:22,
    shadowColor:'#28160C',shadowOffset:{width:0,height:7},
    shadowOpacity:0.19,shadowRadius:15,
  },
  sheetNight:{backgroundColor:'#29221C',borderColor:'#82694E'},
  gestureArea:{height:43,alignItems:'center',justifyContent:'flex-start',
    paddingTop:9,backgroundColor:'rgba(226,197,155,0.22)'},
  handle:{height:5,width:54,borderRadius:8,backgroundColor:'#B28A60'},
  handleNight:{backgroundColor:'#C19A72'},
  swipeLabel:{fontSize:10,color:'#936641',marginTop:5,fontWeight:'600'},
  headingRow:{flexDirection:'row',alignItems:'center',paddingHorizontal:18,
    paddingTop:10,paddingBottom:12,
    borderBottomWidth:1,borderBottomColor:'rgba(163,125,78,0.22)'},
  headingText:{flex:1,paddingRight:14},
  heading:{fontFamily:'serif',fontSize:20,fontWeight:'700',color:'#51351F'},
  origin:{fontSize:13,marginTop:5,color:'#876C53'},
  originTraditional:{fontFamily:'Ponomar',fontSize:15,lineHeight:24},
  scrollPane:{minHeight:90,flexShrink:1,marginHorizontal:11,marginTop:10,
    borderWidth:1,borderColor:'#E0C7A5',
    backgroundColor:'#F8E9CF',borderRadius:15},
  scrollPaneNight:{backgroundColor:'#322922',borderColor:'#5A4938'},
  list:{paddingHorizontal:9,paddingTop:10,paddingBottom:18,gap:9},
  reference:{paddingVertical:13,paddingHorizontal:13,borderRadius:13,
    backgroundColor:'#FFF8EB',borderWidth:1,borderColor:'#DFCAA9'},
  referenceNight:{backgroundColor:'#41352C',borderColor:'#67513D'},
  referencePressed:{opacity:0.67},
  refTitle:{color:'#80502C',fontWeight:'700',fontSize:15},
  refTitleTraditional:{fontFamily:'Ponomar',fontWeight:'400',fontSize:17,lineHeight:25},
  refTitleNight:{color:'#E0B786'},
  refText:{color:'#3E2A1D',fontFamily:'serif',fontSize:16,lineHeight:24,marginTop:6},
  refTextTraditional:{fontFamily:'Ponomar',fontSize:18,lineHeight:31},
  inlineArrow:{fontFamily:'serif',fontSize:17,color:'#865A34'},
  inlineArrowNight:{color:'#D4A97A'},
  lightText:{color:'#F1E2D0'},
  secondaryLight:{color:'#CFB9A3'},
  translationHint:{fontSize:11,color:'#826A51',marginTop:5},
  empty:{color:'#826A51',fontSize:14,paddingVertical:22,paddingHorizontal:8},
  loadMore:{paddingVertical:13,alignItems:'center',borderRadius:12,
    backgroundColor:'#EFE0C4'},
  loadMoreText:{fontSize:14,color:'#81522E',fontWeight:'600'},
  scrollFooter:{flexDirection:'row',justifyContent:'center',alignItems:'center',
    gap:5,paddingVertical:11,backgroundColor:'#FFF4DE'},
  scrollFooterNight:{backgroundColor:'#29221C'},
  scrollHint:{fontSize:11,color:'#946D4B',fontWeight:'600'},
});
