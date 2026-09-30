import React, {useCallback, useState} from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {getPrayerBook} from '../services/prayerBooks';
import {colors, spacing} from '../theme';

export const PrayerBookReaderScreen = ({route, navigation}) => {
  const {bookSyncId} = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const [book, setBook] = useState(null);

  const load = useCallback(async () => {
    const current = await getPrayerBook(bookSyncId);
    setBook(current);
  }, [bookSyncId]);

  useFocusEffect(
    useCallback(() => {
      load().catch((error) => console.log('Ошибка чтения молитвослова:', error));
    }, [load])
  );

  return (
    <AppBackground imageOpacity={0.36}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.screen}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: headerHeight + 22,
            paddingHorizontal: spacing.md,
            paddingBottom: 36 + insets.bottom,
          }}
        >
          {!!book?.description && (
            <Text style={styles.description}>{book.description}</Text>
          )}

          {(book?.items || []).map((item, index) => {
            const prayer = item.prayer;
            return (
              <View key={item.sync_id} style={styles.section}>
                <Text style={styles.title}>{prayer.title}</Text>

                {!!prayer.text && (
                  <Text style={styles.text} selectable>
                    {prayer.text}
                  </Text>
                )}

                {!!prayer.photos?.length && (
                  <View style={styles.photos}>
                    {prayer.photos.map((photo) => (
                      <Image
                        key={photo.sync_id}
                        source={{uri: photo.uri}}
                        style={styles.photo}
                        resizeMode="contain"
                      />
                    ))}
                  </View>
                )}

                {index < (book?.items?.length || 0) - 1 && (
                  <View style={styles.separator}>
                    <View style={styles.line} />
                    <Text style={styles.mark}>✦</Text>
                    <View style={styles.line} />
                  </View>
                )}
              </View>
            );
          })}

          {!book?.items?.length && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>В этом молитвослове пока нет молитв.</Text>
            </View>
          )}
        </ScrollView>

        <FixedSectionHeader
          title={book?.title || 'Мой молитвослов'}
          navigation={navigation}
          topInset={insets.top}
        />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1},
  description: {
    marginBottom: 20,
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  section: {marginBottom: 8},
  title: {
    marginBottom: 12,
    textAlign: 'center',
    color: '#7A4F2D',
    fontFamily: 'serif',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700',
  },
  text: {
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 29,
    textAlign: 'justify',
  },
  photos: {marginTop: 14, gap: 10},
  photo: {
    width: '100%',
    minHeight: 220,
    height: 380,
    borderRadius: 15,
    backgroundColor: 'rgba(234,215,184,0.50)',
  },
  separator: {
    marginVertical: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(126,82,38,0.28)'},
  mark: {marginHorizontal: 9, color: '#A16E35', fontSize: 9},
  empty: {padding: 30, alignItems: 'center'},
  emptyText: {color: colors.textSecondary},
});
