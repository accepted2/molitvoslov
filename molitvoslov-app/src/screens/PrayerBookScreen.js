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
  getPersonalPrayers,
  getPrayerBook,
  importSavedItemToBook,
  movePrayerInBook,
  removePrayerFromBook,
} from '../services/prayerBooks';
import {getSavedItems} from '../services/savedItems';
import {colors, spacing} from '../theme';

const PickerModal = ({
  visible,
  title,
  items,
  onClose,
  onSelect,
  getTitle,
  getSubtitle,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const haystack = [
        getTitle(item),
        getSubtitle(item),
        item?.text,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [getSubtitle, getTitle, items, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти молитву…"
            placeholderTextColor="#A58A73"
            style={styles.searchInput}
          />

          <FlatList
            data={filtered}
            keyExtractor={(item, index) => String(item.sync_id || item.id || index)}
            keyboardShouldPersistTaps="handled"
            renderItem={({item}) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={({pressed}) => [styles.pickerRow, pressed && styles.pressed]}
              >
                <Text style={styles.pickerRowTitle}>{getTitle(item)}</Text>
                {!!getSubtitle(item) && (
                  <Text style={styles.pickerRowSubtitle} numberOfLines={2}>
                    {getSubtitle(item)}
                  </Text>
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyPicker}>Ничего не найдено</Text>
            }
          />
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
  const [libraryPicker, setLibraryPicker] = useState(false);
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
    if (busy) return;
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

  const addExisting = async (prayer) => {
    if (busy) return;
    try {
      setBusy(true);
      await addPrayerToBook(bookSyncId, prayer.sync_id);
      setLibraryPicker(false);
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
        <FixedSectionHeader
          title="Молитвослов"
          navigation={navigation}
          topInset={insets.top}
        />
      </AppBackground>
    );
  }

  const existingPrayerIds = new Set((book.items || []).map((item) => item.prayer_sync_id));
  const reusablePrayers = personalPrayers.filter(
    (prayer) => !existingPrayerIds.has(prayer.sync_id)
  );

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
                  onPress={() => setLibraryPicker(true)}
                  style={({pressed}) => [styles.actionButton, pressed && styles.pressed]}
                >
                  <Text style={styles.actionIcon}>☷</Text>
                  <Text style={styles.actionText}>Из моих молитв</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Молитвы в сборнике</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Сборник пока пуст</Text>
              <Text style={styles.emptyText}>
                Добавьте свою молитву, выберите из сохранённого или используйте уже созданную.
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
                      <Text style={styles.photoMeta}>
                        Фото: {prayer.photos.length}
                      </Text>
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
                    <Text style={[styles.orderButtonText, index === 0 && styles.orderButtonDisabled]}>↑</Text>
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
                        index === (book.items?.length || 0) - 1 && styles.orderButtonDisabled,
                      ]}
                    >
                      ↓
                    </Text>
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => remove(item)} style={styles.removeButton}>
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />

        <FixedSectionHeader
          title={book.title}
          navigation={navigation}
          topInset={insets.top}
        />

        <PickerModal
          visible={savedPicker}
          title="Добавить из избранного"
          items={savedItems}
          onClose={() => setSavedPicker(false)}
          onSelect={addSaved}
          getTitle={(item) =>
            item.item_title || item.source_title || item.save_type_display || 'Сохранённое'
          }
          getSubtitle={(item) => item.text || item.source_title || ''}
        />

        <PickerModal
          visible={libraryPicker}
          title="Мои молитвы"
          items={reusablePrayers}
          onClose={() => setLibraryPicker(false)}
          onSelect={addExisting}
          getTitle={(item) => item.title}
          getSubtitle={(item) => item.text || (item.photos?.length ? 'Молитва с фото' : '')}
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
  description: {marginBottom: 10, color: colors.textSecondary, fontFamily: 'serif', lineHeight: 20},
  readButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#5A3822',
  },
  readButtonText: {color: '#FFF4DE', fontFamily: 'serif', fontSize: 15, fontWeight: '700'},
  disabled: {opacity: 0.38},
  actionGrid: {marginTop: 9, flexDirection: 'row', gap: 7},
  actionButton: {
    flex: 1,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.20)',
    backgroundColor: 'rgba(255,244,222,0.94)',
  },
  actionIcon: {color: '#99652F', fontSize: 19},
  actionText: {marginTop: 4, textAlign: 'center', color: '#5A3822', fontSize: 11, fontWeight: '700'},
  sectionTitle: {marginTop: 20, marginBottom: 8, color: '#432A19', fontFamily: 'serif', fontSize: 18, fontWeight: '700'},
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
  cardTitle: {color: '#3E2A1D', fontFamily: 'serif', fontSize: 16, fontWeight: '700'},
  preview: {marginTop: 5, color: '#765238', fontFamily: 'serif', fontSize: 13, lineHeight: 19},
  photoMeta: {marginTop: 5, color: '#9A714C', fontSize: 11},
  orderButtons: {width: 38, alignItems: 'center', justifyContent: 'center'},
  orderButton: {width: 34, height: 27, alignItems: 'center', justifyContent: 'center'},
  orderButtonText: {color: '#8A603A', fontSize: 16, fontWeight: '700'},
  orderButtonDisabled: {opacity: 0.22},
  removeButton: {width: 34, height: 29, alignItems: 'center', justifyContent: 'center'},
  removeText: {color: '#9A714C', fontSize: 25},
  emptyCard: {padding: 22, alignItems: 'center', borderRadius: 16, backgroundColor: 'rgba(255,244,222,0.94)'},
  emptyTitle: {color: colors.text, fontFamily: 'serif', fontSize: 17, fontWeight: '700'},
  emptyText: {marginTop: 7, textAlign: 'center', color: colors.textSecondary, lineHeight: 20},
  modalBackdrop: {flex: 1, paddingTop: 70, backgroundColor: 'rgba(45,27,16,0.50)', justifyContent: 'flex-end'},
  pickerCard: {
    maxHeight: '82%',
    minHeight: '58%',
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFF4DE',
  },
  pickerHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  pickerTitle: {color: '#3E2A1D', fontFamily: 'serif', fontSize: 20, fontWeight: '700'},
  closeText: {color: '#7A4F2D', fontSize: 30},
  searchInput: {
    marginTop: 12,
    marginBottom: 8,
    minHeight: 43,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.24)',
    backgroundColor: '#FFF9ED',
    color: '#3E2A1D',
  },
  pickerRow: {paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(126,82,38,0.18)'},
  pickerRowTitle: {color: '#3E2A1D', fontFamily: 'serif', fontSize: 15, fontWeight: '700'},
  pickerRowSubtitle: {marginTop: 3, color: '#81634D', fontSize: 12, lineHeight: 17},
  emptyPicker: {padding: 28, textAlign: 'center', color: '#8A6B52'},
  pressed: {opacity: 0.65},
});
