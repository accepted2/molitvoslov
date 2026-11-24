(function install(){
const fs=require('fs'), path=require('path');
const root=process.cwd();
const paths={
  runtime:path.join(root,'src/components/reader/selectableDocumentReader/runtime.js'),
  reader:path.join(root,'src/components/reader/SelectableDocumentReader.js'),
};
const source={};
for(const [k,p] of Object.entries(paths)){
 if(!fs.existsSync(p))throw Error('Missing '+p);
 source[k]=fs.readFileSync(p,'utf8');
}
function one(src,a,b,label){
 const i=src.indexOf(a);
 if(i<0||i!==src.lastIndexOf(a))throw Error('Не найден однозначный блок '+label+'. Ничего не изменено.');
 return src.replace(a,b);
}
let {runtime,reader}=source;
const tag='HOURS_PROFILE_20261116';
if(!runtime.includes(tag)){
 runtime=one(runtime,
 '    renderDocument();\n    loadSavedRanges();\n    computeFocusHighlightRanges();\n    itemTextMap.forEach( ( _text, itemId ) => renderTextItem( itemId ) );',
 `    // HOURS_PROFILE_20261116 - profiling only, no logic changed.
    const hoursProfile = (DATA.document.sections || []).some(s => String(s.className || '').includes('hours-section'));
    const hpStart = hoursProfile ? performance.now() : 0;
    renderDocument();
    const hpRendered = hoursProfile ? performance.now() : 0;
    loadSavedRanges();
    computeFocusHighlightRanges();
    const hpPrepared = hoursProfile ? performance.now() : 0;
    itemTextMap.forEach( ( _text, itemId ) => renderTextItem( itemId ) );
    if (hoursProfile) post({
      type: 'hours-profile', mode: DATA.document.viewSwitcher?.activeKey,
      renderMs: +(hpRendered - hpStart).toFixed(1),
      prepareMs: +(hpPrepared - hpRendered).toFixed(1),
      decorateMs: +(performance.now() - hpPrepared).toFixed(1),
      blocks: itemTextMap.size,
      chars: Array.from(itemTextMap.values()).reduce((n, value) => n + value.length, 0),
    });`,
 'WebView render pipeline');
}
if(!reader.includes(tag)){
 reader=one(reader,
 '    if (message.type === \'view-mode\') {',
 `    // HOURS_PROFILE_20261116: Log only, do not mutate reader state.
    if (message.type === 'hours-profile') {
      console.warn('[HOURS_PROFILE_20261116][WebView]',
        'mode='+message.mode, 'render='+message.renderMs+'ms',
        'prepare='+message.prepareMs+'ms',
        'decorate='+message.decorateMs+'ms',
        'blocks='+message.blocks, 'chars='+message.chars);
      return;
    }
    if (message.type === 'view-mode') {`,
 'native message handler');
 reader=one(reader,
 `        onLoadEnd={(event) => {
          // Bible pages already have their scoped colours in the initial HTML.`,
 `        onLoadEnd={(event) => {
          if ((documentData.sections || []).some(s => String(s.className || '').includes('hours-section'))) {
            console.warn('[HOURS_PROFILE_20261116][WebView load end]',
              'mode='+documentData.viewSwitcher?.activeKey,
              'htmlChars='+html.length,
              'time='+Date.now());
          }
          // Bible pages already have their scoped colours in the initial HTML.`,
 'WebView onLoadEnd');
}
const edits=Object.entries(paths).map(([k,p])=>({p,orig:source[k],next:({runtime,reader})[k]})).filter(x=>x.orig!==x.next);
if(!edits.length){console.log('Profile already installed');return}
const stamp='.backup-hours-profile-'+new Date().toISOString().replace(/[:.]/g,'-');
try{
 for(const x of edits)fs.writeFileSync(x.p+stamp,x.orig,'utf8');
 for(const x of edits)fs.writeFileSync(x.p,x.next,'utf8');
}catch(e){for(const x of edits)try{fs.writeFileSync(x.p,x.orig,'utf8')}catch(_){};throw e}
console.log('OK: profiling enabled; backup suffix '+stamp);
console.log('Open First Hour, switch CS -> RU -> CS+RU -> traditional, then do the same with Third Hour.');
console.log('Copy Metro lines tagged [HOURS_PROFILE_20261116].');
})();
