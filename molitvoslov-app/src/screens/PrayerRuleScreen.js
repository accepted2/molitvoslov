import React, {useEffect, useMemo, useState} from 'react';

import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {contentApi as api} from '../services/contentApi';

import {useReadingProgress} from '../hooks/useReadingProgress';

import {getSavedItems} from '../services/savedItems';

import PrayerRuleReader from '../components/reader/PrayerRuleReader';

import {MemorialQuickSheet} from '../components/memorial/MemorialQuickSheet';

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
const MODE_TRADITIONAL = READER_LANGUAGE_MODES.TRADITIONAL;

export const PrayerRuleScreen = ({route, navigation}) => {
  const {language, t} = useLanguage();
  const {slug, focusTarget = null} = route.params;

  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const [rule, setRule] = useState(null);

  const [savedItems, setSavedItems] = useState([]);

  const [viewMode, setViewMode] = useState(MODE_CHURCH);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [memorialContext, setMemorialContext] = useState(null);

  const {savedProgress, progressReady, scheduleSave} = useReadingProgress({
    sourceType: 'prayer_rule',

    sourceId: rule?.id,
  });

  useEffect(() => {
    loadRule();
  }, [slug]);

  const hasRussianTranslation = useMemo(
    () =>
      (rule?.items || []).some(
        (item) => item.item_type === 'text' && !!item.text?.translation?.trim()
      ),
    [rule]
  );

  const hasUkrainianTranslation = useMemo(
    () =>
      (rule?.items || []).some(
        (item) => item.item_type === 'text' && !!item.text?.translation_uk?.trim()
      ),
    [rule]
  );

  useEffect(() => {
    if (!rule) {
      return;
    }

    setViewMode(
      getReaderModeForAppLanguage(language, {
        hasRussian: hasRussianTranslation,
        hasUkrainian: hasUkrainianTranslation,
      })
    );
  }, [language, rule, hasRussianTranslation, hasUkrainianTranslation]);

  const loadRule = async () => {
    try {
      setLoading(true);
      setError(null);
      setRule(null);
      setSavedItems([]);

      const response = await api.get(`prayer-rules/${slug}/`);

      const ruleData = response.data;

      setRule(ruleData);

      try {
        const saved = await getSavedItems({
          source_type: 'prayer_rule',

          source_id: ruleData.id,
        });

        setSavedItems(saved);
      } catch (savedError) {
        console.log(
          'Ошибка загрузки сохранённых фрагментов:',
          savedError.response?.data || savedError.message
        );
      }
    } catch (loadError) {
      console.log(
        'Ошибка загрузки молитвенного правила:',
        loadError.response?.data || loadError.message
      );

      setError(t('menu.prayerRuleLoadError'));
    } finally {
      setLoading(false);
    }
  };

  if (loading || (rule && !progressReady)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />

        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error || !rule) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || t('reading.prayerRuleNotFound')}</Text>
      </View>
    );
  }

  const viewSwitcher = null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <PrayerRuleReader
        rule={rule}
        savedItems={savedItems}
        savedProgress={savedProgress}
        focusTarget={focusTarget}
        viewMode={viewMode}
        viewSwitcher={viewSwitcher}
        topContentInset={headerHeight}
        memorialEnabled={slug === 'molitvy-utrennie'}
        onMemorialOpen={(context) => setMemorialContext(context || {})}
        onProgress={scheduleSave}
      />

      <MemorialQuickSheet
        visible={!!memorialContext}
        preferredKind={memorialContext?.kind || null}
        onClose={() => setMemorialContext(null)}
        onManage={() => navigation.navigate('Memorial')}
      />

      <FixedSectionHeader
        title={
          getLocalizedField(rule, 'name', language) ||
          t('reading.prayerRule')
        }
        navigation={navigation}
        topInset={insets.top}
        showTitle={false}
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
    alignItems: 'center',
    justifyContent: 'center',
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
