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
  getExplicitReaderLanguageModePreference,
  saveReaderLanguageModePreference,
} from '../services/readerPreferences';
import {READER_LANGUAGE_MODES} from '../services/readerLanguageModes';
import {isDarkReaderBackground, resolveReaderAppearance} from '../services/scopedReaderAppearance';
import {buildHoursDocument, getOfflineHoursText, getHoursLanguageAvailability} from '../services/hoursDocument';
import {lookupLocalizedHoursEntry} from '../data/hoursLocalization';
import {useLanguage} from '../context/LanguageContext';

const VALID_MODES = [
  READER_LANGUAGE_MODES.CHURCH,
  READER_LANGUAGE_MODES.RUSSIAN,
  READER_LANGUAGE_MODES.BOTH,
  READER_LANGUAGE_MODES.TRADITIONAL,
];

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

  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.CHURCH);
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
    const availableTraditional =
      entryId === 'ordinary-1' || entryId === 'ordinary-3' ||
      getHoursLanguageAvailability(getOfflineHoursText(entryId)).hasTraditional;
    setViewMode(traditional && availableTraditional
      ? READER_LANGUAGE_MODES.TRADITIONAL
      : READER_LANGUAGE_MODES.CHURCH);
    if (entryId) {
      Promise.all([
        getExplicitReaderLanguageModePreference({sourceType: 'hours', sourceId: entryId}),
        getReaderLanguageModePreference({sourceType: 'hours', sourceId: entryId}),
      ])
        .then(([explicit, defaultMode]) => {
          const selected = explicit ||
            (traditional && availableTraditional
              ? READER_LANGUAGE_MODES.TRADITIONAL : defaultMode);
          if (active && VALID_MODES.includes(selected)) setViewMode(selected);
        })
        .catch((error) => console.warn('[hours] reader mode:', error?.message || error));
    }
    return () => {active = false;};
  }, [entryId, traditional]);

  const handleViewModeChange = (nextMode) => {
    if (!VALID_MODES.includes(nextMode)) return;
    setViewMode(nextMode);
    if (entryId) {
      saveReaderLanguageModePreference({
        sourceType: 'hours',
        sourceId: entryId,
        mode: nextMode,
      }).catch((error) => console.warn('[hours] save reader mode:', error?.message || error));
    }
  };

  const content = useMemo(() => getOfflineHoursText(entryId), [entryId]);
  // Actions belong beside individual prayer texts, never on Hours dropdowns.
  const documentData = useMemo(() => entry
    ? buildHoursDocument({entry, content, viewMode})
    : null, [entry, content, viewMode]);
  const readerBackground = resolveReaderAppearance(appearance).background;

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

      {((documentData?.sections?.length && content?.sections?.length) ||
        (entryId === 'ordinary-1' && documentData?.available?.hasTraditional &&
          documentData?.sections?.length)) ? (
        <SelectableDocumentReader
          ref={readerRef}
          documentData={documentData}
          focusTarget={linkFocusTarget}
          savedProgress={progressReady ? savedProgress : null}
          topContentInset={headerHeight}
          bottomContentInset={90}
          onReadingScroll={handleReadingScroll}
          onNativeReadingScroll={handleNativeReadingScroll}
          onProgress={scheduleSave}
          onViewModeChange={handleViewModeChange}
          onReady={() => readerRef.current?.applyAppearance(appearance)}
        />
      ) : (
        <View style={[styles.center, {paddingTop: headerHeight}]}>
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
        onHeaderHeightChange={setHeaderHeight}
        title={entry.title}
        titleTextStyle={titleStyle}
        navigation={navigation}
        topInset={insets.top}
        showTitle
        compactReading
        readingHidden={readingChromeHidden}
        showMenu
        onMenuPress={() => setAppearanceVisible(true)}
        languageSwitcher={documentData?.viewSwitcher}
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
