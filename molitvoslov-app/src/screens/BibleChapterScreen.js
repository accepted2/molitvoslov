import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';
import {ReaderBookmarkMenu} from '../components/reader/ReaderBookmarkMenu';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {useReadingProgress} from '../hooks/useReadingProgress';
import {saveReadingBookmark} from '../services/readerBookmarks';
import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';
import {bibleContent} from '../services/bibleContent';
import {colors} from '../theme';
import {useLanguage} from '../context/LanguageContext';

export const BibleChapterScreen = ({route, navigation}) => {
  const {t} = useLanguage();
  const {bookId, chapterNumber, focusTarget = null, resume = false} = route.params || {};

  const book = bibleContent.getBook(bookId);

  const displayName = bibleContent.getDisplayName(book);

  const chapters = book?.chapters || [];

  const requestedChapter = bibleContent.getChapter(bookId, chapterNumber) || chapters[0] || null;

  const [savedItems, setSavedItems] = useState([]);

  const savedItemsRef = useRef([]);
  const readerRef = useRef(null);

  const [savedLoading, setSavedLoading] = useState(true);

  const [readerMenuVisible, setReaderMenuVisible] = useState(false);
  const [bookmarkPosition, setBookmarkPosition] = useState(null);
  const [stablePosition, setStablePosition] = useState(null);
  const [currentChapterNumber, setCurrentChapterNumber] = useState(
    Number(requestedChapter?.number || 1)
  );
  const [bookmarkFeedback, setBookmarkFeedback] = useState('');
  const bookmarkFeedbackTimerRef = useRef(null);

  const insets = useSafeAreaInsets();

  const readerTopInset = insets.top + 68;

  const readerBottomInset = 16;

  const {savedProgress, progressReady, scheduleSave, getCurrentProgress, getStableProgress} =
    useReadingProgress({
      sourceType: 'bible',
      sourceId: book?.id,
    });

  const loadSavedItems = React.useCallback(async () => {
    if (!book?.id) {
      savedItemsRef.current = [];

      setSavedItems([]);
      setSavedLoading(false);

      return;
    }

    try {
      setSavedLoading(true);

      const items = await getSavedItems({
        source_type: 'bible',
        source_id: book.id,
      });

      savedItemsRef.current = items;

      setSavedItems(items);
    } finally {
      setSavedLoading(false);
    }
  }, [book?.id]);

  useEffect(() => {
    loadSavedItems();
  }, [loadSavedItems]);

  useEffect(() => {
    setCurrentChapterNumber(Number(requestedChapter?.number || 1));
  }, [bookId, requestedChapter?.number]);

  useEffect(
    () => () => {
      if (bookmarkFeedbackTimerRef.current) {
        clearTimeout(bookmarkFeedbackTimerRef.current);
      }
    },
    []
  );

  useFocusEffect(
    React.useCallback(() => {
      loadSavedItems();
    }, [loadSavedItems])
  );

  const verseInfo = useMemo(() => {
    const byId = new Map();

    const ids = new Set();

    chapters.forEach((chapter) => {
      (chapter.verses || []).forEach((verse) => {
        const verseId = Number(verse.id);

        ids.add(verseId);

        byId.set(verseId, {
          chapterNumber: Number(chapter.number),

          verseNumber: Number(verse.number),
        });
      });
    });

    return {
      byId,
      ids,
    };
  }, [chapters]);

  const normalizedFocusTarget = useMemo(() => {
    if (!focusTarget || focusTarget.anchor_type !== 'bible_chapter') {
      return focusTarget;
    }

    const targetChapter = bibleContent.getChapter(bookId, focusTarget.metadata?.chapter_number);

    const firstVerse = targetChapter?.verses?.[0];

    if (!firstVerse) {
      return focusTarget;
    }

    return {
      ...focusTarget,

      anchor_type: 'bible_verse',

      anchor_id: Number(firstVerse.id),

      start_offset: null,

      end_offset: null,
    };
  }, [focusTarget, bookId]);

  const chapterStartTarget = useMemo(() => {
    if (normalizedFocusTarget || resume || !requestedChapter) {
      return null;
    }

    const firstVerse = requestedChapter.verses?.[0];

    if (!firstVerse) {
      return null;
    }

    return {
      save_type: 'chapter',

      anchor_type: 'bible_verse',

      anchor_id: Number(firstVerse.id),

      metadata: {
        chapter_number: Number(requestedChapter.number),
      },
    };
  }, [normalizedFocusTarget, resume, requestedChapter]);

  const effectiveFocusTarget = normalizedFocusTarget || chapterStartTarget;

  const handleAction = React.useCallback(
    async (actionKey) => {
      if (!actionKey?.startsWith('bible-chapter:') || !book) {
        return null;
      }

      const chapterId = Number(actionKey.split(':')[1]);

      const chapter = chapters.find((item) => Number(item.id) === chapterId);

      if (!chapter) {
        return null;
      }

      const existing = savedItemsRef.current.find(
        (item) =>
          item.anchor_type === 'bible_chapter' &&
          Number(item.anchor_id) === chapterId &&
          item.save_type === 'chapter'
      );

      if (existing) {
        await deleteSavedItem(existing.id);

        savedItemsRef.current = savedItemsRef.current.filter((item) => item.id !== existing.id);

        return {
          label: t('common.addToFavorites'),
          active: false,
        };
      }

      const text = (chapter.verses || [])
        .map((verse) => verse.number + ' ' + (verse.text || ''))
        .join('\n');

      const saved = await saveItem({
        save_type: 'chapter',

        source_type: 'bible',

        source_id: Number(book.id),

        anchor_type: 'bible_chapter',

        anchor_id: chapterId,

        source_title: t('bible.source', {book: displayName}),

        item_title: t('bible.wholeChapterTitle', {book: displayName, chapter: chapter.number}),

        text,

        start_offset: 0,

        end_offset: text.length,

        metadata: {
          book_id: Number(book.id),

          book_slug: book.slug,

          book_name: displayName,

          book_short_name: book.short_name,

          chapter_id: chapterId,

          chapter_number: Number(chapter.number),

          verse_count: (chapter.verses || []).length,
        },
      });

      savedItemsRef.current = [saved, ...savedItemsRef.current];

      return {
        label: t('common.inFavorites'),
        active: true,
        savedItemId: saved.id,
      };
    },
    [book, chapters, displayName, t]
  );

  const documentData = useMemo(() => {
    if (!book) {
      return {
        title: t('bible.title'),
        description: '',
        progressAnchorType: 'bible_verse',
        savedItems: [],
        sections: [],
      };
    }

    return {
      title: '',

      description: '',

      readerMode: 'book',

      progressOffsetMode: 'page',

      progressAnchorType: 'bible_verse',

      savedItems: savedItems.filter(
        (item) =>
          item.anchor_type === 'bible_verse' &&
          verseInfo.ids.has(Number(item.anchor_id)) &&
          item.start_offset !== null &&
          item.end_offset !== null
      ),

      sections: chapters.flatMap((chapter) => {
        const chapterSaved = savedItems.find(
          (item) =>
            item.anchor_type === 'bible_chapter' &&
            Number(item.anchor_id) === Number(chapter.id) &&
            item.save_type === 'chapter'
        );

        return (chapter.verses || []).map((verse, verseIndex) => ({
          className: [
            'bible-verse-section',

            verseIndex === 0 ? 'bible-chapter-start' : '',

            verseIndex === (chapter.verses?.length || 1) - 1 ? 'bible-chapter-end' : '',
          ]
            .filter(Boolean)
            .join(' '),

          highlightGroupKey: 'bible-chapter:' + chapter.id,

          chapterNumber: verseIndex === 0 ? Number(chapter.number) : null,

          title: verseIndex === 0 ? t('bible.chapter', {number: chapter.number}) : '',

          action:
            verseIndex === 0
              ? {
                  key: 'bible-chapter:' + chapter.id,

                  label: chapterSaved ? t('common.inFavorites') : t('common.addToFavorites'),

                  active: !!chapterSaved,

                  savedItemId: chapterSaved?.id || null,

                  highlightContent: true,
                }
              : null,

          progressAnchorId: Number(verse.id),

          trackProgress: true,

          rows: [
            {
              layout: 'stack',

              blocks: [
                {
                  id: Number(verse.id),

                  text: verse.text || '',

                  label: '',

                  inlineLabel: String(verse.number),

                  className: 'bible-verse',

                  sourceType: 'bible',

                  sourceId: book.id,

                  anchorType: 'bible_verse',

                  anchorId: verse.id,

                  sourceTitle: t('bible.source', {book: displayName}),

                  itemTitle: displayName + ' ' + chapter.number + ':' + verse.number,

                  fullSaveType: 'verse',

                  metadata: {
                    book_id: book.id,

                    book_slug: book.slug,

                    book_name: displayName,

                    book_short_name: book.short_name,

                    chapter_number: Number(chapter.number),

                    verse_number: Number(verse.number),
                  },
                },
              ],
            },
          ],
        }));
      }),
    };
  }, [book, chapters, savedItems, verseInfo.ids, displayName, t]);

  const readerProgress = resume && !effectiveFocusTarget ? savedProgress : null;

  const handleProgress = (progress) => {
    if (!book) {
      return;
    }

    const current = verseInfo.byId.get(Number(progress.anchorId));

    if (!current) {
      return;
    }

    setCurrentChapterNumber((previous) =>
      previous === current.chapterNumber ? previous : current.chapterNumber
    );

    scheduleSave({
      ...progress,

      metadata: {
        book_id: book.id,

        book_slug: book.slug,

        book_name: displayName,

        book_short_name: book.short_name,

        chapter_number: current.chapterNumber,

        verse_number: current.verseNumber,

        page_number:
          progress.pageIndex === null || progress.pageIndex === undefined
            ? null
            : Number(progress.pageIndex) + 1,

        page_count:
          progress.pageCount === null || progress.pageCount === undefined
            ? null
            : Number(progress.pageCount),
      },
    });
  };

  const showBookmarkFeedback = (message) => {
    setBookmarkFeedback(message);

    if (bookmarkFeedbackTimerRef.current) {
      clearTimeout(bookmarkFeedbackTimerRef.current);
    }

    bookmarkFeedbackTimerRef.current = setTimeout(() => {
      setBookmarkFeedback('');
      bookmarkFeedbackTimerRef.current = null;
    }, 1700);
  };

  const buildBookmarkConfig = (position) => {
    if (!book || !position?.anchorId) {
      return null;
    }

    const verse = verseInfo.byId.get(Number(position.anchorId));

    if (!verse) {
      return null;
    }

    return {
      sourceType: 'bible',
      sourceId: Number(book.id),
      sourceTitle: t('bible.source', {book: displayName}),
      itemTitle: displayName + ' ' + verse.chapterNumber + ':' + verse.verseNumber,
      position,
      metadata: {
        book_id: Number(book.id),
        book_slug: book.slug,
        book_name: displayName,
        book_short_name: book.short_name,
        chapter_number: verse.chapterNumber,
        verse_number: verse.verseNumber,
      },
    };
  };

  const addCurrentBookmark = async () => {
    let position = getCurrentProgress() || getStableProgress();

    if (!position?.anchorId) {
      const chapter = bibleContent.getChapter(bookId, currentChapterNumber);
      const firstVerse = chapter?.verses?.[0];

      if (firstVerse) {
        position = {
          anchorType: 'bible_verse',
          anchorId: Number(firstVerse.id),
          offset: 0,
          progressPercent: 0,
          metadata: {
            chapter_number: Number(chapter.number),
            verse_number: Number(firstVerse.number),
          },
        };
      }
    }

    const bookmark = buildBookmarkConfig(position);

    if (!bookmark) {
      showBookmarkFeedback('Позиция ещё не определена');
      return;
    }

    try {
      const result = await saveReadingBookmark(bookmark);
      showBookmarkFeedback(result.created ? 'Закладка добавлена' : 'Закладка уже есть');
    } catch (error) {
      console.log('Ошибка добавления закладки Библии:', error.message);
      showBookmarkFeedback('Не удалось добавить закладку');
    }
  };

  const currentChapterIndex = chapters.findIndex(
    (chapter) => Number(chapter.number) === Number(currentChapterNumber)
  );

  const previousChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1
      ? chapters[currentChapterIndex + 1]
      : null;

  const openChapter = (chapter) => {
    if (!chapter || !book) {
      return;
    }

    navigation.replace('BibleChapter', {
      bookId: book.id,
      chapterNumber: Number(chapter.number),
      resume: false,
    });
  };

  const openReaderMenu = () => {
    setBookmarkPosition(getCurrentProgress());
    setStablePosition(getStableProgress());
    setReaderMenuVisible(true);
  };

  const bookmarkVerse = bookmarkPosition
    ? verseInfo.byId.get(Number(bookmarkPosition.anchorId))
    : null;

  const bookmarkConfig =
    book && bookmarkPosition && bookmarkVerse ? buildBookmarkConfig(bookmarkPosition) : null;

  if (!book || !requestedChapter) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('bible.bookNotFound')}</Text>
      </View>
    );
  }

  if (savedLoading || !progressReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      <SelectableDocumentReader
        ref={readerRef}
        documentData={documentData}
        savedProgress={readerProgress}
        focusTarget={effectiveFocusTarget}
        topContentInset={readerTopInset}
        bottomContentInset={readerBottomInset}
        onProgress={handleProgress}
        onAction={handleAction}
      />

      <ReaderBookmarkMenu
        visible={readerMenuVisible}
        onClose={() => setReaderMenuVisible(false)}
        navigation={navigation}
        bookmark={bookmarkConfig}
        languageOptions={[
          {key: 'russian', label: t('readerModes.russian')},
          {key: 'church', label: t('readerModes.church'), disabled: true},
          {key: 'both', label: t('readerModes.both'), disabled: true},
          {key: 'traditional', label: t('readerModes.traditional'), disabled: true},
        ]}
        activeLanguage="russian"
        canReturnToProgress={!!stablePosition}
        onReturnToProgress={() => {
          readerRef.current?.goToProgress(stablePosition);
          setReaderMenuVisible(false);
        }}
      />

      <FixedSectionHeader
        title={displayName + ' · ' + t('bible.chapter', {number: currentChapterNumber})}
        navigation={navigation}
        topInset={insets.top}
        showTitle
        showMenu
        onMenuPress={openReaderMenu}
      />

      {!!bookmarkFeedback && (
        <View pointerEvents="none" style={styles.bookmarkFeedback}>
          <Text style={styles.bookmarkFeedbackText}>{bookmarkFeedback}</Text>
        </View>
      )}

      <View
        style={[
          styles.bookToolbar,
          {
            paddingBottom: Math.max(insets.bottom, 7),
          },
        ]}
      >
        <Pressable
          disabled={!previousChapter}
          onPress={() => openChapter(previousChapter)}
          style={({pressed}) => [
            styles.chapterNavButton,
            !previousChapter && styles.toolbarButtonDisabled,
            pressed && previousChapter && styles.toolbarPressed,
          ]}
        >
          <Text style={styles.chapterNavArrow}>‹</Text>
          <Text style={styles.chapterNavText}>
            {previousChapter
              ? t('bible.chapter', {number: previousChapter.number})
              : t('bible.chapter', {number: currentChapterNumber})}
          </Text>
        </Pressable>

        <View style={styles.toolbarDivider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить закладку"
          onPress={addCurrentBookmark}
          style={({pressed}) => [styles.toolbarIconButton, pressed && styles.toolbarPressed]}
        >
          <Text style={styles.bookmarkIcon}>⌑</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Настройки шрифта"
          onPress={() => showBookmarkFeedback('Настройки шрифта — скоро')}
          style={({pressed}) => [styles.toolbarIconButton, pressed && styles.toolbarPressed]}
        >
          <Text style={styles.toolbarAa}>Aa</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Тема чтения"
          onPress={() => showBookmarkFeedback('Темы чтения — скоро')}
          style={({pressed}) => [styles.toolbarIconButton, pressed && styles.toolbarPressed]}
        >
          <Text style={styles.toolbarMoon}>◔</Text>
        </Pressable>

        <View style={styles.toolbarDivider} />

        <Pressable
          disabled={!nextChapter}
          onPress={() => openChapter(nextChapter)}
          style={({pressed}) => [
            styles.chapterNavButton,
            styles.chapterNavButtonRight,
            !nextChapter && styles.toolbarButtonDisabled,
            pressed && nextChapter && styles.toolbarPressed,
          ]}
        >
          <Text style={[styles.chapterNavText, styles.chapterNavTextRight]}>
            {nextChapter
              ? t('bible.chapter', {number: nextChapter.number})
              : t('bible.chapter', {number: currentChapterNumber})}
          </Text>
          <Text style={styles.chapterNavArrow}>›</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFF4DE',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },

  error: {
    paddingHorizontal: 20,
    textAlign: 'center',
    fontSize: 16,
    color: colors.liturgical,
  },

  bookToolbar: {
    minHeight: 58,
    paddingTop: 7,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(120, 78, 41, 0.20)',
    backgroundColor: '#F7E9CF',
  },

  chapterNavButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },

  chapterNavButtonRight: {
    justifyContent: 'flex-end',
  },

  chapterNavArrow: {
    color: '#6F4727',
    fontFamily: 'serif',
    fontSize: 27,
    lineHeight: 30,
  },

  chapterNavText: {
    marginLeft: 2,
    color: '#5B3B27',
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },

  chapterNavTextRight: {
    marginLeft: 0,
    marginRight: 2,
    textAlign: 'right',
  },

  toolbarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    marginHorizontal: 2,
    backgroundColor: 'rgba(120, 78, 41, 0.24)',
  },

  toolbarIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bookmarkIcon: {
    marginTop: -2,
    color: '#55351F',
    fontFamily: 'serif',
    fontSize: 28,
    lineHeight: 32,
  },

  toolbarAa: {
    color: '#55351F',
    fontFamily: 'serif',
    fontSize: 21,
    lineHeight: 26,
  },

  toolbarMoon: {
    color: '#55351F',
    fontFamily: 'serif',
    fontSize: 27,
    lineHeight: 30,
    transform: [{rotate: '-35deg'}],
  },

  toolbarPressed: {
    opacity: 0.48,
  },

  toolbarButtonDisabled: {
    opacity: 0.25,
  },

  bookmarkFeedback: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 70,
    zIndex: 30,
    alignItems: 'center',
  },

  bookmarkFeedbackText: {
    maxWidth: '84%',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    overflow: 'hidden',
    color: '#FFF4DE',
    backgroundColor: 'rgba(79, 48, 28, 0.90)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
