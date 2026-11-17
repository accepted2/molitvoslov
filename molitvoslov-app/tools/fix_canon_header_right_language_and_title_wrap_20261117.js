(function installCanonHeaderRightLanguageAndTitleWrapping() {
 const fs = require('fs');
 const path = require('path');
 const marker = 'CANON_HEADER_RIGHT_LANGUAGE_AND_BALANCED_TRAD_TITLE_20261117';
 const root = process.cwd();
 const specs = [
  'src/components/navigation/FixedSectionHeader.js',
  'src/screens/CanonScreen.js',
  'src/components/reader/selectableDocumentReader/styles.js',
 ];
 const list = specs.map(name => {
  const filename = path.join(root,...name.split('/'));
  if(!fs.existsSync(filename)) throw Error('Не найден файл: '+name);
  const original = fs.readFileSync(filename,'utf8');
  return {name,filename,original,eol:original.includes('\r\n')?'\r\n':'\n',source:original.replace(/\r\n/g,'\n')};
 });
 if(list.every(f=>f.source.includes(marker))){
  console.log('OK: кнопка языка справа, внутренний заголовок исправлен ранее.');
  return;
 }
 if(list.some(f=>f.source.includes(marker))) throw Error('Частично применённое исправление. Файлы не изменены.');
 const [header,canon,css] = list;
 const exact = (file,from,to,label) => {
  const i=file.source.indexOf(from);
  if(i<0||file.source.indexOf(from,i+1)>=0)
   throw Error(file.name+': не найден уникальный участок: '+label+'. Файлы не изменены.');
  file.source = file.source.replace(from,to);
 };
 if(!header.source.includes('CANON_FLOWING_LONG_HEADER_JUSTIFIED_TRAD_TITLE_20261117') ||
    !canon.source.includes('THEOTOKOS_TRADITIONAL_RUBRICS_20261117') ||
    !css.source.includes('CANON_FLOWING_LONG_HEADER_JUSTIFIED_TRAD_TITLE_20261117'))
   throw Error('Сначала необходимо применить предыдущую правку длинной шапки и ЦС-трад канона.');

 // Earlier patch anchored the pill to left=0 when the final text line
 // was too long. Keep the measured fit test, but always anchor to the right.
 exact(header,
`                        left: flowPillBelow ? 0 : Math.max(0, lastTitleLineWidth + 6),
                        top: flowPillBelow
                          ? titleLines * lineHeight + 3
                          : Math.max(0, (titleLines - 1) * lineHeight - 1),`,
`                        // ${marker}: right edge of title area, never left.
                        right: 0,
                        top: flowPillBelow
                          ? titleLines * lineHeight + 3
                          : Math.max(0, (titleLines - 1) * lineHeight - 1),`,
'выравнивание кнопки справа');

 // No wrap immediately after the comma in this particular long Church-
 // Slavonic document name. NBSP is a presentation-only change to a title,
 // not to prayer content, bookmarks or saved offsets.
 exact(canon,
  `Бцⷣѣ, пое́мый во всѧ́кой`,
  `Бцⷣѣ,\\u00A0пое́мый во всѧ́кой`,
  'неразрывное сочетание в длинном церковнославянском названии');
 const markerText='/* CANON_FLOWING_LONG_HEADER_JUSTIFIED_TRAD_TITLE_20261117: traditional Theotokos title, distinct from the native header. */';
 const start=css.source.indexOf(markerText);
 if(start<0)throw Error('Не найден CSS длинного церковнославянского заголовка.');
 const ending=css.source.indexOf('\n    }',start);
 if(ending<0)throw Error('Не найден CSS конец заголовка.');
 const block=css.source.slice(start,ending);
 const old=`      text-align: justify !important;
      text-align-last: left !important;
      text-justify: inter-word;
      font-family: 'Ponomar', Georgia, serif !important;
      font-weight: 400 !important;`;
 const altered=`      /* ${marker}: balanced, natural wrapping instead of an isolated word
         after the comma; keep full-width justification without huge glyphs. */
      text-align: justify !important;
      text-align-last: left !important;
      text-justify: inter-word;
      text-wrap: balance;
      overflow-wrap: normal !important;
      word-break: normal !important;
      hyphens: none !important;
      letter-spacing: normal !important;
      font-size: clamp(20px, 5.8vw, 23px) !important;
      line-height: 1.5 !important;
      font-family: 'Ponomar', Georgia, serif !important;
      font-weight: 400 !important;`;
 if(!block.includes(old))throw Error('CSS предыдущей версии отличается, ничего не записано.');
 css.source=css.source.slice(0,start)+block.replace(old,altered)+css.source.slice(ending);
 if(!list.every(f=>f.source.includes(marker)))throw Error('Исправление неполное, файлы не изменены.');
 const suffix='.backup-canon-header-right-and-wrap-20261117-'+new Date().toISOString().replace(/[:.]/g,'-');
 const written=[];
 try{
  for(let f of list)fs.writeFileSync(f.filename+suffix,f.original,'utf8');
  for(let f of list){fs.writeFileSync(f.filename,f.source.replace(/\n/g,f.eol),'utf8');written.push(f);}
 }catch(error){
  for(let f of written)try{fs.writeFileSync(f.filename,f.original,'utf8')}catch(_){}
  throw error;
 }
 console.log('OK: переключатель языков располагается справа в шапке длинного канона.');
 console.log('OK: если кнопка не помещается на последней строке, она справа под заголовком.');
 console.log('OK: текст внутреннего ЦС-трад заголовка переносится естественно, без отрыва «пое́мый» после запятой.');
 console.log('OK: прочие каноны, переводы, молитвы, закладки и данные Django не изменены.');
 console.log('Резервные копии: '+suffix);
})();
