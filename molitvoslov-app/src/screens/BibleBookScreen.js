import React, {useCallback, useRef, useState} from 'react';
import {FlatList, ImageBackground, Pressable, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {LinearGradient} from 'expo-linear-gradient';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {bibleContent} from '../services/bibleContent';
import {useBibleContentGeneration} from '../hooks/useBibleContentGeneration';
import {getReadingProgress} from '../services/readingProgress';
import {getBibleArtwork} from '../data/bibleArtwork';
import {homeArtwork} from '../data/homeArtwork';
import {colors} from '../theme';
import {ContentContextMenu} from '../components/share/ContentContextMenu';
import {shareContent} from '../services/contentSharing';
import {deleteSavedItem, getSavedItems} from '../services/savedItems';
import {findSavedBibleBook, findSavedBibleChapter,
  bibleChapterText, saveBibleBook, saveBibleChapter} from '../services/bibleListFavorites';
import {showShareFeedback} from '../services/shareFeedback';
import {useLanguage} from '../context/LanguageContext';
import {bibleUiText, isTraditionalBible, traditionalBibleTextStyle, formatBibleNumber} from '../services/bibleUi';

export const BibleBookScreen = ({route, navigation}) => {
  const {t} = useLanguage();
  useBibleContentGeneration();
  const translationCode = route.params?.translationCode === 'csl_traditional'
    ? 'csl_traditional'
    : 'rst';
  const isTraditional = isTraditionalBible(translationCode);
  const ui = (key, fallback, params) => bibleUiText(translationCode, key, fallback, params);

  const book = bibleContent.getBook(route.params?.bookId, translationCode);

  const [bookProgress, setBookProgress] = useState(null);
  const [savedBible,setSavedBible] = useState([]);
  const saveLocks=useRef(new Set());
  const [contextChapter,setContextChapter] = useState(null);
  const [bookContextVisible,setBookContextVisible] = useState(false);

  const displayName = bibleContent.getDisplayName(book, translationCode);
  const artwork = getBibleArtwork(book);

  const insets = useSafeAreaInsets();

  const [headerHeight, setHeaderHeight] = React.useState(insets.top + 56);
  React.useEffect(() => {setHeaderHeight(insets.top + 56);}, [insets.top]);

  const loadProgress = useCallback(async () => {
    if (!book?.id) {
      setBookProgress(null);
      return;
    }

    const progress = await getReadingProgress();

    setBookProgress(
      progress.find(
        (item) => item.source_type === 'bible' && (
          Number(item.source_id) === Number(book.id) ||
          item.anchor_info?.book_code === book.code ||
          item.anchor_info?.book_slug === book.slug
        )
      ) || null
    );
  }, [book?.id]);

  useFocusEffect(
    useCallback(() => {
      loadProgress();
    }, [loadProgress])
  );

  useFocusEffect(useCallback(() => {
    let active=true;
    if(book?.id){
      getSavedItems({source_type:'bible',source_id:book.id})
        .then(items=>{if(active)setSavedBible(items);})
        .catch(error=>console.warn('[bible chapter list] saved:',error?.message||error));
    }else{
      setSavedBible([]);
    }
    return ()=>{active=false;};
  },[book?.id,translationCode]));

  const toggleBookSaved=async()=>{
    if(!book || saveLocks.current.has('book'))return;
    saveLocks.current.add('book');
    try{
      const old=findSavedBibleBook(savedBible,book,translationCode);
      if(old){
        await deleteSavedItem(old.id);
        setSavedBible(items=>items.filter(item=>item.id!==old.id));
      }else{
        const saved=await saveBibleBook({book,translationCode,title:displayName});
        setSavedBible(items=>[saved,...items]);
      }
    }catch(error){
      showShareFeedback({title:'Не удалось сохранить книгу',
        message:error?.message||'Попробуйте ещё раз.'});
    }finally{saveLocks.current.delete('book');}
  };

  const toggleChapterSaved=async(chapter)=>{
    if(!book || !chapter)return;
    const key='chapter:'+chapter.id;
    if(saveLocks.current.has(key))return;
    saveLocks.current.add(key);
    try{
      const old=findSavedBibleChapter(savedBible,book,chapter,translationCode);
      if(old){
        await deleteSavedItem(old.id);
        setSavedBible(items=>items.filter(item=>item.id!==old.id));
      }else{
        const saved=await saveBibleChapter({
          book,chapter,translationCode,title:displayName,
        });
        setSavedBible(items=>[saved,...items]);
      }
    }catch(error){
      showShareFeedback({title:'Не удалось сохранить главу',
        message:error?.message||'Попробуйте ещё раз.'});
    }finally{saveLocks.current.delete(key);}
  };

  if (!book) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('bible.bookNotFound')}</Text>
      </View>
    );
  }

  const progressInfo = bookProgress?.anchor_info || {};

  const progressChapter = Number(progressInfo.chapter_number || 0);
  const progressPage = Number(progressInfo.page_number || 0);
  const progressPageCount = Number(progressInfo.page_count || 0);
  const progressPercent = Number(bookProgress?.progress_percent || 0);
  const savedCode = bookProgress?.anchor_info?.translation_code;
  const progressTranslation = savedCode === 'rst' || savedCode === 'csl_traditional' ? savedCode : translationCode;
  const resumeBook = !book ? null : progressTranslation === translationCode ? book :
    bibleContent.getBooks(null, progressTranslation).find((candidate) => candidate.code === book.code);

  const openChapter = (chapter) => {
    const isResumeChapter = !!bookProgress && progressTranslation === translationCode &&
      Number(bookProgress.source_id) === Number(book.id) && Number(chapter.number) === progressChapter;

    navigation.navigate('BibleChapter', {
      bookId: book.id,
      chapterNumber: chapter.number,
      translationCode,
      resume: isResumeChapter,
    });
  };

  const resumeReading = () => {
    if (!bookProgress || !progressChapter || !resumeBook ||
      !bibleContent.getChapter(resumeBook.id, progressChapter, progressTranslation)) {
      return;
    }

    const storedIdMatches = Number(bookProgress.source_id) === Number(resumeBook.id);
    const chapter = bibleContent.getChapter(resumeBook.id, progressChapter, progressTranslation);
    const verseNumber = Number(progressInfo.verse_number || 1);
    const verse = chapter?.verses?.find((item) => Number(item.number) === verseNumber)
      || chapter?.verses?.[0];
    navigation.navigate('BibleChapter', {
      bookId: resumeBook.id,
      chapterNumber: progressChapter,
      translationCode: progressTranslation,
      resume: storedIdMatches,
      // Older progress may refer to another translation's record IDs.
      // If IDs differ, navigate by chapter/verse rather than a stale anchor ID.
      ...(!storedIdMatches && verse ? {
        focusTarget: {
          save_type: 'verse',
          anchor_type: 'bible_verse',
          anchor_id: Number(verse.id),
          metadata: {book_id: Number(resumeBook.id), chapter_number: progressChapter, verse_number: Number(verse.number)},
        },
      } : {}),
    });
  };

  return (
    <View style={styles.screen}>
      <ImageBackground
        source={artwork?.background || homeArtwork.page_bg}
        resizeMode="cover"
        style={styles.background}
        imageStyle={[styles.backgroundImage, !artwork?.background && styles.defaultBackgroundImage]}
      >
        {artwork?.background && (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(30, 16, 8, 0.10)',
                'rgba(30, 16, 8, 0.18)',
                'rgba(35, 18, 8, 0.42)',
                'rgba(35, 18, 8, 0.72)',
              ]}
              locations={[0, 0.32, 0.62, 1]}
              style={StyleSheet.absoluteFillObject}
            />

            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)']}
              style={styles.topShade}
            />
          </>
        )}

        <StatusBar
          style={artwork?.background ? 'light' : 'dark'}
          translucent
          backgroundColor="transparent"
        />

        <FlatList
          data={book.chapters || []}
          numColumns={4}
          keyExtractor={(item) => String(item.id)}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: headerHeight + 16,
            paddingHorizontal: 10,
            paddingBottom: 92 + insets.bottom,
          }}
          ListHeaderComponent={
            <View>
              <Text style={[styles.fullName, artwork?.background && styles.fullNameArtwork, isTraditional && traditionalBibleTextStyle]}>
                {displayName}
              </Text>

              {!!bookProgress && !!progressChapter && (
                <Pressable
                  onPress={resumeReading}
                  style={({pressed}) => [
                    styles.resumeCard,
                    artwork?.background && styles.resumeCardArtwork,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.resumeText}>
                    <Text
                      style={[styles.resumeLabel, artwork?.background && styles.resumeLabelArtwork, isTraditional && traditionalBibleTextStyle]}
                    >
                      {ui('continueReading', t('bible.continueReading'))}
                    </Text>

                    <Text
                      style={[
                        styles.resumePosition,
                        artwork?.background && styles.resumePositionArtwork,
                        isTraditional && traditionalBibleTextStyle,
                      ]}
                    >
                      {ui('chapter', t('bible.chapter', {number: progressChapter}), {number: progressChapter})}
                      {progressPage && progressPageCount
                        ? ' · ' + ui('pageOf', t('bible.pageOf', {page: progressPage, count: progressPageCount}), {page: progressPage, count: progressPageCount})
                        : ''}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.resumePercent,
                      artwork?.background && styles.resumePercentArtwork,
                    isTraditional && traditionalBibleTextStyle,
                    ]}
                  >
                    {formatBibleNumber(translationCode, progressPercent)}%
                  </Text>

                  <Text
                    style={[styles.resumeArrow, artwork?.background && styles.resumeArrowArtwork]}
                  >
                    ›
                  </Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({item}) => {
            const isCurrent=!!bookProgress && Number(item.number)===progressChapter;
            const isSaved=!!findSavedBibleChapter(savedBible,book,item,translationCode);
            return (
              <View style={[
                styles.chapter,
                artwork?.background && styles.chapterArtwork,
                isCurrent && styles.chapterCurrent,
                artwork?.background && isCurrent && styles.chapterCurrentArtwork,
              ]}>
                <Pressable
                  onPress={() => openChapter(item)}
                  onLongPress={() => setContextChapter(item)}
                  delayLongPress={340}
                  accessibilityRole="button"
                  accessibilityLabel={ui('chapter',t('bible.chapter',{number:item.number}),
                    {number:item.number})}
                  style={({pressed}) => [styles.chapterOpen,pressed && styles.pressed]}
                >
                  <Text style={[
                    styles.chapterNumber,
                    artwork?.background && styles.chapterNumberArtwork,
                    isTraditional && traditionalBibleTextStyle,
                    isTraditional && styles.chapterNumberChurch,
                    isCurrent && styles.chapterNumberCurrent,
                  ]}>
                    {formatBibleNumber(translationCode,item.number)}
                  </Text>
                  {isCurrent && <View style={styles.currentDot}/>}
                  {isSaved && <Ionicons name="heart" size={10} color="#A76740"
                    style={styles.chapterSavedMark}/>}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Действия с главой '+item.number}
                  accessibilityHint="Сохранить главу или поделиться"
                  onPress={() => setContextChapter(item)}
                  style={({pressed}) => [styles.chapterMenu,pressed && styles.pressed]}
                  hitSlop={5}
                >
                  <Ionicons name="ellipsis-vertical" size={16}
                    color={artwork?.background && !isCurrent?'#FFF0D1':'#6D432B'}/>
                </Pressable>
              </View>
            );
          }
        />

        <FixedSectionHeader onHeaderHeightChange={setHeaderHeight}
          title={displayName} titleTextStyle={isTraditional ? traditionalBibleTextStyle : null}
          navigation={navigation} topInset={insets.top}
          showMenu onMenuPress={()=>setBookContextVisible(true)}/>

        <BottomNav navigation={navigation} active={null} />
        <ContentContextMenu
          visible={bookContextVisible}
          title={displayName}
          onClose={()=>setBookContextVisible(false)}
          onShare={()=>shareContent({
            title:displayName,
            screen:'BibleBook',params:{bookId:book.id,translationCode},
          })}
          onSave={toggleBookSaved}
          saved={!!findSavedBibleBook(savedBible,book,translationCode)}
        />
        <ContentContextMenu
          visible={!!contextChapter}
          title={contextChapter ? ui('chapter',
            t('bible.chapter',{number:contextChapter.number}),
            {number:contextChapter.number}) : ''}
          onClose={()=>setContextChapter(null)}
          onOpen={contextChapter ? ()=>openChapter(contextChapter) : null}
          onShare={contextChapter ? ()=>shareContent({
            title:displayName+' · '+ui('chapter',
              t('bible.chapter',{number:contextChapter.number}),
              {number:contextChapter.number}),
            text:bibleChapterText(contextChapter,translationCode),
            screen:'BibleChapter',params:{bookId:book.id,
              chapterNumber:contextChapter.number,translationCode},
          }) : null}
          onSave={contextChapter ? ()=>toggleChapterSaved(contextChapter) : null}
          saved={!!(contextChapter &&
            findSavedBibleChapter(savedBible,book,contextChapter,translationCode))}
        />
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#2E180D',
  },

  background: {
    flex: 1,
  },

  backgroundImage: {
    opacity: 1,
  },

  defaultBackgroundImage: {
    opacity: 0.72,
  },

  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },

  row: {
    gap: 8,
  },

  fullName: {
    marginHorizontal: 4,
    marginBottom: 13,
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },

  fullNameArtwork: {
    color: '#FFF2DB',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',

    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 4,
  },

  resumeCard: {
    minHeight: 66,
    marginBottom: 14,
    paddingLeft: 14,
    paddingRight: 12,

    flexDirection: 'row',
    alignItems: 'center',

    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.30)',

    backgroundColor: 'rgba(239, 218, 184, 0.98)',
  },

  resumeCardArtwork: {
    borderColor: 'rgba(226, 175, 96, 0.58)',
    backgroundColor: 'rgba(50, 25, 11, 0.65)',
  },

  resumeText: {
    flex: 1,
  },

  resumeLabel: {
    color: colors.accentDark,
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },

  resumeLabelArtwork: {
    color: '#F8D99C',
  },

  resumePosition: {
    marginTop: 3,
    color: colors.textSecondary,
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 17,
  },

  resumePositionArtwork: {
    color: '#E8D5B8',
  },

  resumePercent: {
    marginLeft: 10,
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: '700',
  },

  resumePercentArtwork: {
    color: '#F1C97D',
  },

  resumeArrow: {
    marginLeft: 7,
    color: '#91623A',
    fontSize: 25,
    lineHeight: 27,
  },

  resumeArrowArtwork: {
    color: '#F1C97D',
  },

  chapter: {
    position: 'relative',

    flex: 1,
    minHeight: 58,

    marginBottom: 8,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 12,
    borderWidth: 1,

    borderColor: 'rgba(126, 82, 38, 0.18)',
    backgroundColor: 'rgba(248, 233, 207, 0.96)',
  },

  chapterOpen:{flex:1,minHeight:58,width:'100%',alignItems:'center',
    justifyContent:'center',paddingBottom:4},
  chapterMenu:{position:'absolute',right:0,bottom:0,width:26,height:26,
    alignItems:'center',justifyContent:'center',zIndex:2},
  chapterSavedMark:{position:'absolute',left:7,top:7},

  chapterArtwork: {
    borderColor: 'rgba(220, 167, 89, 0.48)',
    backgroundColor: 'rgba(54, 28, 13, 0.62)',
  },

  chapterCurrent: {
    borderColor: 'rgba(126, 82, 38, 0.52)',
    backgroundColor: '#EBD3AE',

    shadowColor: '#6C4327',
    shadowOffset: {
      width: 0,
      height: 2,
    },

    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  chapterCurrentArtwork: {
    borderColor: '#945E36',
    backgroundColor: '#FFF0CF',
  },

  chapterNumber: {
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  chapterNumberArtwork: {
    color: '#FFF0D1',

    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 2,
  },

  chapterNumberCurrent: {
    color: '#4C2818',
    textShadowColor:'transparent',
    textShadowRadius:0,
  },
  chapterNumberChurch:{
    fontSize:24,
    lineHeight:32,
  },

  currentDot: {
    position: 'absolute',

    top: 7,
    right: 8,

    width: 6,
    height: 6,

    borderRadius: 3,

    backgroundColor: '#E5B357',
  },

  center: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: colors.background,
  },

  error: {
    fontSize: 16,
    color: colors.liturgical,
  },

  pressed: {
    opacity: 0.62,
  },
});
