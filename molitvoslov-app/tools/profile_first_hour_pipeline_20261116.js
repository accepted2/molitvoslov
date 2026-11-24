(function install(){
 const fs=require('fs'),path=require('path');
 const dir=process.cwd(),tag='HOURS_PIPELINE_20261116';
 const files={
  screen:path.join(dir,'src/screens/HoursReadingScreen.js'),
  reader:path.join(dir,'src/components/reader/SelectableDocumentReader.js')
 };
 const input={};
 for(const [key,file] of Object.entries(files)){
  if(!fs.existsSync(file))throw Error('Файл не найден: '+file);
  input[key]=fs.readFileSync(file,'utf8');
 }
 if(Object.values(input).every(x=>x.includes(tag))){console.log('OK: измерения уже установлены');return}
 if(Object.values(input).some(x=>x.includes(tag)))throw Error('Измерения установлены частично; файлы не изменены.');
 const eols=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,v.includes('\r\n')?'\r\n':'\n']));
 let screen=input.screen.replace(/\r\n/g,'\n');
 let reader=input.reader.replace(/\r\n/g,'\n');
 const once=(src,a,b,label)=>{
  const i=src.indexOf(a);
  if(i<0||src.lastIndexOf(a)!==i)throw Error(label+': код отличается, файлы не изменены.');
  return src.replace(a,b);
 };
 screen=once(screen,
`  const content = useMemo(() => getOfflineHoursText(entryId), [entryId]);
  // Actions belong beside individual prayer texts, never on Hours dropdowns.
  const documentData = useMemo(() => entry
    ? buildHoursDocument({entry, content, viewMode})
    : null, [entry, content, viewMode]);`,
`  // HOURS_PIPELINE_20261116 - instrumentation only.
  const content = useMemo(() => getOfflineHoursText(entryId), [entryId]);
  const documentData = useMemo(() => {
    const started=Date.now();
    console.warn('[HOURS_PIPELINE_20261116] BUILD_START','t='+started,'mode='+viewMode,'entry='+entryId);
    const result=entry ? buildHoursDocument({entry,content,viewMode}) : null;
    console.warn('[HOURS_PIPELINE_20261116] BUILD_DONE','t='+Date.now(),
      'durationMs='+(Date.now()-started),'mode='+viewMode,'entry='+entryId);
    return result;
  },[entry,content,viewMode]);
  useEffect(() => {
    if(entryId==='ordinary-1')console.warn('[HOURS_PIPELINE_20261116] REACT_COMMIT',
      't='+Date.now(),'mode='+viewMode);
  },[documentData]);
  useEffect(() => {
    if(entryId!=='ordinary-1')return undefined;
    let last=Date.now();
    const timer=setInterval(()=>{
      const now=Date.now(), lag=now-last-120;
      if(lag>400)console.warn('[HOURS_PIPELINE_20261116] JS_EVENT_LOOP_LAG',
        't='+now,'lagMs='+lag);
      last=now;
    },120);
    return ()=>clearInterval(timer);
  },[entryId]);`,
 'Hours document useMemo');
 screen=once(screen,
`    console.warn('[HOURS_STARTUP_20261116] modeChangeRequest=' + nextMode);`,
`    console.warn('[HOURS_STARTUP_20261116] modeChangeRequest=' + nextMode);
    console.warn('[HOURS_PIPELINE_20261116] MODE_REQUEST','t='+Date.now(),'mode='+nextMode);`,
 'Hours mode change');
 screen=once(screen,
`            console.warn('[HOURS_STARTUP_20261116] webViewReadyMs=' +`,
`            console.warn('[HOURS_PIPELINE_20261116] READER_READY','t='+Date.now(),'mode='+viewMode);
            console.warn('[HOURS_STARTUP_20261116] webViewReadyMs=' +`,
 'Hours onReady');
 reader=once(reader,
`  const html = useMemo(() => {
    console.warn('[reader] incoming FT =', JSON.stringify(focusTarget));`,
`  const html = useMemo(() => {
    const profileHtmlStart=isHoursDocument?Date.now():0;
    if(isHoursDocument)console.warn('[HOURS_PIPELINE_20261116] HTML_START',
      't='+profileHtmlStart,'mode='+String(documentData.viewSwitcher?.activeKey));
    console.warn('[reader] incoming FT =', JSON.stringify(focusTarget));`,
 'Reader HTML start');
 reader=once(reader,
 "    return markup.replace('</style>', `${css}${embeddedCss}</style>`);",
`    const finalHtml = markup.replace('</style>', \`\${css}\${embeddedCss}</style>\`);
    if(isHoursDocument)console.warn('[HOURS_PIPELINE_20261116] HTML_DONE',
      't='+Date.now(),'durationMs='+(Date.now()-profileHtmlStart),
      'mode='+String(documentData.viewSwitcher?.activeKey),'chars='+finalHtml.length);
    return finalHtml;`,
 'Reader HTML end');
 reader=once(reader,
`        onLoadStart={() => {
          if (documentData?.progressAnchorType === 'hours_row') {`,
`        onLoadStart={() => {
          if (documentData?.progressAnchorType === 'hours_row') {
            console.warn('[HOURS_PIPELINE_20261116] WEBVIEW_START',
              't='+Date.now(),'mode='+String(documentData.viewSwitcher?.activeKey));`,
 'WebView load start');
 reader=once(reader,
`        onLoadEnd={(event) => {
          if (documentData?.progressAnchorType === 'hours_row') {`,
`        onLoadEnd={(event) => {
          if (documentData?.progressAnchorType === 'hours_row') {
            console.warn('[HOURS_PIPELINE_20261116] WEBVIEW_DONE',
              't='+Date.now(),'mode='+String(documentData.viewSwitcher?.activeKey));`,
 'WebView load end');
 const edits=[
  {file:files.screen,original:input.screen,updated:screen.replace(/\n/g,eols.screen)},
  {file:files.reader,original:input.reader,updated:reader.replace(/\n/g,eols.reader)}
 ];
 const suffix='.backup-hours-pipeline-'+new Date().toISOString().replace(/[:.]/g,'-');
 try{
  for(const e of edits)fs.writeFileSync(e.file+suffix,e.original,'utf8');
  for(const e of edits)fs.writeFileSync(e.file,e.updated,'utf8');
 }catch(e){
  for(const edit of edits)try{fs.writeFileSync(edit.file,edit.original,'utf8')}catch(_){}
  throw e;
 }
 console.log('OK: измерения этапов открытия Первого часа установлены.');
 console.log('Логируются расчёт документа, построение HTML, готовность React и WebView, задержки JS потока.');
 console.log('Резервные копии: '+suffix);
})();
