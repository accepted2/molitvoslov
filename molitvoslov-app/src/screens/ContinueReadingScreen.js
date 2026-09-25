import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {LinearGradient} from 'expo-linear-gradient';
import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';

import {contentApi as api} from '../services/contentApi';
import {deleteReadingProgress, getReadingProgress} from '../services/readingProgress';

export const ContinueReadingScreen = ({navigation}) => {
  const [categories, setCategories] = useState([]);
  const [akathists, setAkathists] = useState([]);
  const [canons, setCanons] = useState([]);
  const [prayerRules, setPrayerRules] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const [
        categoriesResponse,
        akathistsResponse,
        canonsResponse,
        prayerRulesResponse,
        progressList,
      ] = await Promise.all([
        api.get('categories/'),
        api.get('akathists/'),
        api.get('canons/'),
        api.get('prayer-rules/'),
        getReadingProgress(),
      ]);

      setCategories(categoriesResponse.data);
      setAkathists(akathistsResponse.data);
      setCanons(canonsResponse.data);
      setPrayerRules(prayerRulesResponse.data);
      setProgress(progressList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const makeItem = progressItem => {
    const percent = Number(progressItem.progress_percent || 0);

    if (progressItem.source_type === 'psalter') {
      const info = progressItem.anchor_info;

      return {
        id: progressItem.id,
        type: 'Псалтирь',
        glyph: '¶',
        title: 'Псалтирь',
        position: info?.kathisma_number
          ? info.psalm_number
            ? `Кафизма ${info.kathisma_number} · Псалом ${info.psalm_number}`
            : `Кафизма ${info.kathisma_number}`
          : 'Продолжить с сохранённого места',
        percent,
        onPress: () => {
          if (info?.kathisma_number) {
            navigation.navigate('Kathisma', {
              kathismaNumber: info.kathisma_number,
              kathismaTitle: `Кафизма ${info.kathisma_number}`,
            });
            return;
          }

          navigation.navigate('Psalter');
        },
      };
    }

    if (progressItem.source_type === 'akathist') {
      const akathist = akathists.find(
        item => Number(item.id) === Number(progressItem.source_id)
      );

      if (!akathist) return null;

      return {
        id: progressItem.id,
        type: 'Акафист',
        glyph: '☦',
        title: akathist.title,
        position: 'Продолжить акафист',
        percent,
        onPress: () =>
          navigation.navigate('Akathist', {
            akathistId: akathist.id,
            slug: akathist.slug,
            title: akathist.title,
          }),
      };
    }

    if (progressItem.source_type === 'canon') {
      const canon = canons.find(item => Number(item.id) === Number(progressItem.source_id));
      if (!canon) return null;

      const info = progressItem.anchor_info;
      const position = info?.ode_number
        ? `Песнь ${info.ode_number}${info.heading ? ` · ${info.heading}` : ''}`
        : 'Продолжить канон';

      return {
        id: progressItem.id,
        type: 'Канон',
        glyph: '▤',
        title: canon.title,
        position,
        percent,
        onPress: () =>
          navigation.navigate('Canon', {
            canonId: canon.id,
            slug: canon.slug,
            title: canon.title,
          }),
      };
    }

    if (progressItem.source_type === 'prayer_rule') {
      const rule = prayerRules.find(item => Number(item.id) === Number(progressItem.source_id));
      if (!rule) return null;

      const ruleItem = rule.items?.find(
        item => Number(item.id) === Number(progressItem.anchor_id)
      );

      return {
        id: progressItem.id,
        type: 'Молитвенное правило',
        glyph: '✦',
        title: rule.name,
        position: ruleItem?.text?.title || ruleItem?.title || 'Продолжить правило',
        percent,
        onPress: () => navigation.navigate('PrayerRule', {slug: rule.slug}),
      };
    }

    if (progressItem.source_type === 'category') {
      const category = categories.find(
        item => Number(item.id) === Number(progressItem.source_id)
      );
      if (!category) return null;

      return {
        id: progressItem.id,
        type: 'Молитвы',
        glyph: '†',
        title: category.name,
        position: 'Продолжить с сохранённого места',
        percent,
        onPress: () =>
          navigation.navigate('Book', {
            categoryId: category.id,
            categorySlug: category.slug,
            categoryName: category.name,
          }),
      };
    }

    return null;
  };

  const items = useMemo(
    () => progress.map(makeItem).filter(Boolean),
    [progress, categories, akathists, canons, prayerRules]
  );

  const removeItem = async id => {
    await deleteReadingProgress(id);
    setProgress(current => current.filter(item => item.id !== id));
  };
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.title}>Продолжить чтение</Text>
          <Text style={styles.subtitle}>Все начатые тексты и сохранённый прогресс</Text>
        </View>

        <Text style={styles.headerCross}>☦</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8A5A38" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {items.length ? (
            items.map(item => (
              <View key={item.id} style={styles.card}>
                <Pressable
                  onPress={item.onPress}
                  style={({pressed}) => [styles.cardMain, pressed && styles.pressed]}
                >
                  <View style={styles.icon}>
                    <Text style={styles.iconText}>{item.glyph}</Text>
                  </View>

                  <View style={styles.cardText}>
                    <Text style={styles.type}>{item.type}</Text>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.position} numberOfLines={2}>
                      {item.position}
                    </Text>

                    <View style={styles.progressRow}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {width: `${Math.max(0, Math.min(item.percent, 100))}%`},
                          ]}
                        />
                      </View>
                      <Text style={styles.percent}>{item.percent}%</Text>
                    </View>
                  </View>

                  <Text style={styles.arrow}>›</Text>
                </Pressable>

                <Pressable
                  hitSlop={8}
                  onPress={() => removeItem(item.id)}
                  style={({pressed}) => [styles.remove, pressed && styles.pressed]}
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyCross}>☦</Text>
              <Text style={styles.emptyTitle}>Начатых чтений пока нет</Text>
              <Text style={styles.emptyText}>
                Когда вы начнёте читать молитву, акафист, канон или Псалтирь, прогресс появится здесь.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <BottomNav
        navigation={navigation}
        active={null}
      />

