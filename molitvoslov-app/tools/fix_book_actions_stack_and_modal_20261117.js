(function installStackedBookActions() {
  const fs = require('fs'), path = require('path');
  const base = process.cwd();
  const marker = 'BOOK_ACTIONS_STACKED_MODAL_20261117';
  const names = [
    'src/screens/PrayerBooksScreen.js',
    'src/screens/MemorialScreen.js',
    'src/screens/PrayerBookScreen.js',
    'src/screens/MemorialBookScreen.js',
  ];
  const componentPath = path.join(base, 'src/components/share/BookDeleteConfirmModal.js');
  const specs = names.map(name => {
    const file = path.join(base, ...name.split('/'));
    if (!fs.existsSync(file)) throw Error('Не найден локальный файл: ' + name);
    const original = fs.readFileSync(file, 'utf8');
    return {name, file, original, eol: original.includes('\r\n') ? '\r\n' : '\n', source: original.replace(/\r\n/g, '\n')};
  });
  if (specs.every(s => s.source.includes(marker)) && fs.existsSync(componentPath)) {
    console.log('OK: обновление кнопок и окон подтверждения уже применено.');
    return;
  }
  if (specs.some(s => s.source.includes(marker))) throw Error('Часть обновлений уже присутствует. Файлы не изменены.');
  if (fs.existsSync(componentPath)) throw Error('Файл BookDeleteConfirmModal.js уже существует. Ничего не изменено.');
  function once(spec, a, b, label) {
    const i = spec.source.indexOf(a);
    if (i < 0 || i !== spec.source.lastIndexOf(a))
      throw Error(spec.name + ': ' + label + ' — локальный фрагмент отличается. Ничего не изменено.');
    spec.source = spec.source.replace(a, b);
  }
  function section(spec, begin, end, content, label) {
    const i = spec.source.indexOf(begin);
    const j = spec.source.indexOf(end, i);
    if (i < 0 || j < 0 || spec.source.indexOf(begin, i + 1) !== -1)
      throw Error(spec.name + ': ' + label + ' — не удалось найти участок. Ничего не изменено.');
    spec.source = spec.source.slice(0, i) + content + spec.source.slice(j);
  }
  const [prayerList, memorialList, prayerDetail, memorialDetail] = specs;
  const component = `import React from 'react';
import {ActivityIndicator, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// BOOK_ACTIONS_STACKED_MODAL_20261117: shared confirmation in the app's parchment palette.
export const BookDeleteConfirmModal = ({
  visible, title, message, onCancel, onConfirm, busy = false,
  confirmLabel = 'Удалить',
}) => (
  <Modal
    visible={!!visible}
    transparent
    statusBarTranslucent
    animationType="fade"
    onRequestClose={() => { if (!busy) onCancel?.(); }}
  >
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFillObject}
        accessibilityLabel="Закрыть подтверждение"
        onPress={() => { if (!busy) onCancel?.(); }}
      />
      <View style={styles.panel} accessibilityViewIsModal>
        <View style={styles.iconCircle}>
          <Ionicons name="trash-outline" size={24} color="#A34738" />
        </View>
        <Text style={styles.title}>{title || 'Удалить?'}</Text>
        <Text style={styles.message}>{message || 'Вы действительно хотите удалить запись?'}</Text>
        <View style={styles.divider} />
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            disabled={busy}
            style={({pressed}) => [styles.cancel, pressed && styles.pressed, busy && styles.disabled]}
          >
            <Text style={styles.cancelText}>Отмена</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onConfirm}
            disabled={busy}
            style={({pressed}) => [styles.delete, pressed && styles.pressed, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator color="#FFF8EA" size="small" /> :
              <Text style={styles.deleteText}>{confirmLabel}</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(36, 25, 17, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D9BC91',
    backgroundColor: '#FFF4DE',
    elevation: 14,
    shadowColor: '#392516',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    alignItems: 'center',
  },
  iconCircle: {
    width: 54, height: 54,
    borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4B6A4',
    backgroundColor: '#F6E4D6',
    marginBottom: 13,
  },
  title: {
    color: '#4C3120',
    fontFamily: 'serif',
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 27,
  },
  message: {
    marginTop: 10,
    color: '#765741',
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  divider: {width: '100%', height: 1, backgroundColor: '#E5D0B0', marginVertical: 19},
  buttons: {width: '100%', flexDirection: 'row', gap: 10},
  cancel: {
    flex: 1, minHeight: 48, borderRadius: 12,
    borderWidth: 1, borderColor: '#CDB38D',
    backgroundColor: '#FFF9EC',
    alignItems: 'center', justifyContent: 'center',
  },
  delete: {
    flex: 1, minHeight: 48, borderRadius: 12,
    backgroundColor: '#A34738',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: {color: '#60442F', fontSize: 15, fontWeight: '700'},
  deleteText: {color: '#FFF8EA', fontSize: 15, fontWeight: '700'},
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.5},
});
`;
  const importModal = "import {BookDeleteConfirmModal} from '../components/share/BookDeleteConfirmModal';\n";

  once(prayerList,
    "import {ContentContextMenu} from '../components/share/ContentContextMenu';\n",
    "import {ContentContextMenu} from '../components/share/ContentContextMenu';\n" + importModal,
    'импорт окна удаления');
  once(prayerList,
    "  const [deletingBookId, setDeletingBookId] = useState(null);",
    "  const [deletingBookId, setDeletingBookId] = useState(null);\n  const [deleteCandidate, setDeleteCandidate] = useState(null); // " + marker,
    'состояние окна');
  section(prayerList, '  const confirmDeleteBook = book => {', '  const create = async () => {',
`  const confirmDeleteBook = book => {
    if (!book?.sync_id || deletingBookId) return;
    setDeleteCandidate(book);
  };
  const performDeleteBook = async () => {
    const book = deleteCandidate;
    if (!book?.sync_id || deletingBookId) return;
    setDeletingBookId(book.sync_id);
    try {
      await deletePrayerBook(book.sync_id);
      setDeleteCandidate(null);
      setContextItem(null);
      setBooks(items => items.filter(item => item.sync_id !== book.sync_id));
    } catch (error) {
      setDeleteCandidate(null);
      Alert.alert('Не удалось удалить молитвослов', error?.message || 'Повторите попытку.');
    } finally {
      setDeletingBookId(null);
    }
  };

`, 'обработчик удаления');

  const prayerButtonBefore = `              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Удалить молитвослов ' + (item.title || '')}
                accessibilityHint="Открыть подтверждение удаления молитвослова"
                onPress={() => confirmDeleteBook(item)}
                disabled={deletingBookId === item.sync_id}
                hitSlop={5}
                style={({pressed}) => [styles.shareButton, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={20} color="#A34738"/>
              </Pressable>`;
  const prayerButtonAfter = `              <View style={styles.actionsColumn}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Поделиться молитвословом ' + (item.title || '')}
                  onPress={() => shareBook(item)}
                  style={({pressed}) => [styles.shareButton, pressed && styles.pressed]}
                >
                  <Ionicons name="share-social-outline" size={19} color="#765238"/>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Удалить молитвослов ' + (item.title || '')}
                  onPress={() => confirmDeleteBook(item)}
                  disabled={!!deletingBookId}
                  style={({pressed}) => [styles.shareButton, styles.deleteButton, pressed && styles.pressed]}
                >
                  <Ionicons name="trash-outline" size={19} color="#A34738"/>
                </Pressable>
              </View>`;
  once(prayerList, prayerButtonBefore, prayerButtonAfter, 'две кнопки справа');
  once(prayerList,
`  shareButton:{
    alignSelf:'stretch',width:48,minHeight:72,
    alignItems:'center',justifyContent:'center',
    borderLeftWidth:1,borderLeftColor:'rgba(126,82,38,0.24)',
    backgroundColor:'rgba(238,220,192,0.48)',
  },`,
`  actionsColumn: {
    alignSelf: 'stretch', width:50, minHeight:88,
    borderLeftWidth:1, borderLeftColor:'rgba(126,82,38,0.24)',
    backgroundColor:'rgba(238,220,192,0.48)',
  },
  shareButton: {
    flex:1, minHeight:44, alignItems:'center', justifyContent:'center',
  },
  deleteButton: {
    borderTopWidth:1, borderTopColor:'rgba(126,82,38,0.20)',
  },`, 'стили вертикальных кнопок');
  once(prayerList,
`        <Modal
          visible={creating}`,
`        <BookDeleteConfirmModal
          visible={!!deleteCandidate}
          title="Удалить молитвослов?"
          message={deleteCandidate ?
            'Молитвослов "' + (deleteCandidate.title || 'Мой молитвослов') +
            '" и его состав будут удалены. Сами молитвы останутся в личной библиотеке.' : ''}
          busy={!!deletingBookId}
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={performDeleteBook}
        />

        <Modal
          visible={creating}`, 'модальное окно');

  once(memorialList,
    "import {ContentContextMenu} from '../components/share/ContentContextMenu';\n",
    "import {ContentContextMenu} from '../components/share/ContentContextMenu';\n" + importModal,
    'импорт окна удаления');
  once(memorialList,
    "  const [deletingBookId, setDeletingBookId] = useState(null);",
    "  const [deletingBookId, setDeletingBookId] = useState(null);\n  const [deleteCandidate, setDeleteCandidate] = useState(null); // " + marker,
    'состояние окна');
  section(memorialList, '  const confirmDeleteBook = book => {', '  const shareMemorial = (book) => shareImportableContent({',
`  const confirmDeleteBook = book => {
    if (!book?.sync_id || deletingBookId) return;
    setDeleteCandidate(book);
  };
  const performDeleteBook = async () => {
    const book = deleteCandidate;
    if (!book?.sync_id || deletingBookId) return;
    setDeletingBookId(book.sync_id);
    try {
      await deleteMemorialBook(book.sync_id);
      setDeleteCandidate(null);
      setContextItem(null);
      setBooks(items => items.filter(item => item.sync_id !== book.sync_id));
    } catch (error) {
      setDeleteCandidate(null);
      Alert.alert('Не удалось удалить помянник', error?.message || 'Повторите попытку.');
    } finally {
      setDeletingBookId(null);
    }
  };

`, 'обработчик удаления');

  const memorialButtonBefore = `        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Удалить помянник ' + (item.title || '')}
          accessibilityHint="Открыть подтверждение удаления помянника"
          onPress={() => confirmDeleteBook(item)}
          disabled={deletingBookId === item.sync_id}
          hitSlop={5}
          style={({pressed})=>[styles.shareButton,pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={20} color="#A34738"/>
        </Pressable>`;
  const memorialButtonAfter = `        <View style={styles.actionsColumn}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Поделиться помянником ' + (item.title || '')}
            onPress={() => shareMemorial(item)}
            style={({pressed})=>[styles.shareButton,pressed && styles.pressed]}
          >
            <Ionicons name="share-social-outline" size={19} color="#765238"/>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Удалить помянник ' + (item.title || '')}
            onPress={() => confirmDeleteBook(item)}
            disabled={!!deletingBookId}
            style={({pressed})=>[styles.shareButton,styles.deleteButton,pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={19} color="#A34738"/>
          </Pressable>
        </View>`;
  once(memorialList, memorialButtonBefore, memorialButtonAfter, 'две кнопки справа');
  const styleStart = memorialList.source.indexOf("  shareButton:");
  if (styleStart < 0) throw Error('MemorialScreen: не найден стиль кнопок. Ничего не изменено.');
  const styleEnd = memorialList.source.indexOf("\n  },", styleStart) + 5;
  if (styleEnd < styleStart) throw Error('MemorialScreen: стиль не закрыт. Ничего не изменено.');
  const styleFragment = memorialList.source.slice(styleStart, styleEnd);
  if (!styleFragment.includes('width: 48') && !styleFragment.includes('width:48'))
    throw Error('MemorialScreen: стиль кнопки уже изменился. Ничего не изменено.');
  once(memorialList, styleFragment,
`  actionsColumn: {
    alignSelf:'stretch', width:50, minHeight:88,
    borderLeftWidth:1, borderLeftColor:'rgba(126,82,38,0.24)',
    backgroundColor:'rgba(238,220,192,0.48)',
  },
  shareButton: {flex:1, minHeight:44, alignItems:'center', justifyContent:'center'},
  deleteButton: {borderTopWidth:1, borderTopColor:'rgba(126,82,38,0.20)'},`,
    'стили вертикальных кнопок');
  once(memorialList,
`          deleteLabel="Удалить помянник"
        />`,
`          deleteLabel="Удалить помянник"
        />
        <BookDeleteConfirmModal
          visible={!!deleteCandidate}
          title="Удалить помянник?"
          message={deleteCandidate ?
            'Помянник "' + (deleteCandidate.title || 'Мой помянник') +
            '" и его фотографии будут удалены. Отменить действие нельзя.' : ''}
          busy={!!deletingBookId}
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={performDeleteBook}
        />`,
    'модальное окно');

  once(prayerDetail,
    "import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';\n",
    "import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';\n" + importModal,
    'импорт окна удаления');
  once(prayerDetail,
    "  const [busy, setBusy] = useState(false);",
    "  const [busy, setBusy] = useState(false);\n  const [deleteVisible, setDeleteVisible] = useState(false); // " + marker,
    'состояние окна');
  section(prayerDetail, '  const confirmDeleteBook = () => {', '  if (!book) {',
`  const confirmDeleteBook = () => {
    if (!book?.sync_id || busy) return;
    setDeleteVisible(true);
  };
  const performDeleteBook = async () => {
    if (!book?.sync_id || busy) return;
    setBusy(true);
    try {
      await deletePrayerBook(book.sync_id);
      setDeleteVisible(false);
      navigation.navigate('PrayerBooks');
    } catch (error) {
      setDeleteVisible(false);
      Alert.alert('Не удалось удалить молитвослов', error?.message || 'Повторите попытку.');
    } finally {
      setBusy(false);
    }
  };

`, 'обработчик удаления');
  once(prayerDetail, '        <SavedPickerModal\n',
`        <BookDeleteConfirmModal
          visible={deleteVisible}
          title="Удалить молитвослов?"
          message={'Молитвослов "' + (book.title || 'Мой молитвослов') +
            '" и его состав будут удалены. Сами молитвы останутся в личной библиотеке.'}
          busy={busy}
          onCancel={() => setDeleteVisible(false)}
          onConfirm={performDeleteBook}
        />

        <SavedPickerModal
`, 'модальное окно');

  once(memorialDetail,
    "import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';",
    "import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';\n" + importModal,
    'импорт окна удаления');
  once(memorialDetail,
    "  const [book, setBook] = useState(null);",
    "  const [book, setBook] = useState(null);\n  const [deleteVisible, setDeleteVisible] = useState(false); // " + marker +
    "\n  const [deleteBusy, setDeleteBusy] = useState(false);",
    'состояние окна');
  section(memorialDetail, '  const confirmDeleteBook = () => {', '  const photos = book?.photos || [];',
`  const confirmDeleteBook = () => setDeleteVisible(true);
  const performDeleteBook = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      allowLeaveRef.current = true;
      await deleteMemorialBook(bookSyncId);
      setDeleteVisible(false);
      navigation.navigate('Memorial');
    } catch (error) {
      allowLeaveRef.current = false;
      setDeleteVisible(false);
      Alert.alert(t('common.deleteFailed'), error?.message || t('common.tryAgain'));
    } finally {
      setDeleteBusy(false);
    }
  };

`, 'обработчик удаления');
  once(memorialDetail, '      <MemorialPhotoViewer\n',
`      <BookDeleteConfirmModal
        visible={deleteVisible}
        title={t('memorial.deleteBookTitle')}
        message={t('memorial.deleteBookText')}
        busy={deleteBusy}
        onCancel={() => setDeleteVisible(false)}
        onConfirm={performDeleteBook}
        confirmLabel={t('memorial.delete')}
      />

      <MemorialPhotoViewer
`, 'модальное окно');

  // Ensure every transformed source is touched and old destructive native alerts are gone.
  for (const spec of specs) {
    if (!spec.source.includes(marker) && !spec.source.includes('<BookDeleteConfirmModal'))
      throw Error('Выполнена не вся установка: ' + spec.name + '. Ничего не изменено.');
  }
  if (prayerList.source.includes("accessibilityHint=\"Открыть подтверждение") ||
      memorialList.source.includes("accessibilityHint=\"Открыть подтверждение"))
    throw Error('Найдены старые кнопки удаления. Ничего не изменено.');

  const backupSuffix = '.backup-book-actions-stacked-' + new Date().toISOString().replace(/[:.]/g, '-');
  const saved = [];
  try {
    for (const spec of specs) fs.writeFileSync(spec.file + backupSuffix, spec.original, 'utf8');
    fs.writeFileSync(componentPath, component, {encoding:'utf8', flag:'wx'});
    for (const spec of specs) {
      fs.writeFileSync(spec.file, spec.source.replace(/\n/g, spec.eol), 'utf8');
      saved.push(spec);
    }
  } catch (error) {
    for (const spec of saved) {
      try {fs.writeFileSync(spec.file, spec.original, 'utf8');} catch (_) {}
    }
    try {fs.unlinkSync(componentPath)} catch (_) {}
    throw error;
  }
  console.log('OK: обе кнопки расположены друг под другом в списках молитвословов и помянников.');
  console.log('Окно подтверждения в едином стиле приложения подключено на 4 экранах.');
  console.log('Резервные копии: ' + backupSuffix);
})();
