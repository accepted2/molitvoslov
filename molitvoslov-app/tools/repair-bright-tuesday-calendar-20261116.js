#!/usr/bin/env node
'use strict';

/*
 * Move three Azbyka-confirmed Bright Tuesday commemorations from inherited
 * 1 April (Julian) to Pascha+2. For 2025: 14 -> 22 April, 2027: 14 April -> 4 May.
 * 2026 is the reference year and is never modified.
 *
 * Read-only preflight:
 *   node tools/repair-bright-tuesday-calendar-20261116.js
 * Controlled repair:
 *   node tools/repair-bright-tuesday-calendar-20261116.js --apply
 * Restore exact original snapshots:
 *   node tools/repair-bright-tuesday-calendar-20261116.js --restore <backup-folder>
 *
 * Only four JSON snapshots are written, with SHA256-verified backups first.
 * No native builds, SQLite, Bible, icons, hagiographies, readings or fasting
 * rules are changed. Both raw and compacted calendar-month files are supported.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const codec=require('../src/services/calendarMonthCodec');
const IDS=[2729,2731,2734];
const BACKEND_IDS=[4192,4189,4190];
const PAIRS=[
  ['2025-04-14','2025-04-22'],
  ['2027-04-14','2027-05-04'],
];
const FILES=[
 'molitvoslov-app/src/data/calendar/2025-04.json',
 'molitvoslov-app/src/data/calendar/2027-04.json',
 'molitvoslov-app/src/data/calendar/2027-05.json',
 'molitvoslov-backend/calendar_2027.json',
];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assert=(cond,why)=>{if(!cond)throw Error('CALENDAR SAFETY: '+why);};
const same=(a,b)=>a.length===b.length &&
  [...a].sort((x,y)=>x-y).join(',')===[...b].sort((x,y)=>x-y).join(',');
const dateOldStyle=iso=>{
  const day=new Date(iso+'T00:00:00.000Z');
  day.setUTCDate(day.getUTCDate()-13);
  return {julian_month:day.getUTCMonth()+1,julian_day:day.getUTCDate()};
};
const monthPath=ym=>'molitvoslov-app/src/data/calendar/'+ym+'.json';
function moveDay(fromDay,toDay,origin,target){
  let changed=0;
  for(const lang of ['ru','uk']){
    const from=origin.days[fromDay]?.[lang],to=target.days[toDay]?.[lang];
    assert(from&&to,'missing day/language '+fromDay+'/'+toDay+'/'+lang);
    const source=from.all_feasts.filter(x=>IDS.includes(x.id));
    const destination=to.all_feasts.filter(x=>IDS.includes(x.id));
    const sourceIds=source.map(x=>x.id);
    const destinationIds=destination.map(x=>x.id);
    if(!source.length && same(destinationIds,IDS)){
      if(fromDay==='2027-04-14')
        assert(from.main_feast?.id===2733,'already repaired but wrong April 14 main');
      continue;
    }
    assert(same(sourceIds,IDS),'source missing/duplicate feast: '+fromDay+'/'+lang);
    assert(!destination.length,'destination already has feast: '+toDay+'/'+lang);
    const dateMeta=dateOldStyle(toDay);
    const moved=source.map(x=>Object.assign({},x,dateMeta,{easter_offset:2}));
    from.all_feasts=from.all_feasts.filter(x=>!IDS.includes(x.id));
    to.all_feasts.push(...moved);
    if(IDS.includes(from.main_feast?.id)){
      assert(fromDay==='2027-04-14','unexpected movable main '+fromDay);
      const mary=from.all_feasts.filter(x=>x.id===2733);
      assert(mary.length===1,'missing unique St Mary of Egypt for '+lang);
      from.main_feast=Object.assign({},mary[0]);
    }
    assert(!IDS.includes(to.main_feast?.id),'destination main must remain unchanged');
    changed++;
  }
  return changed;
}
function moveBackend(backend){
  const source=backend.days?.['2027-04-14'];
  const dest=backend.days?.['2027-05-04'];
  assert(source&&dest,'backend days unavailable');
  const events=source.feasts.filter(f=>BACKEND_IDS.includes(f.local_id));
  const already=dest.feasts.filter(f=>BACKEND_IDS.includes(f.local_id));
  if(!events.length && same(already.map(f=>f.local_id),BACKEND_IDS)){
    assert(source.feasts.some(f=>f.key===source.main_feast&&
      f.title==='Преподобная Мария Египетская'),
      'previously corrected backend has unexpected main feast');
    return false;
  }
  assert(same(events.map(f=>f.local_id),BACKEND_IDS),
    'backend source IDs must be 4192/4189/4190, exactly once');
  assert(!already.length,'backend target contains candidate before repair');
  assert(source.main_feast==='feast:local-4192','backend source main not Shuy');
  source.feasts=source.feasts.filter(f=>!BACKEND_IDS.includes(f.local_id));
  dest.feasts.push(...events);
  const mary=source.feasts.filter(f=>f.title==='Преподобная Мария Египетская');
  assert(mary.length===1,'no unique backend St Mary of Egypt');
  source.main_feast=mary[0].key;
  source.main_feast_reason='curated_azbyka_bright_tuesday';
  assert(!BACKEND_IDS.some(id=>dest.main_feast==='feast:local-'+id),
    'backend May 4 main changed unexpectedly');
  return true;
}
function getData(root){
  const files={};
  for(const file of FILES){
    const absolute=path.join(root,file);
    assert(fs.existsSync(absolute),'file missing: '+file);
    const old=fs.readFileSync(absolute);
    const parsed=JSON.parse(old.toString('utf8'));
    const packed=Boolean(parsed[codec.FORMAT_KEY]);
    files[file]={
      old, packed, lf:old[old.length-1]===10,
      data:packed?codec.unpackCalendarMonth(parsed):parsed,
    };
  }
  return files;
}
function prepare(root){
  const files=getData(root);
  const month=ym=>files[monthPath(ym)].data;
  const result=[];
  for(const [from,to] of PAIRS){
    const moved=moveDay(from,to,month(from.slice(0,7)),month(to.slice(0,7)));
    result.push({from,to,movedLanguageRecords:moved});
  }
  const backendChanged=moveBackend(files['molitvoslov-backend/calendar_2027.json'].data);
  // These are separate fixed commemorations; they must not disappear.
  for(const dt of ['2027-08-10','2027-11-15']){
    const file=path.join(root,monthPath(dt.slice(0,7)));
    const raw=JSON.parse(fs.readFileSync(file,'utf8'));
    const expanded=codec.unpackCalendarMonth(raw);
    assert(expanded.days[dt].ru.all_feasts.some(x=>x.title==='Икона Богородицы Одигитрия Шуйская'),
      'fixed Shuy commemoration missing on '+dt);
  }
  const changes=[];
  for(const file of FILES){
    const x=files[file];
    const out=x.packed?codec.packCalendarMonth(x.data):x.data;
    // Keep the backend year snapshot reviewable: its generator writes pretty JSON.
    const text=file==='molitvoslov-backend/calendar_2027.json'
      ? JSON.stringify(out,null,2) : JSON.stringify(out);
    const bytes=Buffer.from(text+(x.lf?'\n':''),'utf8');
    if(!bytes.equals(x.old))
      changes.push({file,old:x.old,bytes,fromSha:hash(x.old),toSha:hash(bytes)});
  }
  return {changes,result,backendChanged};
}
function atomicWrite(file,bytes){
  const stage=file+'.bright-tuesday.tmp';
  assert(!fs.existsSync(stage),'staging file already exists: '+stage);
  try{
    fs.writeFileSync(stage,bytes,{flag:'wx'});
    fs.renameSync(stage,file);
  }finally{if(fs.existsSync(stage))fs.unlinkSync(stage);}
}
function apply(root,plan){
  if(!plan.changes.length)return null;
  const backupRoot=path.join(root,'molitvoslov-app','reports');
  const stamp=new Date().toISOString().replace(/[-:.]/g,'');
  const folder=path.join(backupRoot,'calendar-bright-tuesday-backup-'+stamp);
  assert(!fs.existsSync(folder),'backup exists: '+folder);
  fs.mkdirSync(folder,{recursive:true});
  for(const x of plan.changes){
    const saved=path.join(folder,x.file);
    fs.mkdirSync(path.dirname(saved),{recursive:true});
    fs.writeFileSync(saved,x.old,{flag:'wx'});
    assert(hash(fs.readFileSync(saved))===x.fromSha,'backup hash mismatch: '+x.file);
  }
  fs.writeFileSync(path.join(folder,'backup-manifest.json'),JSON.stringify({
    version:1,files:plan.changes.map(x=>({path:x.file,oldSha:x.fromSha,newSha:x.toSha}))
  },null,2)+'\n',{flag:'wx'});
  const written=[];
  try{
    for(const x of plan.changes){
      const target=path.join(root,x.file);
      assert(hash(fs.readFileSync(target))===x.fromSha,'file changed during preflight: '+x.file);
      atomicWrite(target,x.bytes);
      written.push(x);
      assert(hash(fs.readFileSync(target))===x.toSha,'write failed SHA: '+x.file);
    }
  }catch(error){
    for(const x of written.reverse())
      atomicWrite(path.join(root,x.file),x.old);
    throw error;
  }
  return folder;
}
function restore(root,folder){
  const reports=path.join(root,'molitvoslov-app','reports');
  folder=path.resolve(root,folder);
  assert(folder.startsWith(reports+path.sep) &&
    path.basename(folder).startsWith('calendar-bright-tuesday-backup-'),
    'restore directory outside expected reports backup location');
  const data=JSON.parse(fs.readFileSync(path.join(folder,'backup-manifest.json'),'utf8'));
  assert(data.version===1&&data.files.length>0&&data.files.length<=4,'invalid manifest');
  const restored=[];
  for(const x of data.files){
    assert(FILES.includes(x.path),'untrusted backup path');
    const original=fs.readFileSync(path.join(folder,x.path));
    assert(hash(original)===x.oldSha,'backup bytes corrupted');
    assert(hash(fs.readFileSync(path.join(root,x.path)))===x.newSha,
      'current source changed, refusing to overwrite: '+x.path);
    restored.push([path.join(root,x.path),original]);
  }
  for(const [file,bytes] of restored)atomicWrite(file,bytes);
  console.log('RESTORED',restored.length,'files, backup kept:',folder);
}
function main(){
  const args=process.argv.slice(2);
  const rootArg=args.indexOf('--root');
  const root=rootArg>=0?path.resolve(args[rootArg+1]):path.resolve(__dirname,'../..');
  const idx=args.indexOf('--restore');
  if(idx>=0){
    assert(!args.includes('--apply'),'restore cannot be combined with apply');
    restore(root,args[idx+1]);
    return;
  }
  const plan=prepare(root);
  plan.result.forEach(x=>console.log('DATE:',x.from,'->',x.to,
    'moved language entries:',x.movedLanguageRecords));
  console.log('BACKEND YEAR CHANGED:',plan.backendChanged);
  for(const x of plan.changes)
    console.log('PROPOSED:',x.file, 'bytes:',x.old.length,'->',x.bytes.length);
  if(!plan.changes.length){
    console.log('PASS: all four snapshots already repaired. No writes.');
    return;
  }
  if(!args.includes('--apply')){
    console.log('DRY RUN: nothing modified. Add --apply for SHA-verified backups and repair.');
    return;
  }
  const folder=apply(root,plan);
  console.log('APPLIED: changes saved; 2026 remains untouched.');
  console.log('BACKUP:',folder);
  console.log('To restore: node tools/repair-bright-tuesday-calendar-20261116.js --restore "'+folder+'"');
}
if(require.main===module)main();
module.exports={prepare,apply,restore,moveDay,moveBackend,IDS,BACKEND_IDS};
