import React, {useCallback, useState} from 'react';
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
import {BottomNav} from '../components/navigation/BottomNav';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {
  createPrayerBook,
  getPrayerBooks,
  syncPrayerBooks,
} from '../services/prayerBooks';
import {colors, radius, spacing} from '../theme';

export const PrayerBooksScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const [books, setBooks] = useState([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getPrayerBooks();
      setBooks(data);
      syncPrayerBooks()
        .then(getPrayerBooks)
        .then(setBooks)
        .catch(() => {});
    } catch (error) {
      console.log('Ошибка загрузки личных молитвословов:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const create = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const book = await createPrayerBook({title});
      setTitle('');
      setCreating(false);
      await load();
      navigation.navigate('PrayerBook', {bookSyncId: book.sync_id});
    } catch (error) {
      Alert.alert('Не удалось создать молитвослов', error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.screen}>
        <FlatList
          data={books}
          keyExtractor={(item) => item.sync_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: headerHeight + 18,
            paddingHorizontal: spacing.md,
            paddingBottom: 112 + insets.bottom,
          }}
          ListHeaderComponent={
            <View>
              <View style={styles.intro}>
                <Text style={styles.introTitle}>Личные молитвенные сборники</Text>
                <Text style={styles.introText}>
                  Собирайте молитвы в свои правила: добавляйте полные тексты из избранного,
                  находите молитвы в библиотеке, вставляйте свои тексты и фотографии.
                </Text>
              </View>

              <Pressable
                onPress={() => setCreating(true)}
                style={({pressed}) => [styles.createButton, pressed && styles.pressed]}
              >
                <Text style={styles.createIcon}>＋</Text>
                <Text style={styles.createButtonText}>Новый молитвослов</Text>
              </Pressable>

              {!!books.length && <Text style={styles.sectionLabel}>МОИ МОЛИТВОСЛОВЫ</Text>}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyMark}>✦</Text>
              <Text style={styles.emptyTitle}>Пока нет своих сборников</Text>
              <Text style={styles.emptyText}>
                Создайте, например, «На утро», «Перед дорогой» или «Мой молитвослов».
              </Text>
            </View>
          }
          renderItem={({item}) => (
            <Pressable
              onPress={() => navigation.navigate('PrayerBook', {bookSyncId: item.sync_id})}
              style={({pressed}) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.bookIcon}>
                <Text style={styles.bookIconText}>✚</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.items?.length || 0} молитв
                  {item.description ? ` · ${item.description}` : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />

        <FixedSectionHeader
          title="Мой молитвослов"
          navigation={navigation}
          topInset={insets.top}
          showBack={false}
        />
        <BottomNav navigation={navigation} active="prayerbooks" />

        <Modal
          visible={creating}
          transparent
          animationType="fade"
          onRequestClose={() => setCreating(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Новый молитвослов</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Например: Молитвы на каждый день"
                placeholderTextColor="#A78970"
                autoFocus
                style={styles.input}
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setCreating(false)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Отмена</Text>
                </Pressable>
                <Pressable onPress={create} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>{busy ? 'Создание…' : 'Создать'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1},
  intro: {
    marginBottom: 0,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 244, 222, 0.90)',
  },
  introTitle: {
    color: '#5C3822',
    fontFamily: 'serif',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
  },
  introText: {
    marginTop: 7,
    color: '#654731',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 21,
  },
  createButton: {
    marginTop: 14,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: '#6A4328',
  },
  createIcon: {
    marginRight: 7,
    color: '#FFF8EA',
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '300',
  },
  createButtonText: {color: '#FFF8EA', fontSize: 15, fontWeight: '700'},
  sectionLabel: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 3,
    color: '#74563F',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  card: {
    minHeight: 72,
    marginBottom: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.20)',
    backgroundColor: 'rgba(255,244,222,0.96)',
  },
  bookIcon: {
    width: 42,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#F0D8AE',
  },
  bookIconText: {color: '#7A4F2D', fontSize: 20},
  cardText: {flex: 1, minWidth: 0, marginLeft: 12},
  title: {color: '#3E2A1D', fontFamily: 'serif', fontSize: 17, fontWeight: '700'},
  meta: {marginTop: 4, color: '#8A6B52', fontSize: 12},
  chevron: {color: '#9A714C', fontSize: 26},
  emptyCard: {
    marginTop: 50,
    padding: 24,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,244,222,0.94)',
  },
  emptyMark: {color: '#A16E35', fontSize: 24},
  emptyTitle: {marginTop: 8, color: colors.text, fontFamily: 'serif', fontSize: 18, fontWeight: '700'},
  emptyText: {marginTop: 7, textAlign: 'center', color: colors.textSecondary, lineHeight: 20},
  modalBackdrop: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
    backgroundColor: 'rgba(45,27,16,0.52)',
  },
  modalCard: {padding: 18, borderRadius: 20, backgroundColor: '#FFF4DE'},
  modalTitle: {color: '#3E2A1D', fontFamily: 'serif', fontSize: 20, fontWeight: '700'},
  input: {
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.28)',
    borderRadius: 12,
    color: '#3E2A1D',
    backgroundColor: '#FFF9ED',
  },
  modalActions: {marginTop: 16, flexDirection: 'row', justifyContent: 'flex-end', gap: 8},
  secondaryButton: {paddingHorizontal: 15, paddingVertical: 10},
  secondaryText: {color: '#765238', fontWeight: '700'},
  primaryButton: {paddingHorizontal: 17, paddingVertical: 10, borderRadius: 12, backgroundColor: '#7A4F2D'},
  primaryText: {color: '#FFF4DE', fontWeight: '700'},
  pressed: {opacity: 0.65},
});
