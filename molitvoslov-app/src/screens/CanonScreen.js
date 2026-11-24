import React, {useEffect, useMemo, useRef, useState} from 'react';

import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {contentApi as api} from '../services/contentApi';
import {resolveSharedReaderRoute} from '../services/sharedReaderRoute';

import {useReadingProgress} from '../hooks/useReadingProgress';

import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';

import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';
import {ReaderBookmarkMenu} from '../components/reader/ReaderBookmarkMenu';
import {shareContent, documentShareText} from '../services/contentSharing';

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

import {isDarkReaderBackground, resolveReaderAppearance} from '../services/scopedReaderAppearance';
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


/* PENITENTIAL_TRADITIONAL_LABELS_20261117
   Presentation-only headings for the supplied penitential canon's
   Church-Slavonic-script variant. These labels are NOT saved to content. */
const PENITENTIAL_TRADITIONAL_SLUG = 'kanon-pokayannyy-ko-gospodu-iisusu-khristu';
const PENITENTIAL_TRADITIONAL_ODE = {
  1: 'а҃', 2: 'в҃', 3: 'г҃', 4: 'д҃', 5: 'є҃',
  6: 'ѕ҃', 7: 'з҃', 8: 'и҃', 9: 'ѳ҃',
};
const PENITENTIAL_TRADITIONAL_LABEL = {
  irmos: 'І҆рмо́съ:',
  refrain: 'Припѣ́въ:',
  sedalen: 'Сѣда́ленъ, гла́съ ѕ҃-й:',
  theotokion: 'Бг҃оро́диченъ:',
  kontakion: 'Конда́къ:',
  ikos: 'И҆́косъ:',
  svetilen: 'Свѣти́ленъ:',
  prayer: 'Моли́тва:',
};
const getPenitentialTraditionalLabel = (section, type) => {
  if (section?.suppress_inline_label) return '';
  // Ordinary troparia, Glory and And now have no separate header label:
  // their own source text contains the full opening doxology.
  return PENITENTIAL_TRADITIONAL_LABEL[type] || '';
};


/* THEOTOKOS_TRADITIONAL_RUBRICS_20261117
   UI-only rubrics for the Paraklesis canon's traditional-script tab.
   Do not mutate liturgical source or text offsets. */
const THEOTOKOS_TRADITIONAL_SLUG = 'kanon-molebnyy-ko-presvyatoy-bogoroditse';
const THEOTOKOS_TRADITIONAL_ODE = {
  1: 'а҃', 2: 'в҃', 3: 'г҃', 4: 'д҃', 5: 'є҃',
  6: 'ѕ҃', 7: 'з҃', 8: 'и҃', 9: 'ѳ҃',
};
const THEOTOKOS_TRADITIONAL_TITLE =
  'Канѡ́нъ моле́бный ко Прест҃ѣ́й Бцⷣѣ,\u00A0пое́мый во всѧ́кой ско́рби дꙋше́внѣй и҆ ѡ҆бстоѧ́нїи';
const theotokosNormalizeHeading = (heading) =>
  String(heading || '').normalize('NFD')
    .replace(/[\u0300-\u036f\u0483-\u0487]/g, '')
    .replace(/ё/g, 'е').replace(/a/g, 'а').toLowerCase().trim();
