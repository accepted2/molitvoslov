/**
 * The complete Church Slavonic Traditional Communion text supplied 2026-11-21.
 * The original Church/Russian/parallel source is never overwritten.
 */
import traditionalSource from '../data/communionTraditionalSource.json';

const COMMUNION_SLUG = 'posledovanie-ko-svyatomu-prichashcheniyu';
const TRADITIONAL_BASE = 6121000;
const NOTE_BASE = 6122000;
export const COMMUNION_TRADITIONAL_NAME = 'Послѣ́дованїе ко ст҃о́мꙋ причаще́нїю';
const TITLES = Object.freeze({
  'Начальные молитвы':'Нача́льныѧ мл҃твы',
  'Псалом 22':'Ѱало́мъ 22', 'Псалом 23':'Ѱало́мъ 23',
  'Псалом 115':'Ѱало́мъ 115', 'Псалом 50':'Ѱало́мъ 50',
  'Тропари, глас 8-й':'Тропа́ри, гла́съ 8-й',
  'Канон, глас 2':'Кано́нъ, гла́съ 2',
  'Молитвы прежде Причастия':'Мл҃твы пре́жде причаще́нїѧ',
  'Молитва 1-я, свт. Василия Великого':'Мл҃тва 1-я, ст҃и́телѧ Васи́лїѧ Вели́кагѡ',
  'Молитва 2-я, свт. Иоанна Златоустого':'Мл҃тва 2-я, ст҃и́телѧ І҆ѡа́нна Златоꙋ́ста',
  'Молитва 3-я, прп. Симеона Метафраста':'Мл҃тва 3-я, преподо́бнагѡ Сѷмеѡ́на Метафра́ста',
  'Молитва 4-я, прп. Иоанна Дамаскина':'Мл҃тва 4-я, преподо́бнагѡ І҆ѡа́нна Дамаски́на',
  'Молитва 5-я, свт. Василия Великого':'Мл҃тва 5-я, ст҃и́телѧ Васи́лїѧ Вели́кагѡ',
  'Молитва 6-я, прп. Симеона Нового Богослова':'Мл҃тва 6-я, преподо́бнагѡ Сѷмеѡ́на Но́вагѡ Бг҃осло́ва',
  'Молитва 7-я, свт. Иоанна Златоустого':'Мл҃тва 7-я, ст҃и́телѧ І҆ѡа́нна Златоꙋ́ста',
  'Молитва 8-я, свт. Иоанна Златоустого':'Мл҃тва 8-я, ст҃и́телѧ І҆ѡа́нна Златоꙋ́ста',
  'Молитва 9-я, свт. Иоанна Златоустого':'Мл҃тва 9-я, ст҃и́телѧ І҆ѡа́нна Златоꙋ́ста',
  'Молитва 10-я, прп. Иоанна Дамаскина':'Мл҃тва 10-я, преподо́бнагѡ І҆ѡа́нна Дамаски́на',
  'Молитва 11-я, свт. Иоанна Златоустого':'Мл҃тва 11-я, ст҃и́телѧ І҆ѡа́нна Златоꙋ́ста',
});
// Church Slavonic numeral letters with titlo: use only in this edition.
const NUMERALS=Object.freeze({
  1:'а҃',2:'в҃',3:'г҃',4:'д҃',5:'є҃',6:'ѕ҃',7:'з҃',8:'и҃',9:'ѳ҃',
  10:'і҃',11:'а҃і',12:'в҃і',22:'к҃в',23:'к҃г',40:'м҃',50:'н҃',115:'рє҃і',
});
const csNumber = value => {
  const result=NUMERALS[Number(value)];
  if(!result)throw Error('Unsupported Communion numeral '+value);
  return result;
};
const traditionalTitle = title => {
  const ode=/^Песнь ([1-9])$/u.exec(title);
  if(ode)return 'Пѣ́снь '+csNumber(ode[1]);
  if(!TITLES[title])throw Error('Untranslated traditional heading: '+title);
  return TITLES[title].replace(/(\d+)(?:-[яй])?/gu,(_,num)=>csNumber(num));
};
// The user's bold labels are metadata, not literal text prefixes.
const formatTraditionalBlock = (block, groupTitle, blockIndex) => {
  let body=String(block?.text||'').trim();
  if(!body)throw Error('Empty traditional Communion text: '+groupTitle);
  let note='';
  if(groupTitle==='Начальные молитвы' && blockIndex===0)
    body=body.replace(/^Моли́твами/u,'Мл҃твами');
  body=body.replace(/\(\s*(12|40)\s+ра́зъ\s*\)/gu,(_,num)=>'('+csNumber(num)+' ра́зъ)');
  if(groupTitle==='Песнь 9' && blockIndex===9){
    const i=body.indexOf('\n');
    if(i<0)throw Error('Ninth ode penitential rubric not found');
    note='Тропа́рь пра́здника. А҆́ще же нѣ́сть пра́здника — тропарѝ покаѧ́нныѧ.';
    body=body.slice(i+1).trim();
  }
  if(groupTitle==='Песнь 9' && [15,16].includes(blockIndex)){
    const i=body.indexOf('\n');
    if(i>=0){
      note=blockIndex===16?'И҆́ныѧ стїхѝ':'И҆ стїхѝ сїѧ̀';
      body=body.slice(i+1).trim();
    }
  }
  return {body,note};
};

