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
import {BottomNav} from '../components/navigation/BottomNav';
import {useReadingChrome} from '../hooks/useReadingChrome';
import {useScopedReaderAppearance} from '../hooks/useScopedReaderAppearance';
import {
  getReaderLanguageModePreference,
  saveReaderLanguageModePreference,
} from '../services/readerPreferences';

import {resolveReaderAppearance} from '../services/scopedReaderAppearance';
import {
  READER_LANGUAGE_MODES,
  buildReaderLanguageOptions,
  getReaderModeForAppLanguage,
} from '../services/readerLanguageModes';
import {useLanguage} from '../context/LanguageContext';
import {getLocalizedField} from '../services/localizedContent';
import {buildCanonTypography} from '../services/canonTypography';
import {getCanonRussianCoverage} from '../services/canonRussianCoverage';

const MODE_CHURCH = READER_LANGUAGE_MODES.CHURCH;
const MODE_BOTH = READER_LANGUAGE_MODES.BOTH;
const MODE_RUSSIAN = READER_LANGUAGE_MODES.RUSSIAN;
const MODE_UKRAINIAN = READER_LANGUAGE_MODES.UKRAINIAN;
const MODE_TRADITIONAL = READER_LANGUAGE_MODES.TRADITIONAL;

const SECTION_LABELS = {
  irmos: 'Ирмос',

  refrain: 'Припев',

  troparion: 'Тропарь',

  theotokion: 'Богородичен',

  glory: 'Слава',

  now: 'И ныне',

  sedalen: 'Седален',

  kontakion: 'Кондак',

  ikos: 'Икос',

  svetilen: 'Светилен',

  prayer: 'Молитва',

  other: 'Текст',
};

const getSectionLabel = (sectionType, t) => {
  const keys = {
    irmos: 'reading.irmos',
    refrain: 'reading.refrain',
    troparion: 'calendar.troparion',
    theotokion: 'reading.theotokion',
    glory: 'reading.glory',
    now: 'reading.now',
    sedalen: 'reading.sedalen',
    kontakion: 'reading.kontakion',
    ikos: 'reading.ikos',
    svetilen: 'reading.svetilen',
    prayer: 'reading.prayer',
    other: 'reading.other',
  };

  const key = keys[sectionType];

  return key ? t(key) : '';
};

const normalizeCanonCue = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u0483-\u0487]/g, '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

const canonTextSignature = (value) =>
  normalizeCanonCue(value)
    .replace(/^(?:припев|иисусу)\s*:\s*/iu, '')
    .replace(/[^а-я0-9]+/giu, ' ')
    .trim();

const getCanonInlineLabel = (section, text, t) => {
  if (!section || section.suppress_inline_label) {
    return '';
  }

  const sectionType = section.section_type;

  // В песнях канона обычные строфы не должны
  // автоматически подписываться "Тропарь:".
  if (sectionType === 'troparion' && section.ode_number) {
    return '';
  }

  if (sectionType === 'other') {
    return '';
  }

  const heading = String(section.heading || '')
    .trim()
    .replace(/[:;]+$/, '');

  const genericSong = /^песнь\s+\d+/iu.test(heading);

  let value = heading && !genericSong && heading.length <= 48 ? heading : '';

  if (!value) {
    if (
      [
        'irmos',
        'refrain',
        'theotokion',
        'kontakion',
        'ikos',
        'sedalen',
        'svetilen',
        'prayer',
      ].includes(sectionType)
    ) {
      value = getSectionLabel(sectionType, t);
    }
  }

  if (!value) {
    return '';
  }

  const normalizedValue = normalizeCanonCue(value);

  const normalizedText = normalizeCanonCue(text);

  // Если "Ирмос:", "Припев:", "Иисусу:" и т.п.
  // уже находятся в самом тексте EPUB, второй раз
  // подпись перед текстом не добавляем.
  if (
    normalizedText === normalizedValue ||
    normalizedText.startsWith(normalizedValue + ':') ||
    normalizedText.startsWith(normalizedValue + ' ')
  ) {
    return '';
  }

  return `${value}:`;
};

