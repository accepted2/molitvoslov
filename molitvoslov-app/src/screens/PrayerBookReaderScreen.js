import React, {useCallback, useMemo, useState} from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {getPrayerBook} from '../services/prayerBooks';

const bundledContent = require('../data/offlineContent.json');

const GLORY_TEXT = `Слава Отцу и Сыну и Святому Духу.
И ныне и присно и во веки веков. Аминь.

Аллилуиа, аллилуиа, аллилуиа, слава Тебе, Боже. (Трижды)
Господи, помилуй. (Трижды)

Слава Отцу и Сыну и Святому Духу.

[Здесь можно прочитать прошение о здравии / об упокоении и помянуть имена.]

И ныне и присно и во веки веков. Аминь.`;

const prayerOrigin = (prayer) => {
  const origin = prayer?.origin_data || {};

  return {
    ...(origin.metadata || {}),
    ...origin,
  };
};

const psalterMode = (prayer) => {
  const origin = prayerOrigin(prayer);

  if (origin.source_type !== 'psalter') {
    return null;
  }

  if (origin.save_type === 'kathisma' || origin.anchor_type === 'kathisma') {
    return 'kathisma';
  }

  if (
    origin.save_type === 'psalm' ||
    origin.anchor_type === 'psalm' ||
    (origin.search_source === 'global_prayer_search' && origin.psalm_id)
  ) {
    return 'psalm';
  }

  return null;
};

const getKathisma = (prayer) => {
  const origin = prayerOrigin(prayer);
  const number = Number(origin.kathisma_number || 0);

  if (!number) {
    return null;
  }

  return bundledContent?.kathismas?.by_number?.[String(number)] || null;
};

const getPsalm = (kathisma, prayer) => {
  const origin = prayerOrigin(prayer);
  const psalmId = Number(origin.psalm_id || origin.anchor_id || 0);
  const psalmNumber = Number(origin.psalm_number || 0);

  return (
    (kathisma?.psalms || []).find(
      (item) =>
        (psalmId && Number(item.id) === psalmId) ||
        (psalmNumber && Number(item.number) === psalmNumber)
    ) || null
  );
};

const ParallelText = ({church, russian, churchStyle, russianStyle}) => {
  if (!russian) {
    return <Text style={[styles.psalterText, churchStyle]}>{church}</Text>;
  }

  return (
    <View style={styles.parallelRow}>
      <View style={styles.parallelColumnLeft}>
        <Text style={[styles.psalterText, churchStyle]}>{church}</Text>
      </View>

      <View style={styles.parallelColumnRight}>
        <Text style={[styles.psalterText, styles.psalterRussian, russianStyle]}>{russian}</Text>
      </View>
    </View>
  );
};

