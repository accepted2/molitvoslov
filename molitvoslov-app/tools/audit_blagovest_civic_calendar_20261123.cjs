#!/usr/bin/env node
'use strict';
/*
 * Audit the ACTUAL local packaged calendar (2025-2027), not the old GitHub JSON.
 * - Blagovest is authoritative; old numeric/source records are not preferred.
 * - Gather one remediation task per canonical UID and hymn field, not per year.
 * - Do not guess transliterations or delete Church Slavonic hymns.
 * - Read-only against the calendar JSON. Writes only an audit under reports/.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const filesRoot=path.join(root,'src/data/calendar');
const reports=path.join(root,'reports');
const out=path.join(reports,'blagovest-civic-audit-20261123.json');
const months=[];
const LANGUAGES=['ru','uk'];
const HYMN_FIELDS=['troparion_title','troparion_content','kontakion_title','kontakion_content'];
const sha256=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const utf=s=>typeof s==='string'?s:'';
const normalizeTitle=s=>utf(s).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^а-яёіїєґ0-9]+/giu,' ').trim();
const isNew=card=>{
  if(!card||typeof card!=='object')return false;
  const id=[card.sync_uid,card.id,card.source_uid,card.card_uid].filter(v=>v!==undefined&&v!==null).join(' ');
  return /(?:^|[^a-z])(?:uoc-)?blv[-_:]/i.test(id);
};
const idOf=card=>String(card?.sync_uid||card?.card_uid||card?.source_uid||card?.id||card?.source_id||'');
const excerpt=s=>utf(s).replace(/\s+/g,' ').slice(0,155);
// Detect high-confidence UCS-8 / legacy font encoding: do not run this on whole articles.
const looksLegacyUcs=s=>{
  const v=utf(s);
  if(!v)return false;
  return /[а-яёіїєѣѡѳѵꙋ][0-9][A-Za-zа-яёіїєѣѡѳѵꙋ]/iu.test(v) ||
    /[A-Za-zа-яёіїєѣѡѳѵꙋ][0-9][а-яёіїєѣѡѳѵꙋ]/iu.test(v) ||
    /[џћњѓѕґ][A-Za-zа-яёіїє0-9]{2,}/iu.test(v) ||
    /\b(?:Бжcтвен|слaва|тропaрь|кондaкъ|глaсъ|прпdб|д¦а|іи3|є3г|д7)\b/iu.test(v);
};
const result={
  generated_at:new Date().toISOString(),
  source:'local bundled calendar JSON; no remote cache',
  policy:'Blagovest cards only; never automatically convert unsafe UCS-8 strings',
  months:[],summary:{months:0,days:0,days_without_new:0,day_locales:0,
    legacy_appearances:0,new_appearances:0,duplicate_new_appearances:0,
    unique_new_cards:0,legacy_hymn_fields:0,invalid_months:0},
  coverage_gaps:[],legacy_collisions:[],unsafe_hymns:[],
  duplicate_new_cards:[],canonical_hymn_variants:[]
};
const hymnKeys=new Map(),uniqueCards=new Set(),variantKeys=new Map();
for(let year=2025;year<=2027;year++){
  for(let month=1;month<=12;month++){
    const key=year+'-'+String(month).padStart(2,'0');
    const file=path.join(filesRoot,key+'.json');
    if(!fs.existsSync(file)){result.summary.invalid_months++;result.months.push({month:key,error:'file missing'});continue}
    const payload=JSON.parse(fs.readFileSync(file,'utf8'));
    if(payload.year!==year||payload.month!==month||!payload.days || typeof payload.days!=='object'){
      result.summary.invalid_months++;result.months.push({month:key,error:'invalid structure/year/month'});continue;
    }
    let days=0,legacy=0,blv=0,gaps=0;
    for(const [date,langs] of Object.entries(payload.days)){
      result.summary.days++;
      days++;
      for(const lang of LANGUAGES){
        const day=langs?.[lang];
        if(!day){result.coverage_gaps.push({date,lang,reason:'language not bundled'});result.summary.days_without_new++;gaps++;continue}
        result.summary.day_locales++;
        const cards=[day.main_feast,...(Array.isArray(day.all_feasts)?day.all_feasts:[])].filter(Boolean);
        const sourceCards=[],oldCards=[],seen=new Set();
        for(const card of cards){
          const id=idOf(card);
          if(seen.has(id))continue;
          seen.add(id);
          if(isNew(card))sourceCards.push(card);else oldCards.push(card);
        }
        blv+=sourceCards.length;legacy+=oldCards.length;
        result.summary.legacy_appearances+=oldCards.length;
        result.summary.new_appearances+=sourceCards.length;
        if(!sourceCards.length){
          result.summary.days_without_new++;gaps++;
          result.coverage_gaps.push({date,lang,reason:'no Blagovest card; legacy cannot be silently removed',
            old_titles:oldCards.slice(0,4).map(c=>utf(c.title).slice(0,100))});
        }
        if(sourceCards.length && oldCards.length){
          result.legacy_collisions.push({date,lang,
            new_cards:sourceCards.map(c=>({id:idOf(c),title:utf(c.title).slice(0,110)})),
            old_cards:oldCards.map(c=>({id:idOf(c),title:utf(c.title).slice(0,110)}))});
        }
        const titleMap=new Map();
        for(const card of sourceCards){
          const id=idOf(card);
          uniqueCards.add(id);
          const title=normalizeTitle(card.title||card.title_uk||card.short_title);
          const exists=titleMap.get(title);
          if(title&&exists&&exists!==id){
            result.summary.duplicate_new_appearances++;
            result.duplicate_new_cards.push({date,lang,title,ids:[exists,id]});
          }
          if(title)titleMap.set(title,id);
          for(const base of HYMN_FIELDS){
            const localized=lang==='uk'&&card[base+'_uk']?base+'_uk':base;
            const value=utf(card[localized]);
            if(!value)continue;
            const exactKey=id+'|'+localized;
            const hash=sha256(value);
            const first=variantKeys.get(exactKey);
            if(first&&first.hash!==hash){
              result.canonical_hymn_variants.push({id,field:localized,first:first.date,second:date,
                first_sha:first.hash,second_sha:hash});
            } else if(!first)variantKeys.set(exactKey,{hash,date});
            if(!looksLegacyUcs(value))continue;
            const taskKey=id+'|'+localized+'|'+hash;
            if(hymnKeys.has(taskKey)){
              const item=hymnKeys.get(taskKey);
              if(!item.dates.includes(date))item.dates.push(date);
              continue;
            }
            const task={
              id,field:localized,lang,title:utf(card.title).slice(0,150),sha256:hash,
              characters:value.length,starts:excerpt(value),dates:[date],
              status:'requires verified UCS-to-civic conversion',
            };
            hymnKeys.set(taskKey,task);
          }
        }
      }
    }
    result.months.push({month:key,days,blagovest:blv,legacy,coverage_gaps:gaps});
  }
}
result.unsafe_hymns=[...hymnKeys.values()].sort((a,b)=>a.id.localeCompare(b.id));
result.summary.unique_new_cards=uniqueCards.size;
result.summary.legacy_hymn_fields=result.unsafe_hymns.length;
result.summary.months=result.months.filter(m=>!m.error).length;
fs.mkdirSync(reports,{recursive:true});
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n','utf8');
console.log('BLAGOVEST CIVIL CALENDAR AUDIT (READ-ONLY)');
console.log(JSON.stringify(result.summary,null,2));
console.log('Legacy/blagovest overlaps: '+result.legacy_collisions.length);
console.log('Separate new-source duplicate names: '+result.duplicate_new_cards.length);
console.log('Same UID inconsistent hymn variants: '+result.canonical_hymn_variants.length);
console.log('Full report: '+out);
console.log('No JSON/APK/DB files were changed.');
if(result.summary.invalid_months)process.exitCode=2;
