import React, {useEffect, useMemo, useRef, useState} from 'react';

import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {contentApi as api} from '../services/contentApi';

import {useReadingProgress} from '../hooks/useReadingProgress';

import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';

import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';
import {ReaderBookmarkMenu} from '../components/reader/ReaderBookmarkMenu';

import {colors} from '../theme';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {
  READER_LANGUAGE_MODES,
  getReaderModeForAppLanguage,
} from '../services/readerLanguageModes';
import {useLanguage} from '../context/LanguageContext';
import {getLocalizedField} from '../services/localizedContent';

const MODE_CHURCH = READER_LANGUAGE_MODES.CHURCH;
const MODE_BOTH = READER_LANGUAGE_MODES.BOTH;
const MODE_RUSSIAN = READER_LANGUAGE_MODES.RUSSIAN;
const MODE_UKRAINIAN = READER_LANGUAGE_MODES.UKRAINIAN;
const MODE_TRADITIONAL = READER_LANGUAGE_MODES.TRADITIONAL;

const normalizeAkathistText = (value) => {
  let result = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00ad/g, '')
    .replace(/\u200b/g, '');

  const notesMatch = result.match(/(?:^|\n)\s*Примечани(?:е|я)\s*(?=\n|$)/iu);

  if (notesMatch && notesMatch.index !== undefined) {
    result = result.slice(0, notesMatch.index);
  }

  const lines = result.split('\n');

  const normalizedLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index].trim();

    if (!current) {
      continue;
    }

    const lettersOnly = current
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^А-Яа-яЁё]/g, '');

    const next = lines[index + 1]?.trim() || '';

    if (
      lettersOnly.length > 0 &&
      lettersOnly.length <= 2 &&
      next &&
      /^[А-Яа-яЁё\u0300-\u036f]/u.test(next)
    ) {
      normalizedLines.push(current + next);

      index += 1;
      continue;
    }

    normalizedLines.push(current);
  }

  return normalizedLines
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
};

const getSectionTitle = (section, language) => {
  if (section.section_type === 'kontakion') {
    return `Кондак ${section.number}`;
  }

  if (section.section_type === 'ikos') {
    return `${language === 'uk' ? 'Ікос' : 'Икос'} ${section.number}`;
  }

  if (section.section_type === 'prayer') {
    return section.number ? `Молитва ${section.number}` : 'Молитва';
  }

  return getLocalizedField(section.text, 'title', language);
};

