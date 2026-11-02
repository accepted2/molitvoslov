#!/usr/bin/env python3
"""Install local category/favorites searches and non-closing PrayerBook search picker.

Preserves local modifications: validates every unique anchor before writing any
file; backs up originals outside the app. Does not touch search FTS5 database,
navigation, selected prayers, or app versions. Idempotent.
"""
from pathlib import Path
from datetime import datetime
import shutil,sys

ROOT=Path(__file__).resolve().parents[1]
MODIFIED={}
MARKER="MOLITVOSLOV_LOCAL_CATEGORY_SEARCH_V1"

def one(s,old,new,path):
    n=s.count(old)
    if n!=1:
        raise RuntimeError(f"{path}: expected one anchor, found {n}: {old[:120]!r}")
    return s.replace(old,new,1)

def patch(rel,update):
    file=ROOT/rel
    src=file.read_text(encoding='utf-8-sig')
    if MARKER in src:
        print("ALREADY PATCHED:",rel)
        return
    result=update(src,rel)
    if result==src or MARKER not in result:
        raise RuntimeError("Patch produced no verified changes: "+rel)
    MODIFIED[rel]=result

def texts(s,p):
    s=one(s,
      "import React, {useEffect, useState} from 'react';",
      "import React, {useEffect, useMemo, useState} from 'react';",p)
    s=one(s,
      "import {contentApi as api} from '../services/contentApi';",
      "import {contentApi as api} from '../services/contentApi';\n"
      "import {LocalSearchField, filterByTitle} from '../components/search/LocalSearchField';",p)
    s=one(s,
      "  const [loading, setLoading] = useState(true);",
      """  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // MOLITVOSLOV_LOCAL_CATEGORY_SEARCH_V1: title-only, on the loaded category.
  const visibleTexts = useMemo(() => filterByTitle(
    texts, query,
    item => getLocalizedTextTitle(item.text, language) ||
      getLocalizedTextDescription(item.text, language) || t('common.prayer')
  ), [texts, query, language, t]);""",p)
    s=one(s,
      "  useEffect(() => {\n    loadTexts();\n  }, [categorySlug]);",
      """  useEffect(() => {
    setQuery('');
    loadTexts();
  }, [categorySlug]);""",p)
    s=one(s,
      "        data={texts}",
      "        data={visibleTexts}",p)
    s=one(s,
      "        renderItem={({item, index}) => (",
      """        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.searchArea}>
            <LocalSearchField value={query} onChangeText={setQuery}
              placeholder="Поиск по названию" />
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptySearch}>
            {query.trim() ? 'В этой категории ничего не найдено' : 'В категории пока нет текстов'}
          </Text>
        }
        renderItem={({item, index}) => (""",p)
    s=one(s,
      "  item: {",
      """  searchArea: {paddingHorizontal:10,paddingBottom:10},
  emptySearch: {padding:24,textAlign:'center',color:'#765238'},
  item: {""",p)
    return s

def favorites(s,p):
    s=one(s,
      "import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';",
      "import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';\n"
      "import {LocalSearchField, filterSavedOnly} from '../components/search/LocalSearchField';",p)
    s=one(s,
      "  const [activeTab, setActiveTab] = useState(initialTab);",
      """  const [activeTab, setActiveTab] = useState(initialTab);
  const [query, setQuery] = useState(''); // MOLITVOSLOV_LOCAL_CATEGORY_SEARCH_V1""",p)
    s=one(s,
      """  const visibleItems =
    activeTab === TAB_PLACES
      ? placeItems
      : activeTab === TAB_FRAGMENTS
        ? fragmentItems
        : savedItems;""",
      """  const visibleItems = useMemo(() => {
    if (query.trim()) return filterSavedOnly(items, query);
    return activeTab === TAB_PLACES ? placeItems :
      activeTab === TAB_FRAGMENTS ? fragmentItems : savedItems;
  }, [query, items, activeTab, placeItems, fragmentItems, savedItems]);""",p)
    s=one(s,
      "                paddingTop: headerHeight + 78,",
      "                paddingTop: headerHeight + 143,",p)
    s=one(s,
      """                <Text style={styles.emptyHeart}>{emptyCopy.icon}</Text>
                <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
                <Text style={styles.emptyText}>{emptyCopy.text}</Text>""",
      """                <Text style={styles.emptyHeart}>{query.trim() ? '⌕' : emptyCopy.icon}</Text>
                <Text style={styles.emptyTitle}>{query.trim() ? 'Ничего не найдено' : emptyCopy.title}</Text>
                <Text style={styles.emptyText}>
                  {query.trim() ? 'Совпадений среди сохранённых текстов и фрагментов нет' : emptyCopy.text}
                </Text>""",p)
    s=one(s,
      """{activeTab === TAB_PLACES
                      ? t('favorites.bookmark')""",
      """{item.save_type === 'bookmark'
                      ? t('favorites.bookmark')""",p)
    s=one(s,
      "                  {activeTab === TAB_PLACES ? (",
      "                  {item.save_type === 'bookmark' ? (",p)
    s=one(s,
      """                  {activeTab !== TAB_PLACES && !!item.source_title && (""",
      """                  {item.save_type !== 'bookmark' && !!item.source_title && (""",p)
    s=one(s,
      """        <FixedSectionHeader
          title={t('favorites.title')}""",
      """        <View style={[styles.localSearchWrap, {top: headerHeight + 55}]}>
          <LocalSearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск в избранном"
            accessibilityLabel="Поиск только среди сохранённых"
          />
        </View>

        <FixedSectionHeader
          title={t('favorites.title')}""",p)
    s=one(s,
      "  tabsWrap: {",
      """  localSearchWrap: {
    position:'absolute',left:spacing.md,right:spacing.md,zIndex:18,
  },
  tabsWrap: {""",p)
    return s