const getTheotokosTraditionalHeading = (heading) => {
  const h = theotokosNormalizeHeading(heading);
  if (/^(?:канон|канѡн)/u.test(h) && /феостирик|ѳеостирик/u.test(h))
    return 'Канѡ́нъ. Творе́нїе Ѳеостирі́кта мона́ха. Гла́съ и҃-й';
  if (/^(?:псалом|ѱалом)\s*50\b/u.test(h))
    return 'Ѱало́мъ н҃';
  if (/^стихир/u.test(h) && /глас/u.test(h))
    return 'Стїхи́ры, гла́съ в҃-й';
  if (/^кондак/u.test(h) && /глас/u.test(h))
    return 'Конда́къ, гла́съ ѕ҃-й';
  if (/^молитва\s+иная/u.test(h))
    return 'Моли́тва и҆на́ѧ ко Прест҃ѣ́й Бцⷣѣ';
  if (/^молитва\s+ко/u.test(h))
    return 'Моли́тва ко Прест҃ѣ́й Бцⷣѣ';
  if (/^к\s+богородице\s+прилежно/u.test(h))
    return 'КЪ Бцⷣе прилѣ́жнѡ ны́нѣ притеце́мъ';
  if (/^песнь\s*([1-9])/u.test(h)) {
    const match = /^песнь\s*([1-9])/u.exec(h);
    return 'Пѣ́снь ' + (THEOTOKOS_TRADITIONAL_ODE[Number(match[1])] || match[1]);
  }
  return heading || '';
};
const getTheotokosTraditionalInlineLabel = (section, sectionType) => {
  if (section?.suppress_inline_label) return '';
  const h = theotokosNormalizeHeading(section?.heading);
  switch (sectionType) {
    case 'irmos':
      return 'І҆рмо́съ:';
    case 'refrain':
      return 'Припѣ́въ:';
    case 'theotokion':
      return 'Бг҃оро́диченъ:';
    case 'troparion':
      // Ordinary troparia have no printed "Тропарь" heading.
      if (/тропар/u.test(h) && /богородиц/u.test(h) && /глас/u.test(h))
        return 'Тропа́рь Бг҃оро́дице, гла́съ д҃-й:';
      if (/тропар/u.test(h) && /глас/u.test(h))
        return 'Тропа́рь, гла́съ в҃-й:';
      return '';
    case 'kontakion':
      return /глас/u.test(h)
        ? 'Конда́къ, гла́съ ѕ҃-й:' : 'Конда́къ:';
    case 'ikos':
      return 'И҆́косъ:';
    case 'sedalen':
      return 'Сѣда́ленъ:';
    case 'svetilen':
      return 'Свѣти́ленъ:';
    case 'prayer':
      if (/молитва\s+иная/u.test(h))
        return 'Моли́тва и҆на́ѧ ко Прест҃ѣ́й Бцⷣѣ:';
      if (/молитва\s+ко/u.test(h))
        return 'Моли́тва ко Прест҃ѣ́й Бцⷣѣ:';
      return 'Моли́тва:';
    case 'stichira':
      return 'Стїхи́ра:';
    // The doxologies are already present at the start of the source text.
    case 'glory':
    case 'glory_now':
    case 'now':
    default:
      return '';
  }
};


/* GUARDIAN_ANGEL_TRADITIONAL_LABELS_20261117: Guardian Angel canon, traditional variant only.
   Labels and headings are UI presentation; text and offsets remain unchanged. */
const isGuardianAngelCanon = (canon) => {
  const title = String(canon?.title || '').toLocaleLowerCase('ru-RU');
  return title.includes('ангел') && title.includes('хранител');
};
const GUARDIAN_ANGEL_ODE_NUMERALS = {
  1: 'а҃', 2: 'в҃', 3: 'г҃', 4: 'д҃', 5: 'є҃',
  6: 'ѕ҃', 7: 'з҃', 8: 'и҃', 9: 'ѳ҃',
};
const GUARDIAN_ANGEL_TRAD_TITLE = 'Канѡ́нъ А҆́гг҃лꙋ-Храни́телю';
const angelHeadingNormalized = (source) =>
  String(source || '').normalize('NFD')
    .replace(/[\u0300-\u036f\u0483-\u0487]/g, '')
    .replace(/ё/g,'е').replace(/a/g, 'а')
    .toLowerCase().trim();
