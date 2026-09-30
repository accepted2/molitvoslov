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

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {getPrayerBook} from '../services/prayerBooks';
import {colors} from '../theme';

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
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: headerHeight + 14,
            paddingHorizontal: 14,
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
          showTitle={false}
        />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#FFF4DE'},
  description: {
    marginBottom: 18,
    marginHorizontal: 4,
    color: '#765238',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 14,
    paddingBottom: 14,
  },
  title: {
    marginBottom: 10,
    textAlign: 'center',
    color: '#7A4F2D',
    fontFamily: 'serif',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
  },
  text: {
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 16,
    lineHeight: 26,
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
    marginTop: 20,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(123,79,36,0.20)',
  },
  mark: {marginHorizontal: 9, color: '#A16E35', fontSize: 9},
  empty: {padding: 30, alignItems: 'center'},
  emptyText: {color: '#765238'},
});
