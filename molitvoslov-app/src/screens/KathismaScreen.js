import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';

import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {contentApi as api} from '../services/contentApi';
import {hyphenateSync as hyphenateRussian} from 'hyphen/ru';
import {hyphenateSync as hyphenateChurchSlavonic} from 'hyphen/cu';
import {useReadingProgress} from '../hooks/useReadingProgress';

import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';

import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';
import {ReaderBookmarkMenu} from '../components/reader/ReaderBookmarkMenu';

import {MemorialQuickSheet} from '../components/memorial/MemorialQuickSheet';

import {colors} from '../theme';

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {READER_LANGUAGE_MODES, buildReaderLanguageOptions} from '../services/readerLanguageModes';

const GLORY_TEXT = `Слава Отцу и Сыну и Святому Духу.
И ныне и присно и во веки веков. Аминь.

Аллилуиа, аллилуиа, аллилуиа, слава Тебе, Боже. (Трижды)
Господи, помилуй.(Трижды)

Слава Отцу и Сыну и Святому Духу.

[Здесь можно прочитать прошение о здравии / об упокоении и помянуть имена.]

И ныне и присно и во веки веков. Аминь.`;

const hyphenatePsalterText = (text, field) => {
  if (!text) {
    return '';
  }

  if (field === 'russian') {
    return hyphenateRussian(text, {
      minWordLength: 5,
    });
  }

  if (field === 'church_slavonic' || field === 'church_slavonic_traditional') {
    return hyphenateChurchSlavonic(text, {
      minWordLength: 5,
    });
  }

  return text;
};

const buildLanguageChunk = (verses, field) => {
  let text = '';

  const verseRanges = [];

  verses.forEach((verse) => {
    const rawValue = verse[field] || '';

    if (!rawValue) {
      return;
    }

    const value = hyphenatePsalterText(rawValue, field);

    if (text) {
      text += '\n';
    }

    const numberPrefix = `${verse.number}.\u202F`;

    text += numberPrefix;

    const contentStart = text.length;

    text += value;

    verseRanges.push({
      verseId: Number(verse.id),
      contentStart,
      contentEnd: text.length,
    });
  });

  return {
    text,
    verseRanges,
  };
};

