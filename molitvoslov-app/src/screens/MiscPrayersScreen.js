import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {useFocusEffect} from '@react-navigation/native';
import {Ionicons} from '@expo/vector-icons';

import {AppBackground} from '../components/layout/AppBackground';
import {BottomNav} from '../components/navigation/BottomNav';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {SaveHeartIcon} from '../components/icons/SaveHeartIcon';
import {shareContent} from '../services/contentSharing';
import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';
import {contentApi as api} from '../services/contentApi';
import {LocalSearchField, matchesLocalQuery} from '../components/search/LocalSearchField';
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
  const [query, setQuery] = useState(''); // MOLITVOSLOV_LOCAL_CATEGORY_SEARCH_V1
  const [savedTexts,setSavedTexts] = useState([]);

  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = React.useState(insets.top + 56);
  React.useEffect(() => {setHeaderHeight(insets.top + 56);}, [insets.top]);

  useEffect(() => {
    setQuery('');
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

  useFocusEffect(useCallback(() => {
    let active=true;
    getSavedItems({source_type:'text',save_type:'text'})
      .then(rows => {if(active) setSavedTexts(rows);})
      .catch(error => console.warn('[misc prayers] favorites:',error?.message||error));
    return () => {active=false;};
  },[]));

  const toggleTextFavorite=async text => {
    if(!text || Number(text.id)<=0)return;
    try {
      const old=savedTexts.find(row => Number(row.anchor_id)===Number(text.id));
      if(old){
        await deleteSavedItem(old.id);
        setSavedTexts(rows=>rows.filter(row=>row.id!==old.id));
        return;
      }
      const body=String(text.content||text.translation||text.traditional_content||'');
      if(!body.trim())return;
      const saved=await saveItem({
        save_type:'text',source_type:'text',source_id:text.id,
        anchor_type:'text',anchor_id:text.id,
        source_title:text.title||'Молитва',
        item_title:text.title||'Молитва',
        text:body,start_offset:0,end_offset:body.length,
        metadata:{slug:text.slug},
      });
      setSavedTexts(rows=>[saved,...rows]);
    } catch(error) {
      console.warn('[misc prayers] save failed:',error?.message||error);
    }
  };

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

  const visibleItems = useMemo(
    () => items.filter(item => matchesLocalQuery(
      query,
      item.kind === 'category'
        ? item.category.name
        : (item.row.text?.title || item.row.text?.description || 'Молитва')
    )),
    [items, query]
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
            data={visibleItems}
            keyExtractor={(item) => item.key}
            contentContainerStyle={{
              paddingTop: headerHeight + 18,
              paddingHorizontal: spacing.md,
              paddingBottom: 92 + insets.bottom,
              gap: spacing.sm,
            }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.localSearch}>
                <LocalSearchField value={query} onChangeText={setQuery}
                  placeholder="Поиск молитвы по названию" />
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{query.trim() ? 'Ничего не найдено' : 'Молитвы пока не добавлены'}</Text>
                <Text style={styles.emptyText}>
                  {query.trim() ? 'Попробуйте другое название молитвы' : 'Этот раздел уже готов для наполнения через админку.'}
                </Text>
              </View>
            }
            renderItem={({item}) => {
              const isCategory = item.kind === 'category';
              const title = isCategory
                ? item.category.name
                : item.row.text?.title || item.row.text?.description || 'Молитва';

              return (
                <View style={styles.card}>
                  <Pressable
                    onPress={() => openItem(item)}
                    style={({pressed}) => [styles.cardMain, pressed && styles.pressed]}
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
                  {!isCategory && Number(item.row.text?.id)>0 &&
                    !item.row.text?.is_placeholder && (
                    <View style={styles.cardActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={savedTexts.some(row =>
                          Number(row.anchor_id)===Number(item.row.text.id))
                          ? 'Убрать из избранного':'Сохранить молитву'}
                        hitSlop={5}
                        style={styles.iconButton}
                        onPress={() => toggleTextFavorite(item.row.text)}
                      >
                        <SaveHeartIcon active={savedTexts.some(row =>
                          Number(row.anchor_id)===Number(item.row.text.id))} size={19}/>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Поделиться молитвой"
                        hitSlop={5}
                        style={styles.iconButton}
                        onPress={() => shareContent({
                          title,
                          text:item.row.text.content||
                            item.row.text.translation||item.row.text.traditional_content||'',
                          screen:'Reader',params:{slug:item.row.text.slug},
                        })}
                      >
                        <Ionicons name="share-social-outline" size={19} color="#765238"/>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        <FixedSectionHeader onHeaderHeightChange={setHeaderHeight}
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

  localSearch: {marginBottom: 8},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: 0,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.20)',
    backgroundColor: 'rgba(248, 233, 207, 0.96)',
    overflow:'hidden',
  },

  cardMain:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center'},
  cardActions:{flexDirection:'row',alignSelf:'stretch',alignItems:'center',
    borderLeftWidth:1,borderLeftColor:'rgba(126,82,38,0.24)',
    backgroundColor:'rgba(238,220,192,0.48)',paddingHorizontal:4,
    marginVertical:-11,marginLeft:8},
  iconButton:{width:34,minHeight:40,alignItems:'center',justifyContent:'center'},
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
