import React, {
  useCallback,
  useState,
} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useFocusEffect,
} from '@react-navigation/native';
import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  StatusBar,
} from 'expo-status-bar';

import {
  AppBackground,
} from '../components/layout/AppBackground';
import {
  FixedSectionHeader,
} from '../components/navigation/FixedSectionHeader';
import {
  BottomNav,
} from '../components/navigation/BottomNav';
import {
  bibleContent,
} from '../services/bibleContent';
import {
  getReadingProgress,
} from '../services/readingProgress';
import {
  colors,
} from '../theme';


export const BibleBookScreen = ({
  route,
  navigation,
}) => {
  const book =
    bibleContent.getBook(
      route.params?.bookId
    );

  const [
    bookProgress,
    setBookProgress,
  ] = useState(null);

  const displayName =
    bibleContent.getDisplayName(
      book
    );

  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

  const loadProgress =
    useCallback(
      async () => {
        if (!book?.id) {
          setBookProgress(
            null
          );

          return;
        }

        const progress =
          await getReadingProgress();

        setBookProgress(
          progress.find(
            item =>
              item.source_type ===
                'bible' &&
              Number(
                item.source_id
              ) ===
                Number(
                  book.id
                )
          ) ||
          null
        );
      },
      [
        book?.id,
      ]
    );

  useFocusEffect(
    useCallback(
      () => {
        loadProgress();
      },
      [
        loadProgress,
      ]
    )
  );

  if (!book) {
    return (
      <View
        style={styles.center}
      >
        <Text
          style={styles.error}
        >
          Книга не найдена
        </Text>
      </View>
    );
  }

  const progressInfo =
    bookProgress
      ?.anchor_info ||
    {};

  const progressChapter =
    Number(
      progressInfo
        .chapter_number ||
      0
    );

  const progressPage =
    Number(
      progressInfo
        .page_number ||
      0
    );

  const progressPageCount =
    Number(
      progressInfo
        .page_count ||
      0
    );

  const progressPercent =
    Number(
      bookProgress
        ?.progress_percent ||
      0
    );

  const openChapter =
    chapter => {
      const isResumeChapter =
        !!bookProgress &&
        Number(
          chapter.number
        ) ===
          progressChapter;

      navigation.navigate(
        'BibleChapter',
        {
          bookId:
            book.id,

          chapterNumber:
            chapter.number,

          resume:
            isResumeChapter,
        }
      );
    };

  const resumeReading =
    () => {
      if (
        !bookProgress ||
        !progressChapter
      ) {
        return;
      }

      navigation.navigate(
        'BibleChapter',
        {
          bookId:
            book.id,

          chapterNumber:
            progressChapter,

          resume:
            true,
        }
      );
    };

  return (
    <AppBackground
      imageOpacity={0.72}
    >
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <FlatList
        data={
          book.chapters ||
          []
        }
        numColumns={4}
        keyExtractor={
          item =>
            String(
              item.id
            )
        }
        columnWrapperStyle={
          styles.row
        }
        contentContainerStyle={{
          paddingTop:
            headerHeight + 16,
          paddingHorizontal: 10,
          paddingBottom:
            92 + insets.bottom,
        }}
        ListHeaderComponent={
          <View>
            <Text
              style={styles.fullName}
            >
              {displayName}
            </Text>

            {!!bookProgress &&
              !!progressChapter && (
              <Pressable
                onPress={
                  resumeReading
                }
                style={({pressed}) => [
                  styles.resumeCard,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <View
                  style={
                    styles.resumeText
                  }
                >
                  <Text
                    style={
                      styles.resumeLabel
                    }
                  >
                    Продолжить чтение
                  </Text>

                  <Text
                    style={
                      styles.resumePosition
                    }
                  >
                    Глава{' '}
                    {progressChapter}
                    {progressPage &&
                    progressPageCount
                      ? ' · страница ' +
                        progressPage +
                        ' из ' +
                        progressPageCount
                      : ''}
                  </Text>
                </View>

                <Text
                  style={
                    styles.resumePercent
                  }
                >
                  {progressPercent}%
                </Text>

                <Text
                  style={
                    styles.resumeArrow
                  }
                >
                  ›
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({item}) => {
          const isCurrent =
            !!bookProgress &&
            Number(
              item.number
            ) ===
              progressChapter;

          return (
            <Pressable
              onPress={() =>
                openChapter(
                  item
                )
              }
              style={({pressed}) => [
                styles.chapter,

                isCurrent &&
                  styles.chapterCurrent,

                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.chapterNumber,

                  isCurrent &&
                    styles.chapterNumberCurrent,
                ]}
              >
                {item.number}
              </Text>

              {isCurrent && (
                <View
                  style={
                    styles.currentDot
                  }
                />
              )}
            </Pressable>
          );
        }}
      />

      <FixedSectionHeader
        title={
          displayName
        }
        navigation={navigation}
        topInset={insets.top}
      />

      <BottomNav
        navigation={navigation}
        active={null}
      />
    </AppBackground>
  );
};


const styles =
  StyleSheet.create({
    row: {
      gap: 8,
    },

    fullName: {
      marginHorizontal: 4,
      marginBottom: 13,
      fontFamily: 'serif',
      fontSize: 15,
      lineHeight: 21,
      color:
        colors.textSecondary,
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
      borderColor:
        'rgba(126, 82, 38, 0.30)',
      backgroundColor:
        'rgba(239, 218, 184, 0.98)',
    },

    resumeText: {
      flex: 1,
    },

    resumeLabel: {
      color:
        colors.accentDark,
      fontFamily: 'serif',
      fontSize: 16,
      fontWeight: '700',
    },

    resumePosition: {
      marginTop: 3,
      color:
        colors.textSecondary,
      fontFamily: 'serif',
      fontSize: 12,
      lineHeight: 17,
    },

    resumePercent: {
      marginLeft: 10,
      color:
        colors.accentDark,
      fontSize: 12,
      fontWeight: '700',
    },

    resumeArrow: {
      marginLeft: 7,
      color: '#91623A',
      fontSize: 25,
      lineHeight: 27,
    },

    chapter: {
      position: 'relative',
      flex: 1,
      minHeight: 52,
      marginBottom: 8,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        'rgba(126, 82, 38, 0.18)',
      backgroundColor:
        'rgba(248, 233, 207, 0.96)',
    },

    chapterCurrent: {
      borderColor:
        'rgba(126, 82, 38, 0.52)',
      backgroundColor:
        '#EBD3AE',
      shadowColor:
        '#6C4327',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.10,
      shadowRadius: 4,
      elevation: 2,
    },

    chapterNumber: {
      fontFamily: 'serif',
      fontSize: 18,
      fontWeight: '700',
      color:
        colors.text,
    },

    chapterNumberCurrent: {
      color:
        colors.accentDark,
    },

    currentDot: {
      position: 'absolute',
      top: 7,
      right: 8,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor:
        colors.liturgical,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.background,
    },

    error: {
      fontSize: 16,
      color:
        colors.liturgical,
    },

    pressed: {
      opacity: 0.62,
    },
  });
