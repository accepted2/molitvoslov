import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppBackground} from '../components/layout/AppBackground';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';

import {useFocusEffect} from '@react-navigation/native';

import {contentApi as api} from '../services/contentApi';

import {useReadingProgress} from '../hooks/useReadingProgress';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';

import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';

import ExpandablePrayerBlock from '../components/reader/ExpandablePrayerBlock';

import {colors, radius, spacing} from '../theme';
import {BottomNav} from '../components/navigation/BottomNav';
import {SaveHeartIcon} from '../components/icons/SaveHeartIcon';
import {useLanguage} from '../context/LanguageContext';
import {getLocalizedField} from '../services/localizedContent';

export default function PsalterScreen({navigation}) {
  const {language, t} = useLanguage();
  const [psalter, setPsalter] = useState(null);

  const [savedItems, setSavedItems] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const {savedProgress, reloadProgress} = useReadingProgress({
    sourceType: 'psalter',

    sourceId: psalter?.id,
  });

  const listRef = useRef(null);
  const afterPrayersYRef = useRef(0);

  useEffect(() => {
    loadPsalter();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (psalter?.id) {
        reloadProgress();

        loadSavedKathismas(psalter.id);
      }
    }, [psalter?.id, reloadProgress])
  );

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const loadSavedKathismas = async (psalterId) => {
    try {
      const saved = await getSavedItems({
        source_type: 'psalter',

        source_id: psalterId,

        anchor_type: 'kathisma',
      });

      setSavedItems(saved);
    } catch (err) {
      console.log('Ошибка загрузки сохранённых кафизм:', err);
    }
  };

  const loadPsalter = async () => {
    try {
      setLoading(true);

      setError(null);

      const response = await api.get('psalters/psaltir/');

      const data = response.data;

      setPsalter(data);

      await loadSavedKathismas(data.id);
    } catch (err) {
      console.log('Ошибка загрузки Псалтири:', err);

      setError(t('menu.psalterLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const openKathisma = (kathisma) => {
    navigation.navigate('Kathisma', {
      kathismaNumber: kathisma.number,

      kathismaTitle:
        getLocalizedField(kathisma, 'title', language) ||
        t('psalter.kathisma', {number: kathisma.number}),
    });
  };

  const getSavedKathisma = (kathismaId) =>
    savedItems.find(
      (item) => item.anchor_type === 'kathisma' && Number(item.anchor_id) === Number(kathismaId)
    );

  const toggleKathismaSaved = async (kathisma) => {
    const existing = getSavedKathisma(kathisma.id);

    try {
      if (existing) {
        await deleteSavedItem(existing.id);

        setSavedItems((current) => current.filter((item) => item.id !== existing.id));

        return;
      }

      const saved = await saveItem({
        save_type: 'kathisma',

        source_type: 'psalter',

        source_id: psalter.id,

        anchor_type: 'kathisma',

        anchor_id: kathisma.id,

        source_title: getLocalizedField(psalter, 'name', language) || t('psalter.title'),

        item_title: t('psalter.kathisma', {number: kathisma.number}),

        text: '',

        metadata: {
          kathisma_number: kathisma.number,

          kathisma_title: getLocalizedField(kathisma, 'title', language) || '',
        },
      });

      setSavedItems((current) => [saved, ...current]);
    } catch (err) {
      console.log('Ошибка сохранения кафизмы:', err.response?.data || err.message);
    }
  };

  const progressInfo = savedProgress?.anchor_info;

  const currentKathismaNumber = progressInfo?.kathisma_number;

  const currentKathisma = psalter?.kathismas?.find(
    (kathisma) => Number(kathisma.number) === Number(currentKathismaNumber)
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
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

  const handlePrayersCollapse = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    });
  };
  const handleAfterPrayersExpand = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: afterPrayersYRef.current,
        animated: true,
      });
    });
  };

  const handleAfterPrayersCollapse = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    });
  };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          removeClippedSubviews={false}
          nestedScrollEnabled
          data={psalter?.kathismas || []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingTop: headerHeight + 20,
              paddingBottom: 80 + insets.bottom,
            },
          ]}
          ListHeaderComponent={
            <View style={styles.header}>
              <ExpandablePrayerBlock
                title={t('psalter.prayersBefore')}
                text={psalter?.prayers_before}
                secondaryText={psalter?.prayers_before_russian}
                ukrainianText={psalter?.prayers_before_uk}
                traditionalText={psalter?.prayers_before_traditional}
                onCollapse={handlePrayersCollapse}
                saveProps={{
                  sourceType: 'psalter',
                  sourceId: psalter?.id,
                  anchorType: 'psalter_prayers_before',
                  anchorId: psalter?.id,
                  sourceTitle: getLocalizedField(psalter, 'name', language) || t('psalter.title'),
                  itemTitle: t('psalter.prayersBefore'),
                  metadata: {
                    section: 'prayers_before',
                  },
                }}
              />

              {psalter?.prayers_after ? (
                <View
                  onLayout={(event) => {
                    afterPrayersYRef.current = event.nativeEvent.layout.y;
                  }}
                >
                  <ExpandablePrayerBlock
                    title={t('psalter.prayersAfter')}
                    text={psalter?.prayers_after}
                    secondaryText={psalter?.prayers_after_russian}
                    ukrainianText={psalter?.prayers_after_uk}
                    traditionalText={psalter?.prayers_after_traditional}
                    onExpand={handleAfterPrayersExpand}
                    onCollapse={handleAfterPrayersCollapse}
                    saveProps={{
                      sourceType: 'psalter',
                      sourceId: psalter?.id,
                      anchorType: 'psalter_prayers_after',
                      anchorId: psalter?.id,
                      sourceTitle:
                        getLocalizedField(psalter, 'name', language) || t('psalter.title'),
                      itemTitle: t('psalter.prayersAfter'),
                      metadata: {
                        section: 'prayers_after',
                      },
                    }}
                  />
                </View>
              ) : null}
            </View>
          }
          renderItem={({item}) => {
            const isCurrent = Number(item.number) === Number(currentKathismaNumber);

            const saved = !!getSavedKathisma(item.id);

            return (
              <View
                style={[
                  styles.kathisma,

                  isCurrent && styles.kathismaCurrent,

                  saved && styles.kathismaSaved,
                ]}
              >
                <Pressable
                  onPress={() => openKathisma(item)}
                  style={({pressed}) => [styles.kathismaMain, pressed && styles.pressed]}
                >
                  <Text style={styles.kathismaNumber}>
                    {t('psalter.kathisma', {number: item.number})}
                  </Text>

                  <Text style={styles.psalmRange}>
                    {item.first_psalm === item.last_psalm
                      ? t('psalter.psalm', {number: item.first_psalm})
                      : t('psalter.psalmsRange', {
                          first: item.first_psalm,
                          last: item.last_psalm,
                        })}
                  </Text>

                  {isCurrent && progressInfo && (
                    <Text style={styles.currentPosition}>
                      {t('psalter.stoppedAt', {psalm: progressInfo.psalm_number})}
                      {progressInfo.verse_number
                        ? t('psalter.stoppedVerse', {verse: progressInfo.verse_number})
                        : ''}
                    </Text>
                  )}

                  {!!getLocalizedField(item, 'title', language) && (
                    <Text style={styles.kathismaTitle}>
                      {getLocalizedField(item, 'title', language)}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    saved ? t('common.removeFromFavorites') : t('common.addFavorite')
                  }
                  onPress={() => toggleKathismaSaved(item)}
                  style={({pressed}) => [styles.saveButton, pressed && styles.pressed]}
                >
                  <SaveHeartIcon active={saved} size={20} />
                </Pressable>
              </View>
            );
          }}
          ListFooterComponent={
            psalter?.prayers_after ? (
              <View
                style={styles.footer}
                onLayout={(event) => {
                  afterPrayersYRef.current = event.nativeEvent.layout.y;
                }}
              ></View>
            ) : null
          }
        />
        <FixedSectionHeader
          title={getLocalizedField(psalter, 'name', language) || t('psalter.title')}
          navigation={navigation}
          topInset={insets.top}
        />
        <BottomNav navigation={navigation} active={null} />
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  listContent: {
    paddingTop: 100,
    paddingHorizontal: 8,
    paddingBottom: 32,
    gap: 9,
  },

  header: {
    gap: 10,
    marginBottom: 2,
  },

  continueCard: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },

  continueLabel: {
    marginBottom: 7,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.accent,
  },

  continueTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: colors.text,
  },

  continuePosition: {
    marginTop: 5,
    fontSize: 15,
    color: colors.textSecondary,
  },

  kathisma: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },

  kathismaCurrent: {
    backgroundColor: '#F5DFC0',
    borderColor: colors.borderStrong,
  },

  kathismaSaved: {
    borderColor: 'rgba(138, 90, 56, 0.30)',
  },

  kathismaMain: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 13,
    paddingRight: 8,
  },

  kathismaNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },

  psalmRange: {
    marginTop: 4,
    fontSize: 14,
    color: colors.textSecondary,
  },

  kathismaTitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textSecondary,
  },
  // footer: {
  //   marginTop: 150,
  // },
  currentPosition: {
    marginTop: 7,
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },

  saveButton: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: 'rgba(238, 220, 192, 0.72)',
  },

  saveButtonText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '400',
    color: colors.textMuted,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },

  saveButtonTextActive: {
    color: colors.accentDark,
  },

  pressed: {
    opacity: 0.62,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },

  error: {
    fontSize: 16,
    color: colors.liturgical,
  },
});