const PsalmParallel = ({psalm, verses: verseItems = null, showLabels = false}) => {
  const verses = verseItems || psalm?.verses || [];
  const hasRussian = verses.some((verse) => String(verse?.russian || '').trim());

  return (
    <View>
      {showLabels && hasRussian && (
        <View style={styles.languageRow}>
          <Text style={styles.languageLabel}>ЦЕРКОВНОСЛАВЯНСКИЙ</Text>
          <Text style={[styles.languageLabel, styles.languageLabelRussian]}>РУССКИЙ</Text>
        </View>
      )}

      {verses.map((verse) => {
        const church = String(verse?.church_slavonic || '').trim();
        const russian = String(verse?.russian || '').trim();

        if (!church && !russian) {
          return null;
        }

        return (
          <View key={verse.id || verse.number} style={styles.verseRow}>
            <View style={styles.parallelColumnLeft}>
              <Text style={styles.psalterText}>
                <Text style={styles.verseNumber}>{verse.number} </Text>
                {church || russian}
              </Text>
            </View>

            {hasRussian && (
              <View style={styles.parallelColumnRight}>
                <Text style={[styles.psalterText, styles.psalterRussian]}>
                  <Text style={styles.verseNumberRussian}>{verse.number} </Text>
                  {russian || church}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const psalmChunks = (psalm, glories) => {
  const chunks = [];
  let verses = [];

  const flush = (gloryAfter = false) => {
    if (!verses.length) {
      return;
    }

    chunks.push({
      verses,
      gloryAfter,
    });

    verses = [];
  };

  (psalm?.verses || []).forEach((verse) => {
    verses.push(verse);

    const gloryAfterVerse = (glories || []).some(
      (item) => Number(item?.after_verse) === Number(verse?.id)
    );

    if (gloryAfterVerse) {
      flush(true);
    }
  });

  flush(false);

  if (
    chunks.length &&
    (glories || []).some((item) => Number(item?.after_psalm) === Number(psalm?.id))
  ) {
    chunks[chunks.length - 1].gloryAfter = true;
  }

  return chunks;
};

const PsalterPrayer = ({prayer}) => {
  const mode = psalterMode(prayer);
  const kathisma = getKathisma(prayer);

  if (!mode || !kathisma) {
    return null;
  }

  if (mode === 'psalm') {
    const psalm = getPsalm(kathisma, prayer);

    if (!psalm) {
      return null;
    }

    return (
      <View>
        <Text style={styles.title}>{prayer.title || `Псалом ${psalm.number}`}</Text>
        <PsalmParallel psalm={psalm} showLabels />
      </View>
    );
  }

  const glories = kathisma.glories || [];

  return (
    <View>
      <Text style={styles.title}>{prayer.title || `Кафизма ${kathisma.number}`}</Text>

      {(kathisma.psalms || []).map((psalm, psalmIndex) => (
        <View key={psalm.id || psalm.number} style={styles.psalmSection}>
          <Text style={styles.psalmTitle}>Псалом {psalm.number}</Text>

          {psalmChunks(psalm, glories).map((chunk, chunkIndex) => (
            <View key={`${psalm.id || psalm.number}-${chunkIndex}`}>
              <PsalmParallel
                psalm={psalm}
                verses={chunk.verses}
                showLabels={psalmIndex === 0 && chunkIndex === 0}
              />

              {chunk.gloryAfter && (
                <View style={styles.gloryBlock}>
                  <Text style={styles.gloryText}>{GLORY_TEXT}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}

      {!!kathisma.prayers_after && (
        <View style={styles.afterPrayers}>
          <Text style={styles.psalmTitle}>Молитвы после кафизмы</Text>

          <ParallelText
            church={String(kathisma.prayers_after || '').trim()}
            russian={String(kathisma.prayers_after_russian || '').trim()}
            churchStyle={styles.afterPrayerText}
            russianStyle={styles.afterPrayerText}
          />
        </View>
      )}
    </View>
  );
};

const PrayerPhoto = ({photo}) => {
  const [aspectRatio, setAspectRatio] = useState(0.7);

  const handleLoad = (event) => {
    const {width, height} = event.nativeEvent.source || {};

    if (width && height) {
      setAspectRatio(width / height);
    }
  };

  return (
    <Image
      source={{uri: photo.uri}}
      style={[
        styles.photo,
        {
          aspectRatio,
        },
      ]}
      resizeMode="contain"
      onLoad={handleLoad}
    />
  );
};

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

  const items = useMemo(() => book?.items || [], [book]);

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
        {!!book?.description && <Text style={styles.description}>{book.description}</Text>}

        {items.map((item, index) => {
          const prayer = item.prayer;
          const mode = psalterMode(prayer);

          return (
            <View key={item.sync_id} style={styles.section}>
              {mode ? (
                <PsalterPrayer prayer={prayer} />
              ) : (
                <>
                  <Text style={styles.title}>{prayer.title}</Text>

                  {!!prayer.text && (
                    <Text style={styles.text} selectable>
                      {prayer.text}
                    </Text>
                  )}
                </>
              )}

              {!!prayer.photos?.length && (
                <View style={styles.photos}>
                  {prayer.photos.map((photo) => (
                    <PrayerPhoto
                      key={photo.sync_id}
                      photo={photo}
                    />
                  ))}
                </View>
              )}

              {index < items.length - 1 && (
                <View style={styles.separator}>
                  <View style={styles.line} />
                  <Text style={styles.mark}>✦</Text>
                  <View style={styles.line} />
                </View>
              )}
            </View>
          );
        })}

        {!items.length && (
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
    marginBottom: 12,
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
  languageRow: {
    marginBottom: 7,
    flexDirection: 'row',
  },
  languageLabel: {
    flex: 1,
    paddingRight: 9,
    color: '#A16E35',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  languageLabelRussian: {
    paddingLeft: 9,
    paddingRight: 0,
    color: '#877666',
  },
  parallelRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  verseRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 7,
  },
  parallelColumnLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 9,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(123,79,36,0.20)',
  },
  parallelColumnRight: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 9,
  },
  psalterText: {
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 16,
    lineHeight: 25,
    textAlign: 'left',
  },
  psalterRussian: {
    color: '#765238',
  },
  verseNumber: {
    color: '#A16E35',
    fontSize: 12,
    fontWeight: '700',
  },
  verseNumberRussian: {
    color: '#978E83',
    fontSize: 12,
    fontWeight: '700',
  },
  psalmSection: {
    marginBottom: 18,
  },
  psalmTitle: {
    marginBottom: 10,
    textAlign: 'center',
    color: '#7A4F2D',
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  gloryBlock: {
    marginVertical: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(123,79,36,0.20)',
  },
  gloryText: {
    color: '#765238',
    fontFamily: 'serif',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  afterPrayers: {
    marginTop: 4,
  },
  afterPrayerText: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'justify',
  },
  photos: {
    width: '100%',
    borderRadius: 15,
    backgroundColor: 'rgba(234,215,184,0.50)',
  },
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
