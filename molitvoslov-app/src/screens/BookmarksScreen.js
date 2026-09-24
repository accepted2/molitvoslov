import React, {useCallback, useState} from 'react';

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {BottomNav} from '../components/navigation/BottomNav';
import {getSavedItems} from '../services/savedItems';

import {colors, radius, spacing} from '../theme';


const WHOLE_SAVE_TYPES = new Set([
  'prayer',
  'psalm',
  'kathisma',
  'chapter',
  'akathist',
  'canon',
  'text',
]);


export const BookmarksScreen = ({navigation}) => {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const saved = await getSavedItems();

      setBookmarks(
        saved.filter(item => (
          !WHOLE_SAVE_TYPES.has(item.save_type) &&
          item.start_offset !== null &&
          item.end_offset !== null
        ))
      );
    } catch (err) {
      console.log('Ошибка загрузки закладок:', err);
      setError('Не удалось загрузить закладки');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const makeFocusTarget = item => ({
    id: item.id,
    save_type: item.save_type,
    anchor_type: item.anchor_type,
    anchor_id: item.anchor_id,
    start_offset: item.start_offset,
    end_offset: item.end_offset,
    metadata: item.metadata || {},
  });

  const openBookmark = item => {
    const metadata = item.metadata || {};
    const focusTarget = makeFocusTarget(item);

    if (item.source_type === 'prayer_rule' && metadata.slug) {
      navigation.navigate('PrayerRule', {
        slug: metadata.slug,
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'category' && metadata.category_slug) {
      navigation.navigate('Book', {
        categoryId: item.source_id,
        categorySlug: metadata.category_slug,
        categoryName: metadata.category_name || item.source_title,
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'text' && metadata.slug) {
      navigation.navigate('Reader', {
        slug: metadata.slug,
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'akathist' && metadata.slug) {
      navigation.navigate('Akathist', {
        akathistId: item.source_id,
        slug: metadata.slug,
        title: item.source_title || 'Акафист',
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'canon' && metadata.slug) {
      navigation.navigate('Canon', {
        canonId: item.source_id,
        slug: metadata.slug,
        title: item.source_title || 'Канон',
        focusTarget,
      });
      return;
    }

    if (item.source_type === 'psalter') {
      if (metadata.kathisma_number) {
        navigation.navigate('Kathisma', {
          kathismaNumber: metadata.kathisma_number,
          kathismaTitle:
            metadata.kathisma_title ||
            `Кафизма ${metadata.kathisma_number}`,
          focusTarget,
        });
        return;
      }

      navigation.navigate('Psalter');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Закладки</Text>
          <Text style={styles.subtitle}>
            Сохранённые фрагменты для быстрого возврата
          </Text>
        </View>

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
            data={bookmarks}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={
              bookmarks.length ? styles.list : styles.emptyList
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Закладок пока нет</Text>
                <Text style={styles.emptyText}>
                  Выделите слово, предложение или фрагмент во время чтения —
                  сохранённое место появится здесь.
                </Text>
              </View>
            }
            renderItem={({item}) => (
              <Pressable
                onPress={() => openBookmark(item)}
                style={({pressed}) => [
                  styles.card,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.cardMark}>
                  <Text style={styles.cardSymbol}>⌑</Text>
                </View>

                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.item_title || item.source_title || 'Закладка'}
                  </Text>

                  {!!item.text && (
                    <Text style={styles.cardText} numberOfLines={4}>
                      «{item.text}»
                    </Text>
                  )}

                  <Text style={styles.cardMeta}>
                    {item.source_title || item.save_type_display || 'Закладка'}
                  </Text>
                </View>

                <Text style={styles.arrow}>›</Text>
              </Pressable>
            )}
          />
        )}
      </View>

      <BottomNav navigation={navigation} active="bookmarks" />
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  screen: {
    flex: 1,
  },

  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },

  title: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: 'serif',
    color: colors.text,
  },

  subtitle: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },

  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },

  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'serif',
  },

  emptyText: {
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  pressed: {
    opacity: 0.65,
  },

  cardMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },

  cardSymbol: {
    fontSize: 20,
    color: colors.accent,
  },

  cardContent: {
    flex: 1,
    marginLeft: spacing.md,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'serif',
  },

  cardText: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    fontFamily: 'serif',
  },

  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
  },

  arrow: {
    marginLeft: spacing.sm,
    fontSize: 26,
    color: colors.textMuted,
  },

  error: {
    color: colors.liturgical,
  },
});
