(function installPersonalBookActions(){
 const fs=require('fs'),path=require('path');
 const base=process.cwd(), tag='PERSONAL_BOOK_ACTIONS_20261117';
 const fileNames=[
 'src/screens/PrayerBooksScreen.js',
 'src/screens/PrayerBookScreen.js',
 'src/screens/MemorialScreen.js',
 'src/screens/MemorialBookScreen.js',
 'src/components/share/ContentContextMenu.js'];
 const entries=fileNames.map(name=>{
  const file=path.join(base,...name.split('/'));
  if(!fs.existsSync(file))throw Error('Не найден: '+name);
  const original=fs.readFileSync(file,'utf8');
  return {name,file,original,eol:original.includes('\r\n')?'\r\n':'\n',text:original.replace(/\r\n/g,'\n')};
 });
 const allHave=entries.every(e=>e.text.includes(tag));
 if(allHave){console.log('OK: правки уже установлены');return}
 if(entries.some(e=>e.text.includes(tag)))throw Error('Часть правок уже установлена. Ничего не записано.');
 const one=(e,oldValue,newValue,label)=>{
   const i=e.text.indexOf(oldValue);
   if(i<0||i!==e.text.lastIndexOf(oldValue))
     throw Error(e.name+': '+label+' — локальный фрагмент отличается. Ни один файл не изменён.');
   e.text=e.text.replace(oldValue,newValue);
 };
 const books=entries[0], prayer=entries[1], memorial=entries[2],
       memorialDetail=entries[3], menu=entries[4];
 one(books,
 "import {createPrayerBook, getPrayerBooks, syncPrayerBooks} from '../services/prayerBooks';",
 "import {createPrayerBook, deletePrayerBook, getPrayerBooks, syncPrayerBooks} from '../services/prayerBooks';",
 'импорт удаления молитвослова');
 one(books,
 "  const [busy, setBusy] = useState(false);",
 `  const [busy, setBusy] = useState(false);
  // PERSONAL_BOOK_ACTIONS_20261117
  const [deletingBookId, setDeletingBookId] = useState(null);`,
 'состояние удаления молитвослова');
 one(books,
 "  const create = async () => {",
 `  const confirmDeleteBook = book => {
    if (!book?.sync_id || deletingBookId) return;
    Alert.alert(
      'Удалить молитвослов?',
      'Молитвослов "' + (book.title || 'Мой молитвослов') +
        '" и его состав будут удалены. Сами молитвы останутся в личной библиотеке.',
      [
        {text: 'Отмена', style: 'cancel'},
        {text: 'Удалить', style: 'destructive', onPress: async () => {
          if (deletingBookId) return;
          setDeletingBookId(book.sync_id);
          try {
            await deletePrayerBook(book.sync_id);
            setContextItem(null);
            setBooks(items => items.filter(item => item.sync_id !== book.sync_id));
          } catch (error) {
            Alert.alert('Не удалось удалить молитвослов', error?.message || 'Повторите попытку.');
          } finally {
            setDeletingBookId(null);
          }
        }},
      ]
    );
  };

  const create = async () => {`,
 'обработчик удаления молитвослова');
 one(books,
`              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Поделиться молитвословом ' + (item.title||'')}
                accessibilityHint="Создать защищённую ссылку для передачи личного молитвослова"
                onPress={() => shareBook(item)}
                hitSlop={5}
                style={({pressed}) => [styles.shareButton,pressed && styles.pressed]}
              >
                <Ionicons name="share-social-outline" size={20} color="#765238"/>
              </Pressable>`,
`              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Удалить молитвослов ' + (item.title || '')}
                accessibilityHint="Открыть подтверждение удаления молитвослова"
                onPress={() => confirmDeleteBook(item)}
                disabled={deletingBookId === item.sync_id}
                hitSlop={5}
                style={({pressed}) => [styles.shareButton, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={20} color="#A34738"/>
              </Pressable>`,
 'кнопка в карточке молитвослова');
 one(books,
`          onShare={contextItem ? ()=>shareBook(contextItem) : null}
        />`,
`          onShare={contextItem ? ()=>shareBook(contextItem) : null}
          onDelete={contextItem ? ()=>confirmDeleteBook(contextItem) : null}
          deleteLabel="Удалить молитвослов"
        />`,
 'удаление в меню молитвослова');
 one(memorial,
 "import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';",
 "import {ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';",
 'импорт Alert');
 one(memorial,
 "import {createMemorialBook, getMemorialBooks, syncMemorials} from '../services/memorials';",
 "import {createMemorialBook, deleteMemorialBook, getMemorialBooks, syncMemorials} from '../services/memorials';",
 'импорт удаления помянника');
 one(memorial,
 "  const [contextItem,setContextItem]=useState(null);",
`  const [contextItem,setContextItem]=useState(null);
  // PERSONAL_BOOK_ACTIONS_20261117
  const [deletingBookId, setDeletingBookId] = useState(null);`,
 'состояние удаления помянника');
 one(memorial,
 "  const shareMemorial = (book) => shareImportableContent({",
`  const confirmDeleteBook = book => {
    if (!book?.sync_id || deletingBookId) return;
    Alert.alert(
      'Удалить помянник?',
      'Помянник "' + (book.title || 'Мой помянник') +
        '" и его фотографии будут удалены. Отменить действие нельзя.',
      [
        {text: 'Отмена', style: 'cancel'},
        {text: 'Удалить', style: 'destructive', onPress: async () => {
          if (deletingBookId) return;
          setDeletingBookId(book.sync_id);
          try {
            await deleteMemorialBook(book.sync_id);
            setContextItem(null);
            setBooks(items => items.filter(item => item.sync_id !== book.sync_id));
          } catch (error) {
            Alert.alert('Не удалось удалить помянник', error?.message || 'Повторите попытку.');
          } finally {
            setDeletingBookId(null);
          }
        }},
      ]
    );
  };

  const shareMemorial = (book) => shareImportableContent({`,
 'обработчик удаления помянника');
 one(memorial,
`        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Поделиться помянником ' + (item.title||'')}
          accessibilityHint="Создать защищённую ссылку для передачи помянника"
          onPress={() => shareMemorial(item)}
          hitSlop={5}
          style={({pressed})=>[styles.shareButton,pressed && styles.pressed]}
        >
          <Ionicons name="share-social-outline" size={20} color="#765238"/>
        </Pressable>`,
`        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Удалить помянник ' + (item.title || '')}
          accessibilityHint="Открыть подтверждение удаления помянника"
          onPress={() => confirmDeleteBook(item)}
          disabled={deletingBookId === item.sync_id}
          hitSlop={5}
          style={({pressed})=>[styles.shareButton,pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={20} color="#A34738"/>
        </Pressable>`,
 'кнопка в карточке помянника');
 one(memorial,
`          onShare={contextItem ? ()=>shareMemorial(contextItem) : null}
        />`,
`          onShare={contextItem ? ()=>shareMemorial(contextItem) : null}
          onDelete={contextItem ? ()=>confirmDeleteBook(contextItem) : null}
          deleteLabel="Удалить помянник"
        />`,
 'удаление в меню помянника');
 one(menu,
`  onDelete=null,`,
`  // PERSONAL_BOOK_ACTIONS_20261117: allow context-specific delete wording.
  onDelete=null,deleteLabel='Удалить из избранного',`,
 'контекстное название удаления');
 one(menu,
`          {item('Удалить из избранного','trash-outline',onDelete,true)}`,
`          {item(deleteLabel,'trash-outline',onDelete,true)}`,
 'кнопка удаления контекстного меню');
 one(prayer,
 "import {shareImportableContent} from '../services/shareInvitations';\n",
 "/* PERSONAL_BOOK_ACTIONS_20261117: sharing remains available from the collection list. */\n",
 'лишний импорт sharing в молитвослове');
 one(prayer,
`  addPrayerToBook,
  createPersonalPrayer,`,
`  addPrayerToBook,
  createPersonalPrayer,
  deletePrayerBook,`,
 'импорт удаления молитвослова в деталях');
 one(prayer,
 "  if (!book) {",
`  const confirmDeleteBook = () => {
    if (!book?.sync_id || busy) return;
    Alert.alert(
      'Удалить молитвослов?',
      'Молитвослов "' + (book.title || 'Мой молитвослов') +
        '" и его состав будут удалены. Сами молитвы останутся в личной библиотеке.',
      [
        {text: 'Отмена', style: 'cancel'},
        {text: 'Удалить', style: 'destructive', onPress: async () => {
          if (busy) return;
          setBusy(true);
          try {
            await deletePrayerBook(book.sync_id);
            navigation.navigate('PrayerBooks');
          } catch (error) {
            Alert.alert('Не удалось удалить молитвослов', error?.message || 'Повторите попытку.');
          } finally {
            setBusy(false);
          }
        }},
      ]
    );
  };

  if (!book) {`,
 'удаление в деталях молитвослова');
 one(prayer,
`          renderItem={({item, index}) => {`,
`          ListFooterComponent={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Удалить молитвослов"
              disabled={busy}
              onPress={confirmDeleteBook}
              style={({pressed}) => [
                styles.deleteBookButton,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.deleteBookText}>Удалить молитвослов</Text>
            </Pressable>
          }
          renderItem={({item, index}) => {`,
 'кнопка удаления в деталях');
 one(prayer,
`        <FixedSectionHeader onHeaderHeightChange={setHeaderHeight}
          title={book.title} navigation={navigation} topInset={insets.top}
          headerAction={{label:'Поделиться',onPress:()=>shareImportableContent({
            kind:'prayerbook',sourceSyncId:book.sync_id,
            title:book.title||'Мой молитвослов',
          })}} />`,
`        <FixedSectionHeader onHeaderHeightChange={setHeaderHeight}
          title={book.title} navigation={navigation} topInset={insets.top} />`,
 'убрать Поделиться в шапке молитвослова');
 one(prayer,
`  stickyReadBar: {`,
`  deleteBookButton: {
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  deleteBookText: {
    color: '#A34738',
    fontSize: 14,
    fontWeight: '700',
  },
  stickyReadBar: {`,
 'стили удаления молитвослова');
 one(memorialDetail,
 "import {shareImportableContent} from '../services/shareInvitations';",
 "/* PERSONAL_BOOK_ACTIONS_20261117: sharing remains available from the memorial list. */",
 'лишний импорт sharing в помяннике');
 const methodStart=memorialDetail.text.indexOf('  const shareCurrentBook = async () => {');
 const methodEnd=memorialDetail.text.indexOf('\n  useEffect(() => {',methodStart);
 if(methodStart<0||methodEnd<0||memorialDetail.text.indexOf('  const shareCurrentBook = async () => {',methodStart+1)>=0)
   throw Error('MemorialBookScreen: функция shareCurrentBook отличается. Ничего не записано.');
 memorialDetail.text=memorialDetail.text.slice(0,methodStart)+memorialDetail.text.slice(methodEnd+1);
 one(memorialDetail,
`          headerAction={book?{label:'Поделиться',onPress:shareCurrentBook}:null}`,
`          `,
 'убрать Поделиться в шапке помянника');
 // Validate final code text and ensure no share action remains in detail.
 if(prayer.text.includes("headerAction={{label:'Поделиться'")||
    memorialDetail.text.includes('shareCurrentBook')||
    memorialDetail.text.includes("headerAction={book?{label:'Поделиться'"))
   throw Error('Остались кнопки Поделиться внутри книги; ничего не записано.');
 const suffix='.backup-personal-book-actions-'+new Date().toISOString().replace(/[:.]/g,'-');
 const writes=[];
 try{
   for(const e of entries)fs.writeFileSync(e.file+suffix,e.original,'utf8');
   for(const e of entries){
    fs.writeFileSync(e.file,e.text.replace(/\n/g,e.eol),'utf8');
    writes.push(e);
   }
 }catch(err){
   for(const e of writes)try{fs.writeFileSync(e.file,e.original,'utf8')}catch(_){}
   throw err;
 }
 console.log('OK: исправлено '+writes.length+' файлов. Резервные копии: '+suffix);
 console.log('Удаление молитвословов и помянников доступно в списке и контекстном меню с подтверждением.');
 console.log('Кнопки Поделиться убраны из заголовков внутренних экранов.');
 console.log('Молитвы остаются в библиотеке, помянник удаляется вместе с фотографиями.');
})();