def prayerbook(s,p):
    s=one(s,
      "  excludedPrayerIds,\n  onClose,",
      "  excludedPrayerIds,\n  existingResultKeys,\n  onClose,",p)
    s=one(s,
      "  const [filter, setFilter] = useState('all');",
      """  const [filter, setFilter] = useState('all');
  // MOLITVOSLOV_LOCAL_CATEGORY_SEARCH_V1
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const [pendingKey, setPendingKey] = useState(null);
  const onAdd = async (item) => {
    if (pendingKey || addedKeys.has(item.key) ||
        existingResultKeys.has(item.key) ||
        (item.kind === 'personal' && excludedPrayerIds.has(item.prayer?.sync_id))) return;
    setPendingKey(item.key);
    try {
      const ok = await onSelect(item);
      if (ok) setAddedKeys(previous => new Set([...previous, item.key]));
    } finally {
      setPendingKey(null);
    }
  };""",p)
    s=one(s,
      """    if (!visible) {
      setSearchQuery('');
      return undefined;
    }""",
      """    if (!visible) {
      setSearchQuery('');
      setAddedKeys(new Set());
      setPendingKey(null);
      return undefined;
    }""",p)
    s=one(s,
      """    return searchAllPrayers(personalPrayers, searchQuery).filter(
      (item) => item.kind !== 'personal' || !excludedPrayerIds.has(item.prayer?.sync_id)
    );""",
      """    // Reuse the existing offline prayer index, including full texts and Psalter.
    // Do not hide items already in this book: display a checked state instead.
    return searchAllPrayers(personalPrayers, searchQuery);""",p)
    s=one(s,
      "              renderItem={({item}) => (\n                <Pressable\n                  onPress={() => onSelect(item)}",
      """              renderItem={({item}) => (
                <Pressable
                  disabled={!!pendingKey || addedKeys.has(item.key) ||
                    existingResultKeys.has(item.key) ||
                    (item.kind === 'personal' && excludedPrayerIds.has(item.prayer?.sync_id))}
                  onPress={() => onAdd(item)}""",p)
    s=one(s,
      """                  <View style={styles.addSearchResultButton}>
                    <Text style={styles.addSearchResultText}>＋</Text>
                  </View>""",
      """                  <View style={[styles.addSearchResultButton,
                    (addedKeys.has(item.key) || existingResultKeys.has(item.key) ||
                      (item.kind === 'personal' && excludedPrayerIds.has(item.prayer?.sync_id))) &&
                      styles.addSearchResultButtonDone]}>
                    <Text style={styles.addSearchResultText}>
                      {addedKeys.has(item.key) || existingResultKeys.has(item.key) ||
                        (item.kind === 'personal' && excludedPrayerIds.has(item.prayer?.sync_id))
                        ? '✓' : pendingKey === item.key ? '…' : '＋'}
                    </Text>
                  </View>""",p)
    s=one(s,
      """    if (busy) {
      return;
    }

    try {
      setBusy(true);

      if (result.kind === 'personal'""",
      """    if (busy) {
      return false;
    }

    try {
      setBusy(true);

      if (result.kind === 'personal'""",p)
    s=one(s,
      """            search_source: 'global_prayer_search',
          },""",
      """            search_source: 'global_prayer_search',
            search_key: result.key,
          },""",p)
    s=one(s,
      """      setGlobalSearch(false);
      await load();
    } catch (error) {
      Alert.alert(t('prayerBooks.addPrayerError'), error.message);
    } finally {
      setBusy(false);
    }
  };

  const move =""",
      """      await load();
      return true;
    } catch (error) {
      Alert.alert(t('prayerBooks.addPrayerError'), error.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const move =""",p)
    s=one(s,
      """  const existingPrayerIds = new Set((book.items || []).map((item) => item.prayer_sync_id));""",
      """  const existingPrayerIds = new Set((book.items || []).map(item => item.prayer_sync_id));
  const existingResultKeys = new Set((book.items || []).map(item => {
    const origin = item.prayer?.origin_data;
    let parsed = origin;
    if (typeof origin === 'string') {
      try {parsed = JSON.parse(origin);} catch {parsed = null;}
    }
    return parsed?.search_key ||
      (parsed?.psalm_id ? 'psalm:' + parsed.psalm_id : null) ||
      (parsed?.text_id ? 'library:' + parsed.text_id : null);
  }).filter(Boolean));""",p)
    s=one(s,
      """          excludedPrayerIds={existingPrayerIds}
          onClose={() => setGlobalSearch(false)}""",
      """          excludedPrayerIds={existingPrayerIds}
          existingResultKeys={existingResultKeys}
          onClose={() => setGlobalSearch(false)}""",p)
    s=one(s,
      "  addSearchResultButton: {",
      """  addSearchResultButtonDone: {backgroundColor:'#8FAD78'},
  addSearchResultButton: {""",p)
    return s

for name,fn in (
   ("src/screens/TextsListScreen.js",texts),
   ("src/screens/FavoritesScreen.js",favorites),
   ("src/screens/PrayerBookScreen.js",prayerbook),
):
    patch(name,fn)

if not MODIFIED:
    print("All local search and multi-add changes already present")
    sys.exit(0)
backups=ROOT.parent/"build-backups"/("local-catalog-search-"+datetime.now().strftime("%Y%m%d_%H%M%S"))
backups.mkdir(parents=True,exist_ok=False)
for file in MODIFIED:
    dest=backups/file
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/file,dest)
for file,contents in MODIFIED.items():
    (ROOT/file).write_text(contents,encoding='utf-8')
    print("PATCHED:",file)
print("SOURCE BACKUP:",backups)
print("Local title search, saved-only search and multi-add picker patched")
