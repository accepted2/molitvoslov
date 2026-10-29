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
import {BottomNav} from '../components/navigation/BottomNav';
import {useReadingChrome} from '../hooks/useReadingChrome';
import {
  READER_LANGUAGE_MODES,
  buildReaderLanguageOptions,
  getReaderModeForAppLanguage,
} from '../services/readerLanguageModes';
import {useLanguage} from '../context/LanguageContext';
import {getLocalizedField} from '../services/localizedContent';

const GLORY_TEXT = `Слава Отцу и Сыну и Святому Духу.
И ныне и присно и во веки веков. Аминь.

Аллилуиа, аллилуиа, аллилуиа, слава Тебе, Боже. (Трижды)
Господи, помилуй.(Трижды)

Слава Отцу и Сыну и Святому Духу.

[Здесь можно прочитать прошение о здравии / об упокоении и помянуть имена.]
И ныне и присно и во веки веков. Аминь.`;
const GLORY_TEXT_TRADITIONAL = `Сла́ва Ѻ҆ц҃ꙋ̀ и҆ Сн҃ꙋ и҆ Ст҃о́мꙋ Дх҃ꙋ. И҆ ны́нѣ и҆ при́снѡ и҆ во вѣ́ки вѣкѡ́въ. А҆ми́нь.

А҆ллилꙋ́їа, а҆ллилꙋ́їа, а҆ллилꙋ́їа, сла́ва тебѣ̀, бж҃е.(Три́жды)
Гдⷭ҇и, поми́лꙋй. (Три́жды)

Сла́ва Ѻ҆ц҃ꙋ̀ и҆ Сн҃ꙋ и҆ Ст҃о́мꙋ Дх҃ꙋ.

[Здѣ́сь мо́жно прочита́ть проше́нїе ѡ҆ здра́вїи / ѡ҆ ᲂу҆покое́нїи и҆ помѧнꙋ́ть и҆мена̀.]
И҆ ны́нѣ и҆ при́снѡ и҆ во вѣ́ки вѣкѡ́въ. А҆ми́нь.`;

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

    const numberPrefix = field === 'church_slavonic_traditional'
      ? `${toChurchSlavonicNumber(verse.number)}.\u202F`
      : `${verse.number}.\u202F`;

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
const toChurchSlavonicNumber = (value) => {
  const units = ['', 'а', 'в', 'г', 'д', 'є', 'ѕ', 'з', 'и', 'ѳ'];
  const tens = ['', 'і', 'к', 'л', 'м', 'н', 'ѯ', 'ѻ', 'п', 'ч'];
  const hundreds = ['', 'р', 'с'];

  const number = Number(value);

  if (!Number.isInteger(number) || number < 1 || number > 299) {
    return String(value);
  }

  if (number >= 11 && number <= 19) {
    return `${units[number - 10]}і҃`;
  }

  const letters =
    (number >= 100 ? hundreds[Math.floor(number / 100)] : '') +
    tens[Math.floor((number % 100) / 10)] +
    units[number % 10];

  return `${letters.slice(0, -1)}${letters.slice(-1)}҃`;
};

