(function installBibleGlobalPagesAndBookmarkToggle(){
 const fs=require('fs'),path=require('path');
 const marker='BIBLE_BOOK_GLOBAL_COUNTER_TOGGLE_BOOKMARK_20261117';
 const name='src/screens/BibleChapterScreen.js',file=path.join(process.cwd(),...name.split('/'));
 if(!fs.existsSync(file))throw Error('Файл не найден: '+name);
 const original=fs.readFileSync(file,'utf8');
 let code=original.replace(/\r\n/g,'\n'),linebreak=original.includes('\r\n')?'\r\n':'\n';
 if(code.includes(marker)){console.log('OK: счётчик страниц и закладки уже обновлены.');return;}
 const once=(old,updated,meaning)=>{
  const i=code.indexOf(old);if(i<0||code.indexOf(old,i+1)>=0)throw Error('Не найден код '+meaning+'; файл не менялся');
  code=code.replace(old,updated);
 };
 once(
 `  const [currentBookmarkOffset,setCurrentBookmarkOffset] = useState(0);`,
 `  const [currentBookmarkOffset,setCurrentBookmarkOffset] = useState(0);
  // ${marker}: global pagination for the entire loaded Bible book.
  const [bookPageProgress,setBookPageProgress] = useState({index:null,total:null});
  const bookmarkActionBusyRef = useRef(false);
  // Refresh only the native bookmark icon, never rebuild all Bible verses.
  const [,refreshBookmarkIcon] = useState(0);`,
 'положение и состояние закладок'
 );
 once(
 `  useEffect(() => {
    setCurrentChapterNumber(Number(requestedChapter?.number || 1));
  }, [bookId, requestedChapter?.number]);`,
 `  useEffect(() => {
    setCurrentChapterNumber(Number(requestedChapter?.number || 1));
  }, [bookId, requestedChapter?.number]);

  // Recomputing pagination in another book/translation must not briefly show
  // the previous book's total. Font/palette updates will report a new total.
  useEffect(() => {
    setBookPageProgress({index:null,total:null});
  }, [bookId, translationCode]);`,
 'сброс счётчика при смене книги'
 );
 once(
 `  const handleProgress = (progress) => {
    if (!book) {
      return;
    }

    const current = verseInfo.byId.get(Number(progress.anchorId));`,
 `  const handleProgress = (progress) => {
    if (!book) {
      return;
    }

    // The book-mode WebView paginates all chapters, not just the open one.
    const pageIndex=progress.pageIndex;
    const pageCount=progress.pageCount;
    if(Number.isInteger(pageIndex)&&Number.isInteger(pageCount)&&
       pageIndex>=0&&pageCount>0){
      const index=Math.min(pageIndex,pageCount-1);
      setBookPageProgress(old=>old.index===index&&old.total===pageCount
        ?old:{index,total:pageCount});
    }

    const current = verseInfo.byId.get(Number(progress.anchorId));`,
 'положение страницы по всей книге'
 );
 once(
 `  const addCurrentBookmark = async () => {
    let position = getCurrentProgress() || getStableProgress();`,
 `  const toggleCurrentBookmark = async () => {
    if(bookmarkActionBusyRef.current)return;
    let position = getCurrentProgress() || getStableProgress();`,
 'повторное нажатие для удаления закладки'
 );
 once(
 `    try {
      const result = await saveReadingBookmark(bookmark);
      const saved=result?.item;
      if(saved && !savedItemsRef.current.some(item=>item.id===saved.id)){
        savedItemsRef.current=[saved,...savedItemsRef.current];
        setSavedItems(current=>[saved,...current]);
      }
      setCurrentBookmarkAnchor(Number(position.anchorId));
      setCurrentBookmarkOffset(Math.max(0,Number(position.offset||0)));
      showBookmarkFeedback(result.created ? 'Закладка добавлена' : 'Закладка уже есть');
    } catch (error) {
      console.log('Ошибка добавления закладки Библии:', error.message);
      showBookmarkFeedback('Не удалось добавить закладку');
    }
  };`,
 `    bookmarkActionBusyRef.current=true;
    try {
      const existing=savedItemsRef.current.find(item=>
        item.save_type==='bookmark' &&
        item.anchor_type===position.anchorType &&
        Number(item.anchor_id)===Number(position.anchorId) &&
        Math.abs(Number(item.metadata?.bookmark_offset||0)-
          Math.max(0,Number(position.offset||0)))<32
      );
      if(existing){
        await deleteSavedItem(existing.id);
        savedItemsRef.current=savedItemsRef.current.filter(item=>item.id!==existing.id);
        refreshBookmarkIcon(value=>value+1);
        showBookmarkFeedback('Закладка снята');
        return;
      }

      const result=await saveReadingBookmark(bookmark);
      const saved=result?.item;
      if(saved && !savedItemsRef.current.some(item=>item.id===saved.id)){
        savedItemsRef.current=[saved,...savedItemsRef.current];
        refreshBookmarkIcon(value=>value+1);
      }
      setCurrentBookmarkAnchor(Number(position.anchorId));
      setCurrentBookmarkOffset(Math.max(0,Number(position.offset||0)));
      showBookmarkFeedback(result.created ? 'Закладка добавлена' : 'Закладка уже есть');
    }catch(error){
      console.log('Ошибка изменения закладки Библии:',error?.message||error);
      showBookmarkFeedback('Не удалось изменить закладку');
    }finally{
      bookmarkActionBusyRef.current=false;
    }
  };`,
 'переключение текущей закладки'
 );
 once(
 `  const isCurrentPlaceBookmarked=savedItems.some(item=>`,
 `  const isCurrentPlaceBookmarked=savedItemsRef.current.some(item=>`,
 'выделение закладки без перестройки списка стихов'
 );
 once(
 `        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить закладку"
          onPress={addCurrentBookmark}`,
 `        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isCurrentPlaceBookmarked?'Снять закладку':'Добавить закладку'}
          accessibilityState={{selected:isCurrentPlaceBookmarked}}
          onPress={toggleCurrentBookmark}`,
 'кнопка и доступность'
 );
 once(
 `      <View
        style={[
          styles.bookToolbar,`,
 `      {/* ${marker}: number is across all chapters of this book, not this chapter. */}
      <View style={[styles.bookPageCounter,readerTheme==='night' && styles.bookPageCounterNight]}>
        <Text numberOfLines={1} style={[styles.bookPageCounterText,readerTheme==='night' && styles.bookPageCounterTextNight]}>
          {bookPageProgress.total
            ? 'Страница '+(bookPageProgress.index+1)+' из '+bookPageProgress.total+
              '  ·  Осталось '+Math.max(0,bookPageProgress.total-bookPageProgress.index-1)
            : ' '}
        </Text>
      </View>
      <View
        style={[
          styles.bookToolbar,`,
 'нижняя строка сквозной нумерации'
 );
 once(
 `  bookToolbar: {
    minHeight: 58,`,
 `  bookPageCounter: {
    height: 19,
    paddingHorizontal: 12,
    alignItems:'center',
    justifyContent:'center',
    backgroundColor:'#F7E9CF',
    borderTopWidth:StyleSheet.hairlineWidth,
    borderTopColor:'rgba(120, 78, 41, 0.16)',
  },
  bookPageCounterNight: {
    backgroundColor:'#1D1713',
    borderTopColor:'rgba(218, 185, 143, 0.14)',
  },
  bookPageCounterText: {
    fontSize:11,
    lineHeight:16,
    color:'#765238',
    textAlign:'center',
  },
  bookPageCounterTextNight: {
    color:'#D8C1A6',
  },
  bookToolbar: {
    minHeight: 58,`,
 'стили счётчика'
 );
 if(!code.includes(marker)||code.includes('onPress={addCurrentBookmark}'))throw Error('Валидация перед записью не пройдена');
 const backup=file+'.backup-bible-pages-bookmark-'+new Date().toISOString().replace(/[:.]/g,'-');
 fs.writeFileSync(backup,original,'utf8');
 try {fs.writeFileSync(file,code.replace(/\n/g,linebreak),'utf8');}catch(e){fs.writeFileSync(file,original,'utf8');throw e;}
 console.log('OK: счётчик «Страница N из M · Осталось K» по всем главам книги.');
 console.log('OK: повторное нажатие закрашенной закладки удаляет её; иконка становится контурной.');
 console.log('OK: подсчёт обновляется при смене страницы и размера шрифта.');
 console.log('OK: остальные книги, переводы и исходники стихов не изменены.');
 console.log('Резервная копия:',backup);
})();