export const AkathistScreen = ({route, navigation}) => {
  const {language, t} = useLanguage();
  const {akathistId, slug, title, focusTarget = null} = route.params;

  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const [akathist, setAkathist] = useState(null);

  const [savedItems, setSavedItems] = useState([]);

  const savedItemsRef = useRef([]);
  const readerRef = useRef(null);

  const [viewMode, setViewMode] = useState(MODE_CHURCH);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [readerMenuVisible, setReaderMenuVisible] = useState(false);
  const [bookmarkPosition, setBookmarkPosition] = useState(null);
  const [stablePosition, setStablePosition] = useState(null);

  const {savedProgress, progressReady, scheduleSave, getCurrentProgress, getStableProgress} =
    useReadingProgress({
      sourceType: 'akathist',

      sourceId: akathistId,
    });

  useEffect(() => {
    loadAkathist();
  }, [slug, akathistId]);

  const loadAkathist = async () => {
    try {
      setLoading(true);
      setError(null);
      setAkathist(null);
      setSavedItems([]);
      savedItemsRef.current = [];

      const [response, saved] = await Promise.all([
        api.get(`akathists/${slug}/`),

        getSavedItems({
          source_type: 'akathist',

          source_id: akathistId,
        }),
      ]);

      setAkathist(response.data);

      savedItemsRef.current = saved;

      setSavedItems(saved);
    } catch (loadError) {
      console.log('Ошибка загрузки акафиста:', loadError.response?.data || loadError.message);

      setError('Не удалось загрузить акафист');
    } finally {
      setLoading(false);
    }
  };

  const hasRussianTranslation = useMemo(() => {
    if (!akathist) {
      return false;
    }

    const specialTexts = [
      akathist.troparion,
      akathist.kontakion_before,
      akathist.common_rule?.opening,
      akathist.common_rule?.ending,
    ];

    return (
      specialTexts.some((item) => !!item?.translation?.trim()) ||
      (akathist.sections || []).some((section) => !!section.text?.translation?.trim())
    );
  }, [akathist]);

  const hasUkrainianTranslation = useMemo(() => {
    if (!akathist) {
      return false;
    }

    const specialTexts = [
      akathist.troparion,
      akathist.kontakion_before,
      akathist.common_rule?.opening,
      akathist.common_rule?.ending,
    ];

    return (
      specialTexts.some((item) => !!item?.translation_uk?.trim()) ||
      (akathist.sections || []).some((section) => !!section.text?.translation_uk?.trim())
    );
  }, [akathist]);

  useEffect(() => {
    if (!akathist) {
      return;
    }

    setViewMode(
      getReaderModeForAppLanguage(language, {
        hasRussian: hasRussianTranslation,
        hasUkrainian: hasUkrainianTranslation,
      })
    );
  }, [language, akathist, hasRussianTranslation, hasUkrainianTranslation]);

  const handleAction = async (actionKey) => {
    if (!actionKey?.startsWith('akathist:') || !akathist) {
      return null;
    }

    const existing = savedItemsRef.current.find(
      (item) =>
        item.anchor_type === 'akathist' &&
        Number(item.anchor_id) === Number(akathist.id) &&
        item.save_type === 'akathist'
    );

    if (existing) {
      await deleteSavedItem(existing.id);

      savedItemsRef.current = savedItemsRef.current.filter((item) => item.id !== existing.id);

      return {
        label: 'В избранное',

        active: false,
      };
    }

    const saved = await saveItem({
      save_type: 'akathist',

      source_type: 'akathist',

      source_id: akathist.id,

      anchor_type: 'akathist',

      anchor_id: akathist.id,

      source_title: getLocalizedField(akathist, 'title', language) || title || t('reading.akathist'),

      item_title: getLocalizedField(akathist, 'title', language) || title || t('reading.akathist'),

      text: '',

      metadata: {
        slug: akathist.slug || slug,
      },
    });

    savedItemsRef.current = [saved, ...savedItemsRef.current];

    return {
      label: 'В избранном',

      active: true,
    };
  };

  const documentData = useMemo(() => {
    if (!akathist) {
      return {
        title: title || 'Акафист',

        description: '',

        progressAnchorType: 'akathist_section',

        savedItems: [],

        sections: [],
      };
    }

    let nextBlockId = 1;

    const normalizedSaved = [];

    const sections = [];

    const showChurch = viewMode === MODE_CHURCH || viewMode === MODE_BOTH;

    const showRussian = viewMode === MODE_RUSSIAN || viewMode === MODE_BOTH;

    const showUkrainian = viewMode === MODE_UKRAINIAN;

    const showTraditional = viewMode === MODE_TRADITIONAL;

    const attachSaved = ({syntheticId, anchorType, anchorId, language, segment, special}) => {
      savedItems
        .filter((item) => {
          if (
            item.anchor_type !== anchorType ||
            Number(item.anchor_id) !== Number(anchorId) ||
            item.start_offset === null ||
            item.end_offset === null
          ) {
            return false;
          }

          const metadata = item.metadata || {};

          if (language && metadata.language && metadata.language !== language) {
            return false;
          }

          if (special && metadata.special && metadata.special !== special) {
            return false;
          }

          if (
            segment &&
            metadata.segment &&
            ![segment, 'whole', 'prayer'].includes(metadata.segment)
          ) {
            return false;
          }

          return true;
        })
        .forEach((item) => {
          normalizedSaved.push({
            ...item,

            anchor_id: syntheticId,
          });
        });
    };

    const makeBlock = ({
      text,
      language,
      anchorType,
      anchorId,
      itemTitle,
      fullSaveType,
      metadata,
      className,
      special,
    }) => {
      const syntheticId = nextBlockId++;

      attachSaved({
        syntheticId,
        anchorType,
        anchorId,
        language,
        segment: metadata.segment,
        special,
      });

      return {
        id: syntheticId,

        text,

        className,

        sourceType: 'akathist',

        sourceId: akathistId,

        anchorType,

        anchorId,

        sourceTitle: getLocalizedField(akathist, 'title', language) || title || t('reading.akathist'),

        itemTitle,

        fullSaveType,

        metadata,

        accentWords: language === 'church' ? ['Радуйся', 'Иисусе', 'Аллилуиа'] : [],
      };
    };

    const addSpecial = (textObject, heading, specialKey) => {
      if (!textObject) {
        return;
      }

      const blocks = [];

      const church = normalizeAkathistText(textObject.content);

      const russian = normalizeAkathistText(textObject.translation);

      const ukrainian = normalizeAkathistText(textObject.translation_uk);

      const traditional = normalizeAkathistText(textObject.traditional_content);

      if (showTraditional && traditional) {
        blocks.push(
          makeBlock({
            text: traditional,

            language: 'traditional',

            anchorType: 'akathist_special',

            anchorId: textObject.id,

            itemTitle: heading,

            fullSaveType: 'text',

            metadata: {
              slug,

              special: specialKey,

              language: 'traditional',
            },

            className: 'akathist-church',
          })
        );
      }

      if (showChurch && church) {
        blocks.push(
          makeBlock({
            text: church,

            language: 'church',

            anchorType: 'akathist_special',

            anchorId: textObject.id,

            itemTitle: heading,

            fullSaveType: 'text',

            metadata: {
              slug,
              special: specialKey,
              segment: 'whole',
              language: 'church',
            },

            className: 'akathist-church',

            special: specialKey,
          })
        );
      }

      if (showUkrainian) {
        const localized = ukrainian || russian || church;
        const localizedLanguage = ukrainian ? 'ukrainian' : russian ? 'russian' : 'church';

        if (localized) {
          blocks.push(
            makeBlock({
              text: localized,

              language: localizedLanguage,

              anchorType: 'akathist_special',

              anchorId: textObject.id,

              itemTitle: heading,

              fullSaveType: 'text',

              metadata: {
                slug,

                special: specialKey,

                segment: 'whole',

                language: localizedLanguage,
              },

              className: localizedLanguage === 'church' ? 'akathist-church' : 'akathist-russian',

              special: specialKey,
            })
          );
        }
      }

      if (showUkrainian) {
        const localized = ukrainian || russian || church;
        const localizedLanguage = ukrainian ? 'ukrainian' : russian ? 'russian' : 'church';

        if (localized) {
          blocks.push(
            makeBlock({
              text: localized,

              language: localizedLanguage,

              anchorType: 'akathist_section',

              anchorId: section.id,

              itemTitle: sectionTitle,

              fullSaveType,

              metadata: {
                slug,
                section_id: section.id,
                segment: 'whole',
                language: localizedLanguage,
              },

              className: localizedLanguage === 'church' ? 'akathist-church' : 'akathist-russian',
            })
          );
        }
      }

      if (showRussian && russian) {
        blocks.push(
          makeBlock({
            text: russian,

            language: 'russian',

            anchorType: 'akathist_special',

            anchorId: textObject.id,

            itemTitle: heading,

            fullSaveType: 'text',

            metadata: {
              slug,
              special: specialKey,
              segment: 'whole',
              language: 'russian',
            },

            className: 'akathist-russian',

            special: specialKey,
          })
        );
      }

      if (!blocks.length) {
        return;
      }

      sections.push({
        progressAnchorId: 0,

        trackProgress: false,

        title: heading,

        rows: blocks.map((block) => ({
          layout: 'stack',

          blocks: [block],
        })),
      });
    };

    addSpecial(akathist.common_rule?.opening, 'Молитвы перед чтением акафиста', 'opening');

    addSpecial(akathist.troparion, 'Тропарь', 'troparion');

    addSpecial(akathist.kontakion_before, 'Кондак', 'kontakion_before');

    (akathist.sections || []).forEach((section) => {
      const church = normalizeAkathistText(section.text?.content);

      const russian = normalizeAkathistText(section.text?.translation);

      const ukrainian = normalizeAkathistText(section.text?.translation_uk);

      const traditional = normalizeAkathistText(section.text?.traditional_content);

      const blocks = [];

      const sectionTitle = getSectionTitle(section, language);

      const fullSaveType = section.section_type === 'prayer' ? 'prayer' : 'section';

      if (showTraditional && traditional) {
        blocks.push(
          makeBlock({
            text: traditional,

            language: 'traditional',

            anchorType: 'akathist_section',

            anchorId: section.id,

            itemTitle: sectionTitle,

            fullSaveType,

            metadata: {
              slug,

              section_type: section.section_type,

              section_number: section.number,

              language: 'traditional',
            },

            className: 'akathist-church',
          })
        );
      }

      if (showChurch && church) {
        blocks.push(
          makeBlock({
            text: church,

            language: 'church',

            anchorType: 'akathist_section',

            anchorId: section.id,

            itemTitle: sectionTitle,

            fullSaveType,

            metadata: {
              slug,
              section_id: section.id,
              segment: 'whole',
              language: 'church',
            },

            className: 'akathist-church',
          })
        );
      }

      if (showRussian && russian) {
        blocks.push(
          makeBlock({
            text: russian,

            language: 'russian',

            anchorType: 'akathist_section',

            anchorId: section.id,

            itemTitle: sectionTitle,

            fullSaveType,

            metadata: {
              slug,
              section_id: section.id,
              segment: 'whole',
              language: 'russian',
            },

            className: 'akathist-russian',
          })
        );
      }

      if (!blocks.length) {
        return;
      }

      sections.push({
        progressAnchorId: Number(section.id),

        trackProgress: true,

        title: sectionTitle,

        note: getLocalizedField(section, 'note', language),

        rows: blocks.map((block) => ({
          layout: 'stack',

          blocks: [block],
        })),
      });
    });

    addSpecial(akathist.common_rule?.ending, 'Окончание чтения акафиста', 'ending');

    const wholeAkathistSaved = savedItems.some(
      (item) =>
        item.anchor_type === 'akathist' &&
        Number(item.anchor_id) === Number(akathist.id) &&
        item.save_type === 'akathist'
    );

    return {
      title: getLocalizedField(akathist, 'title', language) || title || t('reading.akathist'),

      description: getLocalizedField(akathist, 'description', language),

      action: {
        key: `akathist:${akathist.id}`,

        label: wholeAkathistSaved ? 'В избранном' : 'В избранное',

        active: wholeAkathistSaved,
      },

      viewSwitcher: null,

      progressAnchorType: 'akathist_section',

      savedItems: normalizedSaved,

      sections,
    };
  }, [
    akathist,
    akathistId,
    hasRussianTranslation,
    hasUkrainianTranslation,
    savedItems,
    slug,
    title,
    viewMode,
    language,
    t,
  ]);

  const openReaderMenu = () => {
    setBookmarkPosition(getCurrentProgress());
    setStablePosition(getStableProgress());
    setReaderMenuVisible(true);
  };

  const bookmarkSection = bookmarkPosition
    ? (akathist?.sections || []).find(
        (section) => Number(section.id) === Number(bookmarkPosition.anchorId)
      )
    : null;

  const bookmarkConfig =
    akathist && bookmarkPosition && bookmarkSection
      ? {
          sourceType: 'akathist',
          sourceId: Number(akathistId),
          sourceTitle: getLocalizedField(akathist, 'title', language) || title || t('reading.akathist'),
          itemTitle:
            getSectionTitle(bookmarkSection, language) ||
            (language === 'uk' ? 'Місце в акафісті' : 'Место в акафисте'),
          position: bookmarkPosition,
          metadata: {
            slug: akathist.slug || slug,
            section_type: bookmarkSection.section_type,
            section_number: bookmarkSection.number,
          },
        }
      : null;

  if (loading || (akathist && !progressReady)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />

        <Text style={styles.loadingText}>Загрузка...</Text>
      </View>
    );
  }

  if (error || !akathist) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Акафист не найден'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <SelectableDocumentReader
        ref={readerRef}
        documentData={documentData}
        savedProgress={savedProgress}
        focusTarget={focusTarget}
        topContentInset={headerHeight}
        onProgress={scheduleSave}
        onAction={handleAction}
      />

      <ReaderBookmarkMenu
        visible={readerMenuVisible}
        onClose={() => setReaderMenuVisible(false)}
        navigation={navigation}
        bookmark={bookmarkConfig}
        canReturnToProgress={!!stablePosition}
        onReturnToProgress={() => {
          readerRef.current?.goToProgress(stablePosition);
          setReaderMenuVisible(false);
        }}
      />

      <FixedSectionHeader
        title={getLocalizedField(akathist, 'title', language) || title || t('reading.akathist')}
        navigation={navigation}
        topInset={insets.top}
        showTitle={false}
        showMenu
        onMenuPress={openReaderMenu}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF4DE',
  },

  pressed: {
    opacity: 0.65,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF4DE',
  },

  loadingText: {
    marginTop: 10,
    color: '#765238',
  },

  error: {
    paddingHorizontal: 24,
    textAlign: 'center',
    color: colors.liturgical,
    fontSize: 15,
    lineHeight: 22,
  },
});