const guardianTraditionalHeading = (source) => {
  const h = angelHeadingNormalized(source);
  // Also catch the literal locale key BEFORE a legacy normalizer converts
  // Latin "a" to Cyrillic "а", which would hide "calendar.troparion".
  if (String(source || '').trim().toLowerCase() === 'calendar.troparion')
    return '';
  // GUARDIAN_ANGEL_TRADITIONAL_RUBRICS_V2_20261117: these are inline rubrics or cues, NOT heading sections.
  if (/^(?:слава(?:\s+и\s+ныне)?|и\s+ныне|ирмос|припев|иисусу|богородичен|бгородичен|calendar\.troparion)(?=$|[\s:,.])/u.test(h))
    return '';
  if (/^тропар(?:ь)?\s*$/u.test(h)) return '';
  if (/^тропар/u.test(h) && /глас/u.test(h) && /6/u.test(h))
    return 'Тропа́рь, гла́съ ѕ҃-й';
  if (/^канон/u.test(h) && /глас/u.test(h) && /8/u.test(h))
    return 'Канѡ́нъ, гла́съ и҃-й';
  if (/^седален/u.test(h) && /глас/u.test(h))
    return 'Сѣда́ленъ, гла́съ в҃-й';
  if (/^кондак/u.test(h) && /глас/u.test(h))
    return 'Конда́къ, гла́съ д҃-й';
  if (/^икос/u.test(h))
    return 'І҆́косъ';
  if (/^молитва/u.test(h) && /ангел/u.test(h))
    return 'Мл҃тва къ А҆́гг҃лꙋ-Храни́телю';
  const ode = /^песнь\s*([1-9])/u.exec(h);
  if (ode)
    return 'Пѣ́снь '+(GUARDIAN_ANGEL_ODE_NUMERALS[Number(ode[1])]||ode[1]);
  return source || '';
};
const guardianAngelTraditionalInlineLabel = (section, sectionType, tradText) => {
  if (section?.suppress_inline_label) return '';
  const h = angelHeadingNormalized(section?.heading);
  const source = String(tradText || '');
  // GUARDIAN_ANGEL_TRADITIONAL_RUBRICS_V2_20261117: handle backend's "other" and "troparion" aliases,
  // while keeping rubrics attached to their own text, not above as labels.
  if (/^(?:богородичен|бгородичен)/u.test(h))
    return 'Бг҃оро́диченъ:';
  if (/^(?:иисусу|иисусе|иису)/u.test(h) ||
      /гд[ⷭ҇]?и\s+і҆и҃се/u.test(source.slice(0,50)))
    return 'І҆и҃сꙋ:';
  if (/^ирмос/u.test(h)) return 'І҆рмо́съ:';
  if (/^припев/u.test(h)) return 'Припѣ́въ:';
  switch (sectionType) {
    case 'irmos': return 'І҆рмо́съ:';
    case 'refrain': return 'Припѣ́въ:';
    case 'theotokion': return 'Бг҃оро́диченъ:';
    case 'troparion':
      // Ordinary troparia carry NO "calendar.troparion" label.
      // Only the opening troparion has its own heading and tone.
      if (section?.ode_number) return '';
      return /тропар/u.test(h) && /глас\s*6/u.test(h)
        ? 'Тропа́рь, гла́съ ѕ҃-й:'
        : '';
    case 'sedalen':
      return /глас\s*2/u.test(h) ? 'Сѣда́ленъ, гла́съ в҃-й:' : 'Сѣда́ленъ:';
    case 'kontakion':
      return /глас\s*4/u.test(h) ? 'Конда́къ, гла́съ д҃-й:' : 'Конда́къ:';
    case 'ikos': return 'І҆́косъ:';
    case 'prayer': return ''; // A full standalone title is printed above the prayer.
    case 'glory':
    case 'now':
    default: return '';
  }
};

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
  const {canonId: incomingId, slug: incomingSlug, title,
    focusTarget: explicitFocusTarget = null, anchorId} = route.params || {};
  // Deep links pass only one segment; internal catalog navigation passes id
  // and slug separately. Resolve both cases against the bundled offline list.
  const {id: canonId, slug} = resolveSharedReaderRoute('canon', {
    id: incomingId, slug: incomingSlug,
  });
  const focusTarget = useMemo(() => explicitFocusTarget ||
    (Number(anchorId)>0 ? {anchorType:'canon_section',anchorId:Number(anchorId)} : null),
    [explicitFocusTarget,anchorId]);

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

      if (!slug) throw new Error('Ссылка не соответствует локальному канону');
      const response = await api.get(`canons/${slug}/`);
      setCanon(response.data);

      // Favorites are auxiliary. A SQLite/account error must not prevent a
      // public offline document from opening via a shared link.
      try {
        const saved = await getSavedItems({
          source_type: 'canon',
          source_id: response.data.id,
        });
        savedItemsRef.current = saved;
        setSavedItems(saved);
      } catch (savedError) {
        console.warn('[canon] favorites unavailable:', savedError?.message || savedError);
      }
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
    if(canon && String(actionKey||'').startsWith('canon-section:')){
      const id=Number(String(actionKey).split(':')[1]);
      const section=documentData?.sections?.find(item=>
        Number(item.progressAnchorId)===id && id>0);
      if(!section)return null;
      const existing=savedItemsRef.current.find(item=>
        item.anchor_type==='canon_section' &&
        Number(item.anchor_id)===id && item.save_type==='section');
      if(existing){
        await deleteSavedItem(existing.id);
        savedItemsRef.current=savedItemsRef.current.filter(item=>item.id!==existing.id);
        return {active:false,label:t('common.addToFavorites')};
      }
      const body=(section.rows||[]).flatMap(row=>
        (row.blocks||[]).map(block=>String(block.text||'').trim())).filter(Boolean).join('\n\n');
      if(!body)return null;
      const saved=await saveItem({
        save_type:'section',source_type:'canon',source_id:canon.id,
        anchor_type:'canon_section',anchor_id:id,
        source_title:getLocalizedField(canon,'title',language)||title||'Канон',
        item_title:section.title||'Часть канона',text:body,
        start_offset:0,end_offset:body.length,
        metadata:{slug:canon.slug||slug,variant:primaryVariant,language:viewMode},
      });
      savedItemsRef.current=[saved,...savedItemsRef.current];
      return {active:true,label:t('common.inFavorites'),savedItem:saved};
    }
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
      setSavedItems(savedItemsRef.current);

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
    setSavedItems(savedItemsRef.current);

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
    const isTheotokosTraditional =
      showTraditional && canon.slug === THEOTOKOS_TRADITIONAL_SLUG;
    const isGuardianAngelTraditional =
      showTraditional && isGuardianAngelCanon(canon);

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
        // CANON_PARALLEL_RU_BREAKS_NO_REFRAIN_LABEL_20261117: CS+RU also needs non-coloring linebreak ranges.
        canonTypography: buildCanonTypography(
              text || '',
              inlineLabel || '',
              section.heading || '',
              section.section_type === 'prayer' ||
                /^молитв/u.test(normalizeCanonCue(section.heading))
                  ? 'prayer'
                  : section.section_type || '',
              {
                parallelTranslation: isParallelTranslation,
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

    const isPenitentialTraditional =
      showTraditional && canon.slug === PENITENTIAL_TRADITIONAL_SLUG;
    displaySections.forEach((section, sectionIndex) => {
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
            className: isGuardianAngelTraditional
              ? 'canon-church canon-guardian-angel-traditional canon-' + effectiveSectionType
              : isTheotokosTraditional
              ? 'canon-church canon-theotokos-traditional canon-' + effectiveSectionType
              : isPenitentialTraditional
              ? 'canon-church canon-traditional-penitential canon-' + effectiveSectionType
              : 'canon-church',
            // PENITENTIAL_TRADITIONAL_LABELS_20261117: this canon uses the same inline rubric design
            // as the RU/CS reader, but with Church Slavonic orthography.
            // Never display untranslated locale keys (calendar.troparion).
            label: isGuardianAngelTraditional ? '' : isTheotokosTraditional ? '' : isPenitentialTraditional
              ? ''
              : (canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label),
            inlineLabel: isGuardianAngelTraditional
              ? guardianAngelTraditionalInlineLabel(displaySection, effectiveSectionType, traditional)
              : isTheotokosTraditional
              ? getTheotokosTraditionalInlineLabel(displaySection, effectiveSectionType)
              : isPenitentialTraditional
              ? getPenitentialTraditionalLabel(section, effectiveSectionType)
              : '',
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
        sectionTitle = isGuardianAngelTraditional
          ? 'Пѣ́снь ' + (GUARDIAN_ANGEL_ODE_NUMERALS[odeNumber] || String(odeNumber))
          : isTheotokosTraditional
          ? 'Пѣ́снь ' + (THEOTOKOS_TRADITIONAL_ODE[odeNumber] || String(odeNumber))
          : isPenitentialTraditional
          ? 'Пѣ́снь ' + (PENITENTIAL_TRADITIONAL_ODE[odeNumber] || String(odeNumber))
          : t('reading.ode', {number: odeNumber});

        previousOde = odeNumber;
      } else if (!odeNumber) {
        previousOde = null;

        if (showStandaloneHeading) {
          sectionTitle = isGuardianAngelTraditional
            ? guardianTraditionalHeading(effectiveHeading)
            : isTheotokosTraditional
            ? getTheotokosTraditionalHeading(effectiveHeading)
            : effectiveHeading;
        }
      }

      // CANON_RUSSIAN_NOW_GLORY_LINK_20261117: adjoining Glory / And now have no divider between them.
      const nextSection = displaySections[sectionIndex + 1];
      const nextSectionType = nextSection?.display_section_type || nextSection?.section_type;
      const isGloryBeforeNow =
        effectiveSectionType === 'glory' &&
        nextSectionType === 'now' &&
        Number(section.ode_number || 0) === Number(nextSection?.ode_number || 0);

      // GUARDIAN_ANGEL_FINAL_PRAYER_HEADING_20261117: the final prayer is a standalone section, not an
      // inline "Мл҃тва:" label. Do not affect RU, ordinary CS or other canons.
      if (
        isGuardianAngelTraditional &&
        effectiveSectionType === 'prayer' &&
        !odeNumber &&
        blocks.length
      ) {
        sectionTitle = 'Мл҃тва къ А҆́гг҃лꙋ-Храни́телю';
      }

      sections.push({
        className: ((canon.slug === 'tri-sovmeshchennykh-kanona'
          ? viewMode === MODE_TRADITIONAL
            ? sectionTitle
              ? 'canon-section three-combined-canon three-combined-traditional three-combined-heading'
              : effectiveSectionType === 'refrain'
                ? 'canon-section three-combined-canon three-combined-traditional three-combined-paragraph three-combined-refrain'
                : 'canon-section three-combined-canon three-combined-traditional three-combined-paragraph'
            : 'canon-section three-combined-canon'
          : 'canon-section') + (isGloryBeforeNow ? ' canon-glory-before-now' : '')) + (canon?.slug === 'tri-sovmeshchennykh-kanona' && (
    section?.section_type === 'prayer' ||
    section?.display_section_type === 'prayer' ||
    section?.grouped_prayer === true ||
    /^(?:молитв|его\s+же(?:,|\s))/u.test(
      String(section?.heading || '').normalize('NFD')
        .replace(/\p{M}/gu,'').trim().toLowerCase()
    )
  ) ? ' three-combined-closing-prayer' : ''),

        progressAnchorId: Number(section.id),

        trackProgress: true,

        title: sectionTitle,
        ...(sectionTitle && Number(section.id)>0 ? {
          action: {
            key:'canon-section:'+Number(section.id),
            active:savedItems.some(saved=>
              saved.anchor_type==='canon_section' &&
              Number(saved.anchor_id)===Number(section.id) &&
              saved.save_type==='section'),
          },
        } : {}),

        rows: blocks.map((block) => ({
          layout: 'stack',

          blocks: [block],
        })),
      });
      if (isGuardianAngelTraditional) {
        sections[sections.length - 1].className += ' canon-guardian-angel-traditional-section';
      }

      if (isTheotokosTraditional) {
        sections[sections.length - 1].className += ' canon-theotokos-traditional-section';
      }

      if (isPenitentialTraditional) {
        sections[sections.length - 1].className += ' canon-traditional-penitential-section';
      }
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
      title: isGuardianAngelTraditional
        ? GUARDIAN_ANGEL_TRAD_TITLE
        : isTheotokosTraditional
        ? THEOTOKOS_TRADITIONAL_TITLE
        : getLocalizedField(canon, 'title', language) || title || t('reading.canon'),
      // CANON_FLOWING_LONG_HEADER_JUSTIFIED_TRAD_TITLE_20261117: only the inner reader title is translated & justified.
      // CANON_HEADER_RIGHT_LANGUAGE_AND_BALANCED_TRAD_TITLE_20261117
      justifyTraditionalDocumentTitle: isTheotokosTraditional || isGuardianAngelTraditional,

      description: getLocalizedField(canon, 'description', language) || canon.tone || '',

      // CANON_HEADER_ONLY_ACTIONS_RUBRIC_40_20261117: only the fixed reading header has save/share actions.
      hideInlineActions: true,
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

  const readerBackground = resolveReaderAppearance(appearance).background;
  return (
    <View style={[styles.container, {backgroundColor: readerBackground}]}>
      <StatusBar style={isDarkReaderBackground(readerBackground) ? 'light' : 'dark'} translucent backgroundColor="transparent" />

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
        onSave={() => handleAction(`canon:${canon.id}`)}
        isSaved={!!documentData.action?.active}
        onShare={() => shareContent({
          title:getLocalizedField(canon,'title',language)||title||'Канон',
          linkOnly:true,
          screen:'Canon',params:{canonId,slug},
        })}
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
        gradientColor={readerBackground}
        onHeaderHeightChange={setHeaderHeight}
        title={getLocalizedField(canon, 'title', language) || title || t('reading.canon')}
        flowLongTitleWithLanguage
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
