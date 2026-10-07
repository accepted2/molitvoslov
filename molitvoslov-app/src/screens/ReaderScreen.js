import React, {useEffect, useMemo, useRef, useState} from 'react';

import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {contentApi as api} from '../services/contentApi';

import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';

import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';

import {
  READER_LANGUAGE_MODES,
  buildReaderLanguageOptions,
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

export const ReaderScreen = ({route, navigation}) => {
  const {language, t} = useLanguage();
  const {slug, focusTarget = null} = route.params;

  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const [text, setText] = useState(null);

  const [savedItems, setSavedItems] = useState([]);

  const savedItemsRef = useRef([]);

  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.CHURCH);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  useEffect(() => {
    loadText();
  }, [slug]);

  const loadText = async () => {
    try {
      setLoading(true);
      setError(null);
      setText(null);
      setSavedItems([]);
      savedItemsRef.current = [];

      const response = await api.get(`texts/${slug}/`);

      const data = response.data;

      setText(data);

      try {
        const saved = await getSavedItems({
          source_type: 'text',

          source_id: data.id,
        });

        savedItemsRef.current = saved;

        setSavedItems(saved);
      } catch (savedError) {
        console.log(
          'Ошибка загрузки сохранений текста:',
          savedError.response?.data || savedError.message
        );
      }
    } catch (loadError) {
      console.log('Ошибка загрузки текста:', loadError.response?.data || loadError.message);

      setError(t('common.textNotFound'));
    } finally {
      setLoading(false);
    }
  };

  const hasRussianTranslation = !!text?.translation?.trim();
  const hasUkrainianTranslation = !!text?.translation_uk?.trim();
  const hasTraditionalTranslation = !!text?.traditional_content?.trim();

  useEffect(() => {
    if (!text) {
      return;
    }

    setViewMode(
      getReaderModeForAppLanguage(language, {
        hasRussian: hasRussianTranslation,
        hasUkrainian: hasUkrainianTranslation,
      })
    );
  }, [language, text, hasRussianTranslation, hasUkrainianTranslation]);

  const handleAction = async (actionKey) => {
    if (!text || actionKey !== `text:${text.id}`) {
      return null;
    }

    const existing = savedItemsRef.current.find(
      (item) =>
        item.anchor_type === 'text' &&
        Number(item.anchor_id) === Number(text.id) &&
        item.save_type === 'text'
    );

    if (existing) {
      await deleteSavedItem(existing.id);

      savedItemsRef.current = savedItemsRef.current.filter((item) => item.id !== existing.id);

      return {
        label: t('common.addToFavorites'),

        active: false,

        itemId: 1,

        removedSavedItemId: existing.id,
      };
    }

    const content = getLocalizedTextContent(text, language);

    const saved = await saveItem({
      save_type: 'text',

      source_type: 'text',

      source_id: text.id,

      anchor_type: 'text',

      anchor_id: text.id,

      source_title: getLocalizedTextTitle(text, language) || t('common.reading'),

      item_title: getLocalizedTextTitle(text, language) || t('common.text'),

      text: content,

      start_offset: 0,

      end_offset: content.length,

      metadata: {
        slug: text.slug || slug,
      },
    });

    savedItemsRef.current = [saved, ...savedItemsRef.current];

    return {
      label: t('common.inFavorites'),

      active: true,

      itemId: 1,

      savedItem: saved,
    };
  };

  const documentData = useMemo(() => {
    if (!text) {
      return {
        title: '',
        description: '',
        progressAnchorType: 'text',
        savedItems: [],
        sections: [],
      };
    }

    const wholeTextSaved = savedItems.some(
      (item) =>
        item.anchor_type === 'text' &&
        Number(item.anchor_id) === Number(text.id) &&
        item.save_type === 'text'
    );

    const blocks = [];
    const normalizedSaved = [];

    const appendBlock = ({id, value, language, className = ''}) => {
      if (!value) {
        return;
      }

      blocks.push({
        id,
        text: value,
        className,
        sourceType: 'text',
        sourceId: text.id,
        anchorType: 'text',
        anchorId: text.id,
        sourceTitle: text.title || t('common.reading'),
        itemTitle: text.title || t('common.text'),
        fullSaveType: 'text',
        metadata: {
          slug: text.slug || slug,
          language,
        },
      });

      savedItems
        .filter((item) => {
          if (
            item.anchor_type !== 'text' ||
            Number(item.anchor_id) !== Number(text.id) ||
            item.start_offset === null ||
            item.end_offset === null
          ) {
            return false;
          }

          const savedLanguage = item.metadata?.language || 'church';
          return savedLanguage === language;
        })
        .forEach((item) => {
          normalizedSaved.push({
            ...item,
            anchor_id: id,
          });
        });
    };

    if (viewMode === READER_LANGUAGE_MODES.TRADITIONAL) {
      appendBlock({
        id: 3,
        value: text.traditional_content || text.content || text.translation || '',
        language: text.traditional_content?.trim()
          ? 'traditional'
          : text.content?.trim()
            ? 'church'
            : 'russian',
        className: !text.traditional_content?.trim() && text.translation?.trim() ? 'secondary' : '',
      });
    } else if (viewMode === READER_LANGUAGE_MODES.UKRAINIAN) {
      appendBlock({
        id: 4,
        value: text.translation_uk || text.translation || text.content || '',
        language: text.translation_uk?.trim()
          ? 'ukrainian'
          : text.translation?.trim()
            ? 'russian'
            : 'church',
        className: text.translation_uk?.trim() || text.translation?.trim() ? 'secondary' : '',
      });
    } else if (viewMode === READER_LANGUAGE_MODES.RUSSIAN) {
      appendBlock({
        id: 2,
        value: text.translation || text.content || '',
        language: text.translation?.trim() ? 'russian' : 'church',
        className: text.translation?.trim() ? 'secondary' : '',
      });
    } else {
      appendBlock({
        id: 1,
        value: text.content || text.traditional_content || '',
        language: 'church',
      });
    }

    return {
      title: getLocalizedTextTitle(text, language) || t('common.reading'),

      description: getLocalizedTextDescription(text, language),

      action: {
        key: `text:${text.id}`,

        label: wholeTextSaved ? t('common.inFavorites') : t('common.addToFavorites'),

        active: wholeTextSaved,
      },

      viewSwitcher: {
        activeKey: viewMode,
        options: buildReaderLanguageOptions({
          hasRussian: hasRussianTranslation,
          hasTraditional: hasTraditionalTranslation,
        }),
      },

      progressAnchorType: 'text',

      savedItems: normalizedSaved,

      sections: [
        {
          progressAnchorId: Number(text.id),

          trackProgress: false,

          title: '',

          rows: [
            {
              layout: 'stack',

              blocks,
            },
          ],
        },
      ],
    };
  }, [
    hasRussianTranslation,
    hasUkrainianTranslation,
    hasTraditionalTranslation,
    language,
    savedItems,
    slug,
    text,
    viewMode,
    t,
  ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />

        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error || !text) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || t('common.textNotFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <SelectableDocumentReader
        documentData={documentData}
        savedProgress={null}
        focusTarget={focusTarget}
        topContentInset={headerHeight}
        onAction={handleAction}
        onViewModeChange={setViewMode}
      />

      <FixedSectionHeader
        title={getLocalizedTextTitle(text, language) || t('common.reading')}
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
  },
});
