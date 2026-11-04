import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import SelectableDocumentReader from './SelectableDocumentReader';
import {savedSourceId} from './CalendarSaveText';
import {FixedSectionHeader} from '../navigation/FixedSectionHeader';
import {BottomNav} from '../navigation/BottomNav';
import {useReadingChrome} from '../../hooks/useReadingChrome';
import {useScopedReaderAppearance} from '../../hooks/useScopedReaderAppearance';
import {resolveReaderAppearance} from '../../services/scopedReaderAppearance';
import {getSavedItems} from '../../services/savedItems';
import {buildPersonalPrayerReadingDocument} from '../../services/personalPrayerReadingDocument';

export const PersonalPrayerReadingView = ({
  book, items, bookSyncId, prayerSyncId, navigation, fallbackTitle,
}) => {
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [savedItems, setSavedItems] = useState([]);
  const [showPhotos, setShowPhotos] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState(null);
  const [photoZoom, setPhotoZoom] = useState(false);
  const readerRef = useRef(null);
  const {readingChromeHidden, handleReadingScroll, handleNativeReadingScroll} = useReadingChrome();
  const {appearance} = useScopedReaderAppearance(
    'personal_prayer', prayerSyncId || bookSyncId
  );
  const background = resolveReaderAppearance(appearance).background;
  const isSingle = Boolean(prayerSyncId && items.length === 1);
  const displayTitle = isSingle
    ? String(items[0]?.prayer?.title || fallbackTitle || 'Молитва')
    : String(book?.title || fallbackTitle || 'Мой молитвослов');

  useEffect(() => {
    setHeaderHeight(insets.top + 56);
  }, [insets.top]);

  useEffect(() => {
    readerRef.current?.applyAppearance(appearance);
  }, [appearance]);

  // The same source ID as the old selectable TextInput preserves existing
  // personal-prayer favorites and their fragment offsets.
  useFocusEffect(useCallback(() => {
    let active = true;
    const sources = new Set(items.map(item => savedSourceId(item.prayer.sync_id)));
    getSavedItems({source_type: 'personal_prayer'})
      .then(rows => {if (active) setSavedItems(rows.filter(row => sources.has(Number(row.source_id))));})
      .catch(error => console.log('Не удалось загрузить сохранённые фрагменты:', error?.message || error));
    return () => {active = false;};
  }, [items]));

  const documentData = useMemo(() => buildPersonalPrayerReadingDocument({
    book: isSingle ? {...book, description: ''} : book,
    items, bookSyncId,
    sourceIdForSync: savedSourceId,
    savedItems,
  }), [book, isSingle, items, bookSyncId, savedItems]);

  const images = useMemo(
    () => items.flatMap(item =>
      (item.prayer.photos || []).map(photo => ({
        ...photo, prayerTitle: item.prayer.title || 'Молитва',
      }))
    ), [items]
  );

  return (
    <View style={[styles.screen, {backgroundColor: background}]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {showPhotos && (
        <ScrollView
          style={styles.photoGallery}
          contentContainerStyle={{paddingTop: headerHeight + 16, paddingBottom: 110 + insets.bottom}}
        >
          {images.map((photo, index) => (
            <Pressable
              key={photo.sync_id || String(index)}
              onPress={() => {setZoomedPhoto(photo); setPhotoZoom(false);}}
              style={styles.photoCard}
              accessibilityRole="button"
              accessibilityLabel={'Открыть фотографию: ' + photo.prayerTitle}
            >
              <Text style={styles.photoCaption}>{photo.prayerTitle}</Text>
              <Image source={{uri: photo.uri}} style={styles.photo} resizeMode="contain" />
            </Pressable>
          ))}
        </ScrollView>
      )}
      {/* Keep the selection and reading position when viewing attached photos. */}
      <View style={{flex: 1, display: showPhotos ? 'none' : 'flex'}}>
        <SelectableDocumentReader
          ref={readerRef}
          documentData={documentData}
          savedProgress={null}
          topContentInset={headerHeight}
          bottomContentInset={isSingle ? 75 + insets.bottom : 90 + insets.bottom}
          respectBottomSafeArea={false}
          backgroundColor={background}
          onReadingScroll={handleReadingScroll}
          onNativeReadingScroll={handleNativeReadingScroll}
        />
      </View>

      {images.length > 0 && (
        <Pressable
          style={[styles.photoToggle, {bottom: isSingle ? 88 + insets.bottom : 92 + insets.bottom}]}
          onPress={() => setShowPhotos(value => !value)}
          accessibilityRole="button"
        >
          <Text style={styles.photoToggleText}>
            {showPhotos ? 'Вернуться к чтению' : 'Фотографии (' + images.length + ')'}
          </Text>
        </Pressable>
      )}

      {isSingle && (
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
        onHeaderHeightChange={setHeaderHeight}
        title={displayTitle}
        navigation={navigation}
        topInset={insets.top}
        showTitle
        compactReading
        readingHidden={showPhotos ? false : readingChromeHidden}
      />
      {!prayerSyncId && (
        <BottomNav navigation={navigation} active={null} readingHidden={showPhotos ? false : readingChromeHidden} />
      )}

      <Modal visible={Boolean(zoomedPhoto)} animationType="fade" transparent onRequestClose={() => setZoomedPhoto(null)}>
        <View style={styles.zoomBackdrop}>
          <Pressable style={styles.closeZoom} onPress={() => setZoomedPhoto(null)} accessibilityRole="button">
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <ScrollView horizontal contentContainerStyle={styles.zoomScroll}>
            {!!zoomedPhoto && (
              <Pressable onPress={() => setPhotoZoom(value => !value)}>
                <Image
                  source={{uri: zoomedPhoto.uri}}
                  resizeMode="contain"
                  style={{width: photoZoom ? width * 2 : width, height: Math.max(250, height - 100)}}
                />
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#FFF4DE'},
  photoGallery: {flex: 1},
  photoCard: {marginHorizontal: 14, marginBottom: 18, padding: 12, backgroundColor: 'rgba(234,215,184,0.50)', borderRadius: 14},
  photoCaption: {color: '#765238', fontSize: 15, fontWeight: '700', marginBottom: 9},
  photo: {height: 280, width: '100%', borderRadius: 10},
  photoToggle: {
    position: 'absolute', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, backgroundColor: '#F1DFC2',
    borderWidth: 1, borderColor: 'rgba(123,79,36,0.28)',
  },
  photoToggleText: {fontSize: 13, fontWeight: '700', color: '#68401E'},
  editBar: {
    paddingHorizontal: 14, paddingTop: 10, backgroundColor: '#FFF4DE',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(123,79,36,0.20)',
  },
  editButton: {
    minHeight: 48, backgroundColor: '#5A3822', borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  editButtonText: {color: '#FFF4DE', fontSize: 15, fontWeight: '700'},
  zoomBackdrop: {flex: 1, backgroundColor: '#15110E', justifyContent: 'center'},
  closeZoom: {
    position: 'absolute', zIndex: 2, top: 34, right: 14, width: 52, height: 52,
    alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: '#3A2C24',
  },
  closeText: {color: '#FFFFFF', fontSize: 36},
  zoomScroll: {alignItems: 'center'},
});
