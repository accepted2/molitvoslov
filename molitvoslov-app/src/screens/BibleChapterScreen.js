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
    resume = false,
  } = route.params || {};

  const book =
    bibleContent.getBook(
      bookId
    );

  const chapters =
    book?.chapters ||
    [];

  const requestedChapter =
    bibleContent.getChapter(
      bookId,
      chapterNumber
    ) ||
    chapters[0] ||
    null;

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

  const verseInfo =
    useMemo(
      () => {
        const byId =
          new Map();

        const ids =
          new Set();

        chapters.forEach(
          chapter => {
            (
              chapter.verses ||
              []
            ).forEach(
              verse => {
                const verseId =
                  Number(
                    verse.id
                  );

                ids.add(
                  verseId
                );

                byId.set(
                  verseId,
                  {
                    chapterNumber:
                      Number(
                        chapter.number
                      ),

                    verseNumber:
                      Number(
                        verse.number
                      ),
                  }
                );
              }
            );
          }
        );

        return {
          byId,
          ids,
        };
      },
      [
        chapters,
      ]
    );

  const chapterStartTarget =
    useMemo(
      () => {
        if (
          focusTarget ||
          resume ||
          !requestedChapter
        ) {
          return null;
        }

        const firstVerse =
          requestedChapter
            .verses?.[0];

        if (!firstVerse) {
          return null;
        }

        return {
          save_type:
            'chapter',

          anchor_type:
            'bible_verse',

          anchor_id:
            Number(
              firstVerse.id
            ),

          metadata: {
            chapter_number:
              Number(
                requestedChapter
                  .number
              ),
          },
        };
      },
      [
        focusTarget,
        resume,
        requestedChapter,
      ]
    );

  const effectiveFocusTarget =
    focusTarget ||
    chapterStartTarget;

  const documentData =
    useMemo(
      () => {
        if (!book) {
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
            book.name ||
            book.short_name,

          description:
            'Синодальный перевод',

          readerMode:
            'book',

          progressOffsetMode:
            'page',

          progressAnchorType:
            'bible_verse',

          savedItems:
            savedItems.filter(
              item =>
                verseInfo.ids.has(
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
            chapters.flatMap(
              chapter =>
                (
                  chapter.verses ||
                  []
                ).map(
                  (
                    verse,
                    verseIndex
                  ) => ({
                    className:
                      verseIndex === 0
                        ? 'bible-verse-section bible-chapter-start'
                        : 'bible-verse-section',

                    title:
                      verseIndex === 0
                        ? 'Глава ' +
                          chapter.number
                        : '',

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
                )
            ),
        };
      },
      [
        book,
        chapters,
        savedItems,
        verseInfo.ids,
      ]
    );

  const readerProgress =
    resume &&
    !effectiveFocusTarget
      ? savedProgress
      : null;

  const handleProgress =
    progress => {
      if (!book) {
        return;
      }

      const current =
        verseInfo.byId.get(
          Number(
            progress.anchorId
          )
        );

      if (!current) {
        return;
      }

      scheduleSave({
        ...progress,

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
            current.chapterNumber,

          verse_number:
            current.verseNumber,

          page_number:
            progress.pageIndex ===
              null ||
            progress.pageIndex ===
              undefined
              ? null
              : Number(
                  progress.pageIndex
                ) +
                1,

          page_count:
            progress.pageCount ===
              null ||
            progress.pageCount ===
              undefined
              ? null
              : Number(
                  progress.pageCount
                ),
        },
      });
    };

  if (
    !book ||
    !requestedChapter
  ) {
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
          effectiveFocusTarget
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
          book.short_name ||
          book.name
        }
        navigation={navigation}
        topInset={insets.top}
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
