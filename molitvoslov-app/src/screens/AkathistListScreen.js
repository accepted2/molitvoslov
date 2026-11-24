import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {Ionicons} from '@expo/vector-icons';
import {SaveHeartIcon} from '../components/icons/SaveHeartIcon';
import {contentApi as api} from '../services/contentApi';
import {subscribeToContentUpdates} from '../services/contentStore';
import {deleteSavedItem, getSavedItems, saveItem} from '../services/savedItems';
import {colors} from '../theme';
import {useLanguage} from '../context/LanguageContext';
import {getLocalizedField} from '../services/localizedContent';
import {shareContent} from '../services/contentSharing';
import {ContentContextMenu} from '../components/share/ContentContextMenu';
import {LocalSearchField, filterByTitle} from '../components/search/LocalSearchField';

export const AkathistListScreen = ({navigation}) => {
  const {language, t} = useLanguage();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);

  const [akathists, setAkathists] = useState([]);
  const [contextItem,setContextItem]=useState(null);
  const [savedAkathists, setSavedAkathists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''); // MOLITVOSLOV_CATEGORY_TITLE_SEARCH_V1
  const visibleRows = useMemo(() => filterByTitle(
    akathists, query, item => getLocalizedField(item, 'title', language)
  ), [akathists, query, language]);

  const loadSavedAkathists = useCallback(async () => {
    try {
      const saved = await getSavedItems({
        source_type: 'akathist',
        save_type: 'akathist',
      });

      setSavedAkathists(saved.filter((item) => item.anchor_type === 'akathist'));
    } catch (error) {
      console.log('Ошибка загрузки избранных акафистов:', error.response?.data || error.message);
    }
  }, []);

  const loadAkathists = useCallback(async () => {
    try {
      setLoading(true);

      const [response] = await Promise.all([api.get('akathists/'), loadSavedAkathists()]);

      setAkathists(response.data.filter((item) => item.is_visible));
    } catch (error) {
      console.log('Ошибка загрузки акафистов:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  }, [loadSavedAkathists]);

  useEffect(() => {
    loadAkathists();
  }, [loadAkathists]);

  useEffect(
    () =>
      subscribeToContentUpdates(() => {
        loadAkathists();
      }),
    [loadAkathists]
  );

  useFocusEffect(
    useCallback(() => {
      loadSavedAkathists();
    }, [loadSavedAkathists])
  );

  const getSavedAkathist = (akathistId) =>
    savedAkathists.find((item) => Number(item.anchor_id) === Number(akathistId));

  const toggleFavorite = async (akathist) => {
    const existing = getSavedAkathist(akathist.id);

    try {
      if (existing) {
        await deleteSavedItem(existing.id);

        setSavedAkathists((current) => current.filter((item) => item.id !== existing.id));

        return;
      }

      const saved = await saveItem({
        save_type: 'akathist',
        source_type: 'akathist',
        source_id: akathist.id,
        anchor_type: 'akathist',
        anchor_id: akathist.id,
        source_title: getLocalizedField(akathist, 'title', language),
        item_title: getLocalizedField(akathist, 'title', language),
        text: '',
        metadata: {
          slug: akathist.slug,
        },
      });

      setSavedAkathists((current) => [saved, ...current]);
    } catch (error) {
      console.log('Ошибка сохранения акафиста:', error.response?.data || error.message);
    }
  };

  const handlePress = (akathist) => {
    navigation.navigate('Akathist', {
      akathistId: akathist.id,
      slug: akathist.slug,
      title: getLocalizedField(akathist, 'title', language),
    });
  };

  if (loading) {
    return (
      <AppBackground imageOpacity={0.72}>
        <StatusBar style="light" translucent backgroundColor="transparent" />

        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />

          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </AppBackground>
    );
  }

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View style={styles.screen}>
        <FlatList
          data={visibleRows}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: headerHeight + 12,
              paddingBottom: 80 + insets.bottom,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          renderItem={({item}) => {
            const saved = !!getSavedAkathist(item.id);

            return (
              <View style={[styles.item, saved && styles.itemSaved]}>
                <TouchableOpacity
                  style={styles.itemMain}
                  activeOpacity={0.7}
                  onPress={() => handlePress(item)}
                  onLongPress={() => setContextItem(item)}
                  delayLongPress={340}
                >
                  <Text style={styles.title}>{getLocalizedField(item, 'title', language)}</Text>

                  <Text style={styles.arrow}>›</Text>
                </TouchableOpacity>

                <View style={styles.itemActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={saved ? t('common.removeFromFavorites') : t('common.addFavorite')}
                    hitSlop={6}
                    onPress={() => toggleFavorite(item)}
                    style={({pressed}) => [styles.favoriteButton, pressed && styles.pressed]}
                  >
                    <SaveHeartIcon active={saved} size={19} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Поделиться акафистом"
                    hitSlop={6}
                    onPress={() => shareContent({
                      title:getLocalizedField(item,'title',language),
                      screen:'Akathist',params:{akathistId:item.id,slug:item.slug},
                    })}
                    style={({pressed}) => [styles.favoriteButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="share-social-outline" size={19} color="#765238" />
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{query.trim() ? 'По запросу нет акафистов' : t('menu.akathistsEmpty')}</Text>
            </View>
          }
        />

        <FixedSectionHeader
          title={t('menu.akathistsTitle')}
          navigation={navigation}
          topInset={insets.top}
          onHeaderHeightChange={setHeaderHeight}
          rightContent={
            <LocalSearchField
              compact
              value={query}
              onChangeText={setQuery}
              placeholder="Поиск акафиста"
            />
          }
        />

        <BottomNav navigation={navigation} active={null} />
        <ContentContextMenu
          visible={!!contextItem}
          title={contextItem?getLocalizedField(contextItem,'title',language):''}
          onClose={()=>setContextItem(null)}
          onOpen={contextItem ? ()=>handlePress(contextItem) : null}
          onShare={contextItem ? ()=>shareContent({
            title:getLocalizedField(contextItem,'title',language),
            screen:'Akathist',params:{akathistId:contextItem.id,slug:contextItem.slug},
          }) : null}
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

  itemActions:{flexDirection:'row',alignSelf:'stretch',alignItems:'center',
    borderLeftWidth:1,borderLeftColor:'rgba(126,82,38,0.24)',
    backgroundColor:'rgba(238,220,192,0.48)',paddingHorizontal:3},
  favoriteButton: {
    width: 34,
    minHeight:40,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: 'transparent',
  },

  favoriteText: {
    color: '#A9947C',
    fontSize: 22,
    lineHeight: 24,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
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
