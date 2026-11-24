(function improveFirstHourColdStart(){
  const fs=require('fs'),path=require('path'),vm=require('vm');
  const root=process.cwd();
  const locations={
    screen:path.join(root,'src/screens/HoursReadingScreen.js'),
    marks:path.join(root,'src/services/hoursTypography.js'),
  };
  const originals={};
  for(const [key,file] of Object.entries(locations)){
    if(!fs.existsSync(file))throw Error('Не найден файл: '+file);
    originals[key]=fs.readFileSync(file,'utf8');
  }
  const markerScreen='HOURS_FIRST_OPEN_FAST_20261116';
  const markerMarks='HOURS_FAST_MARK_MAPPER_20261116';
  if(originals.screen.includes(markerScreen)&&originals.marks.includes(markerMarks)){
    console.log('OK: оптимизация уже применена.');return;
  }
  if(originals.screen.includes(markerScreen)||originals.marks.includes(markerMarks))
    throw Error('Оптимизация применена частично; файлы не изменены.');
  const eols=Object.fromEntries(Object.entries(originals).map(([k,s])=>[k,s.includes('\r\n')?'\r\n':'\n']));
  let screen=originals.screen.replace(/\r\n/g,'\n');
  let marks=originals.marks.replace(/\r\n/g,'\n');
  const screenAnchor='export const HoursReadingScreen = ({route, navigation}) => {';
  if(screen.split(screenAnchor).length!==2)throw Error('Hours screen differs, no files changed.');
  const cacheHelper=`// HOURS_FIRST_OPEN_FAST_20261116:
  // Keep at most four prepared First Hour variants for this offline session.
  // Switching back to a previously opened language avoids reprocessing Psalms.
  // Content/entry identity checks prevent stale results when the source changes.
  const FIRST_HOUR_DOCUMENT_CACHE = new Map();
  const buildCachedHoursDocument = ({entry, content, viewMode}) => {
    if (entry.id !== 'ordinary-1') {
      return buildHoursDocument({entry, content, viewMode});
    }
    const saved = FIRST_HOUR_DOCUMENT_CACHE.get(viewMode);
    if (saved && saved.entry === entry && saved.content === content) return saved.document;
    const document = buildHoursDocument({entry, content, viewMode});
    FIRST_HOUR_DOCUMENT_CACHE.set(viewMode, {entry, content, document});
    return document;
  };

  `;
  screen=screen.replace(screenAnchor,cacheHelper+screenAnchor);
  const documentMatch=/\bconst result\s*=\s*entry\s*\?\s*buildHoursDocument\(\{\s*entry\s*,\s*content\s*,\s*viewMode\s*\}\)\s*:\s*null\s*;/g;
  const all=[...screen.matchAll(documentMatch)];
  if(all.length!==1)throw Error('Не найдено однозначное построение документа: '+all.length+'. Файлы не изменены.');
  screen=screen.replace(documentMatch,
    `const result = entry && (entryId !== 'ordinary-1' || initialReaderReady)
      ? buildCachedHoursDocument({entry, content, viewMode}) : null;`);
  // Memo must be invalidated when the initial mode arrives but is still CHURCH.
  const memoStart=screen.indexOf('const documentData = useMemo(');
  const memoEnd=screen.indexOf('  const readerBackground =',memoStart);
  if(memoStart<0||memoEnd<0)throw Error('Не удалось найти участок useMemo; файлы не изменены.');
  let memo=screen.slice(memoStart,memoEnd);
  const deps=/\}\s*,\s*\[\s*entry\s*,\s*content\s*,\s*viewMode\s*\]\s*\)\s*;/g;
  if([...memo.matchAll(deps)].length!==1)throw Error('Зависимости useMemo отличаются; файлы не изменены.');
  memo=memo.replace(deps,'}, [entry, content, viewMode, initialReaderReady]);');
  screen=screen.slice(0,memoStart)+memo+screen.slice(memoEnd);
  // Optimize Hours mark collection while preserving *identical* text and
  // UTF-16 indexes. All other reader engines are untouched.
  const begin=marks.indexOf('const mappedText = (value) => {');
  const finish=marks.indexOf('\nexport const collectHoursTextMarks =',begin);
  if(begin<0||finish<0||marks.indexOf('const mappedText = (value) => {',begin+1)>=0)
    throw Error('Участок hoursTypography.js отличается; файлы не изменены.');
  const originalMarksBody=marks;
  const fastMapper=`// HOURS_FAST_MARK_MAPPER_20261116
  // Normalization of each ordinary letter is unnecessary, especially on
  // Android Hermes. Fallback and bounded cache handle Church Slavonic
  // combining signs. All output offsets remain original UTF-16 positions.
  const mappedTextCache = new Map();
  const mappedText = (value) => {
    const original = String(value || '');
    const parts = [];
    const offsets = [];
    const combining = /[\\u0300-\\u036f\\u0483-\\u0489]/u;
    const removed = /[\\u0300\\u0301\\u0340\\u0341\\u0483-\\u0489]/u;
    for (let i = 0; i < original.length;) {
      const start = i;
      const cp = original.codePointAt(i);
      const base = String.fromCodePoint(cp);
      i += base.length;
      let cluster = base;
      let retained = false;
      while (i < original.length && combining.test(original[i])) {
        const mark = original[i++];
        cluster += mark;
        if (!removed.test(mark)) retained = true;
      }
      const simple = !retained && (cp <= 0x7f ||
        (cp >= 0x410 && cp <= 0x44f) || cp === 0x401 || cp === 0x451);
      let clean;
      if (simple) {
        clean = base;
      } else {
        clean = mappedTextCache.get(cluster);
        if (clean === undefined) {
          clean = removeStress(cluster);
          if (mappedTextCache.size >= 512) mappedTextCache.clear();
          mappedTextCache.set(cluster, clean);
        }
      }
      if (clean.length) {
        parts.push(clean);
        for (let j = 0; j < clean.length; j++) offsets.push(start);
      }
    }
    return {normalized: parts.join(''), offsets};
  };`;
  marks=marks.slice(0,begin)+fastMapper+marks.slice(finish);
  // Validate real offline samples with both old and new algorithms prior to
  // touching any source files. No apostrophe/diacritic or selection offset changes.
  const compile=(source)=>{
    const context={};
    const code=source.replace(/^export\s+/gm,'')+
      '\nthis.__collect = collectHoursTextMarks;';
    vm.runInNewContext(code,context,{timeout:15000});
    return context.__collect;
  };
  const oldCollect=compile(originalMarksBody);
  const newCollect=compile(marks);
  const samples=[
    'Глаго́лы моѧ̀ внꙋши, гдⷭ҇и', 'Слава, и ныне: Господи, помилуй (Трижды.)',
    'Йё й̆ и҆ ҃ ́ \r\n🌺', 'Иерей: Отче наш. Хор: Аминь.',
  ];
  for(const p of ['src/data/hoursFirstHourTraditional.json',
    'src/data/hoursFirstHourRussian.json','src/data/hoursThirdHourEditorial.json',
    'src/data/hoursTexts.json']){
    const filename=path.join(root,p);
    if(!fs.existsSync(filename))continue;
    try{
      const data=JSON.parse(fs.readFileSync(filename,'utf8'));
      const sections=[...(data.sections||[]),...(data.psalms||[]),
        ...(data.afterPsalms||[]),...(data.entries?.['ordinary-1']?.sections||[]),
        ...(data.entries?.['ordinary-3']?.sections||[])];
      for(const section of sections)for(const row of section.rows||[]){
        for(const field of ['church','russian','traditional'])
          if(typeof row[field]==='string')samples.push(row[field]);
      }
    }catch(error){throw Error('Ошибка проверки текстов '+p+': '+error.message)}
  }
  let checked=0;
  for(const text of samples){
    const previous=JSON.stringify(oldCollect(text));
    const current=JSON.stringify(newCollect(text));
    if(previous!==current)throw Error(
      'Найдено расхождение диапазонов выделения в тексте: '+
       text.slice(0,65)+'. Никакие файлы не изменены.'
    );
    checked++;
  }
  const changes=[
    {file:locations.screen,before:originals.screen,after:screen.replace(/\n/g,eols.screen)},
    {file:locations.marks,before:originals.marks,after:marks.replace(/\n/g,eols.marks)},
  ];
  const suffix='.backup-hours-first-open-'+new Date().toISOString().replace(/[:.]/g,'-');
  const written=[];
  try{
    for(const item of changes)fs.writeFileSync(item.file+suffix,item.before,'utf8');
    for(const item of changes){fs.writeFileSync(item.file,item.after,'utf8');written.push(item)}
  }catch(error){
    for(const item of written)try{fs.writeFileSync(item.file,item.before,'utf8')}catch(_){}
    throw error;
  }
  console.log('OK: ускорение первого входа применено к '+written.length+' файлам.');
  console.log('Проверено '+checked+' текстов: диапазоны выделений полностью совпадают.');
  console.log('Начальная ненужная сборка ЦС пропускается до определения языка.');
  console.log('Результаты сборки четырёх режимов кэшируются до изменения исходных данных.');
  console.log('Посимвольная обработка текста для Часов оптимизирована.');
  console.log('Резервные копии: '+suffix);
})();
