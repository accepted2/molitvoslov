import React, {useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import SelectableDocumentReader from '../components/reader/SelectableDocumentReader';
import {ReaderAppearanceSheet} from '../components/reader/ReaderAppearanceSheet';
import {shareContent} from '../services/contentSharing';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {useReadingChrome} from '../hooks/useReadingChrome';
import {useScopedReaderAppearance} from '../hooks/useScopedReaderAppearance';
import {useReadingProgress} from '../hooks/useReadingProgress';
import {
  getReaderLanguageModePreference,
  getReadingSettings,
  DEFAULT_READING_SETTINGS,
  saveReaderLanguageModePreference,
} from '../services/readerPreferences';
import {READER_LANGUAGE_MODES} from '../services/readerLanguageModes';
import {isDarkReaderBackground, resolveReaderAppearance} from '../services/scopedReaderAppearance';
import {buildHoursDocument, getOfflineHoursText} from '../services/hoursDocument';
import {lookupLocalizedHoursEntry} from '../data/hoursLocalization';
import {useLanguage} from '../context/LanguageContext';

const VALID_MODES = [
  READER_LANGUAGE_MODES.CHURCH,
  READER_LANGUAGE_MODES.RUSSIAN,
  READER_LANGUAGE_MODES.BOTH,
  READER_LANGUAGE_MODES.TRADITIONAL,
];

// HOURS_FIRST_OPEN_FAST_20261116:
  // Keep at most four prepared First Hour variants for this offline session.
  // Switching back to a previously opened language avoids reprocessing Psalms.
  // Content/entry identity checks prevent stale results when the source changes.
  const FIRST_HOUR_DOCUMENT_CACHE = new Map();
  const buildCachedHoursDocument = ({entry, content, viewMode}) => {
    if (entry.id !== 'ordinary-1') {
      return buildHoursDocument({entry, content, viewMode});
    }
    const saved = FIRST_HOUR_DOCUMENT_CACHE.get(viewMode);
    if (saved && saved.entry === entry && saved.content === content) return saved.document;
    const document = buildHoursDocument({entry, content, viewMode});
    FIRST_HOUR_DOCUMENT_CACHE.set(viewMode, {entry, content, document});
    return document;
  };

  export const HoursReadingScreen = ({route, navigation}) => {
  const {language, t} = useLanguage();
  const traditional = language === 'csl_traditional';
  const titleStyle = traditional ? {fontFamily:'Ponomar',fontWeight:'400'} : null;
  const entry = useMemo(
    () => lookupLocalizedHoursEntry(route.params?.entryId, language),
    [route.params?.entryId, language]
  );
  const entryId = entry?.id || null;
  const anchorId=Number(route.params?.anchorId);
  const linkFocusTarget=useMemo(() => Number.isInteger(anchorId)&&anchorId>0
    ? {anchorType:'hours_row',anchorId} : null,[anchorId]);
  const insets = useSafeAreaInsets();
  const readerRef = useRef(null);
  // HOURS_NONBLOCKING_PROGRESS_20261116
  const hoursStartedRef = useRef(Date.now());
  const hoursWebViewReadyRef = useRef(null);
  const hoursRestoredRef = useRef(null);
  const hoursSwitchedRef = useRef(false);
  const hoursSwitchAtRef = useRef(0);

  const hoursHeaderHeightRef = useRef(insets.top + 56);
  const handleHoursHeaderHeight = (height) => {
    if (!Number.isFinite(Number(height)) || Number(height) <= 0) return;
    hoursHeaderHeightRef.current = Number(height);
    readerRef.current?.setTopContentInset(Number(height));
  };
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  // Resolve locally stored language and reading settings before creating the
  // expensive WebView. Otherwise the First Hour opens with the wrong language
  // and immediately parses the complete document a second time.
  const [initialReaderState, setInitialReaderState] = useState(null);
  const initialReaderReady = initialReaderState?.entryId === entryId;
  const viewMode = initialReaderReady
    ? initialReaderState.mode : READER_LANGUAGE_MODES.CHURCH;
  const initialReadingSettings = initialReaderReady
    ? initialReaderState.settings : null;
  const {readingChromeHidden, handleReadingScroll, handleNativeReadingScroll} = useReadingChrome();
  const {appearance, changeAppearance, resetAppearance} =
    useScopedReaderAppearance('hours', entryId);
  const {savedProgress, progressReady, scheduleSave} = useReadingProgress({
    sourceType: 'hours',
    sourceId: entry?.sourceId || null,
  });

  useEffect(() => {
    readerRef.current?.applyAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    let active = true;
    const languageStartedAt = Date.now();
    if (entryId) {
      Promise.all([
        getReaderLanguageModePreference({sourceType: 'hours', sourceId: entryId})
          .catch(error => {
            console.warn('[hours] reader mode:', error?.message || error);
            return null;
          }),
        getReadingSettings().catch(error => {
          console.warn('[hours] reading settings:', error?.message || error);
          return DEFAULT_READING_SETTINGS;
        }),
      ]).then(([saved, settings]) => {
        if (!active) return;
        const mode = VALID_MODES.includes(saved) ? saved
          : (VALID_MODES.includes(settings?.defaultMode)
            ? settings.defaultMode : READER_LANGUAGE_MODES.CHURCH);
        console.warn('[HOURS_STARTUP_20261116] languageAndSettingsMs=' +
          (Date.now() - languageStartedAt) + ' entry=' + entryId);
        setInitialReaderState({entryId, mode, settings});
      });
    }
    return () => {active = false;};
  }, [entryId]);

  const handleViewModeChange = (nextMode) => {
    if (!initialReaderReady || !VALID_MODES.includes(nextMode) || nextMode === viewMode) return;
    hoursSwitchedRef.current = true;
    hoursSwitchAtRef.current = Date.now();
    console.warn('[HOURS_STARTUP_20261116] modeChangeRequest=' + nextMode);
    console.warn('[HOURS_PIPELINE_20261116] MODE_REQUEST','t='+Date.now(),'mode='+nextMode);
    setInitialReaderState(previous => previous?.entryId === entryId
      ? {...previous, mode: nextMode} : previous);
    if (entryId) {
      saveReaderLanguageModePreference({
        sourceType: 'hours',
        sourceId: entryId,
        mode: nextMode,
      }).catch((error) => console.warn('[hours] save reader mode:', error?.message || error));
    }
  };

  // HOURS_PIPELINE_20261116 - instrumentation only.
  const content = useMemo(() => getOfflineHoursText(entryId), [entryId]);
  const documentData = useMemo(() => {
    const started=Date.now();
    console.warn('[HOURS_PIPELINE_20261116] BUILD_START','t='+started,'mode='+viewMode,'entry='+entryId);
    const result = entry && (entryId !== 'ordinary-1' || initialReaderReady)
      ? buildCachedHoursDocument({entry, content, viewMode}) : null;
    console.warn('[HOURS_PIPELINE_20261116] BUILD_DONE','t='+Date.now(),
      'durationMs='+(Date.now()-started),'mode='+viewMode,'entry='+entryId);
    return result;
  }, [entry, content, viewMode, initialReaderReady]);
  useEffect(() => {
    if(entryId==='ordinary-1')console.warn('[HOURS_PIPELINE_20261116] REACT_COMMIT',
      't='+Date.now(),'mode='+viewMode);
  },[documentData]);
  useEffect(() => {
    if(entryId!=='ordinary-1')return undefined;
    let last=Date.now();
    const timer=setInterval(()=>{
      const now=Date.now(), lag=now-last-120;
      if(lag>400)console.warn('[HOURS_PIPELINE_20261116] JS_EVENT_LOOP_LAG',
        't='+now,'lagMs='+lag);
      last=now;
    },120);
    return ()=>clearInterval(timer);
  },[entryId]);
  const readerBackground = resolveReaderAppearance(appearance).background;
  // First Hour must not wait for the entire reading-progress SQLite query.
  // Restore the position in the existing WebView, never by changing its HTML.
  const readerReady = initialReaderReady &&
    (entryId === 'ordinary-1' || progressReady);
  const restoreFirstHourPosition = () => {
    if (entryId !== 'ordinary-1' ||
        hoursWebViewReadyRef.current !== entryId ||
        !progressReady || !savedProgress || linkFocusTarget ||
        hoursSwitchedRef.current || hoursRestoredRef.current === entryId) return;
    const anchorId = Number(savedProgress.anchor_id ?? savedProgress.anchorId);
    if (!Number.isInteger(anchorId) || anchorId <= 0) return;
    hoursRestoredRef.current = entryId;
    readerRef.current?.goToProgress({
      anchorId, offset: Math.max(0, Number(savedProgress.offset || 0))
    });
    console.warn('[HOURS_STARTUP_20261116] restoredProgressMs=' +
      (Date.now() - hoursStartedRef.current) + ' entry=' + entryId);
  };
  useEffect(() => {
    if (entryId) console.warn('[HOURS_STARTUP_20261116] progressReadyMs=' +
      (progressReady ? Date.now() - hoursStartedRef.current : 'pending') +
      ' entry=' + entryId);
    restoreFirstHourPosition();
  }, [entryId, progressReady, savedProgress, linkFocusTarget]);
  useEffect(() => {
    hoursStartedRef.current = Date.now();
    hoursWebViewReadyRef.current = null;
    hoursRestoredRef.current = null;
    hoursSwitchedRef.current = false;
    hoursSwitchAtRef.current = 0;
  }, [entryId]);

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyHeading, titleStyle]}>{t('hours.notFound')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, {backgroundColor: readerBackground}]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        style={isDarkReaderBackground(readerBackground) ? 'light' : 'dark'}
      />

      {!readerReady ? (
        <View style={[styles.center, {paddingTop: hoursHeaderHeightRef.current}]}>
          <Text style={[styles.emptyText, {
            color: isDarkReaderBackground(readerBackground) ? '#F4E7D2' : '#80634B',
          }]}>
            Подготовка чтения…
          </Text>
        </View>
      ) : ((documentData?.sections?.length && content?.sections?.length) ||
        (entryId === 'ordinary-1' && documentData?.available?.hasTraditional &&
          documentData?.sections?.length)) ? (
        <SelectableDocumentReader
          ref={readerRef}
          documentData={documentData}
          focusTarget={linkFocusTarget}
          savedProgress={entryId === 'ordinary-1' ? null : savedProgress}
          initialReadingSettings={initialReadingSettings}
          topContentInset={insets.top + 56}
          bottomContentInset={90}
          onReadingScroll={handleReadingScroll}
          onNativeReadingScroll={handleNativeReadingScroll}
          onProgress={scheduleSave}
          onViewModeChange={handleViewModeChange}
          onReady={() => {
            hoursWebViewReadyRef.current = entryId;
            console.warn('[HOURS_PIPELINE_20261116] READER_READY','t='+Date.now(),'mode='+viewMode);
            console.warn('[HOURS_STARTUP_20261116] webViewReadyMs=' +
              (Date.now() - hoursStartedRef.current) +
              ' mode=' + viewMode + ' entry=' + entryId +
              (hoursSwitchAtRef.current ?
                ' switchMs=' + (Date.now() - hoursSwitchAtRef.current) : ''));
            readerRef.current?.applyAppearance(appearance);
            readerRef.current?.setTopContentInset(hoursHeaderHeightRef.current);
            restoreFirstHourPosition();
          }}
        />
      ) : (
        <View style={[styles.center, {paddingTop: hoursHeaderHeightRef.current}]}>
          <Text style={[styles.emptyHeading,
            {color: isDarkReaderBackground(readerBackground) ? '#F4E7D2' : '#533723'}, titleStyle]}>
            {entry.title}
          </Text>
          <Text style={[styles.emptyText,
            {color: isDarkReaderBackground(readerBackground) ? '#D0BA9C' : '#80634B'}, titleStyle]}>
            {t('hours.missingText')}
          </Text>
        </View>
      )}

      <ReaderAppearanceSheet
        onShare={() => shareContent({
          title:entry.title,
          linkOnly:true,
          screen:'HoursReading',params:{entryId},
        })}
        visible={appearanceVisible}
        onClose={() => setAppearanceVisible(false)}
        appearance={appearance}
        onChange={changeAppearance}
        onReset={resetAppearance}
      />

      <FixedSectionHeader
        gradientColor={readerBackground}
        onHeaderHeightChange={handleHoursHeaderHeight}
        title={entry.title}
        titleTextStyle={titleStyle}
        navigation={navigation}
        topInset={insets.top}
        showTitle
        compactReading
        readingHidden={readingChromeHidden}
        showMenu
        onMenuPress={() => setAppearanceVisible(true)}
        languageSwitcher={readerReady ? documentData?.viewSwitcher : null}
        onLanguageChange={(mode) => {
          if (readerRef.current) readerRef.current.changeViewMode(mode);
          else handleViewModeChange(mode);
        }}
      />

      <BottomNav navigation={navigation} active={null} readingHidden={readingChromeHidden} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#FFF4DE'},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 15,
  },
  emptyHeading: {
    fontSize: 19,
    fontFamily: 'serif',
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
});
