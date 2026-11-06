import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {colors} from '../theme';
import confessionCatalog from '../data/confessionCatalog.json';
import confessionDocument from '../data/confessionDocument.json';
import {
  loadConfessionPreparation,
  saveConfessionSelection,
  saveConfessionEntry,
  deleteConfessionEntry,
  clearConfessionPreparation,
  CONFESSION_NOTE_MAX_LENGTH,
  CONFESSION_TITLE_MAX_LENGTH,
} from '../services/confessionPreparationStorage';

// Legacy c*** IDs are still readable for saved notes; all new selections
// use precise individual s**** phrases in the continuous source document.
const CATALOG_BY_ID = Object.fromEntries([
  ...confessionCatalog.items,
  ...confessionDocument.entries,
].map(item => [item.id, item]));

const notifySaveError = () => {
  Alert.alert(
    'Не удалось сохранить',
    'Проверьте свободное место и повторите действие. Личные записи не отправляются в интернет.'
  );
};

export const ConfessionPreparationScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [viewMode, setViewMode] = useState('catalog');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
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
      .catch(() => {if (active) notifySaveError();})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, []);

  const persistSelection = useCallback(next => {
    selectedRef.current = next;
    setSelectedIds(next);
    saveConfessionSelection(next).catch(notifySaveError);
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
    deleteConfessionEntry(id).catch(notifySaveError);
  }, [persistSelection]);

  const changeNote = useCallback((id, value) => {
    const clean = value.slice(0, CONFESSION_NOTE_MAX_LENGTH);
    setNotes(previous => ({...previous, [id]: clean}));
    // Queued native encrypted writes preserve typing order, even when the
    // screen is closed shortly after the last keystroke.
    saveConfessionEntry(id, clean, custom[id] || '').catch(notifySaveError);
  }, [custom]);

  const addOwn = useCallback(() => {
    const title = customTitle.trim().slice(0, CONFESSION_TITLE_MAX_LENGTH);
    if (!title) return;
    const id = 'u' + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7);
    setCustom(previous => ({...previous, [id]: title}));
    setNotes(previous => ({...previous, [id]: ''}));
    saveConfessionEntry(id, '', title).catch(notifySaveError);
    persistSelection([...selectedRef.current, id]);
    setCustomTitle('');
    setAddingCustom(false);
  }, [customTitle, persistSelection]);

  const clearAll = useCallback(() => {
    if (!selectedRef.current.length) return;
    Alert.alert(
      'Очистить мой список?',
      'Все выбранные пункты и личные заметки будут удалены с этого устройства.',
      [
        {text: 'Отмена', style: 'cancel'},
        {
          text: 'Очистить', style: 'destructive',
          onPress: () => {
            const oldIds = [...selectedRef.current];
            selectedRef.current = [];
            setSelectedIds([]);
            setNotes({});
            setCustom({});
            clearConfessionPreparation(oldIds).catch(notifySaveError);
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
  const source = catalogMode ? confessionDocument.blocks : chosenEntries;

  const openSinMenu = useCallback(id => {
    const item = CATALOG_BY_ID[id];
    if (!item) return;
    const isSelected = selectedRef.current.includes(id);
    Alert.alert(
      item.title,
      isSelected ? 'Этот грех уже в вашем списке.' : 'Добавить этот грех в мой список?',
      [
        {text: 'Отмена', style: 'cancel'},
        {
          text: isSelected ? 'Убрать из списка' : 'Добавить в мой список',
          style: isSelected ? 'destructive' : 'default',
          onPress: () => isSelected ? removeSelected(id) : addSelected(id),
        },
      ]
    );
  }, [addSelected, removeSelected]);

  // Read the source as one continuous text. Only the phrase the reader
  // actually taps is selected; never its surrounding paragraph.
  const renderDocumentBlock = ({item}) => {
    if (item.type === 'heading') {
      return (
        <View style={styles.documentHeadingWrap}>
          <Text style={styles.documentHeading}>{item.text}</Text>
        </View>
      );
    }
    return (
      <Text style={styles.documentParagraph}>
        {item.segments.map(segment => {
          const selected = selectedIds.includes(segment.id);
          return (
            <Text
              key={segment.id}
              onPress={() => openSinMenu(segment.id)}
              accessibilityRole="button"
              accessibilityLabel={'Выбрать грех: ' + (CATALOG_BY_ID[segment.id]?.title || '')}
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
          accessibilityLabel={'Убрать: ' + item.title}
          onPress={() => removeSelected(item.id)}
          hitSlop={8}
          style={styles.removeButton}
        >
          <Text style={styles.removeText}>×</Text>
        </Pressable>
      </View>
      {!item.isCustom && (
        <Text style={styles.selectedDescription}>{item.description}</Text>
      )}
      <Text style={styles.noteLabel}>Мои мысли и обстоятельства</Text>
      <TextInput
        style={styles.noteInput}
        multiline
        textAlignVertical="top"
        placeholder="Что я хочу сказать на исповеди..."
        placeholderTextColor="#A08A72"
        maxLength={CONFESSION_NOTE_MAX_LENGTH}
        value={notes[item.id] || ''}
        onChangeText={value => changeNote(item.id, value)}
        accessibilityLabel={'Личные заметки: ' + item.title}
      />
    </View>
  );

  const listHeader = (
    <View style={styles.listHeader}>
      <Text style={styles.title}>
        {catalogMode ? 'Подготовка к исповеди' : 'Мой список'}
      </Text>
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, catalogMode && styles.tabActive]}
          onPress={() => setViewMode('catalog')}
          accessibilityRole="tab"
          accessibilityState={{selected: catalogMode}}
        >
          <Text style={[styles.tabText, catalogMode && styles.tabTextActive]}>
            Все грехи
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, !catalogMode && styles.tabActive]}
          onPress={() => setViewMode('mine')}
          accessibilityRole="tab"
          accessibilityState={{selected: !catalogMode}}
        >
          <Text style={[styles.tabText, !catalogMode && styles.tabTextActive]}>
            Мой список ({selectedIds.length})
          </Text>
        </Pressable>
      </View>
      {catalogMode ? (
        <>
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Что такое исповедь?</Text>
            <Text style={styles.introText}>{confessionDocument.intro}</Text>
            <Text style={styles.sourceNote}>{confessionDocument.caution}</Text>
          </View>
          <Text style={styles.heading}>Грехи с объяснениями</Text>
          <Text style={styles.explanation}>
            Нажмите на конкретное слово или выражение в тексте, чтобы добавить
            этот грех в свой список. Текст читается одним целым.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.explanation}>
            Выбранные пункты и заметки хранятся только на этом устройстве
            в защищённом хранилище. Они не отправляются на сервер.
          </Text>
          <View style={styles.personalActions}>
            <Pressable
              accessibilityRole="button"
              style={styles.smallButton}
              onPress={() => setAddingCustom(value => !value)}
            >
              <Text style={styles.smallButtonText}>
                {addingCustom ? 'Отмена' : '+ Свой пункт'}
              </Text>
            </Pressable>
            {selectedIds.length > 0 && (
              <Pressable
                accessibilityRole="button"
                style={styles.smallButton}
                onPress={clearAll}
              >
                <Text style={styles.smallButtonText}>Очистить список</Text>
              </Pressable>
            )}
          </View>
          {addingCustom && (
            <View style={styles.customBox}>
              <TextInput
                style={styles.customInput}
                placeholder="Название своего пункта"
                placeholderTextColor="#A08A72"
                value={customTitle}
                maxLength={CONFESSION_TITLE_MAX_LENGTH}
                onChangeText={setCustomTitle}
                accessibilityLabel="Название своего пункта"
              />
              <Pressable
                style={[styles.actionButton, !customTitle.trim() && styles.disabled]}
                disabled={!customTitle.trim()}
                onPress={addOwn}
              >
                <Text style={styles.actionText}>Добавить</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.screen}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : (
          <FlatList
            key={viewMode}
            data={source}
            keyExtractor={item => item.id}
            renderItem={catalogMode ? renderDocumentBlock : renderSelectedItem}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {catalogMode
                  ? 'В справочнике пока нет записей.'
                  : 'Пока ничего не выбрано. Откройте "Все грехи" и добавьте нужные пункты.'}
              </Text>
            }
            contentContainerStyle={[
              styles.content,
              {paddingTop: headerHeight + 18, paddingBottom: insets.bottom + 95},
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={12}
            windowSize={7}
          />
        )}
        <FixedSectionHeader
          title="Подготовка к исповеди"
          navigation={navigation}
          topInset={insets.top}
          onHeaderHeightChange={setHeaderHeight}
        />
        <BottomNav navigation={navigation} active={null} />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: 'transparent'},
  loading: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  content: {paddingHorizontal: 12},
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
    textAlign: 'center',
  },
  documentParagraph: {
    color: '#463627', fontFamily: 'serif', fontSize: 17,
    lineHeight: 27, marginBottom: 9,
    textAlign: 'left', paddingHorizontal: 3,
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
});