const isTargetRule = rule =>
  rule?.slug === COMMUNION_SLUG &&
  traditionalSource?.document === COMMUNION_SLUG &&
  traditionalSource?.version === 1;

let cachedItems = null;

export const hasCommunionTraditionalEdition = rule => isTargetRule(rule);

const buildTraditionalItems = () => {
  if(cachedItems)return cachedItems;
  const groups=traditionalSource?.groups;
  if(!Array.isArray(groups)||groups.length!==27)
    throw Error('Traditional Communion: expected 27 sections');
  const items=[];
  let sourceOffset=0, count=0, notes=0;
  for(let groupIndex=0;groupIndex<groups.length;groupIndex++){
    const group=groups[groupIndex];
    if(!group?.title||!Array.isArray(group.blocks))throw Error('Incomplete Communion group');
    const headingId=TRADITIONAL_BASE+sourceOffset++;
    const title=traditionalTitle(group.title);
    items.push({id:headingId,item_type:'section',title,traditional_title:title,
      content:'',communionTraditionalHeading:true});
    for(let k=0;k<group.blocks.length;k++){
      const block=group.blocks[k],id=TRADITIONAL_BASE+sourceOffset++;
      const {body,note}=formatTraditionalBlock(block,group.title,k);
      const rubric=String(block.rubric||'').replace(/:$/,'').trim();
      if(note){
        items.push({id:NOTE_BASE+groupIndex*100+k,item_type:'instruction',
          content:note,communionTraditionalNote:true});
        notes++;
      }
      const tropar=(group.title==='Тропари, глас 8-й')||
        (group.title==='Песнь 9'&&k>=9&&k<=13);
      items.push({id,item_type:'text',communionTraditionalText:true,
        communionTraditionalTroparionSet:tropar,
        communionTraditionalDoxology:rubric==='Слава'||rubric==='И ныне',
        communionTraditionalRefrain:rubric==='Припев',
        communionTraditionalInitialSmall:tropar,
        communionTraditionalRubric:rubric,
        text:{id,title:'',content:body,traditional_content:body,translation:'',description:''}});
      count++;
    }
  }
  if(count!==108||sourceOffset!==135||notes!==3||items.length!==138||
     new Set(items.map(item=>item.id)).size!==items.length)
    throw Error('Incomplete traditional Communion document');
  cachedItems=items;
  return items;
};

export const completeCommunionTraditionalRule = (rule, viewMode) => {
  if (viewMode !== 'traditional' || !isTargetRule(rule)) return rule;
  return {
    ...rule,
    traditional_name: COMMUNION_TRADITIONAL_NAME,
    items: buildTraditionalItems(),
    communionTraditionalEdition: true,
  };
};

/** Source-aligned UTF-16 ranges for brown, bold parenthesized bow/count notes. */
export const getCommunionTraditionalCountRanges = source => {
  const result=[];
  for(const hit of String(source||'').matchAll(/\([^)]{1,80}\)/gu)){
    const v=hit[0].slice(1,-1).normalize('NFD').replace(/\p{M}/gu,'')
      .toLowerCase().trim();
    if(/^(?:12|40|ві|м)\s+раз[ъь]?$/u.test(v) ||
       /^трижды(?:\s*,.*)?$/u.test(v) ||
       /^поклон[ъь]?$/u.test(v)){
      result.push({start:hit.index,end:hit.index+hit[0].length,kind:'note'});
    }
  }
  return result;
};
