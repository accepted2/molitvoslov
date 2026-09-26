import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
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

import SelectableDocumentReader
  from '../components/reader/SelectableDocumentReader';
import {
  FixedSectionHeader,
} from '../components/navigation/FixedSectionHeader';
import {
  useReadingProgress,
} from '../hooks/useReadingProgress';
import {
  getSavedItems,
} from '../services/savedItems';
import {
  bibleContent,
} from '../services/bibleContent';
import {
  colors,
} from '../theme';


export const BibleChapterScreen = ({
  route,
  navigation,
}) => {
  const {
    bookId,
    chapterNumber,
    focusTarget = null,
  } = route.params || {};

  const book =
    bibleContent.getBook(
      bookId
    );

  const chapter =
    bibleContent.getChapter(
      bookId,
      chapterNumber
    );

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);

  const [
    savedLoading,
    setSavedLoading,
  ] = useState(true);

  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

  const {
    savedProgress,
    progressReady,
    scheduleSave,
  } = useReadingProgress({
    sourceType:
      'bible',
    sourceId:
      book?.id,
  });

  const loadSavedItems =
    React.useCallback(
      async () => {
        if (!book?.id) {
          setSavedItems([]);
          setSavedLoading(
            false
          );
          return;
        }

        try {
          setSavedLoading(true);

          const items =
            await getSavedItems({
              source_type:
                'bible',
              source_id:
                book.id,
              anchor_type:
                'bible_verse',
            });

          setSavedItems(
            items
          );
        } finally {
          setSavedLoading(
            false
          );
        }
      },
      [
        book?.id,
      ]
    );

  useEffect(() => {
    loadSavedItems();
  }, [
    loadSavedItems,
    chapter?.id,
  ]);

  useFocusEffect(
    React.useCallback(
      () => {
        loadSavedItems();
      },
      [
        loadSavedItems,
      ]
    )
  );

  const verseIds =
    useMemo(
      () =>
        new Set(
          (
            chapter?.verses ||
            []
          ).map(
            verse =>
              Number(
                verse.id
              )
          )
        ),
      [
        chapter,
      ]
    );

  const documentData =
    useMemo(
      () => {
        if (
          !book ||
          !chapter
        ) {
          return {
            title: 'Библия',
            description: '',
            progressAnchorType:
              'bible_verse',
            savedItems: [],
            sections: [],
          };
        }

        return {
          title:
            book.short_name ||
            book.name,

          description:
            'Глава ' +
            chapter.number,

          progressAnchorType:
            'bible_verse',

          savedItems:
            savedItems.filter(
              item =>
                verseIds.has(
                  Number(
                    item.anchor_id
                  )
                ) &&
                item.start_offset !==
                  null &&
                item.end_offset !==
                  null
            ),

          sections:
            (
              chapter.verses ||
              []
            ).map(
              verse => ({
                className:
                  'bible-verse-section',

                progressAnchorId:
                  Number(
                    verse.id
                  ),

                trackProgress:
                  true,

                rows: [
                  {
                    layout:
                      'stack',

                    blocks: [
                      {
                        id:
                          Number(
                            verse.id
                          ),

                        text:
                          verse.text ||
                          '',

                        label: '',

                        inlineLabel:
                          String(
                            verse.number
                          ),

                        className:
                          'bible-verse',

                        sourceType:
                          'bible',

                        sourceId:
                          book.id,

                        anchorType:
                          'bible_verse',

                        anchorId:
                          verse.id,

                        sourceTitle:
                          'Библия · ' +
                          (
                            book.short_name ||
                            book.name
                          ),

                        itemTitle:
                          (
                            book.short_name ||
                            book.name
                          ) +
                          ' ' +
                          chapter.number +
                          ':' +
                          verse.number,

                        fullSaveType:
                          'verse',

                        metadata: {
                          book_id:
                            book.id,

                          book_slug:
                            book.slug,

                          book_name:
                            book.name,

                          book_short_name:
                            book.short_name,

                          chapter_number:
                            Number(
                              chapter.number
                            ),

                          verse_number:
                            Number(
                              verse.number
                            ),
                        },
                      },
                    ],
                  },
                ],
              })
            ),
        };
      },
      [
        book,
        chapter,
        savedItems,
        verseIds,
      ]
    );

  const readerProgress =
    useMemo(
      () => {
        if (
          !savedProgress ||
          !verseIds.has(
            Number(
              savedProgress
                .anchor_id
            )
          )
        ) {
          return null;
        }

        return savedProgress;
      },
      [
        savedProgress,
        verseIds,
      ]
    );

  const handleProgress =
    progress => {
      if (
        !book ||
        !chapter
      ) {
        return;
      }

      const verse =
        (
          chapter.verses ||
          []
        ).find(
          item =>
            Number(
              item.id
            ) ===
            Number(
              progress.anchorId
            )
        );

      const chapters =
        book.chapters || [];

      const chapterIndex =
        Math.max(
          0,
          chapters.findIndex(
            item =>
              Number(
                item.number
              ) ===
              Number(
                chapter.number
              )
          )
        );

      const chapterProgress =
        Math.max(
          0,
          Math.min(
            Number(
              progress
                .progressPercent ||
              0
            ),
            100
          )
        );

      const overallProgress =
        chapters.length
          ? Math.round(
              (
                chapterIndex +
                chapterProgress /
                  100
              ) /
              chapters.length *
              100
            )
          : chapterProgress;

      scheduleSave({
        ...progress,
        progressPercent:
          overallProgress,
        metadata: {
          book_id:
            book.id,
          book_slug:
            book.slug,
          book_name:
            book.name,
          book_short_name:
            book.short_name,
          chapter_number:
            Number(
              chapter.number
            ),
          verse_number:
            verse
              ? Number(
                  verse.number
                )
              : null,
        },
      });
    };

  if (
    !book ||
    !chapter
  ) {
    return (
      <View
        style={styles.center}
      >
        <Text
          style={styles.error}
        >
          Глава не найдена
        </Text>
      </View>
    );
  }

  if (
    savedLoading ||
    !progressReady
  ) {
    return (
      <View
        style={styles.center}
      >
        <ActivityIndicator
          size="large"
          color={
            colors.accent
          }
        />
      </View>
    );
  }

  return (
    <View
      style={styles.screen}
    >
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <SelectableDocumentReader
        documentData={
          documentData
        }
        savedProgress={
          readerProgress
        }
        focusTarget={
          focusTarget
        }
        topContentInset={
          headerHeight
        }
        onProgress={
          handleProgress
        }
      />

      <FixedSectionHeader
        title={
          (
            book.short_name ||
            book.name
          ) +
          ' ' +
          chapter.number
        }
        navigation={navigation}
        topInset={insets.top}
        showTitle={false}
      />
    </View>
  );
};


const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        '#FFF4DE',
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
      paddingHorizontal: 20,
      textAlign: 'center',
      fontSize: 16,
      color:
        colors.liturgical,
    },
  });
