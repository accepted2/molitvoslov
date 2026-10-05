import React, {useEffect, useMemo, useRef, useState} from 'react';

import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {contentApi as api} from '../services/contentApi';

import {useReadingProgress} from '../hooks/useReadingProgress';

import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';

import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';

import {
  READER_LANGUAGE_MODES,
  getReaderModeForAppLanguage,
} from '../services/readerLanguageModes';
import {useLanguage} from '../context/LanguageContext';
import {
  getLocalizedTextContent,
  getLocalizedTextDescription,
  getLocalizedTextTitle,
} from '../services/localizedContent';

import {colors} from '../theme';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';

export const BookScreen = ({route, navigation}) => {
  const {language, t} = useLanguage();
  const {categoryId, categorySlug, categoryName, focusTarget = null} = route.params;

  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const [texts, setTexts] = useState([]);

  const [savedItems, setSavedItems] = useState([]);

  const savedItemsRef = useRef([]);

  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.CHURCH);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const {savedProgress, progressReady, scheduleSave} = useReadingProgress({
    sourceType: 'category',

    sourceId: categoryId,
  });

  useEffect(() => {
    loadScreen();
  }, [categoryId, categorySlug]);

  const loadScreen = async () => {
    try {
      setLoading(true);
      setError(null);
      setTexts([]);
      setSavedItems([]);
      savedItemsRef.current = [];

      const [textsResponse, saved] = await Promise.all([
        api.get(`categories/${categorySlug}/texts/`),

        getSavedItems({
          source_type: 'category',

          source_id: categoryId,
        }),
      ]);

      const sorted = [...textsResponse.data].sort(
        (a, b) => Number(a.order || 0) - Number(b.order || 0)
      );

      setTexts(sorted);

      savedItemsRef.current = saved;

      setSavedItems(saved);
    } catch (loadError) {
      console.log('Ошибка загрузки категории:', loadError.response?.data || loadError.message);

      setError(t('common.loadTextsError'));
    } finally {
      setLoading(false);
    }
  };

  const hasRussianTranslation = useMemo(
    () => texts.some((item) => !!item.text?.translation?.trim()),
    [texts]
  );

  const hasUkrainianTranslation = useMemo(
    () => texts.some((item) => !!item.text?.translation_uk?.trim()),
    [texts]
  );

  useEffect(() => {
    setViewMode(
      getReaderModeForAppLanguage(language, {
        hasRussian: hasRussianTranslation,
        hasUkrainian: hasUkrainianTranslation,
      })
    );
  }, [language, hasRussianTranslation, hasUkrainianTranslation]);

  const handleAction = async (actionKey) => {
    if (!actionKey?.startsWith('category-text:')) {
      return null;
    }

    const itemId = Number(actionKey.split(':')[1]);

    const item = texts.find((entry) => Number(entry.id) === itemId);

    if (!item?.text) {
      return null;
    }

    const existing = savedItemsRef.current.find(
      (saved) =>
        saved.anchor_type === 'category_text' &&
        Number(saved.anchor_id) === itemId &&
        saved.save_type === 'prayer'
    );

    if (existing) {
      await deleteSavedItem(existing.id);

      savedItemsRef.current = savedItemsRef.current.filter((saved) => saved.id !== existing.id);

      return {
        label: t('common.addToFavorites'),

        active: false,

        itemId,

        removedSavedItemId: existing.id,
      };
    }

    const content = getLocalizedTextContent(item.text, language);

    const saved = await saveItem({
      save_type: 'prayer',

      source_type: 'category',

      source_id: categoryId,

      anchor_type: 'category_text',

      anchor_id: itemId,

      source_title: categoryName,

      item_title:
        getLocalizedTextTitle(item.text, language) ||
        getLocalizedTextDescription(item.text, language) ||
        t('common.prayer'),

      text: content,

      start_offset: 0,

      end_offset: content.length,

      metadata: {
        category_slug: categorySlug,

        category_name: categoryName,
      },
    });

    savedItemsRef.current = [saved, ...savedItemsRef.current];

    return {
      label: t('common.inFavorites'),

      active: true,

      itemId,

      savedItem: saved,
    };
  };

  const documentData = useMemo(() => {
    const showChurch =
      viewMode === READER_LANGUAGE_MODES.CHURCH || viewMode === READER_LANGUAGE_MODES.BOTH;
    const showRussian =
      viewMode === READER_LANGUAGE_MODES.RUSSIAN || viewMode === READER_LANGUAGE_MODES.BOTH;
    const showUkrainian = viewMode === READER_LANGUAGE_MODES.UKRAINIAN;
    const showTraditional = viewMode === READER_LANGUAGE_MODES.TRADITIONAL;

    const normalizedSaved = [];

    const makeBlock = ({item, text, language, syntheticId, className = ''}) => {
      savedItems
        .filter((saved) => {
          if (
            saved.anchor_type !== 'category_text' ||
            Number(saved.anchor_id) !== Number(item.id) ||
            saved.start_offset === null ||
            saved.end_offset === null
          ) {
            return false;
          }

          const savedLanguage = saved.metadata?.language || 'church';
          return savedLanguage === language;
        })
        .forEach((saved) => {
          normalizedSaved.push({
            ...saved,
            anchor_id: syntheticId,
          });
        });

      return {
        id: syntheticId,
        text,
        className,
        sourceType: 'category',
        sourceId: categoryId,
        anchorType: 'category_text',
        anchorId: Number(item.id),
        sourceTitle: categoryName,
        itemTitle:
          getLocalizedTextTitle(item.text, language) ||
          getLocalizedTextDescription(item.text, language) ||
          t('common.text'),
        fullSaveType: 'prayer',
        metadata: {
          category_slug: categorySlug,
          category_name: categoryName,
          language,
        },
      };
    };

    const sections = texts
      .filter((item) => !!item.text)
      .map((item) => {
        const text = item.text;

        const wholeSaved = savedItems.some(
          (saved) =>
            saved.anchor_type === 'category_text' &&
            Number(saved.anchor_id) === Number(item.id) &&
            saved.save_type === 'prayer'
        );

        const blocks = [];

        if (showTraditional && text.traditional_content?.trim()) {
          blocks.push(
            makeBlock({
              item,
              text: text.traditional_content,
              language: 'traditional',
              syntheticId: Number(item.id) * 10 + 3,
            })
          );
        }

        if (showChurch && text.content?.trim()) {
          blocks.push(
            makeBlock({
              item,
              text: text.content,
              language: 'church',
              syntheticId: Number(item.id) * 10 + 1,
            })
          );
        }

        if (showUkrainian) {
          const localized =
            text.translation_uk?.trim() ||
            text.translation?.trim() ||
            text.content?.trim() ||
            text.traditional_content?.trim() ||
            '';
          const localizedLanguage = text.translation_uk?.trim()
            ? 'ukrainian'
            : text.translation?.trim()
              ? 'russian'
              : 'church';

          if (localized) {
            blocks.push(
              makeBlock({
                item,
                text: localized,
                language: localizedLanguage,
                syntheticId: Number(item.id) * 10 + 4,
                className: localizedLanguage === 'church' ? '' : 'secondary',
              })
            );
          }
        }

        if (showRussian && text.translation?.trim()) {
          blocks.push(
            makeBlock({
              item,
              text: text.translation,
              language: 'russian',
              syntheticId: Number(item.id) * 10 + 2,
              className: 'secondary',
            })
          );
        }

        return {
          progressAnchorId: Number(item.id),

          trackProgress: true,

          title: getLocalizedTextTitle(text, language) || t('common.prayer'),

          action: {
            key: `category-text:${item.id}`,

            label: wholeSaved ? t('common.inFavorites') : t('common.addToFavorites'),

            active: wholeSaved,
          },

          rows: [
            {
              layout: 'stack',

              blocks,
            },
          ],
        };
      });

    return {
      title: categoryName,

      description: '',

      viewSwitcher: null,

      progressAnchorType: 'category_text',

      savedItems: normalizedSaved,

      sections,
    };
  }, [
    categoryId,
    categorySlug,
    categoryName,
    texts,
    savedItems,
    viewMode,
    hasRussianTranslation,
    hasUkrainianTranslation,
    language,
    t,
  ]);

  if (loading || (categoryId && !progressReady)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />

        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <SelectableDocumentReader
        documentData={documentData}
        savedProgress={savedProgress}
        focusTarget={focusTarget}
        topContentInset={headerHeight}
        onProgress={scheduleSave}
        onAction={handleAction}
      />

      <FixedSectionHeader
        title={categoryName || t('common.reading')}
        navigation={navigation}
        topInset={insets.top}
        showTitle={false}
      />
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  loadingText: {
    marginTop: 10,
    color: colors.textSecondary,
  },

  error: {
    paddingHorizontal: 24,
    textAlign: 'center',
    color: colors.liturgical,
    fontSize: 15,
    lineHeight: 22,
  },
});
