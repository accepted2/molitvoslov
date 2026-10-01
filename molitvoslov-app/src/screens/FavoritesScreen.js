import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {AppBackground} from '../components/layout/AppBackground';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {useFocusEffect} from '@react-navigation/native';

import {BottomNav} from '../components/navigation/BottomNav';

import {deleteSavedItem, getSavedItems} from '../services/savedItems';

import {colors, radius, spacing} from '../theme';

const TAB_SAVED = 'saved';
const TAB_PLACES = 'places';
const TAB_FRAGMENTS = 'fragments';

const TABS = [
  {key: TAB_SAVED, label: 'Сохранённое'},
  {key: TAB_PLACES, label: 'Места'},
  {key: TAB_FRAGMENTS, label: 'Фрагменты'},
];

const FRAGMENT_SAVE_TYPES = new Set(['word', 'sentence', 'paragraph', 'fragment']);

export const FavoritesScreen = ({route, navigation}) => {
  const initialTab = TABS.some((tab) => tab.key === route.params?.tab)
    ? route.params.tab
    : TAB_SAVED;

  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;

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
      setError('Не удалось загрузить избранное');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const visibleItems =
    activeTab === TAB_PLACES
      ? placeItems
      : activeTab === TAB_FRAGMENTS
        ? fragmentItems
        : savedItems;

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
        title: item.source_title || 'Акафист',
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'canon' && metadata.slug) {
      navigation.push('Canon', {
        canonId: item.source_id,
        slug: metadata.slug,
        title: item.source_title || 'Канон',
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

    if (item.source_type === 'daily_quote') {
      navigation.navigate('Menu');
      return;
    }

    if (item.source_type === 'psalter') {
      if (metadata.kathisma_number) {
        navigation.push('Kathisma', {
          kathismaNumber: metadata.kathisma_number,
          kathismaTitle: metadata.kathisma_title || `Кафизма ${metadata.kathisma_number}`,
          focusTarget,
        });
        return;
      }

      navigation.navigate('Psalter');
    }
  };

  const getItemTitle = (item) =>
    item.item_title || item.source_title || item.save_type_display || 'Сохранённое';

  const tabCount = (tab) => {
    if (tab === TAB_PLACES) {
      return placeItems.length;
    }

    if (tab === TAB_FRAGMENTS) {
      return fragmentItems.length;
    }

    return savedItems.length;
  };

  const emptyCopy =
    activeTab === TAB_PLACES
      ? {
          icon: '⌑',
          title: 'Сохранённых мест пока нет',
          text: 'Во время чтения откройте меню ⋮ и нажмите «Добавить закладку». Это место останется здесь независимо от дальнейшего прогресса.',
        }
      : activeTab === TAB_FRAGMENTS
        ? {
            icon: '“',
            title: 'Фрагментов пока нет',
            text: 'Выделите слово, предложение, абзац или произвольный фрагмент текста и сохраните его.',
          }
        : {
            icon: '♡',
            title: 'Сохранённого пока нет',
            text: 'Нажимайте сердечко у молитв, псалмов, глав, акафистов, канонов и других текстов — они появятся здесь.',
          };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View style={styles.screen}>
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
            data={visibleItems}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              visibleItems.length ? styles.list : styles.emptyList,
              {
                paddingTop: headerHeight + 78,
                paddingBottom: 115 + insets.bottom,
              },
            ]}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyHeart}>{emptyCopy.icon}</Text>
                <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
                <Text style={styles.emptyText}>{emptyCopy.text}</Text>
              </View>
            }
            renderItem={({item}) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.typeBadge}>
                    {activeTab === TAB_PLACES
                      ? 'МЕСТО'
                      : (item.save_type_display || item.save_type).toUpperCase()}
                  </Text>

                  <Pressable
                    hitSlop={8}
                    onPress={() => removeItem(item.id)}
                    style={({pressed}) => [styles.deleteButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.deleteText}>Удалить</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => openItem(item)}
                  style={({pressed}) => [styles.cardBody, pressed && styles.pressed]}
                >
                  <Text style={styles.cardTitle}>{getItemTitle(item)}</Text>

                  {activeTab === TAB_PLACES ? (
                    <Text style={styles.placeMeta}>
                      {item.source_title || 'Место чтения'}
                      {Number.isFinite(Number(item.metadata?.progress_percent))
                        ? ` · ${Number(item.metadata.progress_percent)}%`
                        : ''}
                    </Text>
                  ) : item.source_type === 'bible' && item.save_type === 'chapter' ? (
                    <Text style={styles.quote}>
                      Глава сохранена целиком
                      {item.metadata?.verse_count
                        ? ' · ' + item.metadata.verse_count + ' стихов'
                        : ''}
                    </Text>
                  ) : (
                    !!item.text && (
                      <Text style={styles.quote} numberOfLines={8}>
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

        <View
          pointerEvents="box-none"
          style={[
            styles.tabsWrap,
            {
              top: headerHeight + 6,
            },
          ]}
        >
          <View style={styles.tabs}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;

              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={({pressed}) => [
                    styles.tab,
                    active && styles.tabActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>

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

        <FixedSectionHeader
          title="Избранное"
          navigation={navigation}
          topInset={insets.top}
          showBack={false}
        />

        <BottomNav navigation={navigation} active="favorites" />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabsWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 19,
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
