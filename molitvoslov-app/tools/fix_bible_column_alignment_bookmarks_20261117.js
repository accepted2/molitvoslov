(function fixBibleColumnAlignmentAndBookmarkMatching() {
  'use strict';
  const fs = require('fs');
  const path = require('path');
  const MARK = 'BIBLE_COLUMN_WIDTH_GUARDS_20261117';
  const APP = process.cwd();
  const names = {
    screen: 'src/screens/BibleChapterScreen.js',
    runtime: 'src/components/reader/selectableDocumentReader/runtime.js',
    styles: 'src/components/reader/selectableDocumentReader/styles.js',
    bookmarks: 'src/services/readerBookmarks.js',
  };
  const load = name => {
    const filename = path.join(APP, ...name.split('/'));
    if (!fs.existsSync(filename)) throw new Error('Нет файла ' + name + '. Запускайте из molitvoslov-app.');
    const original = fs.readFileSync(filename, 'utf8');
    return {
      name, filename, original, eol: original.includes('\r\n') ? '\r\n' : '\n',
      code: original.replace(/\r\n/g, '\n'),
    };
  };
  let files = Object.fromEntries(Object.entries(names).map(([k, name]) => [k, load(name)]));
  if (Object.values(files).every(f => f.code.includes(MARK))) {
    console.log('OK: ограничение ширины страниц Библии и точное переключение закладок уже установлены.');
    return;
  }
  if (Object.values(files).some(f => f.code.includes(MARK))) {
    throw new Error('Частично установленный патч: ничего не изменено; восстановите резервную копию.');
  }

  // Preserve the original independent patches. Both are safe to run again and
  // create their own backups if they have not yet been installed locally.
  if (!files.screen.code.includes('BIBLE_BOOK_GLOBAL_COUNTER_TOGGLE_BOOKMARK_20261117')) {
    require('./fix_bible_global_pages_and_toggle_bookmark_20261117.js');
  }
  files = Object.fromEntries(Object.entries(names).map(([k, name]) => [k, load(name)]));
  if (!files.runtime.code.includes('BIBLE_CONTINUOUS_COLUMNS_PAGINATION_20261117')) {
    require('./fix_bible_continuous_column_pages_20261117.js');
  }
  files = Object.fromEntries(Object.entries(names).map(([k, name]) => [k, load(name)]));
  if (!files.screen.code.includes('BIBLE_BOOK_GLOBAL_COUNTER_TOGGLE_BOOKMARK_20261117') ||
      !['screen', 'runtime', 'styles'].every(k =>
        files[k].code.includes('BIBLE_CONTINUOUS_COLUMNS_PAGINATION_20261117'))) {
    throw new Error('Исходные исправления счётчика/колонок не установлены; файлы не изменены.');
  }

  const once = (file, oldText, newText, label) => {
    const i = file.code.indexOf(oldText);
    if (i < 0 || file.code.indexOf(oldText, i + oldText.length) !== -1) {
      throw new Error(file.name + ': не найден уникальный фрагмент "' + label + '". Ничего не записано.');
    }
    file.code = file.code.slice(0, i) + newText + file.code.slice(i + oldText.length);
  };
  const {screen, runtime, styles, bookmarks} = files;

  // In the previous version the multicolumn width was determined separately
  // by Chromium's column distribution. Explicitly force one viewport stride
  // per page, including identical left/right insets on *each* page.
  once(
    runtime,
    "          const track=el('div','book-column-track');\n          track.style.columnWidth=Math.max(1,width-16)+'px';\n          reader.appendChild(track);",
    "          const track=el('div','book-column-track');\n" +
    "          // " + MARK + ": one exact viewport-width column stride.\n" +
    "          // The gap is also the sum of the two page-side margins.\n" +
    "          const sideInset=Math.min(18,Math.max(8,Math.floor(width*0.045)));\n" +
    "          track.style.width=width+'px';\n" +
    "          track.style.minWidth=width+'px';\n" +
    "          track.style.maxWidth=width+'px';\n" +
    "          track.style.padding='0 '+sideInset+'px';\n" +
    "          track.style.columnGap=(sideInset*2)+'px';\n" +
    "          track.style.columnWidth=Math.max(1,width-sideInset*2)+'px';\n" +
    "          reader.appendChild(track);",
    'размер колонки и боковые поля'
  );
  once(
    runtime,
    '          state.bookPageCount=Math.max(1,Math.ceil((trackWidth+8)/width));',
    '          state.bookPageCount=Math.max(1,Math.ceil((trackWidth+sideInset)/width));',
    'подсчёт последней колонки без лишней пустой страницы'
  );

  // The book's page index is a *page*, not a pixel scroll offset. Old
  // <32 tolerance could paint the bookmark on adjacent pages and remove the
  // wrong saved position. This does not touch other reader categories.
  once(
    screen,
    '    setCurrentBookmarkOffset(old=>Math.abs(old-offset)<4?old:offset);',
    '    setCurrentBookmarkOffset(old=>old===offset?old:offset);',
    'смена активной закладки при каждом перелистывании'
  );
  once(
    screen,
    "        Math.abs(Number(item.metadata?.bookmark_offset||0)-\n          Math.max(0,Number(position.offset||0)))<32",
    "        Number(item.metadata?.bookmark_offset||0)===Math.max(0,Number(position.offset||0)) &&\n" +
    "        (!Number(item.metadata?.bookmark_page_count||0)||\n" +
    "          !Number(bookPageProgress.total||0)||\n" +
    "          Number(item.metadata.bookmark_page_count)===Number(bookPageProgress.total))",
    'удаление закладки с текущей страницы'
  );
  once(
    screen,
    "    Math.abs(Number(item.metadata?.bookmark_offset||0)-\n      Number(currentBookmarkOffset||0))<32",
    "    Number(item.metadata?.bookmark_offset||0)===Number(currentBookmarkOffset||0) &&\n" +
    "    (!Number(item.metadata?.bookmark_page_count||0)||\n" +
    "      !Number(bookPageProgress.total||0)||\n" +
    "      Number(item.metadata.bookmark_page_count)===Number(bookPageProgress.total))",
    'контурная и закрашенная иконки текущей страницы'
  );
  // Prevent the duplicate detection in the common save service from
  // returning a bookmark belonging to another page of the same long verse.
  once(
    bookmarks,
    'const sameBookmark = (item, position) => {',
    'const sameBookmark = (item, position, sourceType, metadata = {}) => {',
    'аргументы проверки дубля'
  );
  once(
    bookmarks,
    '  return Math.abs(savedOffset - currentOffset) < 32;',
    "  if (sourceType === 'bible') {\n" +
    "    // " + MARK + ": exact page for the Bible, keep the legacy rule elsewhere.\n" +
    "    const savedCount = Number(item.metadata?.bookmark_page_count || 0);\n" +
    "    const currentCount = Number(metadata.bookmark_page_count || 0);\n" +
    "    return savedOffset === currentOffset &&\n" +
    "      (!savedCount || !currentCount || savedCount === currentCount);\n" +
    "  }\n" +
    '  return Math.abs(savedOffset - currentOffset) < 32;',
    'проверка существующей книжной закладки'
  );
  once(
    bookmarks,
    '  const duplicate = existing.find((item) => sameBookmark(item, position));',
    '  const duplicate = existing.find((item) => sameBookmark(item, position, sourceType, metadata));',
    'учёт типа источника при сохранении закладки'
  );

  // CSS columns must be allowed to split long verse paragraphs, but the
  // visible page and all child boxes stay inside its exact horizontal bounds.
  const css = '\n' +
    '    /* ' + MARK + ': Bible book page geometry only. */\n' +
    '    body.book-mode { width: 100%; max-width: 100%; overflow-x: hidden; }\n' +
    '    body.book-mode #book-viewport,\n' +
    '    body.book-mode #reader.book-track { width: 100%; max-width: 100%; overflow-x: hidden; }\n' +
    '    body.book-mode #reader.book-track .book-column-track {\n' +
    '      box-sizing: border-box;\n' +
    '      column-fill: auto;\n' +
    '      overflow: visible;\n' +
    '    }\n' +
    '    body.book-mode #reader.book-track .book-column-track > .rule-item,\n' +
    '    body.book-mode #reader.book-track .book-column-track .reader-row,\n' +
    '    body.book-mode #reader.book-track .book-column-track .reader-column,\n' +
    '    body.book-mode #reader.book-track .book-column-track .reader-inline {\n' +
    '      min-width: 0;\n' +
    '      max-width: 100%;\n' +
    '      break-inside: auto;\n' +
    '    }\n';
  const tail = '\n  ' + String.fromCharCode(96) + ';';
  const cssPos = styles.code.lastIndexOf(tail);
  if (cssPos < 0 || styles.code.lastIndexOf(tail) !== styles.code.indexOf(tail)) {
    throw new Error('Не найден однозначный конец CSS; ничего не записано.');
  }
  styles.code = styles.code.slice(0, cssPos) + css + styles.code.slice(cssPos);
  if (!Object.values(files).every(f => f.code.includes(MARK))) {
    throw new Error('Не все четыре файла исправлены; ничего не записано.');
  }

  const stamp = '.backup-book-alignment-' + new Date().toISOString().replace(/[:.]/g, '-');
  const written = [];
  try {
    for (const f of Object.values(files)) fs.writeFileSync(f.filename + stamp, f.original, 'utf8');
    for (const f of Object.values(files)) {
      fs.writeFileSync(f.filename, f.code.replace(/\n/g, f.eol), 'utf8');
      written.push(f);
    }
  } catch (error) {
    for (const f of written) fs.writeFileSync(f.filename, f.original, 'utf8');
    throw error;
  }
  console.log('OK: книжные страницы выровнены; боковые поля одинаковы на каждой странице.');
  console.log('OK: длинные стихи переносятся между страницами без обрезания справа.');
  console.log('OK: счётчик сквозной по книге, без лишней последней страницы.');
  console.log('OK: закладка переключается на текущей странице; соседние страницы не затронуты.');
  console.log('Созданы резервные копии с суффиксом ' + stamp);
})();