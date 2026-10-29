import React, {useCallback, useMemo, useState} from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {useReadingChrome} from '../hooks/useReadingChrome';
import {getPrayerBook} from '../services/prayerBooks';
import {useLanguage} from '../context/LanguageContext';

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
  const {t} = useLanguage();
  const verses = verseItems || psalm?.verses || [];
  const hasRussian = verses.some((verse) => String(verse?.russian || '').trim());

  return (
    <View>
      {showLabels && hasRussian && (
        <View style={styles.languageRow}>
          <Text style={styles.languageLabel}>{t('prayerBooks.churchSlavonic')}</Text>
          <Text style={[styles.languageLabel, styles.languageLabelRussian]}>
            {t('prayerBooks.russian')}
          </Text>
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
  const {t} = useLanguage();
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
        <Text style={styles.title}>
          {prayer.title || t('psalter.psalm', {number: psalm.number})}
        </Text>
        <PsalmParallel psalm={psalm} showLabels />
      </View>
    );
  }

  const glories = kathisma.glories || [];

  return (
    <View>
      <Text style={styles.title}>
        {prayer.title || t('psalter.kathisma', {number: kathisma.number})}
      </Text>

      {(kathisma.psalms || []).map((psalm, psalmIndex) => (
        <View key={psalm.id || psalm.number} style={styles.psalmSection}>
          <Text style={styles.psalmTitle}>{t('psalter.psalm', {number: psalm.number})}</Text>

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
          <Text style={styles.psalmTitle}>
            {t('psalter.prayersAfterKathisma', {number: kathisma.number})}
          </Text>

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
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const [aspectRatio, setAspectRatio] = useState(0.7);
  const [expanded, setExpanded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const displayWidth = Math.max(240, screenWidth - 28);
  const imageHeight = Math.min(1000, displayWidth / aspectRatio);
  const enlargedWidth = zoomed ? screenWidth * 2 : screenWidth;
  const enlargedHeight = enlargedWidth / aspectRatio;

  const handleLoad = (event) => {
    const {width, height} = event.nativeEvent.source || {};
    if (width && height) setAspectRatio(width / height);
  };

  return (
    <>
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel="Увеличить фотографию молитвы"
      >
        <Image
          source={{uri: photo.uri}}
          style={[styles.photo, {height: imageHeight}]}
          resizeMode="contain"
          onLoad={handleLoad}
        />
        <Text style={styles.photoZoomHint}>Нажмите для увеличения</Text>
      </Pressable>
      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setExpanded(false);
          setZoomed(false);
        }}
      >
        <View style={styles.photoModal}>
          <Pressable
            onPress={() => {
              setExpanded(false);
              setZoomed(false);
            }}
            style={styles.photoModalClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть фотографию"
          >
            <Text style={styles.photoModalCloseText}>×</Text>
          </Pressable>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{alignItems: 'center'}}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{minHeight: screenHeight, justifyContent: 'center'}}
            >
              <Pressable onPress={() => setZoomed((value) => !value)}>
                <Image
                  source={{uri: photo.uri}}
                  resizeMode="contain"
                  style={{width: enlargedWidth, height: enlargedHeight}}
                />
              </Pressable>
            </ScrollView>
          </ScrollView>
          <Text style={styles.photoModalHint}>
            Нажмите на фото: {zoomed ? 'уменьшить' : 'увеличить в 2 раза'}
          </Text>
        </View>
      </Modal>
    </>
  );
};

export const PrayerBookReaderScreen = ({route, navigation}) => {
  const {t} = useLanguage();
  const {bookSyncId, prayerSyncId = null} = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const [book, setBook] = useState(null);
  const {readingChromeHidden, handleReadingScroll: onChromeScroll} = useReadingChrome();
  const lastScrollY = React.useRef(0);
  const scrollDirection = React.useRef('');
  const scrollDistance = React.useRef(0);
  const handleReadingScroll = event => {
    const nextY = Math.max(0, event.nativeEvent.contentOffset.y);
    const delta = nextY - lastScrollY.current;
    lastScrollY.current = nextY;
    if (delta === 0) return;
    onChromeScroll('activity');
    if (Math.abs(delta) > 100) { scrollDistance.current = 0; return; }
    const direction = nextY < 35 ? 'up' : delta > 0 ? 'down' : 'up';
    if (direction !== scrollDirection.current) {
      scrollDistance.current += Math.abs(delta);
      if (scrollDistance.current >= 5 || nextY < 35) {
        scrollDirection.current = direction;
        scrollDistance.current = 0;
        onChromeScroll(direction);
      }
    } else {
      scrollDistance.current = 0;
    }
  };

  const load = useCallback(async () => {
    const current = await getPrayerBook(bookSyncId);
    setBook(current);
  }, [bookSyncId]);

  useFocusEffect(
    useCallback(() => {
      load().catch((error) => console.log('Ошибка чтения молитвослова:', error));
    }, [load])
  );

  const items = useMemo(
    () =>
      (book?.items || []).filter((item) => !prayerSyncId || item.prayer?.sync_id === prayerSyncId),
    [book, prayerSyncId]
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <ScrollView
        onScroll={handleReadingScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerHeight + 14,
          paddingHorizontal: 14,
          paddingBottom: 105 + insets.bottom,
        }}
      >
        {!prayerSyncId && !!book?.description && (
          <Text style={styles.description}>{book.description}</Text>
        )}

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
                    <PrayerPhoto key={photo.sync_id} photo={photo} />
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
            <Text style={styles.emptyText}>{t('prayerBooks.readerEmpty')}</Text>
          </View>
        )}
      </ScrollView>

      {!!prayerSyncId && items.length > 0 && (
        <View style={[styles.editBar, {paddingBottom: Math.max(insets.bottom, 12)}]}>
          <Pressable
            onPress={() => navigation.navigate('PersonalPrayerEditor', {bookSyncId, prayerSyncId})}
            style={styles.editButton}
            accessibilityRole="button"
          >
            <Text style={styles.editButtonText}>✎ Редактировать молитву</Text>
          </Pressable>
        </View>
      )}

      <FixedSectionHeader
        title={prayerSyncId && items.length === 1 ? (items[0]?.prayer?.title || book?.title) : (book?.title || t('prayerBooks.title'))}
        navigation={navigation}
        topInset={insets.top}
        showTitle
        compactReading
        readingHidden={readingChromeHidden}
      />
      {!prayerSyncId && <BottomNav navigation={navigation} active={null} readingHidden={readingChromeHidden} />}
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
    borderRadius: 12,
    backgroundColor: 'rgba(234,215,184,0.50)',
  },
  photoZoomHint: {
    textAlign: 'center',
    color: '#806245',
    fontSize: 12,
    paddingVertical: 8,
  },
  photoModal: {
    flex: 1,
    backgroundColor: '#15110E',
    justifyContent: 'center',
  },
  photoModalClose: {
    position: 'absolute',
    zIndex: 4,
    top: 34,
    right: 14,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#3A2C24',
  },
  photoModalCloseText: {color: '#FFFFFF', fontSize: 36},
  photoModalHint: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    color: '#FFFFFF',
    fontSize: 13,
  },
  editBar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: '#FFF4DE',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(123,79,36,0.20)',
  },
  editButton: {
    minHeight: 48,
    backgroundColor: '#5A3822',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {color: '#FFF4DE', fontSize: 15, fontWeight: '700'},
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
