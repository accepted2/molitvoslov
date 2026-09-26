import React, {
  useEffect,
  useMemo,
  useRef,
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
  deleteSavedItem,
  getSavedItems,
  saveItem,
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

  const displayName =
    bibleContent.getDisplayName(
      book
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

  const savedItemsRef =
    useRef([]);

  const [
    savedLoading,
    setSavedLoading,
  ] = useState(true);

  const insets =
    useSafeAreaInsets();

  const readerTopInset =
    insets.top + 43;

  const readerBottomInset =
    38;

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
          savedItemsRef.current =
            [];

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
            });

          savedItemsRef.current =
            items;

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

  const normalizedFocusTarget =
    useMemo(
      () => {
        if (
          !focusTarget ||
          focusTarget.anchor_type !==
            'bible_chapter'
        ) {
          return focusTarget;
        }

        const targetChapter =
          bibleContent.getChapter(
            bookId,
            focusTarget.metadata
              ?.chapter_number
          );

        const firstVerse =
          targetChapter
            ?.verses?.[0];

        if (!firstVerse) {
          return focusTarget;
        }

        return {
          ...focusTarget,

          anchor_type:
            'bible_verse',

          anchor_id:
            Number(
              firstVerse.id
            ),

          start_offset:
            null,

          end_offset:
            null,
        };
      },
      [
        focusTarget,
        bookId,
      ]
    );

  const chapterStartTarget =
    useMemo(
      () => {
        if (
          normalizedFocusTarget ||
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
        normalizedFocusTarget,
        resume,
        requestedChapter,
      ]
    );

  const effectiveFocusTarget =
    normalizedFocusTarget ||
    chapterStartTarget;

  const handleAction =
    React.useCallback(
      async actionKey => {
        if (
          !actionKey?.startsWith(
            'bible-chapter:'
          ) ||
          !book
        ) {
          return null;
        }

        const chapterId =
          Number(
            actionKey.split(
              ':'
            )[1]
          );

        const chapter =
          chapters.find(
            item =>
              Number(
                item.id
              ) ===
              chapterId
          );

        if (!chapter) {
          return null;
        }

        const existing =
          savedItemsRef.current
            .find(
              item =>
                item.anchor_type ===
                  'bible_chapter' &&
                Number(
                  item.anchor_id
                ) ===
                  chapterId &&
                item.save_type ===
                  'chapter'
            );

        if (existing) {
          await deleteSavedItem(
            existing.id
          );

          savedItemsRef.current =
            savedItemsRef.current
              .filter(
                item =>
                  item.id !==
                  existing.id
              );

          return {
            label: '☆',
            active: false,
          };
        }

        const text =
          (
            chapter.verses ||
            []
          )
            .map(
              verse =>
                verse.number +
                ' ' +
                (
                  verse.text ||
                  ''
                )
            )
            .join('\n');

        const saved =
          await saveItem({
            save_type:
              'chapter',

            source_type:
              'bible',

            source_id:
              Number(
                book.id
              ),

            anchor_type:
              'bible_chapter',

            anchor_id:
              chapterId,

            source_title:
              'Библия · ' +
              displayName,

            item_title:
              displayName +
              ' · Глава ' +
              chapter.number,

            text,

            start_offset: 0,

            end_offset:
              text.length,

            metadata: {
              book_id:
                Number(
                  book.id
                ),

              book_slug:
                book.slug,

              book_name:
                displayName,

              book_short_name:
                book.short_name,

              chapter_id:
                chapterId,

              chapter_number:
                Number(
                  chapter.number
                ),

              verse_count:
                (
                  chapter.verses ||
                  []
                ).length,
            },
          });

        savedItemsRef.current = [
          saved,
          ...savedItemsRef.current,
        ];

        return {
          label: '★',
          active: true,
          savedItemId:
            saved.id,
        };
      },
      [
        book,
        chapters,
        displayName,
      ]
    );

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
            displayName,

          description: '',

          readerMode:
            'book',

          progressOffsetMode:
            'page',

          progressAnchorType:
            'bible_verse',

          savedItems:
            savedItems.filter(
              item =>
                item.anchor_type ===
                  'bible_verse' &&
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
              chapter => {
                const chapterSaved =
                  savedItems.find(
                    item =>
                      item.anchor_type ===
                        'bible_chapter' &&
                      Number(
                        item.anchor_id
                      ) ===
                        Number(
                          chapter.id
                        ) &&
                      item.save_type ===
                        'chapter'
                  );

                return (
                  chapter.verses ||
                  []
                ).map(
                  (
                    verse,
                    verseIndex
                  ) => ({
                    className:
                      [
                        'bible-verse-section',

                        verseIndex === 0
                          ? 'bible-chapter-start'
                          : '',

                        verseIndex ===
                          (
                            chapter.verses
                              ?.length ||
                            1
                          ) -
                          1
                          ? 'bible-chapter-end'
                          : '',
                      ]
                        .filter(
                          Boolean
                        )
                        .join(' '),

                    highlightGroupKey:
                      'bible-chapter:' +
                      chapter.id,

                    chapterNumber:
                      verseIndex === 0
                        ? Number(
                            chapter.number
                          )
                        : null,

                    title:
                      verseIndex === 0
                        ? 'Глава ' +
                          chapter.number
                        : '',

                    action:
                      verseIndex === 0
                        ? {
                            key:
                              'bible-chapter:' +
                              chapter.id,

                            label:
                              chapterSaved
                                ? '★'
                                : '☆',

                            active:
                              !!chapterSaved,

                            savedItemId:
                              chapterSaved
                                ?.id ||
                              null,

                            highlightContent:
                              true,
                          }
                        : null,

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
                              displayName,

                            itemTitle:
                              displayName +
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
                                displayName,

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
                );
              }
            ),
        };
      },
      [
        book,
        chapters,
        savedItems,
        verseInfo.ids,
        displayName,
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
            displayName,

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
        style="dark"
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
          readerTopInset
        }
        bottomContentInset={
          readerBottomInset
        }
        onProgress={
          handleProgress
        }
        onAction={
          handleAction
        }
      />

      <FixedSectionHeader
        title={
          displayName
        }
        navigation={navigation}
        topInset={insets.top}
        showTitle={false}
        minimal
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
