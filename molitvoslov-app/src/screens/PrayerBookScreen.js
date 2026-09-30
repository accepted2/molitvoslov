import React, {useCallback, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {
  addPrayerToBook,
  createPersonalPrayer,
  getPersonalPrayers,
  getPrayerBook,
  importSavedItemToBook,
  movePrayerInBook,
  removePrayerFromBook,
} from '../services/prayerBooks';
import {searchAllPrayers} from '../services/prayerSearch';
import {getSavedItems} from '../services/savedItems';
import {colors, spacing} from '../theme';

const SavedPickerModal = ({visible, items, onClose, onSelect}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return items;
    }

    return items.filter((item) =>
      [
        item.item_title,
        item.source_title,
        item.save_type_display,
        item.text,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [items, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Добавить из избранного</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск в избранном"
              placeholderTextColor="#9A7D66"
              style={styles.searchInput}
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Text style={styles.clearSearch}>×</Text>
              </Pressable>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item, index) => String(item.sync_id || item.id || index)}
            keyboardShouldPersistTaps="handled"
            renderItem={({item}) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={({pressed}) => [styles.pickerRow, pressed && styles.pressed]}
              >
                <Text style={styles.pickerRowTitle}>
                  {item.item_title ||
                    item.source_title ||
                    item.save_type_display ||
                    'Сохранённое'}
                </Text>

                {!!(item.text || item.source_title) && (
                  <Text style={styles.pickerRowSubtitle} numberOfLines={2}>
                    {item.text || item.source_title}
                  </Text>
                )}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptyPicker}>Ничего не найдено</Text>}
          />
        </View>
      </View>
    </Modal>
  );
};

