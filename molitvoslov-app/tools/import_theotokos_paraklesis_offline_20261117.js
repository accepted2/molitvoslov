// Safe, targeted offline translation import for the Theotokos Paraklesis canon.
// Source files: complete RU + complete CS traditional (77/77). Never change Text.content.
const fs = require('fs');
const path = require('path');

const TAG = 'THEOTOKOS_PARAKLESIS_OFFLINE_20261117';
const root = path.resolve(__dirname, '..');
const ruPath = path.resolve(root, '../molitvoslov-backend/api/data/canon_bogoroditse_prilezhno_ru_20261117.txt');
const csPath = path.resolve(root, '../molitvoslov-backend/api/data/canon_bogoroditse_prilezhno_csl_20261117.txt');
const offlinePath = path.resolve(root, 'src/data/offlineContent.json');
const slug = process.argv.find(s => s.startsWith('--slug='))?.slice('--slug='.length);
const apply = process.argv.includes('--apply');
const allowPartialCs = process.argv.includes('--allow-partial-csl');
const traditionalOnly = process.argv.includes('--traditional-only');
const replaceExisting = process.argv.includes('--replace-existing');

function normalize(input) {
  return [...String(input || '').normalize('NFD')]
    .filter(ch => !/[\u0300-\u036f\u0483-\u0487]/u.test(ch))
    .join('').toLowerCase()
    .replace(/҃/g,'').replace(/ѣ/g,'е').replace(/і/g,'и').replace(/ѵ/g,'и').trim();
}
function kind(label) {
  const k = normalize(label).replace(/[\s,.:;\-]+/g,'');
  for (const [prefix,name] of [
    ['славаи','glory_now'],['слава','glory'],['иныне','now'],['иные','now'],
    ['ирмос','irmos'],['припев','refrain'],['тропар','troparion'],
    ['богородичен','theotokion'],['бгородичен','theotokion'],
    ['кондак','kontakion'],['стихир','stichira'],
    ['псалом','psalm'],['ѱалом','psalm'],['молитв','prayer'],['млтва','prayer'],
  ]) if (k.startsWith(prefix)) return name;
  throw Error('Неизвестная рубрика: '+label);
}
function parse(raw, traditional) {
  const entries=[];
  let group=-1, heading='', ode=null;
  raw.replace(/^\uFEFF/,'').split(/\r?\n/).forEach((part,i)=>{
    const line=part.trim();
    if (!line || (line.startsWith('# ') && !line.startsWith('## '))) return;
    if(line.startsWith('## ') || line.startsWith('### ')){
      heading=line.slice(line.startsWith('### ')?4:3).trim();
      group++;
      const m = !traditional ? heading.match(/^Песнь\s+([1-9])$/iu) : null;
      ode=m ? Number(m[1]) : traditional && heading.startsWith('Пѣ́снь')
        ? ({3:1,4:3,5:4,6:5,7:6,9:7,10:8,11:9}[group]||null)
        : null;
      return;
    }
    const match=line.match(/^(?:\[([^\]]+)\]|\*\*([^*]+):\*\*)\s+(.+)$/u);
    if(!match || group<0)throw Error('Неверная строка '+(i+1));
    entries.push({group,kind:kind(match[1]||match[2]),ode,text:match[3].trim(),line:i+1});
  });
  return entries;
}
function joinGlory(items){
  const joined=[];
  for(let i=0;i<items.length;i++){
    const e=items[i];
    if(e.ode && (e.kind==='glory'||e.kind==='now')){
      const following=items[i+1];
      if(!following||following.kind!=='troparion'||following.group!==e.group)
        throw Error('Нет тропаря после '+e.kind+' в строке '+e.line);
      joined.push({...e,text:e.text+' '+following.text});
      i++;
    }else joined.push(e);
  }
  return joined;
}
function findClose(s,start,open,close){
  let count=0,quoted=false,escaped=false;
  for(let i=start;i<s.length;i++){
    let c=s[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(c==='\\')escaped=true;
      else if(c==='"')quoted=false;
      continue;
    }
    if(c==='"'){quoted=true;continue;}
    if(c===open)count++;
    if(c===close){count--;if(!count)return i;}
  }
  throw Error('Не закрыт JSON-блок');
}
function compatible(section,entry){
  const typ=section.section_type;
  const typeOk=typ===entry.kind ||
    ['psalm','stichira'].includes(entry.kind)&&typ==='other' ||
    entry.kind==='glory_now'&&['glory','now','other'].includes(typ);
  if(typeOk&&(entry.ode==null||Number(section.ode_number)===entry.ode))
    return true;
  // Precisely the two historical exceptions of the Theotokos canon,
  // validated by group, position, rubric and the existing CS text.
  const heading=normalize(section.heading||'');
  const church=normalize(section.text?.content||'');
  if(entry.group===0&&entry.kind==='prayer'&&entry.ode==null&&
    typ==='troparion'&&section.ode_number==null&&
    Number(section.order)===1&&heading.includes('богород')&&
    heading.includes('глас')&&heading.includes('4')&&
    church.startsWith('к богородице прилежно'))
    return true;
  if(entry.group===4&&entry.kind==='troparion'&&entry.ode===3&&
    typ==='troparion'&&section.ode_number==null&&
    Number(section.order)===22&&heading.startsWith('тропар')&&
    heading.includes('глас')&&heading.includes('2')&&
    church.startsWith('моление теплое'))
    return true;
  return false;
}

