import React, {useCallback, useState} from 'react';
import {
  FlatList,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {bibleContent} from '../services/bibleContent';
import {getReadingProgress} from '../services/readingProgress';
import {getBibleArtwork} from '../data/bibleArtwork';
import {homeArtwork} from '../data/homeArtwork';
import {colors} from '../theme';

export const BibleBookScreen = ({route, navigation}) => {
  const book = bibleContent.getBook(route.params?.bookId);

  const [bookProgress, setBookProgress] = useState(null);

  const displayName = bibleContent.getDisplayName(book);
  const artwork = getBibleArtwork(book);

  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const loadProgress = useCallback(async () => {
    if (!book?.id) {
      setBookProgress(null);
      return;
    }

    const progress = await getReadingProgress();

    setBookProgress(
      progress.find(
        (item) =>
          item.source_type === 'bible' &&
          Number(item.source_id) === Number(book.id)
      ) || null
    );
  }, [book?.id]);

  useFocusEffect(
    useCallback(() => {
      loadProgress();
    }, [loadProgress])
  );

  if (!book) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Книга не найдена</Text>
      </View>
    );
  }

  const progressInfo = bookProgress?.anchor_info || {};

  const progressChapter = Number(progressInfo.chapter_number || 0);
  const progressPage = Number(progressInfo.page_number || 0);
  const progressPageCount = Number(progressInfo.page_count || 0);
  const progressPercent = Number(bookProgress?.progress_percent || 0);

  const openChapter = (chapter) => {
    const isResumeChapter =
      !!bookProgress && Number(chapter.number) === progressChapter;

    navigation.navigate('BibleChapter', {
      bookId: book.id,
      chapterNumber: chapter.number,
      resume: isResumeChapter,
    });
  };

  const resumeReading = () => {
    if (!bookProgress || !progressChapter) {
      return;
    }

    navigation.navigate('BibleChapter', {
      bookId: book.id,
      chapterNumber: progressChapter,
      resume: true,
    });
  };

  return (
    <View style={styles.screen}>
      <ImageBackground
        source={artwork?.background || homeArtwork.page_bg}
        resizeMode="cover"
        style={styles.background}
        imageStyle={[
          styles.backgroundImage,
          !artwork?.background && styles.defaultBackgroundImage,
        ]}
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
              colors={[
                'rgba(0,0,0,0.38)',
                'rgba(0,0,0,0)',
              ]}
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
              <Text
                style={[
                  styles.fullName,
                  artwork?.background && styles.fullNameArtwork,
                ]}
              >
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
                      style={[
                        styles.resumeLabel,
                        artwork?.background && styles.resumeLabelArtwork,
                      ]}
                    >
                      Продолжить чтение
                    </Text>

                    <Text
                      style={[
                        styles.resumePosition,
                        artwork?.background && styles.resumePositionArtwork,
                      ]}
                    >
                      Глава {progressChapter}
                      {progressPage && progressPageCount
                        ? ' · страница ' +
                        progressPage +
                        ' из ' +
                        progressPageCount
                        : ''}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.resumePercent,
                      artwork?.background && styles.resumePercentArtwork,
                    ]}
                  >
                    {progressPercent}%
                  </Text>

                  <Text
                    style={[
                      styles.resumeArrow,
                      artwork?.background && styles.resumeArrowArtwork,
                    ]}
                  >
                    ›
                  </Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({item}) => {
            const isCurrent =
              !!bookProgress && Number(item.number) === progressChapter;

            return (
              <Pressable
                onPress={() => openChapter(item)}
                style={({pressed}) => [
                  styles.chapter,

                  artwork?.background && styles.chapterArtwork,

                  isCurrent && styles.chapterCurrent,

                  artwork?.background &&
                  isCurrent &&
                  styles.chapterCurrentArtwork,

                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.chapterNumber,

                    artwork?.background && styles.chapterNumberArtwork,

                    isCurrent && styles.chapterNumberCurrent,
                  ]}
                >
                  {item.number}
                </Text>

                {isCurrent && <View style={styles.currentDot} />}
              </Pressable>
            );
          }}
        />

        <FixedSectionHeader
          title={displayName}
          navigation={navigation}
          topInset={insets.top}
        />

        <BottomNav navigation={navigation} active={null} />
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
    minHeight: 52,

    marginBottom: 8,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 12,
    borderWidth: 1,

    borderColor: 'rgba(126, 82, 38, 0.18)',
    backgroundColor: 'rgba(248, 233, 207, 0.96)',
  },

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
    borderColor: '#E6B65E',
    backgroundColor: 'rgba(126, 76, 25, 0.92)',
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
    color: '#FFE2A1',
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