export const CanonScreen = ({route, navigation}) => {
  const {language, t} = useLanguage();
  const {canonId, slug, title, focusTarget = null} = route.params;

  const insets = useSafeAreaInsets();

  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  useEffect(() => {setHeaderHeight(insets.top + 56);}, [insets.top]);

  const [canon, setCanon] = useState(null);
  const {readingChromeHidden, handleReadingScroll, handleNativeReadingScroll} = useReadingChrome();

  const [savedItems, setSavedItems] = useState([]);

  const savedItemsRef = useRef([]);
  const readerRef = useRef(null);
  const {appearance, changeAppearance, resetAppearance} = useScopedReaderAppearance('canon', canonId);
  useEffect(() => {readerRef.current?.applyAppearance(appearance);}, [appearance]);

  const [viewMode, setViewMode] = useState(MODE_CHURCH);
  const changeViewMode = nextMode => {
    setViewMode(nextMode);
    if (canonId) {
      saveReaderLanguageModePreference({
        sourceType: 'canon', sourceId: canonId, mode: nextMode,
      }).catch(error => console.warn('[reader language] save:', error?.message || error));
    }
  };


  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [readerMenuVisible, setReaderMenuVisible] = useState(false);
  const [bookmarkPosition, setBookmarkPosition] = useState(null);
  const [stablePosition, setStablePosition] = useState(null);

  const {savedProgress, progressReady, scheduleSave, getCurrentProgress, getStableProgress} =
    useReadingProgress({
      sourceType: 'canon',

      sourceId: canonId,
    });

  useEffect(() => {
    loadCanon();
  }, [slug, canonId]);

  const loadCanon = async () => {
    try {
      setLoading(true);

      setError(null);

      setCanon(null);

      setSavedItems([]);

      savedItemsRef.current = [];

      const [response, saved] = await Promise.all([
        api.get(`canons/${slug}/`),

        getSavedItems({
          source_type: 'canon',

          source_id: canonId,
        }),
      ]);

      setCanon(response.data);

      savedItemsRef.current = saved;

      setSavedItems(saved);
    } catch (loadError) {
      console.log('Ошибка загрузки канона:', loadError.response?.data || loadError.message);

      setError(t('menu.canonLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const primaryVariant = useMemo(() => {
    const values = (canon?.sections || [])
      .map((section) => Number(section.variant || 1))
      .filter(Number.isFinite);

    return values.length ? Math.min(...values) : 1;
  }, [canon]);

  const activeSections = useMemo(() => {
    // The three combined canons have their own full traditional prayer-book
    // structure (including prelude and conclusion), distinct from the
    // modern CS/RU parallel paragraphs. Never align unrelated verses by index.
    const source = viewMode === MODE_TRADITIONAL &&
      Array.isArray(canon?.traditional_sections) &&
      canon.traditional_sections.length
        ? canon.traditional_sections
        : canon?.sections || [];
    return source
      .filter((section) => Number(section.variant || 1) === Number(primaryVariant))
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  }, [canon, primaryVariant, viewMode]);

  const displaySections = useMemo(() => {
    const refrainCandidates = activeSections.filter((section) => {
      if (section.section_type !== 'refrain') {
        return false;
      }

      const heading = normalizeCanonCue(section.heading);

      if (heading !== 'припев') {
        return false;
      }

      const signature = canonTextSignature(section.text?.content);

      if (!signature || signature.length > 220) {
        return false;
      }

      return (
        signature.includes('моли бога') ||
        signature.includes('помилуй') ||
        signature.includes('спаси нас') ||
        signature.includes('спаси мя') ||
        signature.includes('слава тебе') ||
        signature.includes('радуйся')
      );
    });

    const canonical = refrainCandidates[0];

    const canonicalSignature = canonical ? canonTextSignature(canonical.text?.content) : '';

    return activeSections.map((section) => {
      const signature = canonTextSignature(section.text?.content);

      if (
        canonicalSignature &&
        section.section_type === 'troparion' &&
        signature === canonicalSignature
      ) {
        return {
          ...section,

          display_section_type: 'refrain',

          display_heading: '',
        };
      }

      return {
        ...section,

        display_section_type: section.section_type,

        display_heading: section.heading || '',
      };
    });
  }, [activeSections]);

  // Language availability must not depend on the currently selected tab.
  // The combined Three Canons have a separate traditional corpus, and changing
  // tabs must not retrigger the default-language initialization effect.
  const modernSections = useMemo(
    () => (canon?.sections || []).filter(
      (section) => Number(section.variant || 1) === Number(primaryVariant)
    ),
    [canon, primaryVariant]
  );

  // All-or-nothing: if ANY modern source section lacks RU, do not mix a
  // partial translation into the parallel view.
  const hasRussianTranslation = useMemo(
    () => getCanonRussianCoverage(modernSections).complete,
    [modernSections]
  );

  const hasUkrainianTranslation = useMemo(
    () => modernSections.some((section) => !!section.text?.translation_uk?.trim()),
    [modernSections]
  );

  const hasTraditionalTranslation = useMemo(
    () => (
      canon?.traditional_sections?.length
        ? canon.traditional_sections
        : modernSections
    ).some((section) => !!section.text?.traditional_content?.trim()),
    [canon, modernSections]
  );

  useEffect(() => {
    if (!canon) {
      return;
    }

    // Keep every language tab selectable even when its translation is missing.
    let nextMode = getReaderModeForAppLanguage(language, {
      hasRussian: true,
      hasUkrainian: hasUkrainianTranslation,
      hasTraditional: hasTraditionalTranslation,
    });

    const preferred = focusTarget?.preferredLanguage;


    if (preferred === 'russian') {
      nextMode = MODE_RUSSIAN;
    } else if (preferred === 'ukrainian') {
      nextMode = hasUkrainianTranslation ? MODE_UKRAINIAN : MODE_CHURCH;
    } else if (preferred === 'church') {
      nextMode = MODE_CHURCH;
    } else if (preferred === 'traditional') {
      nextMode = hasTraditionalTranslation ? MODE_TRADITIONAL : MODE_CHURCH;
    }

    setViewMode(nextMode);
    if (!preferred && canonId) {
      let active = true;
      getReaderLanguageModePreference({sourceType: 'canon', sourceId: canonId})
        .then(savedMode => {
          if (!active) return;
          const supported = (savedMode === 'russian' || savedMode === 'both')
            ? (hasRussianTranslation ? savedMode : 'church')
            : savedMode === 'traditional'
              ? (hasTraditionalTranslation ? savedMode : 'church')
              : 'church';
          setViewMode(supported);
        })
        .catch(error => console.warn('[reader language] load:', error?.message || error));
      return () => { active = false; };
    }
  }, [
    language,
    canon,
    hasRussianTranslation,
    hasUkrainianTranslation,
    hasTraditionalTranslation,
    focusTarget,
  ]);

  const handleAction = async (actionKey) => {
    if (!canon || actionKey !== `canon:${canon.id}`) {
      return null;
    }

    const existing = savedItemsRef.current.find(
      (item) =>
        item.anchor_type === 'canon' &&
        Number(item.anchor_id) === Number(canon.id) &&
        item.save_type === 'canon'
    );

    if (existing) {
      await deleteSavedItem(existing.id);

      savedItemsRef.current = savedItemsRef.current.filter((item) => item.id !== existing.id);

      return {
        label: t('common.addToFavorites'),

        active: false,
      };
    }

    const saved = await saveItem({
      save_type: 'canon',

      source_type: 'canon',

      source_id: canon.id,

      anchor_type: 'canon',

      anchor_id: canon.id,

      source_title: getLocalizedField(canon, 'title', language) || title || t('reading.canon'),

      item_title: getLocalizedField(canon, 'title', language) || title || t('reading.canon'),

      text: '',

      metadata: {
        slug: canon.slug || slug,

        variant: primaryVariant,
      },
    });

    savedItemsRef.current = [saved, ...savedItemsRef.current];

    return {
      label: t('common.inFavorites'),

      active: true,

      savedItem: saved,
    };
  };

  const documentData = useMemo(() => {
    if (!canon) {
      return {
        title: title || t('reading.canon'),

        description: '',

        progressAnchorType: 'canon_section',

        savedItems: [],

        sections: [],
      };
    }

    // Keep the selected tab visible, but never show only part of a translation.
    const showChurch = viewMode === MODE_CHURCH || viewMode === MODE_BOTH;

    const showRussian = hasRussianTranslation &&
      (viewMode === MODE_RUSSIAN || viewMode === MODE_BOTH);

    const showUkrainian = viewMode === MODE_UKRAINIAN;

    const showTraditional = viewMode === MODE_TRADITIONAL;

    let nextBlockId = 1;

    let previousOde = null;

    const normalizedSaved = [];

    const sections = [];

    const makeBlock = ({section, text, language, className, label, inlineLabel}) => {
      const syntheticId = nextBlockId++;
      // In CS + RU, the translation is an explanatory secondary paragraph.
      // Do not give it the Slavonic hymn's red initials or doxology styling.
      const isParallelTranslation = viewMode === MODE_BOTH && language === 'russian';

      savedItems
        .filter((item) => {
          if (
            item.anchor_type !== 'canon_section' ||
            Number(item.anchor_id) !== Number(section.id) ||
            item.start_offset === null ||
            item.end_offset === null
          ) {
            return false;
          }

          const metadata = item.metadata || {};

          if (metadata.language && metadata.language !== language) {
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

      return {
        id: syntheticId,

        text: text || '',

        label: label || '',

        inlineLabel: inlineLabel || '',

        // Canon-specific visual ranges; never rewrite text or save offsets.
        canonTypography: isParallelTranslation
          ? null
          : buildCanonTypography(
              text || '',
              inlineLabel || '',
              section.heading || '',
              section.section_type === 'prayer' ||
                /^молитв/u.test(normalizeCanonCue(section.heading))
                  ? 'prayer'
                  : section.section_type || '',
              {
                initialOnlyFirstParagraph: !!section.grouped_prayer,
                traditionalLiturgicalNotes:
                  canon.slug === 'tri-sovmeshchennykh-kanona' &&
                  language === 'traditional',
                traditionalFullRefrain:
                  canon.slug === 'tri-sovmeshchennykh-kanona' &&
                  language === 'traditional' &&
                  section.traditional_full_refrain === true,
              }
            ),

        className: isParallelTranslation
          ? `${className} canon-parallel-translation`
          : className,

        sourceType: 'canon',

        sourceId: canon.id,

        anchorType: 'canon_section',

        anchorId: section.id,

        sourceTitle: getLocalizedField(canon, 'title', language) || t('reading.canon'),

        itemTitle:
          getLocalizedField(section, 'heading', language) ||
          getSectionLabel(section.section_type, t) ||
          t('reading.canonSection'),

        fullSaveType: section.section_type === 'prayer' ? 'prayer' : 'section',

        metadata: {
          slug: canon.slug || slug,

          variant: primaryVariant,

          ode_number: section.ode_number,

          section_type: section.display_section_type || section.section_type,

          heading:
            getLocalizedField(section, 'heading', language) ||
            section.display_heading ||
            section.heading ||
            '',

          language,
        },
      };
    };

    displaySections.forEach((section) => {
      const church = section.text?.content?.trim() || '';

      const russian = section.text?.translation?.trim() || '';

      const ukrainian = section.text?.translation_uk?.trim() || '';

      const traditional = section.text?.traditional_content?.trim() || '';

      const effectiveSectionType = section.display_section_type || section.section_type;

      const effectiveHeading =
        getLocalizedField(section, 'heading', language) ||
        section.display_heading ||
        section.heading ||
        '';

      const displaySection = {
        ...section,

        section_type: effectiveSectionType,

        heading: effectiveHeading,
      };

      const label = effectiveHeading || getSectionLabel(effectiveSectionType, t);

      const blocks = [];

      if (showTraditional && traditional) {
        blocks.push(
          makeBlock({
            section: displaySection,
            text: traditional,
            language: 'traditional',
            className: 'canon-church',
            // The traditional source already contains all rubrics, and
            // heading-only sections mark the ode boundaries. Avoid printing
            // the generic "Текст" label before each prayer paragraph.
            label: canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label,
            inlineLabel: '',
          })
        );
      }

      if (showChurch && church) {
        blocks.push(
          makeBlock({
            section,

            text: church,

            language: 'church',

            className: `canon-church canon-${effectiveSectionType}`,

            label: '',

            inlineLabel: getCanonInlineLabel(displaySection, church, t),
          })
        );
      }

      if (showUkrainian) {
        const localized = ukrainian || russian || church;
        const localizedLanguage = ukrainian ? 'ukrainian' : russian ? 'russian' : 'church';

        if (localized) {
          blocks.push(
            makeBlock({
              section,

              text: localized,

              language: localizedLanguage,

              className:
                localizedLanguage === 'church'
                  ? `canon-church canon-${effectiveSectionType}`
                  : `canon-russian canon-${effectiveSectionType}`,

              label: '',

              // Standalone localized tabs need the same Irmos/Refrain/etc.
              // labels as the Church Slavonic tab.
              inlineLabel: getCanonInlineLabel(displaySection, localized, t),
            })
          );
        }
      }

      if (showRussian && russian) {
        blocks.push(
          makeBlock({
            section,

            text: russian,

            language: 'russian',

            className: `canon-russian canon-${effectiveSectionType}`,

            label: '',

            // Show standalone RU rubrics, but keep the CS + RU translation
            // visually secondary without repeating the source headings.
            inlineLabel: viewMode === MODE_RUSSIAN
              ? getCanonInlineLabel(displaySection, russian, t)
              : '',
          })
        );
      }

      const showStandaloneHeading = effectiveSectionType === 'other' && !!effectiveHeading;

      // Combined Three Canons include real source headings (ode, kontakion,
      // ikos, prayer). Keep them in the standalone Russian tab as well.
      const isStructuredCombinedCanon = Array.isArray(canon.traditional_sections);
      if (!blocks.length &&
        (!showStandaloneHeading ||
          (viewMode === MODE_RUSSIAN && !isStructuredCombinedCanon))) {
        return;
      }

      const odeNumber = section.ode_number ? Number(section.ode_number) : null;

      let sectionTitle = '';

      if (odeNumber && odeNumber !== previousOde) {
        sectionTitle = t('reading.ode', {number: odeNumber});

        previousOde = odeNumber;
      } else if (!odeNumber) {
        previousOde = null;

        if (showStandaloneHeading) {
          sectionTitle = effectiveHeading;
        }
      }

      sections.push({
        className: canon.slug === 'tri-sovmeshchennykh-kanona'
          ? viewMode === MODE_TRADITIONAL
            ? sectionTitle
              ? 'canon-section three-combined-canon three-combined-traditional three-combined-heading'
              : effectiveSectionType === 'refrain'
                ? 'canon-section three-combined-canon three-combined-traditional three-combined-paragraph three-combined-refrain'
                : 'canon-section three-combined-canon three-combined-traditional three-combined-paragraph'
            : 'canon-section three-combined-canon'
          : 'canon-section',

        progressAnchorId: Number(section.id),

        trackProgress: true,

        title: sectionTitle,

        rows: blocks.map((block) => ({
          layout: 'stack',

          blocks: [block],
        })),
      });
    });

    // RU and CS+RU remain accessible. A missing or partial translation
    // is replaced with ONE message; no individual translated verse leaks.
    if (!hasRussianTranslation &&
      (viewMode === MODE_RUSSIAN || viewMode === MODE_BOTH)) {
      if (viewMode === MODE_RUSSIAN) sections.length = 0;
      sections.unshift({
        className: 'canon-translation-notice',
        progressAnchorId: 0,
        trackProgress: false,
        title: '',
        rows: [{
          layout: 'stack',
          blocks: [{
            id: nextBlockId++,
            text: 'Нет текста этого перевода.',
            className: 'canon-russian',
            metadata: {language: 'russian'},
          }],
        }],
      });
    }

    const unavailableMode =
      viewMode === MODE_TRADITIONAL && !hasTraditionalTranslation
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
            text: 'Те́кстъ въ традиціо́нномъ начерта́ніи отсꙋ́тствꙋетъ.',
            className: 'akathist-church',
            metadata: {language: unavailableMode},
          }],
        }],
      });
    }

    const wholeSaved = savedItemsRef.current.find(
      (item) =>
        item.anchor_type === 'canon' &&
        Number(item.anchor_id) === Number(canon.id) &&
        item.save_type === 'canon'
    );

    return {
      title: getLocalizedField(canon, 'title', language) || title || t('reading.canon'),

      description: getLocalizedField(canon, 'description', language) || canon.tone || '',

      action: {
        key: `canon:${canon.id}`,

        label: wholeSaved ? t('common.inFavorites') : t('common.addToFavorites'),

        active: !!wholeSaved,

        savedItemId: wholeSaved?.id || null,

        highlightContent: true,
      },

      viewSwitcher: {
        activeKey: viewMode,
        options: buildReaderLanguageOptions({
          hasRussian: true,
          hasTraditional: true,
        }),
      },

      progressAnchorType: 'canon_section',

      savedItems: normalizedSaved,

      sections,
    };
  }, [
    canon,
    title,
    slug,
    displaySections,
    primaryVariant,
    savedItems,
    viewMode,
    hasRussianTranslation,
    hasUkrainianTranslation,
    hasTraditionalTranslation,
    language,
    t,
  ]);

  const readerProgress = useMemo(() => {
    if (!savedProgress) {
      return null;
    }

    const belongsToVariant = activeSections.some(
      (section) => Number(section.id) === Number(savedProgress.anchor_id)
    );

    return belongsToVariant ? savedProgress : null;
  }, [activeSections, savedProgress]);

  const openReaderMenu = () => {
    setBookmarkPosition(getCurrentProgress());
    setStablePosition(getStableProgress());
    setReaderMenuVisible(true);
  };

  const bookmarkSection = bookmarkPosition
    ? activeSections.find((section) => Number(section.id) === Number(bookmarkPosition.anchorId))
    : null;

  const bookmarkConfig =
    canon && bookmarkPosition && bookmarkSection
      ? {
          sourceType: 'canon',
          sourceId: Number(canon.id || canonId),
          sourceTitle: getLocalizedField(canon, 'title', language) || title || t('reading.canon'),
          itemTitle:
            getLocalizedField(bookmarkSection, 'heading', language) ||
            getSectionLabel(
              bookmarkSection.display_section_type || bookmarkSection.section_type,
              t
            ) ||
            t('reading.canonPlace'),
          position: bookmarkPosition,
          metadata: {
            slug: canon.slug || slug,
            variant: primaryVariant,
            ode_number: bookmarkSection.ode_number,
            section_type: bookmarkSection.display_section_type || bookmarkSection.section_type,
          },
        }
      : null;

  if (loading || (canon && !progressReady)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />

        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error || !canon) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || t('reading.canonNotFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <SelectableDocumentReader
        ref={readerRef}
        documentData={documentData}
        savedProgress={readerProgress}
        focusTarget={focusTarget}
        topContentInset={headerHeight}
        bottomContentInset={90}
        onReadingScroll={handleReadingScroll}
        onNativeReadingScroll={handleNativeReadingScroll}
        onProgress={scheduleSave}
        onAction={handleAction}
        onViewModeChange={changeViewMode}
        onReady={() => readerRef.current?.applyAppearance(appearance)}
      />

      <ReaderBookmarkMenu
        visible={readerMenuVisible}
        onClose={() => setReaderMenuVisible(false)}
        navigation={navigation}
        bookmark={bookmarkConfig}
        appearance={appearance}
        onAppearanceChange={changeAppearance}
        onAppearanceReset={resetAppearance}
        canReturnToProgress={!!stablePosition}
        onReturnToProgress={() => {
          readerRef.current?.goToProgress(stablePosition);
          setReaderMenuVisible(false);
        }}
      />

      <FixedSectionHeader
        gradientColor={resolveReaderAppearance(appearance).background}
        onHeaderHeightChange={setHeaderHeight}
        title={getLocalizedField(canon, 'title', language) || title || t('reading.canon')}
        navigation={navigation}
        topInset={insets.top}
        showTitle
        compactReading
        readingHidden={readingChromeHidden}
        showMenu
        onMenuPress={openReaderMenu}
        languageSwitcher={documentData.viewSwitcher}
        onLanguageChange={(mode) => readerRef.current?.changeViewMode(mode)}
      />

      <BottomNav navigation={navigation} active={null} readingHidden={readingChromeHidden} />
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
