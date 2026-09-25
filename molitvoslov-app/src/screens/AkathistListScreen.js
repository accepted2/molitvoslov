import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {LinearGradient} from 'expo-linear-gradient';
import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {contentApi as api} from '../services/contentApi';
import {
  deleteSavedItem,
  getSavedItems,
  saveItem,
} from '../services/savedItems';
import {colors} from '../theme';

export const AkathistListScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;

  const [akathists, setAkathists] = useState([]);
  const [savedAkathists, setSavedAkathists] = useState([]);
  const [loading, setLoading] = useState(true);


  const loadSavedAkathists = useCallback(async () => {
    try {
      const saved = await getSavedItems({
        source_type: 'akathist',
        save_type: 'akathist',
      });

      setSavedAkathists(
        saved.filter(item => item.anchor_type === 'akathist')
      );
    } catch (error) {
      console.log(
        'Ошибка загрузки избранных акафистов:',
        error.response?.data || error.message
      );
    }
  }, []);

  const loadAkathists = useCallback(async () => {
    try {
      setLoading(true);

      const [response] = await Promise.all([
        api.get('akathists/'),
        loadSavedAkathists(),
      ]);

      setAkathists(
        response.data.filter(item => item.is_visible)
      );
    } catch (error) {
      console.log(
        'Ошибка загрузки акафистов:',
        error.response?.data || error.message
      );
    } finally {
      setLoading(false);
    }
  }, [loadSavedAkathists]);

  useEffect(() => {
    loadAkathists();
  }, [loadAkathists]);

  useFocusEffect(
    useCallback(() => {
      loadSavedAkathists();
    }, [loadSavedAkathists])
  );

  const getSavedAkathist = akathistId =>
    savedAkathists.find(
      item => Number(item.anchor_id) === Number(akathistId)
    );

  const toggleFavorite = async akathist => {
    const existing = getSavedAkathist(akathist.id);

    try {
      if (existing) {
        await deleteSavedItem(existing.id);

        setSavedAkathists(current =>
          current.filter(item => item.id !== existing.id)
        );

        return;
      }

      const saved = await saveItem({
        save_type: 'akathist',
        source_type: 'akathist',
        source_id: akathist.id,
        anchor_type: 'akathist',
        anchor_id: akathist.id,
        source_title: akathist.title,
        item_title: akathist.title,
        text: '',
        metadata: {
          slug: akathist.slug,
        },
      });

      setSavedAkathists(current => [saved, ...current]);
    } catch (error) {
      console.log(
        'Ошибка сохранения акафиста:',
        error.response?.data || error.message
      );
    }
  };

  const handlePress = akathist => {
    navigation.navigate('Akathist', {
      akathistId: akathist.id,
      slug: akathist.slug,
      title: akathist.title,
    });
  };

  if (loading) {
    return (
      <AppBackground imageOpacity={0.72}>
        <StatusBar
          style="light"
          translucent
          backgroundColor="transparent"
        />

        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color={colors.accent}
          />

          <Text style={styles.loadingText}>
            Загрузка...
          </Text>
        </View>
      </AppBackground>
    );
  }

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <View style={styles.screen}>
        <FlatList
          data={akathists}
          keyExtractor={item => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: headerHeight + 20,
              paddingBottom: 80 + insets.bottom,
            }
          ]}
          renderItem={({item}) => {
            const saved = !!getSavedAkathist(item.id);

            return (
              <View
                style={[
                  styles.item,
                  saved && styles.itemSaved,
                ]}
              >
                <TouchableOpacity
                  style={styles.itemMain}
                  activeOpacity={0.7}
                  onPress={() => handlePress(item)}
                >
                  <Text style={styles.title}>
                    {item.title}
                  </Text>

                  <Text style={styles.arrow}>
                    ›
                  </Text>
                </TouchableOpacity>

                <Pressable
                  hitSlop={8}
                  onPress={() => toggleFavorite(item)}
                  style={({pressed}) => [
                    styles.favoriteButton,
                    saved && styles.favoriteButtonActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.favoriteText,
                      saved && styles.favoriteTextActive,
                    ]}
                  >
                    {saved ? '★' : '☆'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                Акафисты пока не добавлены
              </Text>
            </View>
          }
        />

        <View
          pointerEvents="box-none"
          style={[
            styles.fixedHeader,
            {
              height: headerHeight + 26,
            },
          ]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(239, 211, 160, 0.94)',
              'rgba(239, 211, 160, 0.90)',
              'rgba(239, 211, 160, 0.72)',
              'rgba(239, 211, 160, 0.34)',
              'rgba(239, 211, 160, 0)',
            ]}
            locations={[0, 0.48, 0.66, 0.84, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View
            style={[
              styles.headerContent,
              {
                height: headerHeight,
                paddingTop: insets.top,
              },
            ]}
          >
            <Pressable
              hitSlop={12}
              onPress={() => navigation.goBack()}
              style={({pressed}) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.backArrow}>
                ‹
              </Text>
            </Pressable>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>
                Акафисты
              </Text>

              <View style={styles.headerOrnament}>
                <View style={styles.headerLine} />

                <Text style={styles.headerMark}>
                  ✦
                </Text>

                <View style={styles.headerLine} />
              </View>
            </View>
          </View>
        </View>

        <BottomNav
          navigation={navigation}
          active={null}
        />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  listContent: {
    paddingBottom: 18,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  loadingText: {
    marginTop: 8,
    color: colors.textSecondary,
  },

  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },

  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  backButton: {
    width: 38,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backArrow: {
    marginTop: -2,
    color: '#6F4727',
    fontFamily: 'serif',
    fontSize: 34,
    lineHeight: 36,
  },

  headerTitleWrap: {
    marginLeft: 2,
    paddingTop: 1,
  },

  headerTitle: {
    color: '#432A19',
    fontFamily: 'serif',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '700',
  },

  headerOrnament: {
    width: 118,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },

  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(139, 88, 40, 0.38)',
  },

  headerMark: {
    marginHorizontal: 6,
    color: '#98622E',
    fontSize: 7,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 55,
    marginHorizontal: 10,
    marginVertical: 2,

    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.18)',

    backgroundColor: 'rgba(248, 233, 207, 0.96)',

    shadowColor: '#4A2817',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,

    overflow: 'hidden',
  },

  itemSaved: {
    borderColor: 'rgba(156, 100, 45, 0.34)',
    backgroundColor: 'rgba(250, 236, 209, 0.96)',
  },

  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',

    paddingVertical: 9,
    paddingLeft: 14,
    paddingRight: 5,
  },

  title: {
    flex: 1,

    color: '#3B281B',
    fontFamily: 'serif',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },

  arrow: {
    marginLeft: 8,

    color: '#9A714C',
    fontSize: 23,
    lineHeight: 25,
  },

  favoriteButton: {
    width: 42,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: 'transparent',
  },

  favoriteButtonActive: {
    backgroundColor: 'rgba(190, 139, 72, 0.08)',
  },

  favoriteText: {
    color: '#A9947C',
    fontSize: 22,
  },

  favoriteTextActive: {
    color: '#A66A2E',
  },

  pressed: {
    opacity: 0.6,
  },

  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },

  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});