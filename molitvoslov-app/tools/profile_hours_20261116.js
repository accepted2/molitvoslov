// Profile offline Hours data and the document-building function without modifying app files.
// Run from molitvoslov-app: node tools/profile_hours_20261116.js
const fs=require('fs'), path=require('path'), Module=require('module'), perf=require('perf_hooks').performance;
const base=process.cwd();
const textFile=p=>path.join(base,p);
const read=p=>JSON.parse(fs.readFileSync(textFile(p),'utf8'));
const data=read('src/data/hoursTexts.json');
const trad=read('src/data/hoursFirstHourTraditional.json');
const ru=read('src/data/hoursFirstHourRussian.json');
const third=read('src/data/hoursThirdHourEditorial.json');
function summarize(name,sections) {
 const all=(Array.isArray(sections)?sections:[]).flatMap(s=>s.rows||[]);
 const lengths=all.map(r=>Math.max(...['church','russian','traditional'].map(k=>String(r[k]||'').length)));
 const largest=lengths.slice().sort((a,b)=>b-a);
 console.log(name+': sections='+sections?.length+', rows='+all.length+
   ', combined chars='+lengths.reduce((a,b)=>a+b,0)+
   ', largest row='+largest[0]+', top5 chars='+largest.slice(0,5).join('/'));
}
console.log('== OFFLINE SOURCES ==');
const first=data.entries?.['ordinary-1'];
const thirdImported=data.entries?.['ordinary-3'];
summarize('First Hour imported', first?.sections);
summarize('First Hour traditional',trad.sections);
summarize('First Hour Russian',[ru.opening,...(ru.psalms||[]),...(ru.afterPsalms||[])]);
summarize('Third Hour editorial',third.sections);
summarize('Third Hour imported',thirdImported?.sections);
console.log('Files in bytes:');
for(const p of ['src/data/hoursTexts.json','src/data/hoursFirstHourTraditional.json','src/data/hoursFirstHourRussian.json','src/data/hoursFirstHourEditorial.json','src/data/hoursThirdHourEditorial.json','src/components/reader/selectableDocumentReader/runtime.js','src/components/reader/selectableDocumentReader/styles.js'])
 console.log(' '+p+': '+fs.statSync(textFile(p)).size);
console.log('== DOCUMENT BENCHMARK ==');
let babel;
try {babel=require('@babel/core');require.resolve('@babel/plugin-transform-modules-commonjs')}
catch(e){console.log('Babel unavailable, source sizes above still valid: '+e.message);process.exit(0)}
const original=Module._extensions['.js'];
Module._extensions['.js']=function(mod,filename){
 if(filename.startsWith(path.join(base,'src')+path.sep)){
   const source=fs.readFileSync(filename,'utf8');
   const compiled=babel.transformSync(source,{filename,babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
   mod._compile(compiled,filename);
 }else original(mod,filename);
};
try{
 const {buildHoursDocument,getOfflineHoursText}=require(textFile('src/services/hoursDocument.js'));
 const {getHoursEntry}=require(textFile('src/data/hoursCatalog.js'));
 const modes=['church','russian','both','traditional'];
 for(const id of ['ordinary-1','ordinary-3']){
   const entry=getHoursEntry(id),content=getOfflineHoursText(id);
   console.log('Entry '+id+' source='+ (id==='ordinary-1'&&first?'imported':'bundled'));
   for(const mode of modes){
     const start=perf.now();
     let doc;
     for(let i=0;i<15;i++)doc=buildHoursDocument({entry,content,viewMode:mode});
     const ms=(perf.now()-start)/15;
     const str=JSON.stringify(doc);
     const blocks=(doc.sections||[]).flatMap(s=>s.rows||[]).flatMap(r=>r.blocks||[]);
     console.log(' '+mode+': build avg '+ms.toFixed(2)+'ms, blocks='+blocks.length+
       ', chars='+blocks.reduce((s,b)=>s+(b.text?.length||0),0)+
       ', marks='+blocks.reduce((s,b)=>s+(b.hoursMarks?.length||0),0)+
       ', serialized='+str.length+' chars');
   }
 }
}catch(e){console.log('BENCH ERROR: '+(e.stack||e.message));process.exitCode=1}
finally{Module._extensions['.js']=original}