export default function KathismaScreen({route, navigation}) {
  const {language, t} = useLanguage();
  const {kathismaNumber, kathismaTitle, focusTarget = null} = route.params;

  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const [kathisma, setKathisma] = useState(null);
  const {readingChromeHidden, handleReadingScroll} = useReadingChrome();

  const [savedItems, setSavedItems] = useState([]);

  const savedItemsRef = useRef([]);
  const readerRef = useRef(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.CHURCH);

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
      title: kathismaTitle || t('psalter.kathisma', {number: kathismaNumber}),
    });
  }, [navigation, kathismaNumber, kathismaTitle, t]);

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

      setError(t('menu.kathismaLoadError'));
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
          label: t('common.addToFavorites'),

          active: false,
        };
      }

      const saved = await saveItem({
        save_type: 'kathisma',

        source_type: 'psalter',

        source_id: kathisma.psalter,

        anchor_type: 'kathisma',

        anchor_id: kathisma.id,

        source_title: t('psalter.title'),

        item_title: t('psalter.kathisma', {number: kathisma.number}),

        text: '',

        metadata: {
          kathisma_number: kathisma.number,

          kathisma_title: getLocalizedField(kathisma, 'title', language) || '',
        },
      });

      savedItemsRef.current = [saved, ...savedItemsRef.current];

      return {
        label: t('common.inFavorites'),

        active: true,
      };
    }

    if (actionKey === 'kathisma:troparia' || actionKey === 'kathisma:prayer') {
      const part = actionKey === 'kathisma:troparia' ? 'troparia' : 'prayer';
      const existing = savedItemsRef.current.find(item =>
        item.anchor_type === 'kathisma_prayers_after' &&
        Number(item.anchor_id) === Number(kathisma.id) &&
        item.metadata?.part === part
      );
      if (existing) {
        await deleteSavedItem(existing.id);
        savedItemsRef.current = savedItemsRef.current.filter(item => item.id !== existing.id);
        return {active: false};
      }
      const section = documentData.sections.find(item => item.action?.key === actionKey);
      const block = section?.rows?.[0]?.blocks?.[0];
      if (!block?.text) return null;
      const saved = await saveItem({
        save_type: 'prayer',
        source_type: 'psalter',
        source_id: kathisma.psalter,
        anchor_type: 'kathisma_prayers_after',
        anchor_id: kathisma.id,
        source_title: t('psalter.title'),
        item_title: part === 'troparia'
          ? `Тропари по кафизме ${kathisma.number}`
          : `Молитва по кафизме ${kathisma.number}`,
        text: block.text,
        metadata: {
          kathisma_number: kathisma.number,
          part,
          language: block.metadata?.language || 'church',
        },
      });
      savedItemsRef.current = [saved, ...savedItemsRef.current];
      return {active: true, savedItem: saved};
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
        label: t('common.addToFavorites'),

        active: false,
      };
    }

    const saved = await saveItem({
      save_type: 'psalm',

      source_type: 'psalter',

      source_id: kathisma.psalter,

      anchor_type: 'psalm',

      anchor_id: psalm.id,

      source_title: t('psalter.title'),

      item_title: t('psalter.psalm', {number: psalm.number}),

      text: '',

      metadata: {
        kathisma_number: kathisma.number,

        kathisma_title: getLocalizedField(kathisma, 'title', language) || '',

        psalm_number: psalm.number,
      },
    });

    savedItemsRef.current = [saved, ...savedItemsRef.current];

    return {
      label: t('common.inFavorites'),

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
          language: metadata.language || focusTarget.preferredLanguage || 'church',
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
      const preferred = focusTarget.preferredLanguage;
      const savedLanguage =
        (metadata.language || preferred) === 'ukrainian'
          ? 'ukrainian'
          : (metadata.language || preferred) === 'russian'
            ? 'russian'
            : (metadata.language || preferred) === 'traditional'
              ? 'traditional'
              : 'church';
      const field =
        savedLanguage === 'ukrainian'
          ? 'ukrainian'
          : savedLanguage === 'russian'
            ? 'russian'
            : savedLanguage === 'traditional'
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
          // Keep the exact verse boundaries so search cannot jump to another
          // occurrence of the word elsewhere in this multi-verse chunk.
          start_offset: legacyStart === null ? range.contentStart : range.contentStart + legacyStart,
          end_offset: legacyEnd === null ? range.contentEnd : range.contentStart + legacyEnd,
          highlightVerse: true,
          metadata: {
            ...metadata,
            psalm_id: Number(psalm.id),
            psalm_number: Number(psalm.number),
            chunk_index: chunkIndex,
            language: savedLanguage,
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

  const hasUkrainianTranslation = useMemo(
    () =>
      !!kathisma?.prayers_after_uk?.trim() ||
      (kathisma?.psalms || []).some((psalm) =>
        (psalm.verses || []).some((verse) => !!verse.ukrainian?.trim())
      ),
    [kathisma]
  );

  const hasTraditionalTranslation = useMemo(
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

    const preferred = focusTarget?.preferredLanguage;
    const initial = getReaderModeForAppLanguage(language, {
      hasRussian: hasRussianTranslation,
      hasUkrainian: hasUkrainianTranslation,
    });
    setViewMode(
      preferred === 'russian' ? (hasRussianTranslation ? READER_LANGUAGE_MODES.RUSSIAN : initial) :
      preferred === 'ukrainian' ? (hasUkrainianTranslation ? READER_LANGUAGE_MODES.UKRAINIAN : initial) :
      preferred === 'traditional' ? (hasTraditionalTranslation ? READER_LANGUAGE_MODES.TRADITIONAL : initial) :
      preferred === 'church' ? READER_LANGUAGE_MODES.CHURCH : initial
    );
  }, [language, kathisma, hasRussianTranslation, hasUkrainianTranslation, hasTraditionalTranslation, focusTarget]);

  const documentData = useMemo(() => {
    if (!kathisma) {
      return {
        title: t('psalter.kathisma', {number: kathismaNumber}),

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
    const showUkrainian = viewMode === READER_LANGUAGE_MODES.UKRAINIAN;
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

        sourceTitle: t('psalter.title'),

        itemTitle: t('psalter.psalm', {number: psalm.number}),

        fullSaveType: chunkCount === 1 ? 'psalm' : 'fragment',

        metadata: {
          kathisma_number: kathisma.number,

          kathisma_title: getLocalizedField(kathisma, 'title', language) || '',

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

        sourceTitle: t('psalter.title'),

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
            text:
              viewMode === READER_LANGUAGE_MODES.TRADITIONAL
                ? GLORY_TEXT_TRADITIONAL
                : GLORY_TEXT,

            anchorType: 'kathisma_glory',

            // className: 'psalter-prayer',
            className: 'psalter-glory',
            language:
              viewMode === READER_LANGUAGE_MODES.TRADITIONAL
                ? 'traditional'
                : 'church',
            anchorId: chunk.glory.id,

            itemTitle: t('psalter.gloryAfterPsalm', {number: psalm.number}),

            fullSaveType: 'prayer',

            metadata: {
              kathisma_number: kathisma.number,
              psalm_number: psalm.number,
              glory_number: chunk.glory.number,
              language:
                viewMode === READER_LANGUAGE_MODES.TRADITIONAL
                  ? 'traditional'
                  : 'church',
            },

            memorialAction: {
              marker: (
                viewMode === READER_LANGUAGE_MODES.TRADITIONAL
                  ? GLORY_TEXT_TRADITIONAL
                  : GLORY_TEXT
              ).match(/\[[^\]\n]+\]/u)?.[0] || '',

              label: t('common.openMemorial'),

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

        const ukrainian = buildLanguageChunk(chunk.verses, 'ukrainian');

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

        if (showUkrainian) {
          const localized = ukrainian.text || russian.text || church.text;
          const localizedRanges = ukrainian.text
            ? ukrainian.verseRanges
            : russian.text
              ? russian.verseRanges
              : church.verseRanges;
          const localizedLanguage = ukrainian.text
            ? 'ukrainian'
            : russian.text
              ? 'russian'
              : 'church';

          if (localized) {
            blocks.push(
              makePsalmBlock({
                psalm,
                text: localized,
                verseRanges: localizedRanges,
                language: localizedLanguage,
                chunkIndex: verseChunkIndex,
                chunkCount: verseChunkCount,
                className: localizedLanguage === 'church' ? 'psalter' : 'psalter secondary',
                label: '',
              })
            );
          }
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
        className: 'psalter-psalm-section',
        progressAnchorId: Number(psalm.id),

        trackProgress: true,

        title:
          viewMode === READER_LANGUAGE_MODES.TRADITIONAL
            ? `Ѱало́мъ ${toChurchSlavonicNumber(psalm.number)}`
            : t('psalter.psalm', {number: psalm.number}),

        action: {
          key: `psalm:${psalm.id}`,

          label: psalmSaved ? t('common.inFavorites') : t('common.addToFavorites'),

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

      const ukrainianText = normalizePrayersAfter(kathisma.prayers_after_uk);

      const traditionalText = normalizePrayersAfter(
        kathisma.prayers_after_traditional
      )
        .replace(
          /^По[^\r\n]*(?:\r?\n|$)/u,
          'Трист҃о́е, по Ѻ҆́ч҃е на́шъ:\n'
        )
        // Только для традиционного ЦС.
        .replace(/(^|\n)([^\r\n]*)(?=\r?\n|$)/gu, (match, prefix, line) => {
          const plain = line.normalize('NFD').replace(/[\u0300-\u036f\u0483-\u0489]/gu, '').toLowerCase();
          if (!/^таже\s+тропар/u.test(plain) || !plain.includes('глас')) return match;
          const glas = line.match(/([^\s,]+)\s*:\s*$/u)?.[1];
          if (!glas) return match;
          return prefix + (/тропари/u.test(plain) ? 'Тропа́ри' : 'Тропа́рь') + ', гла́съ ' + glas + ':';
        })
        // Только традиционная версия: выделяем заголовок без изменения текста молитвы.
        .split(/\r?\n/u)
        .flatMap(line => {
          const normalized = value => String(value).normalize('NFD')
            .replace(/[\u0300-\u036f\u0483-\u0489]/gu, '')
            .replace(/[ꙋѹꙊѸ]/gu, 'у')
            .replace(/[ѣѢ]/gu, 'е')
            .toLowerCase();
          if (!/помил/u.test(normalized(line))) return [line];
          const match = line.match(/(?:^|[ \t]+)(?:[ЕеИи][\u0300-\u036f\u0483-\u0489]*[ \t]+)?([Мм][^\s:]*)[ \t]*:[ \t]*$/u);
          if (!match || !/^(?:млтва|молитва)$/u.test(normalized(match[1]))) return [line];
          return [line.slice(0, match.index).trimEnd(), 'Мл҃тва'];
        })
        .map(line => {
          const normalized = line.normalize('NFD')
            .replace(/[\u0300-\u036f\u0483-\u0489]/gu, '').toLowerCase();
          return /^(?:млтва|молитва)\s*:?\s*$/u.test(normalized) ? 'Мл҃тва' : line;
        })
        .join('\n')
        // В первом славословии помета повторения должна быть "(Три́жды)".
        // Меняем только эту помету, не остальные строки и кафизмы.
        .replace(/(^|\n)([^\r\n]*)(?=\n|$)/gu, (whole, prefix, line) => {
          if (Number(kathisma.number) !== 1) return whole;
          const plain = line.normalize('NFD')
            .replace(/[\u0300-\u036f\u0483-\u0489]/gu, '')
            .toLowerCase();
          if (!plain.startsWith('слава') || !plain.includes('трижды')) return whole;
          return prefix + line.replace(
            /[ \t]*\(?[Тт]р[\u0300-\u036f\u0483-\u0489]*и[\u0300-\u036f\u0483-\u0489]*ж[\u0300-\u036f\u0483-\u0489]*д[\u0300-\u036f\u0483-\u0489]*ы[\u0300-\u036f\u0483-\u0489]*\)?\.?[ \t]*$/u,
            ' (Три́жды)'
          );
        })
        // Заголовок отображается блочным элементом WebView: соседние
        // переводы строк давали дополнительный пустой абзац.
        .replace(/\n(Мл҃тва)\n/u, '\n$1')
        // В 20-й кафизме после первой молитвы идут общие заключительные
        // молитвы Псалтири. Они отображаются в отдельном разделе.
        .replace(/[\s\S]*/u, complete => {
          if (Number(kathisma.number) !== 20) return complete;
          const heading = complete.indexOf('Мл҃тва');
          if (heading < 0) return complete;
          const bodyStart = heading + 'Мл҃тва'.length;
          const body = complete.slice(bodyStart);
          const amen = /[Аа][\u0300-\u036f\u0483-\u0489]*[Мм][\u0300-\u036f\u0483-\u0489]*[ИиІі][\u0300-\u036f\u0483-\u0489]*[Нн][\u0300-\u036f\u0483-\u0489]*[ЬьЪъ]?[\u0300-\u036f\u0483-\u0489]*[.!]?/u.exec(body);
          if (!amen) return complete;
          return complete.slice(0, bodyStart + amen.index + amen[0].length).trimEnd();
        })
        .trimStart();
      const blocks = [];

      if (showTraditional && traditionalText) {
        blocks.push(
          makeOtherBlock({
            text: traditionalText,
            language: 'traditional',
            anchorType: 'kathisma_prayers_after',
            anchorId: kathisma.id,
            itemTitle: t('psalter.prayersAfterKathisma', {number: kathisma.number}),
            fullSaveType: 'prayer',
            className: 'psalter-prayer',
            metadata: {
              kathisma_number: kathisma.number,
              kathisma_title: getLocalizedField(kathisma, 'title', language) || '',
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

        itemTitle: t('psalter.prayersAfterKathisma', {number: kathisma.number}),

        fullSaveType: 'prayer',

        className: 'psalter-prayer',

        metadata: {
          kathisma_number: kathisma.number,
          kathisma_title: getLocalizedField(kathisma, 'title', language) || '',
          section: 'prayers_after',
          language: 'church',
        },

        sectionName: 'prayers_after',
      });

      if (showChurch && churchText) {
        blocks.push(churchBlock);
      }

      if (showUkrainian) {
        const localized = ukrainianText || russianText || churchText;
        const localizedLanguage = ukrainianText ? 'ukrainian' : russianText ? 'russian' : 'church';

        if (localized) {
          blocks.push(
            makeOtherBlock({
              text: localized,

              language: localizedLanguage,

              anchorType: 'kathisma_prayers_after',

              anchorId: kathisma.id,

              itemTitle: t('psalter.prayersAfterKathisma', {number: kathisma.number}),

              fullSaveType: 'prayer',

              className:
                localizedLanguage === 'church' ? 'psalter-prayer' : 'psalter-prayer secondary',

              metadata: {
                kathisma_number: kathisma.number,
                kathisma_title: getLocalizedField(kathisma, 'title', language) || '',
                section: 'prayers_after',
                language: localizedLanguage,
              },

              sectionName: 'prayers_after',
            })
          );
        }
      }

      if (showRussian && russianText) {
        blocks.push(
          makeOtherBlock({
            text: russianText,

            // label: 'Русский',

            language: 'russian',

            anchorType: 'kathisma_prayers_after',

            anchorId: kathisma.id,

            itemTitle: t('psalter.prayersAfterKathisma', {number: kathisma.number}),

            fullSaveType: 'prayer',

            className: 'psalter-prayer secondary',

            metadata: {
              kathisma_number: kathisma.number,
              kathisma_title: getLocalizedField(kathisma, 'title', language) || '',
              section: 'prayers_after',
              language: 'russian',
            },

            sectionName: 'prayers_after',
          })
        );
      }

      // Keep each translation's exact text, but give troparia and prayer
      // independent save actions and highlight boundaries.
      const splitPostKathisma = (block) => {
        const text = block.text || '';
        const lines = text.split('\n');
        let offset = 0;
        let troparStart = -1;
        let mercyStart = -1;
        let prayerStart = -1;
        const normalize = value => String(value).normalize('NFD')
          .replace(/[\u0300-\u036f\u0483-\u0489]/gu, '')
          .replace(/[ꙋѹꙊѸ]/gu, 'у')
          .replace(/[ѣѢ]/gu, 'е')
          .toLowerCase();
        for (const line of lines) {
          const plain = normalize(line).trim();
          if (troparStart < 0 && /тропар/u.test(plain) && /глас/u.test(plain)) {
            troparStart = offset;
          } else if (troparStart >= 0 && mercyStart < 0 &&
                     /^(?:господи|гди)\s*,?\s*помил/u.test(plain)) {
            mercyStart = offset;
          }
          if (prayerStart < 0 && (
            /^молитва(?:\s|$)/u.test(plain) ||
            /^млтва(?:\s|$)/u.test(plain)
          )) {
            prayerStart = offset;
          }
          offset += line.length + 1;
        }
        const makePart = (begin, finish, part) => {
          if (begin < 0 || finish <= begin) return null;
          const content = text.slice(begin, finish).trim();
          return content ? {...block, id: nextBlockId++, text: content, metadata: {...block.metadata, part}} : null;
        };
        const troparEnd = mercyStart >= 0 ? mercyStart : prayerStart;
        return {
          introduction: makePart(0, troparStart >= 0 ? troparStart : (prayerStart >= 0 ? prayerStart : text.length), 'introduction'),
          troparia: makePart(troparStart, troparEnd, 'troparia'),
          conclusion: makePart(mercyStart, prayerStart, 'conclusion'),
          prayer: makePart(prayerStart, text.length, 'prayer'),
        };
      };
      const splitBlocks = blocks.map(splitPostKathisma);
      const addPostKathismaSection = (part, title, savable = false) => {
        const partBlocks = splitBlocks.map(item => item[part]).filter(Boolean).map(block => {
          if (part !== 'prayer') return block;
          // The prayer title belongs in the section header beside its save heart.
          const heading = block.metadata?.language === 'traditional'
            ? /^Мл҃тва\s*/u
            : /^Молитва\s*:?\s*/iu;
          return {...block, text: block.text.replace(heading, '').trimStart()};
        });
        if (!partBlocks.length) return;
        const actionKey = 'kathisma:' + part;
        const savedPart = savable && savedItems.some(item =>
          item.anchor_type === 'kathisma_prayers_after' &&
          Number(item.anchor_id) === Number(kathisma.id) &&
          item.metadata?.part === part
        );
        sections.push({
          className: 'psalter-post-kathisma-part',
          progressAnchorId: Number(kathisma.id),
          trackProgress: false,
          title,
          ...(savable ? {action: {
            key: actionKey,
            active: savedPart,
            highlightContent: true,
          }} : {}),
          rows: [{
            layout: partBlocks.length > 1 ? 'parallel' : 'stack',
            blocks: partBlocks,
          }],
        });
      };
      addPostKathismaSection('introduction', '');
      addPostKathismaSection('troparia', 'Тропари', true);
      addPostKathismaSection('conclusion', '');
      addPostKathismaSection('prayer', showTraditional ? 'Мл҃тва' : 'Молитва', true);

    }

    // Full translations are added as a unit; do not silently fall back to church text.
    const unavailableMode =
      ((viewMode === READER_LANGUAGE_MODES.RUSSIAN || viewMode === READER_LANGUAGE_MODES.BOTH) && !hasRussianTranslation)
        ? 'russian'
        : viewMode === READER_LANGUAGE_MODES.TRADITIONAL && !hasTraditionalTranslation
          ? 'traditional'
          : null;
    if (unavailableMode) {
      sections.length = 0;
      sections.push({
        progressAnchorId: 0,
        trackProgress: false,
        title: '',
        rows: [{
          layout: 'stack',
          blocks: [{
            id: nextBlockId++,
            text: unavailableMode === 'traditional'
              ? 'Те́кстъ въ традиціо́нномъ начерта́ніи отсꙋ́тствꙋетъ.'
              : 'Перевод пока отсутствует.',
            className: unavailableMode === 'traditional' ? 'akathist-church' : 'akathist-russian',
            metadata: {language: unavailableMode},
          }],
        }],
      });
    }

    const wholeKathismaSaved = savedItems.some(
      (item) => item.anchor_type === 'kathisma' && Number(item.anchor_id) === Number(kathisma.id)
    );

    return {
      title:
        viewMode === READER_LANGUAGE_MODES.TRADITIONAL
          ? `Каѳи́сма ${toChurchSlavonicNumber(kathisma.number)}`
          : t('psalter.kathisma', {number: kathisma.number}),

      description: getLocalizedField(kathisma, 'title', language) || '',

      action: {
        key: `kathisma:${kathisma.id}`,

        label: wholeKathismaSaved ? t('common.inFavorites') : t('common.addToFavorites'),

        active: wholeKathismaSaved,
      },

      viewSwitcher: {
        activeKey: viewMode,
        options: buildReaderLanguageOptions({
          hasRussian: true,
          hasTraditional: true,
        }),
      },

      progressAnchorType: 'psalm',

      savedItems: normalizedSaved,

      sections,
    };
  }, [
    kathisma,
    kathismaNumber,
    savedItems,
    viewMode,
    hasRussianTranslation,
    hasUkrainianTranslation,
    hasTraditionalTranslation,
    language,
    t,
  ]);

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
          sourceTitle: t('psalter.title'),
          itemTitle: t('psalter.psalm', {number: bookmarkPsalm.number}),
          position: bookmarkPosition,
          metadata: {
            kathisma_number: Number(kathisma.number),
            kathisma_title: getLocalizedField(kathisma, 'title', language) || '',
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
        <Text style={styles.error}>{error || t('psalter.kathismaNotFound')}</Text>
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
        bottomContentInset={90}
        onReadingScroll={handleReadingScroll}
        onProgress={handleProgress}
        onAction={handleAction}
        onViewModeChange={setViewMode}
        onMemorialOpen={() => setMemorialVisible(true)}
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
        title={t('psalter.kathisma', {number: kathisma.number})}
        navigation={navigation}
        topInset={insets.top}
        showTitle
        compactReading
        readingHidden={readingChromeHidden}
        showMenu
        onMenuPress={openReaderMenu}
      />

      <BottomNav navigation={navigation} active={null} readingHidden={readingChromeHidden} />
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
