// Safe, targeted offline translation import for the Guardian Angel canon.
// 65 RU sections + 64 complete traditional; last traditional prayer is truncated and NEVER imported.
const fs = require('fs');
const path = require('path');

const TAG = 'GUARDIAN_ANGEL_CANON_OFFLINE_20261117';
const root = path.resolve(__dirname, '..');
const ruPath = path.resolve(root, '../molitvoslov-backend/api/data/canon_angelu_khranitelyu_ru_20261117.txt');
const csPath = path.resolve(root, '../molitvoslov-backend/api/data/canon_angelu_khranitelyu_trad_20261117_PARTIAL.txt');
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
    .replace(/҃/g,'').replace(/ѣ/g,'е').replace(/і/g,'и')
    .replace(/ѡ/g,'о').replace(/ѻ/g,'о').replace(/ꙋ/g,'у')
    .replace(/ѳ/g,'ф').replace(/ѵ/g,'и').trim();
}
function kind(label) {
  const k = normalize(label).replace(/[\s,.:;\-]+/g,'');
  for (const [prefix,name] of [
    ['славаи','glory_now'],['слава','glory'],['иныне','now'],
    ['ирмос','irmos'],['припев','refrain'],['тропар','troparion'],
    ['богородичен','theotokion'],['бгородичен','theotokion'],
    ['седален','sedalen'],['кондак','kontakion'],['икос','ikos'],
    ['молитв','prayer'],['млтва','prayer'],['иису','jesus'],
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
        ? ({2:1,3:3,5:4,6:5,7:6,10:7,11:8,12:9}[group]||null)
        : null;
      if ((group===2||group===3||group===5||group===6||
           group===7||group===10||group===11||group===12) && ode==null)
        throw Error('Не определена песнь в строке '+(i+1));
      if ((group!==2&&group!==3&&group!==5&&group!==6&&
           group!==7&&group!==10&&group!==11&&group!==12) && ode!=null)
        throw Error('Неожиданная песнь в строке '+(i+1));
      return;
    }
    const match=line.match(/^(?:\[([^\]]+)\]|\*\*([^*]+):\*\*)\s+(.+)$/u);
    if(!match || group<0)throw Error('Неверная строка '+(i+1));
    entries.push({group,kind:kind(match[1]||match[2]),ode,text:match[3].trim(),line:i+1});
  });
  if(group!==13)throw Error('Ожидалось 14 разделов канона, получено '+(group+1));
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
  if(entry.ode!=null&&Number(section.ode_number)!==entry.ode)return false;
  if(entry.kind==='glory_now')return ['glory','now','other'].includes(typ);
  if(entry.kind==='jesus'){
    if(![1,9].includes(entry.ode)||
       !['refrain','other','troparion'].includes(typ))return false;
    const t=normalize(section.text?.content||'');
    const label=normalize(section.heading||'');
    return t.includes('иису')||label.includes('иису')||
      (t.slice(0,20).includes('гд')&&t.slice(0,45).includes('хр'));
  }
  if(entry.kind==='theotokion')
    return ['theotokion','troparion'].includes(typ);
  return typ===entry.kind;
}

function main(){
  for(const p of [ruPath,csPath,offlinePath])
    if(!fs.existsSync(p))throw Error('Файл не найден: '+p);
  const ruOriginal=parse(fs.readFileSync(ruPath,'utf8'),false);
  const csOriginal=parse(fs.readFileSync(csPath,'utf8'),true);
  if(ruOriginal.length!==81||csOriginal.length!==81)
    throw Error('Требуется 81 фрагмент в RU и ЦС-трад: RU '+
      ruOriginal.length+', ЦС '+csOriginal.length);
  for(let i=0;i<csOriginal.length;i++){
    const ru=ruOriginal[i],cs=csOriginal[i];
    if(ru.kind!==cs.kind||ru.group!==cs.group||ru.ode!==cs.ode)
      throw Error('Сдвиг версий на позиции '+(i+1));
  }
  if(ruOriginal.at(-1).kind!=='prayer'||
    !ruOriginal.at(-1).text.endsWith('Аминь.'))
    throw Error('Русская заключительная молитва не полная.');
  if(csOriginal.at(-1).kind!=='prayer'||
    !csOriginal.at(-1).text.endsWith('Кото́рыма ѻ҆чи́ма, а'))
    throw Error('ЦС-трад источник изменился или завершён иначе. Не импортировать.');
  const russian=joinGlory(ruOriginal);
  const church=joinGlory(csOriginal.slice(0,-1));
  if(russian.length!==65||church.length!==64)
    throw Error('Неверная структура: RU='+russian.length+'/65, ЦС='+church.length+'/64');
  if(traditionalOnly&&!allowPartialCs)
    throw Error('ЦС-трад не полный: разреши только 64 фрагмента через --allow-partial-csl.');
  for(let i=0;i<church.length;i++)
    if(russian[i].kind!==church[i].kind||
      russian[i].group!==church[i].group||
      russian[i].ode!==church[i].ode)
      throw Error('Смещение после объединения на позиции '+(i+1));

  const raw=fs.readFileSync(offlinePath,'utf8'), data=JSON.parse(raw);
  const candidates=Object.values(data.canons?.by_slug||{}).filter(item=>
    /ангел/iu.test(item.title||'')&&/хранител/iu.test(item.title||''));
  const canon=slug ? data.canons?.by_slug?.[slug] :
    candidates.length===1 ? candidates[0] : null;
  if(!canon||!/ангел/iu.test(canon.title||'')||
    !/хранител/iu.test(canon.title||''))
    throw Error('Укажите точный --slug=... для канона Ангелу Хранителю. Кандидаты: '+
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
    if(traditionalOnly&&i>=church.length)return;
    edits.set(index,traditionalOnly?{}:{translation:russian[i].text});
    if((traditionalOnly||allowPartialCs)&&i<church.length)
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
    '| ЦС-трад завершено:',church.length+'/65',
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
  const backup=path.join(reports,'offline-before-guardian-angel-import-'+
    new Date().toISOString().replace(/[:.]/g,'-')+'.json');
  fs.copyFileSync(offlinePath,backup);
  fs.writeFileSync(offlinePath,patched,'utf8');
  console.log(traditionalOnly
    ? 'ГОТОВО: 64 полных секции ЦС-трад записаны; основной ЦС и RU не менялись.'
    : 'ГОТОВО: русский перевод 65/65 записан'+
      (allowPartialCs?' и 64 секции ЦС-трад также обработаны':'')+'.');
  console.log('Резервная копия:',backup);
}
try{main();}catch(error){console.error('ERROR:',error.message);process.exitCode=1;}
