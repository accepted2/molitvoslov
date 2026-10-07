import React, {useCallback, useState} from 'react';

import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';

import {useFocusEffect} from '@react-navigation/native';

import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {StatusBar} from 'expo-status-bar';

import {AppBackground} from '../components/layout/AppBackground';

import {BottomNav} from '../components/navigation/BottomNav';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';

import {createMemorialBook, getMemorialBooks, syncMemorials} from '../services/memorials';

import {colors, radius, spacing} from '../theme';
import {useLanguage} from '../context/LanguageContext';

export const MemorialScreen = ({navigation}) => {
  const {t} = useLanguage();
  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const [books, setBooks] = useState([]);

  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);

  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const local = await getMemorialBooks();

      setBooks(local);

      await syncMemorials();

      const refreshed = await getMemorialBooks();

      setBooks(refreshed);
    } catch (loadError) {
      console.log('Ошибка загрузки помянников:', loadError?.message || loadError);

      setError(t('memorial.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const createBook = async () => {
    if (creating) {
      return;
    }

    try {
      setCreating(true);

      const title =
        books.length === 0 ? t('memorial.my') : t('memorial.newTitle', {number: books.length + 1});

      const book = await createMemorialBook(title);

      navigation.navigate('MemorialBook', {
        bookSyncId: book.sync_id,
      });
    } catch (createError) {
      console.log('Ошибка создания помянника:', createError?.message || createError);

      setError(t('memorial.createError'));
    } finally {
      setCreating(false);
    }
  };

  const renderBook = ({item}) => {
    const healthCount = item.health_names?.length || 0;

    const reposeCount = item.repose_names?.length || 0;

    const photoCount = item.photos?.length || 0;

    return (
      <Pressable
        onPress={() =>
          navigation.navigate('MemorialBook', {
            bookSyncId: item.sync_id,
          })
        }
        style={({pressed}) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.cardMark}>
          <Text style={styles.cardMarkText}>†</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title || t('memorial.my')}
          </Text>

          <Text style={styles.cardMeta}>
            {t('memorial.health')}: {healthCount}
            {'  ·  '}
            {t('memorial.repose')}: {reposeCount}
          </Text>

          {!!photoCount && (
            <Text style={styles.cardPhotos}>{t('memorial.photosCount', {count: photoCount})}</Text>
          )}
        </View>

        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View style={styles.screen}>
        {loading && !books.length ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={books}
            keyExtractor={(item) => item.sync_id}
            renderItem={renderBook}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.list,
              {
                paddingTop: headerHeight + 20,

                paddingBottom: 124 + insets.bottom,
              },
            ]}
            ListHeaderComponent={
              <View>
                <View style={styles.intro}>
                  <Text style={styles.introTitle}>{t('memorial.introTitle')}</Text>

                  <Text style={styles.introText}>{t('memorial.introText')}</Text>
                </View>

                {!!error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  onPress={createBook}
                  disabled={creating}
                  style={({pressed}) => [
                    styles.createButton,
                    pressed && styles.pressed,
                    creating && styles.disabled,
                  ]}
                >
                  <Text style={styles.createIcon}>+</Text>

                  <Text style={styles.createText}>{t('memorial.newBook')}</Text>
                </Pressable>

                {!!books.length && <Text style={styles.sectionLabel}>{t('memorial.myBooks')}</Text>}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyMark}>✦</Text>

                <Text style={styles.emptyTitle}>{t('memorial.listEmptyTitle')}</Text>

                <Text style={styles.emptyText}>{t('memorial.listEmptyText')}</Text>
              </View>
            }
          />
        )}

        <FixedSectionHeader
          title={t('memorial.title')}
          navigation={navigation}
          topInset={insets.top}
          showBack={false}
        />

        <BottomNav navigation={navigation} active="memorial" />
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

  list: {
    paddingHorizontal: spacing.lg,
  },

  intro: {
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 244, 222, 0.86)',
  },

  introTitle: {
    color: colors.accentDark,
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: '700',
  },

  introText: {
    marginTop: 7,
    color: colors.textSecondary,
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 21,
  },

  error: {
    marginTop: 10,
    color: colors.liturgical,
    fontSize: 13,
  },

  createButton: {
    minHeight: 52,
    marginTop: 14,
    paddingHorizontal: 17,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDark,
  },

  createIcon: {
    marginRight: 8,
    color: '#FFF8EA',
    fontSize: 25,
    lineHeight: 27,
    fontWeight: '300',
  },

  createText: {
    color: '#FFF8EA',
    fontSize: 15,
    fontWeight: '700',
  },

  sectionLabel: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 3,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  card: {
    minHeight: 86,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 240, 216, 0.92)',
  },

  cardMark: {
    width: 46,
    height: 54,
    marginRight: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(138, 90, 56, 0.11)',
  },

  cardMarkText: {
    color: colors.accentDark,
    fontFamily: 'serif',
    fontSize: 25,
  },

  cardContent: {
    flex: 1,
    minWidth: 0,
  },

  cardTitle: {
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: '700',
  },

  cardMeta: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 12,
  },

  cardPhotos: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 11,
  },

  chevron: {
    marginLeft: 8,
    color: colors.accent,
    fontFamily: 'serif',
    fontSize: 27,
  },

  emptyCard: {
    marginTop: 22,
    padding: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 248, 233, 0.82)',
  },

  emptyMark: {
    color: colors.accent,
    fontSize: 20,
  },

  emptyTitle: {
    marginTop: 8,
    color: colors.accentDark,
    fontFamily: 'serif',
    fontSize: 19,
    fontWeight: '700',
  },

  emptyText: {
    marginTop: 7,
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 21,
  },

  pressed: {
    opacity: 0.62,
  },

  disabled: {
    opacity: 0.5,
  },
});