</AppBackground>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3E4C6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F7ECD7',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(126, 82, 38, 0.18)',
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  backText: {
    marginTop: -3,
    color: '#7D502B',
    fontSize: 36,
    lineHeight: 38,
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    color: '#422A1B',
    fontFamily: 'serif',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 3,
    color: '#836B55',
    fontSize: 12,
    lineHeight: 17,
  },
  headerCross: {
    marginLeft: 8,
    color: '#9A6A37',
    fontSize: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 14,
    paddingBottom: 30,
  },
  card: {
    position: 'relative',
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.18)',
    shadowColor: '#5B321B',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 26,
  },
  icon: {
    width: 54,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EAD0A0',
    borderWidth: 1,
    borderColor: '#C69255',
  },
  iconText: {
    color: '#6D4326',
    fontFamily: 'serif',
    fontSize: 27,
    fontWeight: '700',
  },
  cardText: {
    flex: 1,
    marginLeft: 12,
  },
  type: {
    color: '#A0733D',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardTitle: {
    marginTop: 2,
    color: '#3F281A',
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  position: {
    marginTop: 4,
    color: '#7E6854',
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 17,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: '#E8DDCB',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#B8874A',
  },
  percent: {
    width: 36,
    marginLeft: 8,
    color: '#765D48',
    fontSize: 11,
    textAlign: 'right',
  },
  arrow: {
    marginLeft: 8,
    color: '#9A6A36',
    fontSize: 30,
    lineHeight: 32,
  },
  remove: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F4E5CF',
  },
  removeText: {
    color: '#8B6B50',
    fontSize: 18,
    lineHeight: 20,
  },
  empty: {
    marginTop: 48,
    alignItems: 'center',
    padding: 28,
    borderRadius: 20,
    backgroundColor: '#F8EBD4',
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.18)',
  },
  emptyCross: {
    color: '#A6753D',
    fontSize: 30,
  },
  emptyTitle: {
    marginTop: 12,
    color: '#442B1C',
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 8,
    color: '#806A56',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.68,
  },
});