function main(){
  for(const p of [ruPath,csPath,offlinePath])
    if(!fs.existsSync(p))throw Error('Файл не найден: '+p);
  const ruOriginal=parse(fs.readFileSync(ruPath,'utf8'),false);
  const csOriginal=parse(fs.readFileSync(csPath,'utf8'),true);
  if(ruOriginal.length!==93||csOriginal.length!==93)
    throw Error('Для полного импорта требуются 93 фрагмента в RU и ЦС-трад: RU '+
      ruOriginal.length+', ЦС '+csOriginal.length);
  for(let i=0;i<csOriginal.length;i++){
    const ru=ruOriginal[i],cs=csOriginal[i];
    if(ru.kind!==cs.kind||ru.group!==cs.group||ru.ode!==cs.ode)
      throw Error('Сдвиг версий на позиции '+(i+1));
  }
  if(csOriginal.at(-1).kind!=='prayer'||
    !csOriginal.at(-1).text.endsWith('Гдⷭ҇ь съ Тобо́ю.'))
    throw Error('Заключительная молитва ЦС-трад отсутствует или обрывается.');
  const russian=joinGlory(ruOriginal);
  const church=joinGlory(csOriginal);
  if(russian.length!==77||church.length!==77)
    throw Error('Неверное объединение Слава/И ныне: '+russian.length+'/'+church.length);
  for(let i=0;i<church.length;i++)
    if(russian[i].kind!==church[i].kind||
      russian[i].group!==church[i].group||
      russian[i].ode!==church[i].ode)
      throw Error('Смещение после объединения на позиции '+(i+1));

  const raw=fs.readFileSync(offlinePath,'utf8'), data=JSON.parse(raw);
  const candidates=Object.values(data.canons?.by_slug||{}).filter(item=>
    /богород/iu.test(item.title||''));
  const canon=slug ? data.canons?.by_slug?.[slug] :
    candidates.length===1 ? candidates[0] : null;
  if(!canon||!/богород/iu.test(canon.title||''))
    throw Error('Укажите точный --slug=... для канона Феостирикта. Кандидаты: '+
      JSON.stringify(candidates.map(x=>({slug:x.slug,title:x.title}))));
  const primary=Math.min(...(canon.sections||[]).map(x=>Number(x.variant||1)));
  const sourceSections=canon.sections.filter(s=>Number(s.variant||1)===primary)
    .sort((a,b)=>Number(a.order)-Number(b.order));
  // Preserve empty "other" sections used only as visual headings.
  const sections=sourceSections.filter(s=>!(
    s.section_type==='other' &&
    !!String(s.heading||'').trim() &&
    !String(s.text?.content||'').trim()
  ));
  const problems=[];
  if(sections.length!==russian.length)
    problems.push('Django/офлайн секций '+sections.length+', русских '+russian.length);
  for(let i=0;i<Math.min(sections.length,russian.length);i++){
    if(!compatible(sections[i],russian[i])){
      const a=sections[i],e=russian[i];
      problems.push('#'+(i+1)+': '+e.kind+'/'+e.ode+
        ' != '+a.section_type+'/'+a.ode_number+' '+String(a.text?.content||'').slice(0,35));
    }
  }
  if(problems.length)
    throw Error('Нельзя безопасно сопоставить секции:\n'+problems.slice(0,35).join('\n'));
  if(new Set(sections.map(s=>s.text?.id)).size!==sections.length)
    throw Error('Некоторые секции используют один и тот же текст.');

  const edits=new Map();
  sections.forEach((section,i)=>{
    const index=canon.sections.findIndex(s=>String(s.id)===String(section.id));
    if(index<0)throw Error('ID секции не найден');
    edits.set(index,traditionalOnly?{}:{translation:russian[i].text});
    if(traditionalOnly||allowPartialCs)
      edits.get(index).traditional_content=church[i].text;
  });
  const conflicts=[];
  let modified=0;
  for(const [index,values] of edits){
    const section=canon.sections[index];
    for(const [field,val] of Object.entries(values)){
      const before=String(section.text?.[field]||'');
      if(before&&before!==val)conflicts.push(index+1+':'+field);
      if(before!==val)modified++;
    }
  }
  console.log(TAG,'Канон:',canon.title,'| slug=',canon.slug,
    '| режим:',traditionalOnly?'только ЦС-трад':'RU + опционально ЦС-трад');
  console.log('Сопоставлено:',sections.length+'/'+russian.length,
    '| заголовков без текста:',sourceSections.length-sections.length,
    '| ЦС-трад полный:',church.length+'/77',
    '| изменений:',modified,'| конфликтов:',conflicts.length);
  if(conflicts.length&&!replaceExisting)
    throw Error('Существующие переводы отличаются: '+conflicts.slice(0,20).join(', ')+
      '. Проверьте перед --replace-existing.');
  if(!apply){console.log('ПРОВЕРКА: офлайн-файл не изменён.');return;}

  const start=raw.indexOf('"canons"'),bySlug=raw.indexOf('"by_slug"',start);
  if(start<0||bySlug<0)throw Error('Не найден canons.by_slug');
  const key=JSON.stringify(canon.slug);
  const keyAt=raw.indexOf(key,bySlug);
  if(keyAt<0)throw Error('Ключ канона не найден в JSON');
  const colon=raw.indexOf(':',keyAt+key.length);
  const open=raw.indexOf('{',colon);
  const end=findClose(raw,open,'{','}');
  const chunk=raw.slice(open,end+1);
  if(JSON.parse(chunk).slug!==canon.slug)throw Error('Неверный блок канона');
  const sectionKey=chunk.indexOf('"sections"');
  const arrStart=chunk.indexOf('[',sectionKey),arrEnd=findClose(chunk,arrStart,'[',']');
  if(sectionKey<0||arrStart<0)throw Error('Секции не найдены');
  const sectionJson=chunk.slice(arrStart,arrEnd+1);
  const regex=/("(translation|traditional_content)"\s*:\s*)("(?:\\.|[^"\\])*")/g;
  const positions=[...sectionJson.matchAll(regex)];
  const perField={translation:0,traditional_content:0};
  positions.forEach(x=>perField[x[2]]++);
  for(const name of ['translation','traditional_content'])
    if(perField[name]!==canon.sections.length)
      throw Error('Неожиданное количество полей '+name+': '+perField[name]);
  const indices={translation:-1,traditional_content:-1};
  const changedSections=sectionJson.replace(regex,(full,prefix,field)=>{
    const index=++indices[field],value=edits.get(index)?.[field];
    return value===undefined ? full : prefix+JSON.stringify(value);
  });
  const patched=raw.slice(0,open+arrStart)+changedSections+
    raw.slice(open+arrEnd+1);
  const updated=JSON.parse(patched).canons.by_slug[canon.slug];
  for(const [index,fields] of edits){
    const section=updated.sections[index];
    for(const [field,value] of Object.entries(fields))
      if(section.text[field]!==value)
        throw Error('После записи потерян фрагмент '+(index+1)+':'+field);
  }
  if(modified===0){console.log('Все строки уже заполнены.');return;}
  const reports=path.resolve(root,'reports');
  fs.mkdirSync(reports,{recursive:true});
  const backup=path.join(reports,'offline-before-theotokos-import-'+
    new Date().toISOString().replace(/[:.]/g,'-')+'.json');
  fs.copyFileSync(offlinePath,backup);
  fs.writeFileSync(offlinePath,patched,'utf8');
  console.log(traditionalOnly
    ? 'ГОТОВО: ЦС-трад обновлён (77/77), русский и основной ЦС не изменены.'
    : 'ГОТОВО: русский перевод обновлён'+
      (allowPartialCs?' и ЦС-трад полностью обновлён (77/77)':'')+'.');
  console.log('Резервная копия:',backup);
}
try{main();}catch(error){console.error('ERROR:',error.message);process.exitCode=1;}