export default function KathismaScreen({route, navigation}) {
  const {kathismaNumber, kathismaTitle, focusTarget = null} = route.params;

  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const [kathisma, setKathisma] = useState(null);

  const [savedItems, setSavedItems] = useState([]);

  const savedItemsRef = useRef([]);
  const readerRef = useRef(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.BOTH);

  const [memorialVisible, setMemorialVisible] = useState(false);

  const [readerMenuVisible, setReaderMenuVisible] = useState(false);
  const [bookmarkPosition, setBookmarkPosition] = useState(null);
  const [stablePosition, setStablePosition] = useState(null);

  const {savedProgress, progressReady, scheduleSave, getCurrentProgress, getStableProgress} =
    useReadingProgress({
      sourceType: 'psalter',

      sourceId: kathisma?.psalter,
    });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: kathismaTitle || `Кафизма ${kathismaNumber}`,
    });
  }, [navigation, kathismaNumber, kathismaTitle]);

  useEffect(() => {
    loadScreen();
  }, [kathismaNumber]);

  const loadScreen = async () => {
    try {
      setLoading(true);
      setError(null);
      setKathisma(null);
      setSavedItems([]);
      savedItemsRef.current = [];

      const response = await api.get(`kathismas/${kathismaNumber}/`);

      const data = response.data;

      setKathisma(data);

      try {
        const saved = await getSavedItems({
          source_type: 'psalter',

          source_id: data.psalter,
        });

        savedItemsRef.current = saved;

        setSavedItems(saved);
      } catch (savedError) {
        console.log(
          'Ошибка загрузки сохранений Псалтири:',
          savedError.response?.data || savedError.message
        );
      }
    } catch (loadError) {
      console.log('Ошибка загрузки кафизмы:', loadError.response?.data || loadError.message);

      setError('Не удалось загрузить кафизму');
    } finally {
      setLoading(false);
    }
  };

  const getSavedKathisma = () =>
    savedItemsRef.current.find(
      (item) => item.anchor_type === 'kathisma' && Number(item.anchor_id) === Number(kathisma?.id)
    );

  const getSavedPsalm = (psalmId) =>
    savedItemsRef.current.find(
      (item) =>
        (item.anchor_type === 'psalm' ||
          (item.anchor_type === 'psalm_text' && item.save_type === 'psalm')) &&
        Number(item.anchor_id) === Number(psalmId)
    );

  const handleAction = async (actionKey) => {
    if (!kathisma) {
      return null;
    }

    if (actionKey === `kathisma:${kathisma.id}`) {
      const existing = getSavedKathisma();

      if (existing) {
        await deleteSavedItem(existing.id);

        savedItemsRef.current = savedItemsRef.current.filter((item) => item.id !== existing.id);

        return {
          label: 'В избранное',

          active: false,
        };
      }

      const saved = await saveItem({
        save_type: 'kathisma',

        source_type: 'psalter',

        source_id: kathisma.psalter,

        anchor_type: 'kathisma',

        anchor_id: kathisma.id,

        source_title: 'Псалтирь',

        item_title: `Кафизма ${kathisma.number}`,

        text: '',

        metadata: {
          kathisma_number: kathisma.number,

          kathisma_title: kathisma.title || '',
        },
      });

      savedItemsRef.current = [saved, ...savedItemsRef.current];

      return {
        label: 'В избранном',

        active: true,
      };
    }

    if (!actionKey?.startsWith('psalm:')) {
      return null;
    }

    const psalmId = Number(actionKey.split(':')[1]);

    const psalm = (kathisma.psalms || []).find((item) => Number(item.id) === psalmId);

    if (!psalm) {
      return null;
    }

    const existing = getSavedPsalm(psalmId);

    if (existing) {
      await deleteSavedItem(existing.id);

      savedItemsRef.current = savedItemsRef.current.filter((item) => item.id !== existing.id);

      return {
        label: 'В избранное',

        active: false,
      };
    }

    const saved = await saveItem({
      save_type: 'psalm',

      source_type: 'psalter',

      source_id: kathisma.psalter,

      anchor_type: 'psalm',

      anchor_id: psalm.id,

      source_title: 'Псалтирь',

      item_title: `Псалом ${psalm.number}`,

      text: '',

      metadata: {
        kathisma_number: kathisma.number,

        kathisma_title: kathisma.title || '',

        psalm_number: psalm.number,
      },
    });

    savedItemsRef.current = [saved, ...savedItemsRef.current];

    return {
      label: 'В избранном',

      active: true,

      savedItem: saved,
    };
  };

  const readerProgress = useMemo(() => {
    if (!savedProgress || !kathisma) {
      return savedProgress;
    }

    if (savedProgress.anchor_type === 'psalm') {
      return savedProgress;
    }

    if (savedProgress.anchor_type !== 'psalm_verse') {
      return null;
    }

    const psalm = (kathisma.psalms || []).find((item) =>
      (item.verses || []).some((verse) => Number(verse.id) === Number(savedProgress.anchor_id))
    );

    if (!psalm) {
      return null;
    }

    return {
      ...savedProgress,

      anchor_type: 'psalm',

      anchor_id: psalm.id,

      offset: 0,
    };
  }, [kathisma, savedProgress]);

  const normalizedFocusTarget = useMemo(() => {
    if (!focusTarget || !kathisma) {
      return focusTarget;
    }

    const anchorType = focusTarget.anchor_type || focusTarget.anchorType;
    const metadata = focusTarget.metadata || {};

    if (anchorType === 'kathisma') {
      const firstPsalm = (kathisma.psalms || [])[0];

      if (!firstPsalm) {
        return focusTarget;
      }

      return {
        ...focusTarget,
        save_type: 'psalm',
        anchor_type: 'psalm_text',
        anchor_id: Number(firstPsalm.id),
        start_offset: null,
        end_offset: null,
        metadata: {
          ...metadata,
          psalm_id: Number(firstPsalm.id),
          psalm_number: Number(firstPsalm.number),
          chunk_index: 0,
          language: metadata.language || 'church',
        },
      };
    }

    if (
      anchorType === 'psalm' ||
      (anchorType === 'psalm_text' && focusTarget.save_type === 'psalm')
    ) {
      const psalmId = Number(metadata.psalm_id || focusTarget.anchor_id || focusTarget.anchorId);

      const psalm = (kathisma.psalms || []).find((item) => Number(item.id) === psalmId);

      if (!psalm) {
        return focusTarget;
      }

      return {
        ...focusTarget,
        anchor_type: 'psalm_text',
        anchor_id: Number(psalm.id),
        start_offset: null,
        end_offset: null,
        metadata: {
          ...metadata,
          psalm_id: Number(psalm.id),
          psalm_number: Number(psalm.number),
          chunk_index: 0,
          language: metadata.language || 'church',
        },
      };
    }

    if (anchorType === 'psalm_verse') {
      const verseId = Number(focusTarget.anchor_id || focusTarget.anchorId);
      const language =
        metadata.language === 'russian'
          ? 'russian'
          : metadata.language === 'traditional'
            ? 'traditional'
            : 'church';
      const field =
        language === 'russian'
          ? 'russian'
          : language === 'traditional'
            ? 'church_slavonic_traditional'
            : 'church_slavonic';

      for (const psalm of kathisma.psalms || []) {
        const chunks = [];
        let currentChunk = [];

        const flush = () => {
          if (currentChunk.length) {
            chunks.push(currentChunk);
            currentChunk = [];
          }
        };

        for (const verse of psalm.verses || []) {
          currentChunk.push(verse);

          const hasGloryAfterVerse = (kathisma.glories || []).some(
            (item) => Number(item.after_verse) === Number(verse.id)
          );

          if (hasGloryAfterVerse) {
            flush();
          }
        }

        flush();

        const chunkIndex = chunks.findIndex((chunk) =>
          chunk.some((verse) => Number(verse.id) === verseId)
        );

        if (chunkIndex < 0) {
          continue;
        }

        const built = buildLanguageChunk(chunks[chunkIndex], field);
        const range = built.verseRanges.find((item) => Number(item.verseId) === verseId);

        if (!range) {
          return focusTarget;
        }

        const legacyStart =
          focusTarget.start_offset === null || focusTarget.start_offset === undefined
            ? null
            : Number(focusTarget.start_offset);
        const legacyEnd =
          focusTarget.end_offset === null || focusTarget.end_offset === undefined
            ? null
            : Number(focusTarget.end_offset);

        return {
          ...focusTarget,
          anchor_type: 'psalm_text',
          anchor_id: Number(psalm.id),
          start_offset: legacyStart === null ? null : range.contentStart + legacyStart,
          end_offset: legacyEnd === null ? null : range.contentStart + legacyEnd,
          metadata: {
            ...metadata,
            psalm_id: Number(psalm.id),
            psalm_number: Number(psalm.number),
            chunk_index: chunkIndex,
            language,
          },
        };
      }
    }

    return focusTarget;
  }, [focusTarget, kathisma]);

  const hasRussianTranslation = useMemo(
    () =>
      !!kathisma?.prayers_after_russian?.trim() ||
      (kathisma?.psalms || []).some((psalm) =>
        (psalm.verses || []).some((verse) => !!verse.russian?.trim())
      ),
    [kathisma]
  );

  const hasTraditionalText = useMemo(
    () =>
      !!kathisma?.prayers_after_traditional?.trim() ||
      (kathisma?.psalms || []).some((psalm) =>
        (psalm.verses || []).some((verse) => !!verse.church_slavonic_traditional?.trim())
      ),
    [kathisma]
  );

  useEffect(() => {
    if (!kathisma) {
      return;
    }

    if (
      (viewMode === READER_LANGUAGE_MODES.BOTH || viewMode === READER_LANGUAGE_MODES.RUSSIAN) &&
      !hasRussianTranslation
    ) {
      setViewMode(READER_LANGUAGE_MODES.CHURCH);
      return;
    }

    if (viewMode === READER_LANGUAGE_MODES.TRADITIONAL && !hasTraditionalText) {
      setViewMode(READER_LANGUAGE_MODES.CHURCH);
    }
  }, [kathisma, viewMode, hasRussianTranslation, hasTraditionalText]);

  const documentData = useMemo(() => {
    if (!kathisma) {
      return {
        title: `Кафизма ${kathismaNumber}`,

        description: '',

        progressAnchorType: 'psalm',

        savedItems: [],

        sections: [],
      };
    }

    const showChurch =
      viewMode === READER_LANGUAGE_MODES.CHURCH || viewMode === READER_LANGUAGE_MODES.BOTH;
    const showRussian =
      viewMode === READER_LANGUAGE_MODES.RUSSIAN || viewMode === READER_LANGUAGE_MODES.BOTH;
    const showTraditional = viewMode === READER_LANGUAGE_MODES.TRADITIONAL;

    let nextBlockId = 1;

    const normalizedSaved = [];

    const sections = [];

    const attachDirectSaved = ({
      syntheticId,
      anchorType,
      anchorId,
      language,
      chunkIndex,
      sectionName,
    }) => {
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

          if (
            Number.isFinite(chunkIndex) &&
            metadata.chunk_index !== undefined &&
            Number(metadata.chunk_index) !== Number(chunkIndex)
          ) {
            return false;
          }

          if (sectionName && metadata.section && metadata.section !== sectionName) {
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

    const attachLegacyVerseSaved = ({syntheticId, verseRanges, language}) => {
      verseRanges.forEach((range) => {
        savedItems
          .filter((item) => {
            if (
              item.anchor_type !== 'psalm_verse' ||
              Number(item.anchor_id) !== Number(range.verseId) ||
              item.start_offset === null ||
              item.end_offset === null
            ) {
              return false;
            }

            const metadata = item.metadata || {};

            return !metadata.language || metadata.language === language;
          })
          .forEach((item) => {
            normalizedSaved.push({
              ...item,

              anchor_id: syntheticId,

              start_offset: range.contentStart + Number(item.start_offset),

              end_offset: range.contentStart + Number(item.end_offset),
            });
          });
      });
    };

    const makePsalmBlock = ({
      psalm,
      text,
      verseRanges,
      language,
      chunkIndex,
      chunkCount,
      className,
      label,
    }) => {
      const syntheticId = nextBlockId++;

      attachDirectSaved({
        syntheticId,
        anchorType: 'psalm_text',
        anchorId: psalm.id,
        language,
        chunkIndex,
      });

      attachLegacyVerseSaved({
        syntheticId,
        verseRanges,
        language,
      });

      return {
        id: syntheticId,

        text,

        label: label || '',

        className,

        sourceType: 'psalter',

        sourceId: kathisma.psalter,

        anchorType: 'psalm_text',

        anchorId: psalm.id,

        sourceTitle: 'Псалтирь',

        itemTitle: `Псалом ${psalm.number}`,

        fullSaveType: chunkCount === 1 ? 'psalm' : 'fragment',

        metadata: {
          kathisma_number: kathisma.number,

          kathisma_title: kathisma.title || '',

          psalm_id: psalm.id,

          psalm_number: psalm.number,

          chunk_index: chunkIndex,

          language,
        },
      };
    };

    const makeOtherBlock = ({
      text,
      anchorType,
      anchorId,
      itemTitle,
      fullSaveType,
      metadata,
      sectionName,
      className = '',
      label = '',
      language = null,
      memorialAction = null,
    }) => {
      const syntheticId = nextBlockId++;

      attachDirectSaved({
        syntheticId,
        anchorType,
        anchorId,
        sectionName,
        language,
      });

      return {
        id: syntheticId,

        text: text || '',

        sourceType: 'psalter',
        label,
        sourceId: kathisma.psalter,

        anchorType,

        anchorId,

        sourceTitle: 'Псалтирь',

        itemTitle,

        fullSaveType,

        className,

        metadata,

        memorialAction,
      };
    };

    (kathisma.psalms || []).forEach((psalm, psalmIndex) => {
      const verses = psalm.verses || [];

      const chunks = [];

      let currentChunk = [];

      const flushChunk = () => {
        if (currentChunk.length) {
          chunks.push({
            type: 'verses',

            verses: currentChunk,
          });

          currentChunk = [];
        }
      };

      verses.forEach((verse) => {
        currentChunk.push(verse);

        const glory = (kathisma.glories || []).find(
          (item) => Number(item.after_verse) === Number(verse.id)
        );

        if (glory) {
          flushChunk();

          chunks.push({
            type: 'glory',

            glory,
          });
        }
      });

      flushChunk();

      const psalmGlory = (kathisma.glories || []).find(
        (item) => Number(item.after_psalm) === Number(psalm.id)
      );

      if (psalmGlory) {
        chunks.push({
          type: 'glory',

          glory: psalmGlory,
        });
      }

      const verseChunkCount = chunks.filter((chunk) => chunk.type === 'verses').length;

      let verseChunkIndex = 0;

      const rows = [];

      chunks.forEach((chunk) => {
        if (chunk.type === 'glory') {
          const gloryBlock = makeOtherBlock({
            text: GLORY_TEXT,

            anchorType: 'kathisma_glory',

            // className: 'psalter-prayer',
            className: 'psalter-glory',
            anchorId: chunk.glory.id,

            itemTitle: `Слава после Псалма ${psalm.number}`,

            fullSaveType: 'prayer',

            metadata: {
              kathisma_number: kathisma.number,

              psalm_number: psalm.number,

              glory_number: chunk.glory.number,
            },

            memorialAction: {
              marker: '[Здесь можно прочитать прошение о здравии / об упокоении и помянуть имена.]',

              label: 'Открыть помянник',

              context: {
                source: 'psalter',

                kathisma_number: Number(kathisma.number),

                psalm_number: Number(psalm.number),

                glory_number: Number(chunk.glory.number),
              },
            },
          });

          rows.push({
            layout: 'stack',

            blocks: [gloryBlock],
          });

          return;
        }

        const church = buildLanguageChunk(chunk.verses, 'church_slavonic');

        const russian = buildLanguageChunk(chunk.verses, 'russian');

        const traditional = buildLanguageChunk(chunk.verses, 'church_slavonic_traditional');

        const blocks = [];

        if (showTraditional && traditional.text) {
          blocks.push(
            makePsalmBlock({
              psalm,
              text: traditional.text,
              verseRanges: traditional.verseRanges,
              language: 'traditional',
              chunkIndex: verseChunkIndex,
              chunkCount: verseChunkCount,
              className: 'psalter',
              label:
                psalmIndex === 0 && verseChunkIndex === 0
                  ? 'Церковнославянский · традиционное написание'
                  : '',
            })
          );
        }

        if (showChurch && church.text) {
          blocks.push(
            makePsalmBlock({
              psalm,
              text: church.text,
              verseRanges: church.verseRanges,
              language: 'church',
              chunkIndex: verseChunkIndex,
              chunkCount: verseChunkCount,
              className: 'psalter',
              label: psalmIndex === 0 && verseChunkIndex === 0 ? 'Церковнославянский' : '',
            })
          );
        }

        if (showRussian && russian.text) {
          blocks.push(
            makePsalmBlock({
              psalm,
              text: russian.text,
              verseRanges: russian.verseRanges,
              language: 'russian',
              chunkIndex: verseChunkIndex,
              chunkCount: verseChunkCount,
              className: 'psalter secondary',
              label: psalmIndex === 0 && verseChunkIndex === 0 ? 'Русский' : '',
            })
          );
        }

        if (blocks.length) {
          rows.push({
            layout: blocks.length > 1 ? 'parallel' : 'stack',

            blocks,
          });
        }

        verseChunkIndex += 1;
      });

      const psalmSavedItem = savedItems.find(
        (item) =>
          (item.anchor_type === 'psalm' ||
            (item.anchor_type === 'psalm_text' && item.save_type === 'psalm')) &&
          Number(item.anchor_id) === Number(psalm.id)
      );

      const psalmSaved = !!psalmSavedItem;

      sections.push({
        progressAnchorId: Number(psalm.id),

        trackProgress: true,

        title: `Псалом ${psalm.number}`,

        action: {
          key: `psalm:${psalm.id}`,

          label: psalmSaved ? 'В избранном' : 'В избранное',

          active: psalmSaved,

          savedItemId: psalmSavedItem?.id || null,

          highlightContent: true,

          highlightAnchorType: 'psalm_text',
        },

        rows,
      });
    });

    if (kathisma.prayers_after) {
      const normalizePrayersAfter = (value) =>
        String(value || '')
          .replace(/^([^\r\n]+)(?:\r?\n[ \t]*){2,}/u, '$1\n')
          .replace(/,\s*Трисвятое по Отче наш:/iu, ',\nТрисвятое по Отче наш:')
          .replace(/Трисвятое по Отче наш:[ \t]*/iu, 'Трисвятое по Отче наш:\n')
          .replace(
            /(?:Таже\s+|Также\s+)?Тропар(ь|и)\s*,?\s*глас\s*(\d+)\s*:\s*/iu,
            (_match, ending, glas) => `Тропар${ending === 'ь' ? 'ь' : 'и'}, глас ${glas}:\n`
          )
          .replace(
            /(^|\r?\n)[^\r\n]*\(40\)[^\r\n]*(?:\r?\n[ \t]*)*/u,
            '$1Господи, помилуй (40).\nМолитва '
          )
          .replace(/(^|\n)И[ \t]+ныне:[ \t]+/giu, '$1И\u00A0ныне:\u00A0');

      const churchText = normalizePrayersAfter(kathisma.prayers_after);

      const russianText = normalizePrayersAfter(kathisma.prayers_after_russian);

      const traditionalText = normalizePrayersAfter(kathisma.prayers_after_traditional);

      const blocks = [];

      if (showTraditional && traditionalText) {
        blocks.push(
          makeOtherBlock({
            text: traditionalText,

            language: 'traditional',

            anchorType: 'kathisma_prayers_after',

            anchorId: kathisma.id,

            itemTitle: `Молитвы после кафизмы ${kathisma.number}`,

            fullSaveType: 'prayer',

            className: 'psalter-prayer',

            metadata: {
              kathisma_number: kathisma.number,
              kathisma_title: kathisma.title || '',
              section: 'prayers_after',
              language: 'traditional',
            },

            sectionName: 'prayers_after',
          })
        );
      }

      const churchBlock = makeOtherBlock({
        text: churchText,

        // label: russianText
        //   ? 'Церковнославянский'
        //   : '',

        language: 'church',

        anchorType: 'kathisma_prayers_after',

        anchorId: kathisma.id,

        itemTitle: `Молитвы после кафизмы ${kathisma.number}`,

        fullSaveType: 'prayer',

        className: 'psalter-prayer',

        metadata: {
          kathisma_number: kathisma.number,
          kathisma_title: kathisma.title || '',
          section: 'prayers_after',
          language: 'church',
        },

        sectionName: 'prayers_after',
      });

      if (showChurch && churchText) {
        blocks.push(churchBlock);
      }

      if (showRussian && russianText) {
        blocks.push(
          makeOtherBlock({
            text: russianText,

            // label: 'Русский',

            language: 'russian',

            anchorType: 'kathisma_prayers_after',

            anchorId: kathisma.id,

            itemTitle: `Молитвы после кафизмы ${kathisma.number}`,

            fullSaveType: 'prayer',

            className: 'psalter-prayer secondary',

            metadata: {
              kathisma_number: kathisma.number,
              kathisma_title: kathisma.title || '',
              section: 'prayers_after',
              language: 'russian',
            },

            sectionName: 'prayers_after',
          })
        );
      }

      sections.push({
        progressAnchorId: Number(kathisma.id),

        trackProgress: false,

        title: 'Молитвы после кафизмы',

        rows: [
          {
            layout: blocks.length > 1 ? 'parallel' : 'stack',

            blocks,
          },
        ],
      });
    }

    const wholeKathismaSaved = savedItems.some(
      (item) => item.anchor_type === 'kathisma' && Number(item.anchor_id) === Number(kathisma.id)
    );

    return {
      title: `Кафизма ${kathisma.number}`,

      description: kathisma.title || '',

      action: {
        key: `kathisma:${kathisma.id}`,

        label: wholeKathismaSaved ? 'В избранном' : 'В избранное',

        active: wholeKathismaSaved,
      },

      viewSwitcher: {
        activeKey: viewMode,
        options: buildReaderLanguageOptions({
          hasRussian: hasRussianTranslation,
          hasTraditional: hasTraditionalText,
        }),
      },

      progressAnchorType: 'psalm',

      savedItems: normalizedSaved,

      sections,
    };
  }, [kathisma, kathismaNumber, savedItems, viewMode, hasRussianTranslation, hasTraditionalText]);

  const handleProgress = (progress) => {
    if (!kathisma) {
      return;
    }

    const psalm = (kathisma.psalms || []).find(
      (item) => Number(item.id) === Number(progress.anchorId)
    );

    scheduleSave({
      ...progress,
      metadata: {
        kathisma_number: Number(kathisma.number),
        psalm_number: psalm ? Number(psalm.number) : null,
      },
    });
  };

  const openReaderMenu = () => {
    setBookmarkPosition(getCurrentProgress());
    setStablePosition(getStableProgress());
    setReaderMenuVisible(true);
  };

  const bookmarkPsalm = bookmarkPosition
    ? (kathisma?.psalms || []).find(
        (psalm) => Number(psalm.id) === Number(bookmarkPosition.anchorId)
      )
    : null;

  const bookmarkConfig =
    kathisma && bookmarkPosition && bookmarkPsalm
      ? {
          sourceType: 'psalter',
          sourceId: Number(kathisma.psalter),
          sourceTitle: 'Псалтирь',
          itemTitle: `Псалом ${bookmarkPsalm.number}`,
          position: bookmarkPosition,
          metadata: {
            kathisma_number: Number(kathisma.number),
            kathisma_title: kathisma.title || '',
            psalm_id: Number(bookmarkPsalm.id),
            psalm_number: Number(bookmarkPsalm.number),
          },
        }
      : null;

  if (loading || (kathisma && !progressReady)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error || !kathisma) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Кафизма не найдена'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <SelectableDocumentReader
        ref={readerRef}
        documentData={documentData}
        savedProgress={readerProgress}
        focusTarget={normalizedFocusTarget}
        topContentInset={headerHeight}
        onProgress={handleProgress}
        onAction={handleAction}
        onMemorialOpen={() => setMemorialVisible(true)}
        onViewModeChange={setViewMode}
      />

      <MemorialQuickSheet
        visible={memorialVisible}
        onClose={() => setMemorialVisible(false)}
        onManage={() => navigation.navigate('Memorial')}
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
        title={`Кафизма ${kathisma.number}`}
        navigation={navigation}
        topInset={insets.top}
        showTitle={false}
        showMenu
        onMenuPress={openReaderMenu}
      />
    </View>
  );
}

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

  error: {
    paddingHorizontal: 18,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 23,
    color: colors.liturgical,
  },
});
