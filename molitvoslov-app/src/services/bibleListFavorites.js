import {saveItem} from './savedItems';
import {formatBibleNumber} from './bibleUi';

// A book is saved as a navigation target, not an enormous duplicate of Scripture.
// The existing Bible reader's chapter records retain their native IDs.
const matchesEdition=(row,book,translationCode) =>
  row?.source_type==='bible' &&
  Number(row.source_id)===Number(book?.id) &&
  (!row.metadata?.translation_code ||
    row.metadata.translation_code===translationCode);

export const findSavedBibleBook=(rows,book,translationCode) =>
  (rows||[]).find(row =>
    matchesEdition(row,book,translationCode) &&
    row.anchor_type==='bible_book' &&
    row.save_type==='text' &&
    Number(row.anchor_id)===Number(book?.id))||null;

export const findSavedBibleChapter=(rows,book,chapter,translationCode) =>
  (rows||[]).find(row =>
    matchesEdition(row,book,translationCode) &&
    row.anchor_type==='bible_chapter' &&
    row.save_type==='chapter' &&
    Number(row.anchor_id)===Number(chapter?.id))||null;

export const bibleChapterText=(chapter,translationCode) =>
  (chapter?.verses||[]).map(verse =>
    formatBibleNumber(translationCode,verse.number)+' '+String(verse.text||'')
  ).join('\n');

export const saveBibleBook=async({book,translationCode,title})=>{
  if(!Number.isInteger(Number(book?.id)) || Number(book.id)<=0) {
    throw new Error('Книга не найдена');
  }
  return saveItem({
    save_type:'text',
    source_type:'bible',
    source_id:Number(book.id),
    anchor_type:'bible_book',
    anchor_id:Number(book.id),
    source_title:title,
    item_title:title,
    text:'',
    start_offset:0,
    end_offset:0,
    metadata:{
      book_id:Number(book.id),
      book_slug:book.slug,
      book_code:book.code,
      book_name:title,
      translation_code:translationCode,
    },
  });
};

export const saveBibleChapter=async({book,chapter,translationCode,title})=>{
  if(!Number.isInteger(Number(book?.id)) || Number(book.id)<=0 ||
     !Number.isInteger(Number(chapter?.id)) || Number(chapter.id)<=0) {
    throw new Error('Глава не найдена');
  }
  const text=bibleChapterText(chapter,translationCode);
  return saveItem({
    save_type:'chapter',
    source_type:'bible',
    source_id:Number(book.id),
    anchor_type:'bible_chapter',
    anchor_id:Number(chapter.id),
    source_title:title,
    item_title:title+' · '+formatBibleNumber(translationCode,chapter.number),
    text,
    start_offset:0,
    end_offset:text.length,
    metadata:{
      book_id:Number(book.id),
      book_slug:book.slug,
      book_code:book.code,
      book_name:title,
      chapter_id:Number(chapter.id),
      chapter_number:Number(chapter.number),
      verse_count:(chapter.verses||[]).length,
      translation_code:translationCode,
    },
  });
};