const GlobalPrayerSearchModal = ({
  visible,
  personalPrayers,
  excludedPrayerIds,
  onClose,
  onSelect,
}) => {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!visible) {
      return [];
    }

    return searchAllPrayers(personalPrayers, query).filter(
      (item) => item.kind !== 'personal' || !excludedPrayerIds.has(item.prayer?.sync_id)
    );
  }, [excludedPrayerIds, personalPrayers, query, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.pickerCard, styles.globalSearchCard]}>
          <View style={styles.pickerHeader}>
            <View style={styles.searchHeading}>
              <Text style={styles.pickerTitle}>Найти молитву</Text>
              <Text style={styles.searchHeadingHint}>Поиск по всей библиотеке приложения</Text>
            </View>

            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={[styles.searchBox, styles.globalSearchBox]}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
              placeholder="Например: перед дорогой, о здравии…"
              placeholderTextColor="#8F725B"
              style={styles.searchInput}
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Text style={styles.clearSearch}>×</Text>
              </Pressable>
            )}
          </View>

          {query.trim().length < 2 ? (
            <View style={styles.searchEmptyState}>
              <Text style={styles.searchEmptyMark}>⌕</Text>
              <Text style={styles.searchEmptyTitle}>Введите хотя бы два символа</Text>
              <Text style={styles.searchEmptyText}>
                Поиск смотрит название, описание и полный текст молитв. Ваши собственные
                молитвы тоже участвуют в поиске.
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <Text style={styles.resultCount}>
                  {results.length
                    ? `Найдено: ${results.length}`
                    : 'По этому запросу ничего не найдено'}
                </Text>
              }
              renderItem={({item}) => (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={({pressed}) => [styles.searchResult, pressed && styles.pressed]}
                >
                  <View style={styles.searchResultTop}>
                    <Text style={styles.searchResultTitle}>{item.title}</Text>
                    <Text
                      style={[
                        styles.sourceBadge,
                        item.kind === 'personal' && styles.sourceBadgePersonal,
                      ]}
                    >
                      {item.kind === 'personal' ? 'МОЯ' : 'БИБЛИОТЕКА'}
                    </Text>
                  </View>

                  {!!item.subtitle && (
                    <Text style={styles.searchResultSource} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  )}

                  {!!item.preview && (
                    <Text style={styles.searchResultPreview} numberOfLines={3}>
                      {item.preview}
                    </Text>
                  )}
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

export const PrayerBookScreen = ({route, navigation}) => {
  const {bookSyncId} = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;

  const [book, setBook] = useState(null);
  const [savedItems, setSavedItems] = useState([]);
  const [personalPrayers, setPersonalPrayers] = useState([]);
  const [savedPicker, setSavedPicker] = useState(false);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextBook, saved, prayers] = await Promise.all([
        getPrayerBook(bookSyncId),
        getSavedItems(),
        getPersonalPrayers(),
      ]);

      setBook(nextBook);
      setSavedItems(saved);
      setPersonalPrayers(prayers);
    } catch (error) {
      console.log('Ошибка загрузки молитвослова:', error);
    }
  }, [bookSyncId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const addSaved = async (item) => {
    if (busy) {
      return;
    }

    try {
      setBusy(true);
      await importSavedItemToBook(bookSyncId, item);
      setSavedPicker(false);
      await load();
    } catch (error) {
      Alert.alert('Не удалось добавить молитву', error.message);
    } finally {
      setBusy(false);
    }
  };

  const addSearchResult = async (result) => {
    if (busy) {
      return;
    }

    try {
      setBusy(true);

      if (result.kind === 'personal' && result.prayer?.sync_id) {
        await addPrayerToBook(bookSyncId, result.prayer.sync_id);
      } else {
        const prayer = await createPersonalPrayer({
          title: result.title || 'Молитва',
          text: result.text || '',
          origin_type: 'library',
          origin_data: {
            ...(result.origin_data || {}),
            search_source: 'global_prayer_search',
          },
        });

        await addPrayerToBook(bookSyncId, prayer.sync_id);
      }

      setGlobalSearch(false);
      await load();
    } catch (error) {
      Alert.alert('Не удалось добавить молитву', error.message);
    } finally {
      setBusy(false);
    }
  };

  const move = async (item, direction) => {
    try {
      const next = await movePrayerInBook(bookSyncId, item.sync_id, direction);
      setBook(next);
    } catch (error) {
      Alert.alert('Не удалось изменить порядок', error.message);
    }
  };

  const remove = (item) => {
    Alert.alert(
      'Убрать из молитвослова?',
      'Сама молитва останется в вашей библиотеке.',
      [
        {text: 'Отмена', style: 'cancel'},
        {
          text: 'Убрать',
          style: 'destructive',
          onPress: async () => {
            await removePrayerFromBook(item.sync_id);
            await load();
          },
        },
      ]
    );
  };

  if (!book) {
    return (
      <AppBackground imageOpacity={0.72}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <View style={styles.center}>
          <Text style={styles.loading}>Загрузка…</Text>
        </View>
        <FixedSectionHeader title="Молитвослов" navigation={navigation} topInset={insets.top} />
      </AppBackground>
    );
  }

  const existingPrayerIds = new Set((book.items || []).map((item) => item.prayer_sync_id));

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View style={styles.screen}>
        <FlatList
          data={book.items || []}
          keyExtractor={(item) => item.sync_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: headerHeight + 18,
            paddingHorizontal: spacing.md,
            paddingBottom: 34 + insets.bottom,
          }}
          ListHeaderComponent={
            <View style={styles.actionsWrap}>
              {!!book.description && (
                <Text style={styles.description}>{book.description}</Text>
              )}

              <Pressable
                onPress={() =>
                  navigation.navigate('PrayerBookReader', {bookSyncId: book.sync_id})
                }
                disabled={!book.items?.length}
                style={({pressed}) => [
                  styles.readButton,
                  !book.items?.length && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.readButtonText}>Читать как один молитвослов</Text>
              </Pressable>

              <View style={styles.actionGrid}>
                <Pressable
                  onPress={() =>
                    navigation.navigate('PersonalPrayerEditor', {bookSyncId: book.sync_id})
                  }
                  style={({pressed}) => [styles.actionButton, pressed && styles.pressed]}
                >
                  <Text style={styles.actionIcon}>＋</Text>
                  <Text style={styles.actionText}>Своя молитва</Text>
                </Pressable>

                <Pressable
                  onPress={() => setSavedPicker(true)}
                  style={({pressed}) => [styles.actionButton, pressed && styles.pressed]}
                >
                  <Text style={styles.actionIcon}>♡</Text>
                  <Text style={styles.actionText}>Из избранного</Text>
                </Pressable>

                <Pressable
                  onPress={() => setGlobalSearch(true)}
                  style={({pressed}) => [styles.actionButton, pressed && styles.pressed]}
                >
                  <Text style={styles.actionIcon}>⌕</Text>
                  <Text style={styles.actionText}>Найти молитву</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Молитвы в сборнике</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Сборник пока пуст</Text>
              <Text style={styles.emptyText}>
                Добавьте свой текст, выберите молитву из избранного или найдите её по всей
                библиотеке приложения.
              </Text>
            </View>
          }
          renderItem={({item, index}) => {
            const prayer = item.prayer;

            return (
              <View style={styles.card}>
                <Pressable
                  onPress={() =>
                    navigation.navigate('PersonalPrayerEditor', {
                      bookSyncId: book.sync_id,
                      prayerSyncId: prayer.sync_id,
                    })
                  }
                  style={({pressed}) => [styles.cardBody, pressed && styles.pressed]}
                >
                  <Text style={styles.order}>{index + 1}</Text>

                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{prayer.title}</Text>

                    {!!prayer.text && (
                      <Text style={styles.preview} numberOfLines={3}>
                        {prayer.text}
                      </Text>
                    )}

                    {!!prayer.photos?.length && (
                      <Text style={styles.photoMeta}>Фото: {prayer.photos.length}</Text>
                    )}
                  </View>
                </Pressable>

                <View style={styles.orderButtons}>
                  <Pressable
                    disabled={index === 0}
                    hitSlop={6}
                    onPress={() => move(item, -1)}
                    style={styles.orderButton}
                  >
                    <Text
                      style={[
                        styles.orderButtonText,
                        index === 0 && styles.orderButtonDisabled,
                      ]}
                    >
                      ↑
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={index === (book.items?.length || 0) - 1}
                    hitSlop={6}
                    onPress={() => move(item, 1)}
                    style={styles.orderButton}
                  >
                    <Text
                      style={[
                        styles.orderButtonText,
                        index === (book.items?.length || 0) - 1 &&
                          styles.orderButtonDisabled,
                      ]}
                    >
                      ↓
                    </Text>
                  </Pressable>

                  <Pressable
                    hitSlop={8}
                    onPress={() => remove(item)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />

        <FixedSectionHeader title={book.title} navigation={navigation} topInset={insets.top} />

        <SavedPickerModal
          visible={savedPicker}
          items={savedItems}
          onClose={() => setSavedPicker(false)}
          onSelect={addSaved}
        />

        <GlobalPrayerSearchModal
          visible={globalSearch}
          personalPrayers={personalPrayers}
          excludedPrayerIds={existingPrayerIds}
          onClose={() => setGlobalSearch(false)}
          onSelect={addSearchResult}
        />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  loading: {color: colors.textSecondary},
  actionsWrap: {marginBottom: 14},
  description: {
    marginBottom: 10,
    color: '#654731',
    fontFamily: 'serif',
    lineHeight: 20,
  },
  readButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#5A3822',
  },
  readButtonText: {
    color: '#FFF4DE',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {opacity: 0.38},
  actionGrid: {marginTop: 9, flexDirection: 'row', gap: 7},
  actionButton: {
    flex: 1,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.20)',
    backgroundColor: 'rgba(255,244,222,0.94)',
  },
  actionIcon: {color: '#8F5C2D', fontSize: 20, lineHeight: 22},
  actionText: {
    marginTop: 4,
    textAlign: 'center',
    color: '#5A3822',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 8,
    color: '#432A19',
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: '700',
  },
  card: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.20)',
    backgroundColor: 'rgba(255,244,222,0.96)',
    overflow: 'hidden',
  },
  cardBody: {flex: 1, flexDirection: 'row', padding: 12},
  order: {
    width: 26,
    height: 26,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 13,
    color: '#7A4F2D',
    backgroundColor: '#F0D8AE',
    fontSize: 12,
    fontWeight: '700',
  },
  cardText: {flex: 1, minWidth: 0, marginLeft: 10},
  cardTitle: {
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
  },
  preview: {
    marginTop: 5,
    color: '#765238',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 19,
  },
  photoMeta: {marginTop: 5, color: '#9A714C', fontSize: 11},
  orderButtons: {width: 38, alignItems: 'center', justifyContent: 'center'},
  orderButton: {width: 34, height: 27, alignItems: 'center', justifyContent: 'center'},
  orderButtonText: {color: '#8A603A', fontSize: 16, fontWeight: '700'},
  orderButtonDisabled: {opacity: 0.22},
  removeButton: {width: 34, height: 29, alignItems: 'center', justifyContent: 'center'},
  removeText: {color: '#9A714C', fontSize: 25},
  emptyCard: {
    padding: 22,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255,244,222,0.94)',
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 7,
    textAlign: 'center',
    color: '#654731',
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    paddingTop: 70,
    backgroundColor: 'rgba(45,27,16,0.50)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    maxHeight: '84%',
    minHeight: '58%',
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFF4DE',
  },
  globalSearchCard: {
    minHeight: '72%',
    maxHeight: '92%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  searchHeading: {flex: 1, paddingRight: 12},
  pickerTitle: {
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: '700',
  },
  searchHeadingHint: {
    marginTop: 3,
    color: '#74563F',
    fontSize: 12,
    lineHeight: 17,
  },
  closeText: {color: '#7A4F2D', fontSize: 30, lineHeight: 30},
  searchBox: {
    minHeight: 46,
    marginTop: 12,
    marginBottom: 9,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.27)',
    backgroundColor: '#FFF9ED',
  },
  globalSearchBox: {
    minHeight: 50,
    borderColor: 'rgba(106,67,40,0.42)',
    shadowColor: '#56351F',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 7,
    color: '#7A4F2D',
    fontSize: 21,
    lineHeight: 23,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 0,
    color: '#3E2A1D',
    fontSize: 14,
  },
  clearSearch: {
    marginLeft: 8,
    color: '#8E6B51',
    fontSize: 23,
    lineHeight: 25,
  },
  pickerRow: {
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(126,82,38,0.18)',
  },
  pickerRowTitle: {
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 15,
    fontWeight: '700',
  },
  pickerRowSubtitle: {
    marginTop: 3,
    color: '#70523D',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyPicker: {padding: 28, textAlign: 'center', color: '#74563F'},
  searchEmptyState: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  searchEmptyMark: {color: '#A16E35', fontSize: 34},
  searchEmptyTitle: {
    marginTop: 8,
    color: '#4B3020',
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '700',
  },
  searchEmptyText: {
    marginTop: 7,
    textAlign: 'center',
    color: '#70523D',
    fontSize: 13,
    lineHeight: 19,
  },
  resultCount: {
    paddingVertical: 8,
    color: '#7A5B44',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  searchResult: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.18)',
    backgroundColor: 'rgba(255,249,237,0.86)',
  },
  searchResultTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  searchResultTitle: {
    flex: 1,
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    overflow: 'hidden',
    color: '#755030',
    backgroundColor: '#EFD8AE',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
  },
  sourceBadgePersonal: {
    color: '#5D3A24',
    backgroundColor: '#E5C79D',
  },
  searchResultSource: {
    marginTop: 4,
    color: '#8B6A50',
    fontSize: 11,
    lineHeight: 15,
  },
  searchResultPreview: {
    marginTop: 5,
    color: '#624633',
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: {opacity: 0.65},
});
