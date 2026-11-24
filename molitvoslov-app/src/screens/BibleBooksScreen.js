import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Pressable, SectionList, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import {ContentContextMenu} from '../components/share/ContentContextMenu';
import {shareContent} from '../services/contentSharing';
import {SaveHeartIcon} from '../components/icons/SaveHeartIcon';
import {deleteSavedItem, getSavedItems} from '../services/savedItems';
import {findSavedBibleBook, saveBibleBook} from '../services/bibleListFavorites';
import {showShareFeedback} from '../services/shareFeedback';
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
  const [contextBook,setContextBook] = useState(null);
  const [savedBooks,setSavedBooks] = useState([]);
  const savingRef=useRef(new Set());

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

  useFocusEffect(useCallback(() => {
    let active=true;
    getSavedItems({source_type:'bible'})
      .then(rows => {if(active)setSavedBooks(rows);})
      .catch(error => console.warn('[bible books] saved:',error?.message||error));
    return () => {active=false;};
  },[]));

  const toggleBookSaved=async book => {
    if(!book?.id || savingRef.current.has(book.id))return;
    savingRef.current.add(book.id);
    try {
      const existing=findSavedBibleBook(savedBooks,book,translationCode);
      if(existing){
        await deleteSavedItem(existing.id);
        setSavedBooks(current=>current.filter(item=>item.id!==existing.id));
      } else {
        const saved=await saveBibleBook({
          book,translationCode,title:bibleContent.getDisplayName(book,translationCode),
        });
        setSavedBooks(current=>[saved,...current]);
      }
    }catch(error){
      console.warn('[bible books] save:',error?.message||error);
      showShareFeedback({title:'Не удалось сохранить книгу',
        message:error?.message||'Попробуйте ещё раз.'});
    }finally{savingRef.current.delete(book.id);}
  };

  const shareBook=book=>shareContent({
    title:bibleContent.getDisplayName(book,translationCode),
    screen:'BibleBook',params:{bookId:book.id,translationCode},
  });

  const progressByBook = useMemo(() => {
    const results = new Map();
    // getReadingProgress() returns newest first. Resolve progress across
    // translations by canonical code/slug, not by per-edition record ID.
    readingProgress.forEach((item) => {
      for (const key of [item.anchor_info?.book_code, item.anchor_info?.book_slug, Number(item.source_id)]) {
        if (key !== undefined && key !== null && !results.has(key)) results.set(key, item);
      }
    });
    return results;
  }, [readingProgress]);

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
          const progress=progressByBook.get(item.code) ||
            progressByBook.get(item.slug) || progressByBook.get(Number(item.id));
          const chapterNumber=Number(progress?.anchor_info?.chapter_number||0);
          const saved=!!findSavedBibleBook(savedBooks,item,translationCode);
          return (
            <View style={[styles.item,!!progress && styles.itemStarted]}>
              <Pressable
                onLongPress={() => setContextBook(item)}
                delayLongPress={340}
                onPress={() => navigation.navigate('BibleBook',{
                  bookId:item.id,translationCode,
                })}
                style={({pressed}) => [styles.itemMain,pressed && styles.pressed]}
              >
                <View style={styles.itemText}>
                  <Text style={[styles.bookName,isTraditional && traditionalBibleTextStyle,
                    isTraditional && styles.bookNameChurch]}>
                    {bibleContent.getDisplayName(item,translationCode)}
                  </Text>
                  <Text style={[styles.chapterCount,isTraditional && traditionalBibleTextStyle,
                    isTraditional && styles.chapterCountChurch]}>
                    {ui('chapters',t('bible.chapters',{count:item.chapters?.length||0}),
                      {count:item.chapters?.length||0})}
                    {chapterNumber ? ' · ' + ui('stoppedChapter',
                      t('bible.stoppedChapter',{chapter:chapterNumber}),
                      {chapter:chapterNumber}) : ''}
                  </Text>
                </View>
                {!!progress && (
                  <Text style={[styles.progressPercent,isTraditional && traditionalBibleTextStyle]}>
                    {formatBibleNumber(translationCode,Number(progress.progress_percent||0))}%
                  </Text>
                )}
                <Text style={styles.arrow}>›</Text>
              </Pressable>
              <View style={styles.itemActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={saved?'Убрать книгу из избранного':'Сохранить книгу'}
                  onPress={() => toggleBookSaved(item)}
                  hitSlop={5}
                  style={({pressed}) => [styles.actionButton,pressed && styles.pressed]}
                >
                  <SaveHeartIcon active={saved} size={19}/>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Поделиться книгой"
                  onPress={() => shareBook(item)}
                  hitSlop={5}
                  style={({pressed}) => [styles.actionButton,pressed && styles.pressed]}
                >
                  <Ionicons name="share-social-outline" size={19} color="#765238"/>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <FixedSectionHeader onHeaderHeightChange={setHeaderHeight} title={title} titleTextStyle={isTraditional ? traditionalBibleTextStyle : null} navigation={navigation} topInset={insets.top} />

      <BottomNav navigation={navigation} active={null} />
      <ContentContextMenu
        visible={!!contextBook}
        title={contextBook ? bibleContent.getDisplayName(contextBook,translationCode) : ''}
        onClose={()=>setContextBook(null)}
        onOpen={contextBook ? ()=>navigation.navigate('BibleBook',{
          bookId:contextBook.id,translationCode,
        }) : null}
        onShare={contextBook ? ()=>shareBook(contextBook) : null}
        onSave={contextBook ? ()=>toggleBookSaved(contextBook) : null}
        saved={!!(contextBook && findSavedBibleBook(savedBooks,contextBook,translationCode))}
      />
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
    paddingLeft: 0,
    paddingRight: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.18)',
    backgroundColor: 'rgba(248, 233, 207, 0.96)',
    overflow: 'hidden',
  },

  itemMain:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',
    paddingLeft:14,paddingRight:7,paddingVertical:9,minHeight:58},
  itemActions:{flexDirection:'row',alignSelf:'stretch',alignItems:'center',
    borderLeftWidth:1,borderLeftColor:'rgba(126,82,38,0.20)',
    paddingHorizontal:2,backgroundColor:'rgba(238,220,192,0.54)'},
  actionButton:{width:34,minHeight:42,alignItems:'center',justifyContent:'center'},

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
  bookNameChurch:{fontSize:19,lineHeight:27},
  chapterCountChurch:{fontSize:15,lineHeight:22,color:'#5C3924'},
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
