(function installBibleContinuousColumnPagination(){
 const fs=require('fs'),path=require('path');
 const mark='BIBLE_CONTINUOUS_COLUMNS_PAGINATION_20261117';
 const list=[
   'src/screens/BibleChapterScreen.js',
   'src/components/reader/selectableDocumentReader/runtime.js',
   'src/components/reader/selectableDocumentReader/styles.js',
 ];
 const files=list.map(name=>{
  const filename=path.join(process.cwd(),...name.split('/'));
  if(!fs.existsSync(filename))throw Error('Не найден файл: '+name);
  const raw=fs.readFileSync(filename,'utf8');
  return {name,filename,raw,eol:raw.includes('\r\n')?'\r\n':'\n',code:raw.replace(/\r\n/g,'\n')};
 });
 if(files.every(f=>f.code.includes(mark))){
  console.log('OK: непрерывная пагинация Библии уже установлена.');return;
 }
 if(files.some(f=>f.code.includes(mark)))throw Error('Найдено частичное применение; файлы не изменены.');
 const [screen,runtime,styles]=files;
 if(!screen.code.includes('BIBLE_BOOK_GLOBAL_COUNTER_TOGGLE_BOOKMARK_20261117'))
  throw Error('Сначала примени fix_bible_global_pages_and_toggle_bookmark_20261117.js');
 const once=(file,from,to,label)=>{
  let i=file.code.indexOf(from);
  if(i<0||file.code.indexOf(from,i+1)>=0)throw Error(file.name+': не найден уникальный фрагмент '+label+'; файлы не менялись.');
  file.code=file.code.replace(from,to);
 };

 once(screen,
   `      readerMode: 'book',

      progressOffsetMode: 'page',`,
   `      readerMode: 'book',

      // ${mark}: split long Bible verses across page boundaries by CSS
      // columns without duplicating a single DOM verse or its text offsets.
      bookFlowColumns: true,

      progressOffsetMode: 'page',`,
   'включение колонок только для Библии');

 once(runtime,
   `    const bookMode = DATA.document ?.readerMode === 'book';`,
   `    const bookMode = DATA.document ?.readerMode === 'book';
    const bookFlowColumns = bookMode && DATA.document?.bookFlowColumns === true;
    // ${mark}: page anchors refer to the ORIGINAL verse nodes, not clones.
    let bookPageAnchors = [];`,
   'опциональная книжная раскладка');

 once(runtime,
   `        state.bookPage = clampBookPage( page );
        const pages = Array.from( reader.querySelectorAll( ':scope > .book-page' ) );`,
   `        state.bookPage = clampBookPage( page );
        if(bookFlowColumns){
          const track=reader.querySelector(':scope > .book-column-track');
          if(track){
            track.style.transition=animated ? 'transform 140ms ease-out' : 'none';
            track.style.transform='translate3d('+
              (-state.bookPage*state.bookPageWidth+(dragOffset||0)*0.08)+'px,0,0)';
          }
          bookViewport.scrollLeft=0;
          updateBookPageIndicator();
          return;
        }
        const pages = Array.from( reader.querySelectorAll( ':scope > .book-page' ) );`,
   'переворот непрерывной колонки');

 once(runtime,
   `        Array.from( reader.children ).forEach( child => {
            if ( child.classList ?.contains( 'book-page' ) ) {`,
   `        Array.from( reader.children ).forEach( child => {
            if(child.classList?.contains('book-column-track')){
              nodes.push(...Array.from(child.children));
              return;
            }
            if ( child.classList ?.contains( 'book-page' ) ) {`,
   'извлечение исходных стихов при смене шрифта');

 once(runtime,
   `        const currentAnchor = reader.querySelector( '.book-page.active .rule-item[data-track-progress="true"]'
          ) ?.dataset ?.itemId || null;`,
   `        const currentAnchor = bookFlowColumns
          ? (bookPageAnchors[state.bookPage] || null)
          : (reader.querySelector('.book-page.active .rule-item[data-track-progress="true"]')
            ?.dataset?.itemId || null);
        const previousTotal=Math.max(1,state.bookPageCount);
        const previousPage=state.bookPage;`,
   'сохранение позиции при перепагинации');

 once(runtime,
   `        state.bookPageWidth = Math.max( 1, bookViewport .clientWidth );
        let page = createBookPage( 0 );`,
   `        state.bookPageWidth = Math.max( 1, bookViewport .clientWidth );
        if(bookFlowColumns){
          const width=state.bookPageWidth;
          const track=el('div','book-column-track');
          track.style.columnWidth=Math.max(1,width-16)+'px';
          reader.appendChild(track);
          nodes.forEach(node=>track.appendChild(node));

          // Columns retain a *single* verse DOM, even when it continues onto
          // the following page. This preserves selection, crossrefs, IDs,
          // highlighting and the original source character offsets.
          const trackWidth=Math.max(width,track.scrollWidth);
          state.bookPageCount=Math.max(1,Math.ceil((trackWidth+8)/width));
          const trackLeft=track.getBoundingClientRect().left;
          const anchors=Array(state.bookPageCount).fill(null);
          Array.from(track.children).forEach(node=>{
            if(node.dataset?.trackProgress!=='true')return;
            for(const rect of Array.from(node.getClientRects())){
              if(rect.width<1||rect.height<1)continue;
              const index=Math.floor((rect.left-trackLeft+1)/width);
              if(index>=0&&index<anchors.length&&!anchors[index])
                anchors[index]=String(node.dataset.itemId||'');
            }
          });
          let seen=anchors.find(value=>!!value)||null;
          for(let i=0;i<anchors.length;i++){
            if(anchors[i])seen=anchors[i];
            else anchors[i]=seen;
          }
          bookPageAnchors=anchors;
          refreshSavedBookRunClasses();
          if(currentAnchor){
            const matches=bookPageAnchors.map((value,i)=>value===currentAnchor?i:-1)
              .filter(i=>i>=0);
            const fraction=previousTotal<=1?0:previousPage/(previousTotal-1);
            const estimate=Math.round(fraction*Math.max(0,state.bookPageCount-1));
            state.bookPage=matches.length
              ? matches.reduce((best,i)=>Math.abs(i-estimate)<Math.abs(best-estimate)?i:best)
              : estimate;
          }
          state.bookPage=clampBookPage(state.bookPage);
          applyBookPage(state.bookPage,false);
          return;
        }
        let page = createBookPage( 0 );`,
   'постраничные колонки без дублирования стихов');

 once(runtime,
   `    const pageForElement = element => {
        if ( !bookMode || !element ) {
          return 0;
        }
        const page = element.closest( '.book-page' );`,
   `    const pageForElement = element => {
        if ( !bookMode || !element ) {
          return 0;
        }
        if(bookFlowColumns){
          const track=reader.querySelector(':scope > .book-column-track');
          if(!track)return 0;
          const node=element.closest('.rule-item')||element;
          const rect=node.getClientRects()?.[0];
          if(!rect)return 0;
          return clampBookPage(Math.floor(
            (rect.left-track.getBoundingClientRect().left+1)/state.bookPageWidth));
        }
        const page = element.closest( '.book-page' );`,
   'переход к стихам и главам через колонку');

 once(runtime,
   `        document .querySelectorAll( '.book-page' ) .forEach( page => {`,
   `        document .querySelectorAll( '.book-page, .book-column-track' ) .forEach( page => {`,
   'сохранение групповой подсветки глав');

 once(runtime,
   `        if (bookMode) {
          const currentPage = reader.querySelector( '.book-page[data-page-index="' + state.bookPage + '"]' );
          const current = currentPage ?.querySelector( '.rule-item[data-track-progress="true"]' ) || items[0];`,
   `        if (bookMode) {
          const currentPage = bookFlowColumns ? null
            : reader.querySelector( '.book-page[data-page-index="' + state.bookPage + '"]' );
          const activeAnchor=bookFlowColumns ? bookPageAnchors[state.bookPage] : null;
          const current = (activeAnchor
            ? reader.querySelector('.rule-item[data-track-progress="true"][data-item-id="'+activeAnchor+'"]')
            : currentPage?.querySelector('.rule-item[data-track-progress="true"]')) || items[0];`,
   'корректный прогресс при перелистывании');

 once(runtime,
   `      if (bookMode) {
        const currentPage = reader.querySelector('.book-page[data-page-index="' + state.bookPage + '"]');
        const current = currentPage?.querySelector('.rule-item[data-track-progress="true"]') || items[0];
        return {anchorId: Number(current.dataset.itemId), offset: state.bookPage, scrollRatio};
      }`,
   `      if (bookMode) {
        const activeAnchor=bookFlowColumns ? bookPageAnchors[state.bookPage] : null;
        const currentPage=bookFlowColumns?null
          :reader.querySelector('.book-page[data-page-index="'+state.bookPage+'"]');
        const current=(activeAnchor
          ? reader.querySelector('.rule-item[data-track-progress="true"][data-item-id="'+activeAnchor+'"]')
          : currentPage?.querySelector('.rule-item[data-track-progress="true"]')) || items[0];
        return {anchorId: Number(current.dataset.itemId), offset: state.bookPage, scrollRatio};
      }`,
   'положение текущего стиха при смене перевода');

 const end='\\n  `;';
 const pos=styles.code.lastIndexOf('\n  `;');
 if(pos<0||!['\n  `;','\n  `;\n'].includes(styles.code.slice(pos)))
  throw Error('Не удалось найти конец CSS читателя.');
 const add=`
    /* ${mark}: Bible-only flowing columns. Each DOM verse stays whole,
       even though its rendered lines may continue on the next book page. */
    body.book-mode #reader.book-track .book-column-track {
      position: relative;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: 0 8px;
      column-fill: auto;
      column-gap: 16px;
      overflow: visible;
      will-change: transform;
    }
    body.book-mode #reader.book-track .book-column-track .bible-verse-section {
      break-inside: auto;
      page-break-inside: auto;
      orphans: 2;
      widows: 2;
    }
    body.book-mode #reader.book-track .book-column-track .bible-chapter-start .section-header {
      break-after: avoid-column;
    }
`;
 styles.code=styles.code.slice(0,pos)+add+styles.code.slice(pos);
 if(!files.every(f=>f.code.includes(mark)))throw Error('Внедрение неполное, файлы не изменены');
 const stamp='.backup-bible-columns-20261117-'+new Date().toISOString().replace(/[:.]/g,'-');
 const written=[];
 try{
  for(const f of files)fs.writeFileSync(f.filename+stamp,f.raw,'utf8');
  for(const f of files){fs.writeFileSync(f.filename,f.code.replace(/\n/g,f.eol),'utf8');written.push(f);}
 }catch(e){for(const f of written)try{fs.writeFileSync(f.filename,f.raw,'utf8');}catch(_){}throw e;}
 console.log('OK: страницы Библии заполняются непрерывно, длинные стихи могут продолжаться на следующей странице.');
 console.log('OK: стихи не дублируются, исходный текст и индексы выделения не изменены.');
 console.log('OK: общая нумерация страниц, закладки и параллельные ссылки остаются доступны.');
 console.log('OK: остальные читатели не затронуты; резервные копии: '+stamp);
})();
