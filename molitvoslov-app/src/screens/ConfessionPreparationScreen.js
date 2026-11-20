import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {useReadingChrome} from '../hooks/useReadingChrome';
import {useLanguage} from '../context/LanguageContext';
import {traditionalUiTextStyle} from '../services/traditionalUiTypography';
import {translate} from '../i18n/translations';
import {colors} from '../theme';
import confessionCatalog from '../data/confessionCatalog.json';
import confessionDocument from '../data/confessionDocument.json';
import {buildSemanticConfessionDocument} from '../services/confessionSemanticGrouping';
import {
  loadConfessionPreparation,
  saveConfessionSelection,
  saveConfessionEntry,
  deleteConfessionEntry,
  clearConfessionPreparation,
  CONFESSION_NOTE_MAX_LENGTH,
  CONFESSION_TITLE_MAX_LENGTH,
} from '../services/confessionPreparationStorage';

// Original passage IDs are never deleted or automatically rewritten.
// New taps target meaningful clauses rather than arbitrary comma fragments.
const SEMANTIC_DOCUMENT = buildSemanticConfessionDocument(confessionDocument);
const CATALOG_BY_ID = Object.fromEntries([
  ...confessionCatalog.items,
  ...confessionDocument.entries,
].map(item => [item.id, item]));
for (const [id, group] of Object.entries(SEMANTIC_DOCUMENT.lookup)) {
  const original = CATALOG_BY_ID[id];
  if (original && group.memberIds.length > 1) {
    CATALOG_BY_ID[id] = {...original, title: group.title};
  }
}

const notifySaveError = language => {
  Alert.alert(
    translate(language, 'confession.saveError'),
    translate(language, 'confession.saveHint')
  );
};


// A narrow, draggable reading-style thumb. Only its 22px-wide handle takes
// gestures; the surrounding text continues to receive regular scroll swipes.
const ConfessionScrollThumb = ({
  scrollY, offsetRef, draggingRef, viewportHeight, contentHeight,
  topInset, bottomInset, scrollTo,
}) => {
  const trackHeight = Math.max(0, viewportHeight - topInset - bottomInset);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const thumbHeight = Math.min(trackHeight, Math.max(46,
    contentHeight > 0 ? trackHeight * viewportHeight / contentHeight : trackHeight));
  const thumbTravel = Math.max(0, trackHeight - thumbHeight);
  const dragStartRef = useRef(0);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      draggingRef.current = true;
      dragStartRef.current = offsetRef.current;
    },
    onPanResponderMove: (_event, gesture) => {
      if (maxScroll <= 0 || thumbTravel <= 0) return;
      const next = Math.max(0, Math.min(maxScroll,
        dragStartRef.current + gesture.dy * maxScroll / thumbTravel));
      scrollTo(next);
    },
    onPanResponderRelease: () => { draggingRef.current = false; },
    onPanResponderTerminate: () => { draggingRef.current = false; },
    onPanResponderTerminationRequest: () => false,
  }), [draggingRef, maxScroll, offsetRef, scrollTo, thumbTravel]);

  const translateY = scrollY.interpolate({
    inputRange: [0, Math.max(1, maxScroll)],
    outputRange: [0, thumbTravel],
    extrapolate: 'clamp',
  });

  if (viewportHeight <= 0 || contentHeight <= viewportHeight + 5 || trackHeight < 80) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.scrollThumbTrack, {top: topInset, bottom: bottomInset}]}
    >
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.scrollThumbTouch, {
          height: thumbHeight,
          transform: [{translateY}],
        }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Прокрутка текста. Перетащите ползунок вверх или вниз."
      >
        <View pointerEvents="none" style={styles.scrollThumb} />
      </Animated.View>
    </View>
  );
};

