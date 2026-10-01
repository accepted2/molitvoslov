import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {AppBackground} from '../components/layout/AppBackground';
import {BottomNav} from '../components/navigation/BottomNav';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {contentApi as api} from '../services/contentApi';
import {colors, radius, spacing} from '../theme';

const ROOT_SLUG = 'raznye-molitvy';

const PLACEHOLDER_TREE = {
  [ROOT_SLUG]: {
    name: 'Разные молитвы',
    categories: [
      {
        id: -101,
        name: 'Молитвы перед чтением Евангелия',
        slug: 'molitvy-pered-evangeliem',
        parent: -100,
        order: 10,
      },
    ],
    texts: [
      {
        id: -1001,
        order: 20,
        text: {
          id: -1001,
          slug: 'placeholder-pered-nachalom-dobrogo-dela',
          title: 'Молитва перед началом доброго дела',
          content: 'Текст церковнославянской версии будет добавлен позже.',
          translation: 'Русский перевод будет добавлен позже.',
          traditional_content: '',
          is_placeholder: true,
        },
      },
      {
        id: -1002,
        order: 30,
        text: {
          id: -1002,
          slug: 'placeholder-pered-chteniem-pisania',
          title: 'Молитва перед чтением Священного Писания',
          content: 'Текст церковнославянской версии будет добавлен позже.',
          translation: 'Русский перевод будет добавлен позже.',
          traditional_content: '',
          is_placeholder: true,
        },
      },
      {
        id: -1003,
        order: 40,
        text: {
          id: -1003,
          slug: 'placeholder-posle-chtenia-pisania',
          title: 'Молитва после чтения Священного Писания',
          content: 'Текст церковнославянской версии будет добавлен позже.',
          translation: 'Русский перевод будет добавлен позже.',
          traditional_content: '',
          is_placeholder: true,
        },
      },
    ],
  },
  'molitvy-pered-evangeliem': {
    name: 'Молитвы перед чтением Евангелия',
    categories: [],
    texts: [
      {
        id: -1101,
        order: 10,
        text: {
          id: -1101,
          slug: 'placeholder-molitva-pered-evangeliem-1',
          title: 'Молитва перед Евангелием первая',
          content: 'Текст церковнославянской версии будет добавлен позже.',
          translation: 'Русский перевод будет добавлен позже.',
          traditional_content: '',
          is_placeholder: true,
        },
      },
      {
        id: -1102,
        order: 20,
        text: {
          id: -1102,
          slug: 'placeholder-molitva-pered-evangeliem-2',
          title: 'Молитва перед Евангелием вторая',
          content: 'Текст церковнославянской версии будет добавлен позже.',
          translation: 'Русский перевод будет добавлен позже.',
          traditional_content: '',
          is_placeholder: true,
        },
      },
    ],
  },
};

export const MiscPrayersScreen = ({route, navigation}) => {
  const categorySlug = route.params?.categorySlug || ROOT_SLUG;
  const fallback = PLACEHOLDER_TREE[categorySlug] || {
    name: route.params?.categoryName || 'Разные молитвы',
    categories: [],
    texts: [],
  };

  const [categoryName, setCategoryName] = useState(route.params?.categoryName || fallback.name);
  const [subcategories, setSubcategories] = useState([]);
  const [texts, setTexts] = useState([]);
  const [loading, setLoading] = useState(true);

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);

        const [categoriesResponse, textsResponse] = await Promise.all([
          api.get('categories/'),
          api.get(`categories/${categorySlug}/texts/`).catch(() => ({data: []})),
        ]);

        if (!active) {
          return;
        }

        const categories = categoriesResponse.data || [];
        const current = categories.find((item) => item.slug === categorySlug);

        if (!current) {
          setCategoryName(fallback.name);
          setSubcategories(fallback.categories);
          setTexts(fallback.texts);
          return;
        }

        const children = categories
          .filter((item) => Number(item.parent) === Number(current.id))
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

        const rows = [...(textsResponse.data || [])].sort(
          (a, b) => Number(a.order || 0) - Number(b.order || 0)
        );

        setCategoryName(current.name || fallback.name);
        setSubcategories(children);
        setTexts(rows);
      } catch (error) {
        if (!active) {
          return;
        }

        setCategoryName(fallback.name);
        setSubcategories(fallback.categories);
        setTexts(fallback.texts);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [categorySlug]);

  const items = useMemo(
    () =>
      [
        ...subcategories.map((category) => ({
          kind: 'category',
          key: `category:${category.id}`,
          order: Number(category.order || 0),
          category,
        })),
        ...texts.map((row) => ({
          kind: 'text',
          key: `text:${row.id}`,
          order: Number(row.order || 0),
          row,
        })),
      ].sort((a, b) => a.order - b.order),
    [subcategories, texts]
  );

  const openItem = (item) => {
    if (item.kind === 'category') {
      navigation.push('MiscPrayers', {
        categorySlug: item.category.slug,
        categoryName: item.category.name,
      });
      return;
    }

    const text = item.row.text;

    if (text?.is_placeholder || Number(text?.id) < 0) {
      navigation.push('MiscPrayerPlaceholder', {
        title: text?.title || 'Молитва',
        churchText: text?.content || '',
        russianText: text?.translation || '',
        traditionalText: text?.traditional_content || '',
      });
      return;
    }

    navigation.push('Reader', {
      slug: text.slug,
    });
  };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View style={styles.screen}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.key}
            contentContainerStyle={{
              paddingTop: headerHeight + 18,
              paddingHorizontal: spacing.md,
              paddingBottom: 92 + insets.bottom,
              gap: spacing.sm,
            }}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Молитвы пока не добавлены</Text>
                <Text style={styles.emptyText}>
                  Этот раздел уже готов для наполнения через админку.
                </Text>
              </View>
            }
            renderItem={({item}) => {
              const isCategory = item.kind === 'category';
              const title = isCategory
                ? item.category.name
                : item.row.text?.title || item.row.text?.description || 'Молитва';

              return (
                <Pressable
                  onPress={() => openItem(item)}
                  style={({pressed}) => [styles.card, pressed && styles.pressed]}
                >
                  <View style={styles.cardIcon}>
                    <Text style={styles.cardIconText}>{isCategory ? '▤' : '✦'}</Text>
                  </View>

                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{title}</Text>
                    <Text style={styles.cardSubtitle}>
                      {isCategory ? 'Раздел молитв' : 'Открыть молитву'}
                    </Text>
                  </View>

                  <Text style={styles.arrow}>›</Text>
                </Pressable>
              );
            }}
          />
        )}

        <FixedSectionHeader
          title={categoryName || 'Разные молитвы'}
          navigation={navigation}
          topInset={insets.top}
        />

        <BottomNav navigation={navigation} active={null} />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.20)',
    backgroundColor: 'rgba(248, 233, 207, 0.96)',
  },

  cardIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: colors.accentSoft,
  },

  cardIconText: {
    color: colors.accentDark,
    fontSize: 18,
  },

  cardText: {
    flex: 1,
    marginLeft: spacing.md,
  },

  cardTitle: {
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },

  cardSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },

  arrow: {
    marginLeft: spacing.sm,
    color: '#9A714C',
    fontSize: 26,
  },

  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  emptyTitle: {
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: '700',
  },

  emptyText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },

  pressed: {
    opacity: 0.65,
  },
});
