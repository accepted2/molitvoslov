import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useFonts} from 'expo-font';
import {Ionicons} from '@expo/vector-icons';
import {LinearGradient} from 'expo-linear-gradient';
import {AppBackground} from '../components/layout/AppBackground';
import {ActivityIndicator, Alert, FlatList, PanResponder, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {useFocusEffect} from '@react-navigation/native';

import {BottomNav} from '../components/navigation/BottomNav';

import {deleteSavedItem, getSavedItems, setSavedItemPinned, sortSavedItems} from '../services/savedItems';
import {savedTextFontFamily} from '../services/savedTextTypography';

import {colors, radius, spacing} from '../theme';
import {useLanguage} from '../context/LanguageContext';
import {useInterfaceScale} from '../context/InterfaceScaleContext';

const TAB_SAVED = 'saved';
const TAB_PLACES = 'places';
const TAB_FRAGMENTS = 'fragments';

const TABS = [
  {key: TAB_SAVED, labelKey: 'favorites.saved'},
  {key: TAB_PLACES, labelKey: 'favorites.bookmarks'},
  {key: TAB_FRAGMENTS, labelKey: 'favorites.fragments'},
];

const FRAGMENT_SAVE_TYPES = new Set(['word', 'sentence', 'paragraph', 'fragment']);

// Font is sourced from the reader that created the saved item, never from
// letters or combining accents in the text itself.
const isPonomarPreview = item => savedTextFontFamily(item) === 'Ponomar';

export const FavoritesScreen = ({route, navigation}) => {
  const uiScale = useInterfaceScale();
  const {t} = useLanguage();
  const initialTab = TABS.some((tab) => tab.key === route.params?.tab)
    ? route.params.tab
    : TAB_SAVED;

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [ponomarLoaded] = useFonts({
    FavoritesPonomar: require('../../assets/fonts/Ponomar-Regular.ttf'),
  });
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (TABS.some((tab) => tab.key === route.params?.tab)) {
      setActiveTab(route.params.tab);
    }
  }, [route.params?.tab]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      setItems(await getSavedItems());
    } catch (err) {
      console.log('Ошибка загрузки сохранённого:', err);
      setError(t('favorites.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const placeItems = useMemo(() => items.filter((item) => item.save_type === 'bookmark'), [items]);

  const fragmentItems = useMemo(
    () =>
      items.filter(
        (item) => item.save_type !== 'bookmark' && FRAGMENT_SAVE_TYPES.has(item.save_type)
      ),
    [items]
  );

  const savedItems = useMemo(
    () =>
      items.filter(
        (item) => item.save_type !== 'bookmark' && !FRAGMENT_SAVE_TYPES.has(item.save_type)
      ),
    [items]
  );

  const activeItems =
    activeTab === TAB_PLACES
      ? placeItems
      : activeTab === TAB_FRAGMENTS
        ? fragmentItems
        : savedItems;

  const searchQuery = search.trim().toLocaleLowerCase();
  const visibleItems = searchQuery
    ? activeItems.filter((item) =>
        [item.item_title, item.source_title, item.save_type_display, item.text]
          .some((part) => String(part || '').toLocaleLowerCase().includes(searchQuery))
      )
    : activeItems;

  // Respond only to clear horizontal gestures, leaving vertical scrolling intact.
  const swipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > 35 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) < 65 ||
          Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.4) return;
      setActiveTab((current) => {
        const position = TABS.findIndex((tab) => tab.key === current);
        const next = Math.max(0, Math.min(TABS.length - 1, position + (gesture.dx < 0 ? 1 : -1)));
        return TABS[next]?.key || current;
      });
    },
  }), []);

  const togglePin = async item => {
    const next=!item.is_pinned;
    try {
      const updated=await setSavedItemPinned(item.id,next);
      setItems(current=>sortSavedItems(current.map(candidate=>
        candidate.id===item.id?updated:candidate)));
    } catch(error) {
      console.warn('[favorites] toggle pin:',error?.message||error);
      Alert.alert('Не удалось закрепить',error?.message||'Попробуйте ещё раз');
    }
  };

  const removeItem = async (itemId) => {
    try {
      await deleteSavedItem(itemId);

      setItems((current) => current.filter((item) => item.id !== itemId));
    } catch (err) {
      console.log('Ошибка удаления сохранения:', err);
    }
  };

  const makeFocusTarget = (item) => ({
    id: item.id,
    save_type: item.save_type,
    anchor_type: item.anchor_type,
    anchor_id: item.anchor_id,
    start_offset: item.start_offset,
    end_offset: item.end_offset,
    metadata: item.metadata || {},
  });

  const openItem = (item) => {
    const metadata = item.metadata || {};
    const focusTarget = makeFocusTarget(item);

    if (item.source_type === 'prayer_rule' && metadata.slug) {
      navigation.push('PrayerRule', {
        slug: metadata.slug,
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'category' && metadata.category_slug) {
      navigation.push('Book', {
        categoryId: item.source_id,
        categorySlug: metadata.category_slug,
        categoryName: metadata.category_name || item.source_title,
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'text' && metadata.slug) {
      navigation.push('Reader', {
        slug: metadata.slug,
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'akathist' && metadata.slug) {
      navigation.push('Akathist', {
        akathistId: item.source_id,
        slug: metadata.slug,
        title: item.source_title || t('reading.akathist'),
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'canon' && metadata.slug) {
      navigation.push('Canon', {
        canonId: item.source_id,
        slug: metadata.slug,
        title: item.source_title || t('reading.canon'),
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'bible' && metadata.chapter_number) {
      navigation.push('BibleChapter', {
        bookId: metadata.book_id || item.source_id,
        chapterNumber: Number(metadata.chapter_number),
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'calendar') {
      navigation.push('SaintDetail', {
        date: metadata.date || undefined,
        feastId: metadata.feast_id || undefined,
        feastUid: metadata.feast_uid || undefined,
        feastTitle: metadata.feast_title || item.source_title,
        focusSection: metadata.section || 'life',
      });
      return;
    }

    if (item.source_type === 'personal_prayer' && metadata.book_sync_id) {
      navigation.push('PrayerBookReader', {
        bookSyncId: metadata.book_sync_id,
        prayerSyncId: metadata.prayer_sync_id || null,
      });
      return;
    }

    if (item.source_type === 'daily_quote') {
      navigation.navigate('Menu');
      return;
    }

    if (item.source_type === 'psalter') {
      if (metadata.kathisma_number) {
        navigation.push('Kathisma', {
          kathismaNumber: metadata.kathisma_number,
          kathismaTitle:
            metadata.kathisma_title || t('psalter.kathisma', {number: metadata.kathisma_number}),
          focusTarget,
        });
        return;
      }

      navigation.navigate('Psalter');
    }
  };

  const getItemTitle = (item) =>
    item.item_title || item.source_title || item.save_type_display || t('favorites.fallbackTitle');

  const tabCount = (tab) => {
    if (tab === TAB_PLACES) {
      return placeItems.length;
    }

    if (tab === TAB_FRAGMENTS) {
      return fragmentItems.length;
    }

    return savedItems.length;
  };

  const emptyCopy = searchQuery
    ? {icon: '⌕', title: t('favorites.noResults'), text: ''}
    : activeTab === TAB_PLACES
      ? {
          icon: '⌑',
          title: t('favorites.emptyPlacesTitle'),
          text: t('favorites.emptyPlacesText'),
        }
      : activeTab === TAB_FRAGMENTS
        ? {
            icon: '“',
            title: t('favorites.emptyFragmentsTitle'),
            text: t('favorites.emptyFragmentsText'),
          }
        : {
            icon: '♡',
            title: t('favorites.emptySavedTitle'),
            text: t('favorites.emptySavedText'),
          };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View style={styles.screen}>
        <View style={[styles.headerRow, {paddingTop: insets.top + 2}]}>
          <View style={styles.headerTitleBlock}>
            <Text style={[styles.headerTitle, {fontSize: 21 * uiScale}]} numberOfLines={1}>{t('favorites.title')}</Text>
            <View style={styles.headerOrnament}>
              <View style={styles.headerLine} />
              <Text style={styles.headerStar}>✦</Text>
              <View style={styles.headerLine} />
            </View>
          </View>
          <View style={styles.searchField}>
            <Ionicons name="search-outline" size={17} color={colors.accent} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('favorites.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              underlineColorAndroid="transparent"
              accessibilityLabel={t('favorites.searchPlaceholder')}
            />
            {!!search && (
              <Pressable
                style={styles.clearSearch}
                hitSlop={8}
                onPress={() => setSearch('')}
                accessibilityRole="button"
                accessibilityLabel={t('favorites.clearSearch')}
              >
                <Ionicons name="close-circle" size={17} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
        <View style={styles.tabsWrap}>
          <View style={styles.tabs}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  accessibilityRole="tab"
                  accessibilityState={{selected: active}}
                  style={({pressed}) => [
                    styles.tab,
                    active && styles.tabActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.tabText, {fontSize: 12 * uiScale}, active && styles.tabTextActive]}>
                    {t(tab.labelKey)}
                  </Text>
                  {!!tabCount(tab.key) && (
                    <Text style={[styles.tabCount, active && styles.tabCountActive]}>
                      {tabCount(tab.key)}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.listRegion} {...swipeResponder.panHandlers}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : (
          <FlatList
            key={activeTab}
            data={visibleItems}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              visibleItems.length ? styles.list : styles.emptyList,
              {paddingBottom: 115 + insets.bottom},
            ]}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyHeart}>{emptyCopy.icon}</Text>
                <Text style={[styles.emptyTitle, {fontSize: 19 * uiScale}]}>{emptyCopy.title}</Text>
                {!!emptyCopy.text && <Text style={[styles.emptyText, {fontSize: 14 * uiScale}]}>{emptyCopy.text}</Text>}
              </View>
            }
            renderItem={({item}) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.typeBadge}>
                    {activeTab === TAB_PLACES
                      ? t('favorites.bookmark')
                      : (item.save_type_display || item.save_type).toUpperCase()}
                  </Text>

                  <View style={styles.cardTopActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.is_pinned?'Открепить избранное':'Закрепить избранное'}
                      accessibilityHint="Закреплённые сохранения отображаются первыми"
                      hitSlop={9}
                      onPress={() => togglePin(item)}
                      style={({pressed}) => [styles.pinButton,
                        item.is_pinned && styles.pinButtonActive,
                        pressed && styles.pressed]}
                    >
                      <Ionicons name={item.is_pinned?'pin':'pin-outline'}
                        size={19} color={item.is_pinned?'#A64D33':'#785D48'} />
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() => removeItem(item.id)}
                      style={({pressed}) => [styles.deleteButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.deleteText}>{t('favorites.delete')}</Text>
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  onPress={() => openItem(item)}
                  style={({pressed}) => [styles.cardBody, pressed && styles.pressed]}
                >
                  <Text style={[styles.cardTitle, {fontSize: 17 * uiScale}]}>{getItemTitle(item)}</Text>

                  {activeTab === TAB_PLACES ? (
                    <Text style={styles.placeMeta}>
                      {item.source_title || t('favorites.readingPlace')}
                      {Number.isFinite(Number(item.metadata?.progress_percent))
                        ? ` · ${Number(item.metadata.progress_percent)}%`
                        : ''}
                    </Text>
                  ) : item.source_type === 'bible' && item.save_type === 'chapter' ? (
                    <Text style={[styles.quote, {fontSize: 15 * uiScale}]}>
                      {t('favorites.wholeChapter')}
                      {item.metadata?.verse_count
                        ? ' · ' + t('favorites.verses', {count: item.metadata.verse_count})
                        : ''}
                    </Text>
                  ) : (
                    !!item.text && (
                      <Text style={[styles.quote, {fontSize: 15 * uiScale}, isPonomarPreview(item) && ponomarLoaded && styles.quoteChurch]} numberOfLines={8}>
                        «{item.text}»
                      </Text>
                    )
                  )}

                  {activeTab !== TAB_PLACES && !!item.source_title && (
                    <Text style={styles.source}>{item.source_title}</Text>
                  )}
                </Pressable>
              </View>
            )}
          />
        )}
          {/* Fade moving cards softly beneath the fixed tab row, without covering taps. */}
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(255, 244, 222, 0.82)',
              'rgba(255, 244, 222, 0.42)',
              'rgba(255, 244, 222, 0)',
            ]}
            locations={[0, 0.45, 1]}
            style={styles.topListFade}
          />
        </View>

        <BottomNav navigation={navigation} active="favorites" />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  cardTopActions:{flexDirection:'row',alignItems:'center',gap:10},
  pinButton:{minWidth:34,minHeight:32,alignItems:'center',justifyContent:'center',
    borderRadius:9,borderWidth:1,borderColor:'#DEC7A4'},
  pinButtonActive:{backgroundColor:'#F1DDC3',borderColor:'#B47B59'},

  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 4,
    gap: spacing.sm,
    backgroundColor: 'transparent',
  },

  headerTitleBlock: {
    flexShrink: 0,
    width: 140,
    paddingLeft: 2,
  },

  headerTitle: {
    fontFamily: 'serif',
    fontWeight: '700',
    fontSize: 21,
    lineHeight: 25,
    color: '#432A19',
    includeFontPadding: false,
  },

  headerOrnament: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 115,
    marginTop: 2,
  },

  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(139, 88, 40, 0.38)',
  },

  headerStar: {
    marginHorizontal: 6,
    color: '#98622E',
    fontSize: 7,
  },

  searchField: {
    flex: 1,
    minWidth: 0,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 9,
    paddingRight: 7,
    gap: 5,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.22)',
    backgroundColor: 'rgba(255, 244, 222, 0.96)',
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 13,
    color: colors.text,
  },

  clearSearch: {
    padding: 2,
  },

  tabsWrap: {
    marginHorizontal: spacing.md,
    marginTop: 3,
    marginBottom: 8,
  },

  listRegion: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },

  topListFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    zIndex: 3,
    elevation: 3,
  },

  tabs: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 244, 222, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.20)',
  },

  tab: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.sm,
  },

  tabActive: {
    backgroundColor: colors.accentSoft,
  },

  tabText: {
    color: colors.textSecondary,
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '700',
  },

  tabTextActive: {
    color: colors.accentDark,
  },

  tabCount: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },

  tabCountActive: {
    color: colors.accentDark,
  },

  list: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },

  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },

  emptyCard: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  emptyHeart: {
    fontSize: 34,
    color: colors.accent,
  },

  emptyTitle: {
    marginTop: spacing.sm,
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'serif',
    textAlign: 'center',
  },

  emptyText: {
    maxWidth: 290,
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    color: colors.textSecondary,
  },

  card: {
    borderRadius: 17,
    backgroundColor: 'rgba(255, 244, 222, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.22)',
    overflow: 'hidden',
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },

  typeBadge: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.accent,
  },

  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },

  deleteText: {
    fontSize: 11,
    color: colors.textMuted,
  },

  cardBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },

  pressed: {
    opacity: 0.6,
  },

  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'serif',
  },

  quote: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    fontFamily: 'serif',
  },

  quoteChurch: {
    fontFamily: 'FavoritesPonomar',
    fontSize: 17,
    lineHeight: 25,
    includeFontPadding: false,
  },

  placeMeta: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  source: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },

  error: {
    color: colors.liturgical,
  },
});