export const ConfessionPreparationScreen = ({navigation}) => {
  const {language,t} = useLanguage();
  const latestLanguageRef = useRef(language);
  latestLanguageRef.current = language;
  const onSaveError = useCallback(
    () => notifySaveError(latestLanguageRef.current), []);
  const cslText = (size, lineHeight) => traditionalUiTextStyle(language, size, lineHeight);
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [viewMode, setViewMode] = useState('catalog');
  const scrollRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollOffsetRef = useRef(0);
  const thumbDraggingRef = useRef(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const {readingChromeHidden, handleReadingScroll, handleNativeReadingScroll} = useReadingChrome();

  // Drive the thumb directly from the native scroll position, avoiding
  // per-frame JS updates that make the handle stutter during fast swipes.
  const handleListScroll = useCallback(event => {
    handleNativeReadingScroll(event);
    const raw = event.nativeEvent?.contentOffset?.y;
    if (!Number.isFinite(raw) || thumbDraggingRef.current) return;
    scrollOffsetRef.current = Math.max(0, raw);
  }, [handleNativeReadingScroll]);

  const nativeScrollHandler = useMemo(() => Animated.event(
    [{nativeEvent: {contentOffset: {y: scrollY}}}],
    {useNativeDriver: true, listener: handleListScroll},
  ), [handleListScroll, scrollY]);

  const scrollToPosition = useCallback(offset => {
    const position = Math.max(0, offset);
    scrollOffsetRef.current = position;
    const scrollView = scrollRef.current;
    if (typeof scrollView?.scrollTo === 'function') {
      scrollView.scrollTo({y: position, animated: false});
    } else {
      scrollView?.getNode?.()?.scrollTo?.({y: position, animated: false});
    }
  }, []);

  const switchView = useCallback(nextMode => {
    if (nextMode === viewMode) return;
    handleReadingScroll('top');
    thumbDraggingRef.current = false;
    scrollOffsetRef.current = 0;
    scrollY.setValue(0);
    setContentHeight(0);
    setViewMode(nextMode);
  }, [handleReadingScroll, scrollY, viewMode]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [menuSinId, setMenuSinId] = useState(null);
  const selectedRef = useRef([]);
  const [notes, setNotes] = useState({});
  const [custom, setCustom] = useState({});
  const [addingCustom, setAddingCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState('');

  useEffect(() => {
    let active = true;
    loadConfessionPreparation()
      .then(data => {
        if (!active) return;
        selectedRef.current = data.ids;
        setSelectedIds(data.ids);
        setNotes(data.notes);
        setCustom(data.custom);
      })
      .catch(() => {if (active) onSaveError();})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, []);

  const persistSelection = useCallback(next => {
    selectedRef.current = next;
    setSelectedIds(next);
    saveConfessionSelection(next).catch(onSaveError);
  }, []);

  const addSelected = useCallback(id => {
    if (selectedRef.current.includes(id)) return;
    persistSelection([...selectedRef.current, id]);
  }, [persistSelection]);

  const removeSelected = useCallback(id => {
    if (!selectedRef.current.includes(id)) return;
    persistSelection(selectedRef.current.filter(value => value !== id));
    setNotes(previous => {
      const copy = {...previous};
      delete copy[id];
      return copy;
    });
    if (id.startsWith('u')) {
      setCustom(previous => {
        const copy = {...previous};
        delete copy[id];
        return copy;
      });
    }
    deleteConfessionEntry(id).catch(onSaveError);
  }, [persistSelection]);

  const changeNote = useCallback((id, value) => {
    const clean = value.slice(0, CONFESSION_NOTE_MAX_LENGTH);
    setNotes(previous => ({...previous, [id]: clean}));
    // Queued native encrypted writes preserve typing order, even when the
    // screen is closed shortly after the last keystroke.
    saveConfessionEntry(id, clean, custom[id] || '').catch(onSaveError);
  }, [custom]);

  const addOwn = useCallback(() => {
    const title = customTitle.trim().slice(0, CONFESSION_TITLE_MAX_LENGTH);
    if (!title) return;
    const id = 'u' + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7);
    setCustom(previous => ({...previous, [id]: title}));
    setNotes(previous => ({...previous, [id]: ''}));
    saveConfessionEntry(id, '', title).catch(onSaveError);
    persistSelection([...selectedRef.current, id]);
    setCustomTitle('');
    setAddingCustom(false);
  }, [customTitle, persistSelection]);

  const clearAll = useCallback(() => {
    if (!selectedRef.current.length) return;
    Alert.alert(
      t('confession.clearTitle'),
      t('confession.clearDescription'),
      [
        {text: t('confession.cancel'), style: 'cancel'},
        {
          text: t('confession.clearConfirm'), style: 'destructive',
          onPress: () => {
            const oldIds = [...selectedRef.current];
            selectedRef.current = [];
            setSelectedIds([]);
            setNotes({});
            setCustom({});
            clearConfessionPreparation(oldIds).catch(onSaveError);
          },
        },
      ]
    );
  }, []);

  const chosenEntries = useMemo(
    () => selectedIds.map(id => CATALOG_BY_ID[id] || (
      custom[id] ? {id, title: custom[id], description: '', isCustom: true} : null
    )).filter(Boolean),
    [selectedIds, custom]
  );

  const catalogMode = viewMode === 'catalog';
  const source = catalogMode ? SEMANTIC_DOCUMENT.blocks : chosenEntries;

  const openSinMenu = useCallback(id => {
    const group = SEMANTIC_DOCUMENT.lookup[id];
    const canonicalId = group?.id || id;
    if (CATALOG_BY_ID[canonicalId]) setMenuSinId(canonicalId);
  }, []);

  const closeSinMenu = useCallback(() => setMenuSinId(null), []);

  const confirmSinMenu = useCallback(() => {
    if (!menuSinId) return;
    // Check current selection at confirmation time, not a stale snapshot.
    const ids = SEMANTIC_DOCUMENT.lookup[menuSinId]?.memberIds || [menuSinId];
    const alreadyChosen = ids.filter(id => selectedRef.current.includes(id));
    if (alreadyChosen.length) {
      // Remove all selected legacy members only after explicit confirmation.
      for (const id of alreadyChosen) removeSelected(id);
    } else {
      addSelected(menuSinId);
    }
    setMenuSinId(null);
  }, [menuSinId, addSelected, removeSelected]);

  const menuSin = menuSinId ? CATALOG_BY_ID[menuSinId] : null;
  const menuAlreadySelected = !!menuSinId &&
    (SEMANTIC_DOCUMENT.lookup[menuSinId]?.memberIds || [menuSinId])
      .some(id => selectedIds.includes(id));

  // One press selects the complete semantic phrase, including its
  // dependent comma-separated explanations. Distinct sins remain separate.
  const renderDocumentBlock = ({item}) => {
    if (item.type === 'heading') {
      return (
        <View style={styles.documentHeadingWrap}>
          <Text style={styles.documentHeading}>{item.text}</Text>
        </View>
      );
    }
    return (
      <Text
        style={styles.documentParagraph}
        textBreakStrategy="highQuality"
        android_hyphenationFrequency="normal"
      >
        {item.segments.map(segment => {
          const selected = segment.memberIds.some(id => selectedIds.includes(id));
          return (
            <Text
              key={segment.id}
              onPress={() => openSinMenu(segment.id)}
              accessibilityRole="button"
              accessibilityLabel={t('confession.selectSin',{title:CATALOG_BY_ID[segment.id]?.title || ''})}
              style={selected ? styles.documentSelected : styles.documentPhrase}
            >
              {segment.text}
            </Text>
          );
        })}
      </Text>
    );
  };

  const renderSelectedItem = ({item, index}) => (
    <View style={styles.entry}>
      <View style={styles.personalHeader}>
        <Text style={styles.personalIndex}>{index + 1}.</Text>
        <Text style={styles.personalTitle}>{item.title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('confession.removeSin',{title:item.title})}
          onPress={() => removeSelected(item.id)}
          hitSlop={8}
          style={styles.removeButton}
        >
          <Text style={styles.removeText}>×</Text>
        </Pressable>
      </View>
      {!item.isCustom && !!item.description && (
        <Text style={styles.selectedDescription}>{item.description}</Text>
      )}
      <Text style={[styles.noteLabel,cslText(13,20)]}>{t('confession.notesTitle')}</Text>
      <TextInput
        style={styles.noteInput}
        multiline
        textAlignVertical="top"
        placeholder={t('confession.notesPlaceholder')}
        placeholderTextColor="#A08A72"
        maxLength={CONFESSION_NOTE_MAX_LENGTH}
        value={notes[item.id] || ''}
        onChangeText={value => changeNote(item.id, value)}
        accessibilityLabel={t('confession.notesA11y',{title:item.title})}
      />
    </View>
  );

  const listHeader = (
    <View style={styles.listHeader}>
      <Text style={[styles.title,cslText(24,33)]}>
        {catalogMode ? t('confession.title') : t('confession.myList')}
      </Text>
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, catalogMode && styles.tabActive]}
          onPress={() => switchView('catalog')}
          accessibilityRole="tab"
          accessibilityState={{selected: catalogMode}}
        >
          <Text style={[styles.tabText, catalogMode && styles.tabTextActive,cslText(14,21)]}>
            {t('confession.allSins')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, !catalogMode && styles.tabActive]}
          onPress={() => switchView('mine')}
          accessibilityRole="tab"
          accessibilityState={{selected: !catalogMode}}
        >
          <Text style={[styles.tabText, !catalogMode && styles.tabTextActive,cslText(14,21)]}>
            {t('confession.myListCount',{count:selectedIds.length})}
          </Text>
        </Pressable>
      </View>
      {catalogMode ? (
        <>
          <View style={styles.intro}>
            <Text style={[styles.introTitle,cslText(18,26)]}>{t('confession.whatIs')}</Text>
            <Text style={[styles.introText,cslText(15,23)]}>{t('confession.intro')}</Text>
            <Text style={[styles.sourceNote,cslText(12,19)]}>{t('confession.caution')}</Text>
          </View>
          <Text style={[styles.heading,cslText(19,27)]}>{t('confession.explanationTitle')}</Text>
          <Text style={[styles.explanation,cslText(13,21)]}>
            {t('confession.explanation')}
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.explanation,cslText(13,21)]}>
            {t('confession.privateHint')}
          </Text>
          <View style={styles.personalActions}>
            <Pressable
              accessibilityRole="button"
              style={styles.smallButton}
              onPress={() => setAddingCustom(value => !value)}
            >
              <Text style={[styles.smallButtonText,cslText(13,20)]}>
                {addingCustom ? t('confession.cancel') : t('confession.add')}
              </Text>
            </Pressable>
            {selectedIds.length > 0 && (
              <Pressable
                accessibilityRole="button"
                style={styles.smallButton}
                onPress={clearAll}
              >
                <Text style={[styles.smallButtonText,cslText(13,20)]}>{t('confession.clear')}</Text>
              </Pressable>
            )}
          </View>
          {addingCustom && (
            <View style={styles.customBox}>
              <TextInput
                style={styles.customInput}
                placeholder={t('confession.newItem')}
                placeholderTextColor="#A08A72"
                value={customTitle}
                maxLength={CONFESSION_TITLE_MAX_LENGTH}
                onChangeText={setCustomTitle}
                accessibilityLabel={t('confession.newItem')}
              />
              <Pressable
                style={[styles.actionButton, !customTitle.trim() && styles.disabled]}
                disabled={!customTitle.trim()}
                onPress={addOwn}
              >
                <Text style={[styles.actionText,cslText(14,21)]}>{t('confession.addAction')}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <View style={styles.page}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <View style={styles.screen}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : (
          <Animated.ScrollView
            ref={scrollRef}
            key={`confession-scroll:${viewMode}`}
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              {paddingTop: headerHeight + 18, paddingBottom: insets.bottom + 95},
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={nativeScrollHandler}
            scrollEventThrottle={16}
            onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
            onContentSizeChange={(_width, height) => setContentHeight(height)}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            overScrollMode="never"
          >
            {listHeader}
            {source.length ? source.map((item, index) => (
              <React.Fragment key={item.id || `doc-${index}`}>
                {catalogMode
                  ? renderDocumentBlock({item, index})
                  : renderSelectedItem({item, index})}
              </React.Fragment>
            )) : (
              <Text style={styles.empty}>
                {catalogMode
                  ? t('confession.noCatalog')
                  : t('confession.noSelections')}
              </Text>
            )}
          </Animated.ScrollView>
        )}
        <ConfessionScrollThumb
          scrollY={scrollY}
          offsetRef={scrollOffsetRef}
          draggingRef={thumbDraggingRef}
          viewportHeight={viewportHeight}
          contentHeight={contentHeight}
          topInset={headerHeight + 8}
          bottomInset={Math.max(insets.bottom + 69, 76)}
          scrollTo={scrollToPosition}
        />
        <FixedSectionHeader
          title={t('confession.title')}
          titleTextStyle={cslText(21,29)}
          gradientColor="#FFF4DE"
          navigation={navigation}
          compactReading
          readingHidden={readingChromeHidden}
          headerAction={{
            label: catalogMode ? t('confession.myList') : t('confession.allSins'),
            accessibilityLabel: catalogMode
              ? t('confession.openMyList')
              : t('confession.openAll'),
            onPress: () => switchView(catalogMode ? 'mine' : 'catalog'),
          }}
          topInset={insets.top}
          onHeaderHeightChange={setHeaderHeight}
        />
        <BottomNav navigation={navigation} active={null} readingHidden={readingChromeHidden} />
      </View>

      <Modal
        transparent
        visible={!!menuSin}
        animationType="fade"
        onRequestClose={closeSinMenu}
        statusBarTranslucent
      >
        <View style={styles.sinMenuOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeSinMenu}
            accessibilityRole="button"
            accessibilityLabel={t('confession.close')}
          />
          <View style={styles.sinMenuCard} accessibilityViewIsModal>
            <View style={styles.sinMenuAccent} />
            <Text style={[styles.sinMenuCaption,cslText(12,19)]}>{t('confession.title')}</Text>
            <Text style={styles.sinMenuTitle}>{menuSin?.title}</Text>
            <Text style={styles.sinMenuDescription}>
              {menuAlreadySelected
                ? t('confession.selected')
                : t('confession.askAdd')}
            </Text>
            <View style={styles.sinMenuDivider} />
            <Pressable
              accessibilityRole="button"
              style={({pressed}) => [
                styles.sinMenuConfirm,
                menuAlreadySelected && styles.sinMenuRemove,
                pressed && styles.pressed,
              ]}
              onPress={confirmSinMenu}
            >
              <Text style={styles.sinMenuConfirmText}>
                {menuAlreadySelected ? t('confession.removeSelected') : t('confession.addSelected')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({pressed}) => [styles.sinMenuCancel, pressed && styles.pressed]}
              onPress={closeSinMenu}
            >
              <Text style={styles.sinMenuCancelText}>{t('confession.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // Use the same plain paper color as CanonScreen; never render homeArtwork
  // under personal confession notes or the continuous reading document.
  page: {flex: 1, backgroundColor: '#FFF4DE'},
  screen: {flex: 1, backgroundColor: '#FFF4DE'},
  loading: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  scroll: {flex: 1},
  content: {paddingLeft: 12, paddingRight: 20},
  scrollThumbTrack: {
    position: 'absolute', right: 2, width: 22, zIndex: 20,
  },
  scrollThumbTouch: {
    position: 'absolute', top: 0, right: 0, width: 22,
    alignItems: 'flex-end', paddingRight: 7,
  },
  scrollThumb: {
    width: 4, height: '100%', borderRadius: 4,
    backgroundColor: 'rgba(100, 61, 35, 0.64)',
  },
  listHeader: {marginBottom: 10},
  title: {
    fontFamily: 'serif', fontSize: 24, lineHeight: 30,
    fontWeight: '700', color: '#573822', textAlign: 'center', marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row', borderRadius: 12, padding: 3,
    backgroundColor: 'rgba(229, 207, 175, 0.86)', marginBottom: 15,
  },
  tab: {flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10},
  tabActive: {backgroundColor: '#FFF2DA'},
  tabText: {fontSize: 14, color: '#775B42', fontWeight: '600'},
  tabTextActive: {color: '#763C27', fontWeight: '700'},
  intro: {
    padding: 15, backgroundColor: 'rgba(250, 239, 220, 0.95)',
    borderWidth: 1, borderColor: 'rgba(126, 82, 38, 0.2)',
    borderRadius: 14, marginBottom: 18,
  },
  introTitle: {
    fontFamily: 'serif', fontWeight: '700', fontSize: 18,
    lineHeight: 24, color: '#704527', marginBottom: 8,
  },
  introText: {fontSize: 15, lineHeight: 23, color: '#4A3526'},
  sourceNote: {
    fontSize: 12, lineHeight: 18, color: '#806852',
    marginTop: 12, paddingTop: 9,
    borderTopWidth: 1, borderTopColor: 'rgba(126,82,38,0.16)',
  },
  heading: {
    fontFamily: 'serif', fontSize: 19, fontWeight: '700',
    color: '#69412A', marginBottom: 5,
  },
  explanation: {fontSize: 13, lineHeight: 20, color: '#745C46', marginBottom: 15},
  documentHeadingWrap: {
    marginTop: 15, marginBottom: 9,
    borderBottomColor: 'rgba(126,82,38,0.22)',
    borderBottomWidth: 1, paddingBottom: 8,
  },
  documentHeading: {
    color: '#73492E', fontFamily: 'serif',
    fontSize: 17, lineHeight: 24, fontWeight: '700',
    textAlign: 'left',
  },
  documentParagraph: {
    color: '#463627', fontFamily: 'serif', fontSize: 17,
    lineHeight: 27, marginBottom: 9,
    textAlign: 'justify', paddingHorizontal: 3,
  },
  documentPhrase: {color: '#463627'},
  documentSelected: {color: '#A44331', textDecorationLine: 'underline'},
  entry: {
    borderRadius: 13,
    borderWidth: 1, borderColor: 'rgba(126, 82, 38, 0.18)',
    backgroundColor: 'rgba(252, 240, 219, 0.96)',
    marginBottom: 9, overflow: 'hidden',
  },
  entryTap: {paddingVertical: 13, paddingHorizontal: 15},
  entryHeading: {flexDirection: 'row', alignItems: 'flex-start'},
  entryTitle: {
    flex: 1, fontFamily: 'serif', fontWeight: '700',
    fontSize: 17, lineHeight: 23, color: '#603C29',
  },
  caret: {fontSize: 24, lineHeight: 25, color: '#AC8A64', marginLeft: 8},
  chosen: {fontSize: 18, color: '#86552B'},
  entryDescription: {
    fontSize: 14, lineHeight: 21,
    color: '#594739', marginTop: 6,
  },
  entryActionArea: {
    borderTopWidth: 1, borderTopColor: 'rgba(126, 82, 38, 0.14)',
    padding: 10, alignItems: 'flex-start',
  },
  actionButton: {
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#795036', alignItems: 'center',
  },
  actionText: {fontSize: 14, color: '#FFF1DC', fontWeight: '700'},
  pressed: {opacity: 0.7},
  personalActions: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 13,
  },
  smallButton: {
    borderWidth: 1, borderColor: 'rgba(126,82,38,0.35)',
    backgroundColor: 'rgba(250,237,217,0.8)',
    borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11,
  },
  smallButtonText: {color: '#704527', fontWeight: '600', fontSize: 13},
  customBox: {
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(248,233,207,0.94)', marginBottom: 12, gap: 9,
  },
  customInput: {
    borderWidth: 1, borderColor: 'rgba(126,82,38,0.25)',
    borderRadius: 9, color: '#3B281B', backgroundColor: '#FFF4E1',
    padding: 11, fontSize: 15,
  },
  disabled: {opacity: 0.45},
  personalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 13,
    paddingBottom: 5,
  },
  personalIndex: {fontSize: 17, fontWeight: '700', color: '#A06144', marginRight: 8},
  personalTitle: {
    flex: 1, fontFamily: 'serif', fontSize: 17,
    lineHeight: 23, fontWeight: '700', color: '#603C29',
  },
  removeButton: {paddingHorizontal: 9, paddingTop: 0, paddingBottom: 4},
  removeText: {fontSize: 25, lineHeight: 25, color: '#9A6F5C'},
  selectedDescription: {
    paddingHorizontal: 15, color: '#5B4A3D',
    lineHeight: 20, fontSize: 13, paddingBottom: 8,
  },
  noteLabel: {
    marginHorizontal: 15, marginTop: 4,
    color: '#825D43', fontSize: 12, fontWeight: '700',
  },
  noteInput: {
    margin: 12, marginTop: 7,
    borderWidth: 1, borderColor: '#DEC8A9',
    borderRadius: 9, padding: 11, minHeight: 75,
    backgroundColor: '#FFF7E9',
    color: '#3B281B', fontSize: 15, lineHeight: 21,
  },
  empty: {
    paddingVertical: 40, paddingHorizontal: 22,
    textAlign: 'center', lineHeight: 23, color: '#735840', fontSize: 15,
  },
  sinMenuOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(32, 21, 13, 0.52)',
  },
  sinMenuCard: {
    width: '100%',
    maxWidth: 370,
    maxHeight: '82%',
    paddingHorizontal: 20,
    paddingTop: 23,
    paddingBottom: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9BA91',
    backgroundColor: '#FFF4DE',
    shadowColor: '#34200F',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 14,
  },
  sinMenuAccent: {
    alignSelf: 'center',
    width: 45,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#986548',
    marginBottom: 17,
  },
  sinMenuCaption: {
    color: '#987454',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 8,
  },
  sinMenuTitle: {
    color: '#633E2B',
    fontFamily: 'serif',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
    textAlign: 'center',
    marginBottom: 10,
  },
  sinMenuDescription: {
    color: '#65503E',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  sinMenuDivider: {
    height: 1,
    backgroundColor: 'rgba(126, 82, 38, 0.22)',
    marginTop: 18,
    marginBottom: 17,
  },
  sinMenuConfirm: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#795036',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sinMenuRemove: {
    backgroundColor: '#94574D',
  },
  sinMenuConfirmText: {
    color: '#FFF4DE',
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
  },
  sinMenuCancel: {
    marginTop: 4,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  sinMenuCancelText: {
    color: '#77563B',
    fontSize: 14,
    fontWeight: '600',
  },
});
