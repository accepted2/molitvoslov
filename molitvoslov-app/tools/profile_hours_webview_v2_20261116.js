(function applyProfiler() {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(process.cwd(), 'src/components/reader/SelectableDocumentReader.js');
  if (!fs.existsSync(file)) throw Error('Не найден файл ' + file);
  const original = fs.readFileSync(file, 'utf8');
  const marker = 'HOURS_WEBVIEW_PROFILE_V2_20261116';
  if (original.includes(marker)) { console.log('OK: диагностика уже установлена'); return; }
  let result = original;
  function addAfter(pattern, extra, what) {
    const matches = [...result.matchAll(pattern)];
    if (matches.length !== 1) throw Error('Не найден однозначный участок: ' + what + '. Файл не изменён. Найдено ' + matches.length);
    const m = matches[0];
    result = result.slice(0, m.index + m[0].length) + extra + result.slice(m.index + m[0].length);
  }
  // All changes restricted to the shared WebView component and active only for Hours.
  addAfter(/const webViewRef\s*=\s*useRef\(null\)\s*;/g,
    "\n  const hoursProfileStartRef = useRef(0); // HOURS_WEBVIEW_PROFILE_V2_20261116\n",
    'webViewRef');
  addAfter(/const handleMessage\s*=\s*async\s*\(event\)\s*=>\s*\{/g,
    '', 'handleMessage');
  addAfter(/message\s*=\s*JSON\.parse\(event\.nativeEvent\.data\)\s*;\s*\}\s*catch\s*\{\s*return\s*;\s*\}/g,
    "\n    if (message?.type === 'hours-webview-profile' && documentData?.progressAnchorType === 'hours_row') {\n      console.warn('[HOURS_WEBVIEW_PROFILE_V2_20261116][DOM]', JSON.stringify(message));\n      return;\n    }\n",
    'JSON message parsing');
  addAfter(/onLoadEnd\s*=\s*\{\s*\(event\)\s*=>\s*\{/g,
    `
          if (documentData?.progressAnchorType === 'hours_row') {
            console.warn('[HOURS_WEBVIEW_PROFILE_V2_20261116][LOAD_END]',
              'mode='+String(documentData.viewSwitcher?.activeKey),
              'elapsedMs='+(hoursProfileStartRef.current ? Date.now()-hoursProfileStartRef.current : 'start_missing'),
              'htmlChars='+html.length);
            webViewRef.current?.injectJavaScript(
              "(function(){var nav=performance.getEntriesByType('navigation')[0];" +
              "var payload={type:'hours-webview-profile',mode:" +
              JSON.stringify(documentData.viewSwitcher?.activeKey || '') +
              ",webNowMs:Math.round(performance.now()),domContentLoadedMs:nav?Math.round(nav.domContentLoadedEventEnd):null,loadMs:nav?Math.round(nav.loadEventEnd):null,domNodes:document.getElementsByTagName('*').length,readerTextNodes:document.querySelectorAll('.reader-text').length};" +
              "window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(payload));})();true;"
            );
          }
`,
    'onLoadEnd callback');
  // Insert callback in the WebView JSX, before its onLoadEnd handler.
  const loadMatch = [...result.matchAll(/\bonLoadEnd\s*=\s*\{\s*\(event\)\s*=>\s*\{/g)];
  if (loadMatch.length !== 1) throw Error('onLoadEnd callback ambiguous; file unchanged.');
  const insertAt=loadMatch[0].index;
  result = result.slice(0,insertAt) +
    `onLoadStart={() => {
          if (documentData?.progressAnchorType === 'hours_row') {
            hoursProfileStartRef.current = Date.now();
            console.warn('[HOURS_WEBVIEW_PROFILE_V2_20261116][LOAD_START]',
              'mode='+String(documentData.viewSwitcher?.activeKey),
              'htmlChars='+html.length);
          }
        }}
        ` + result.slice(insertAt);
  const suffix='.backup-hours-profile-v2-'+new Date().toISOString().replace(/[:.]/g,'-');
  fs.writeFileSync(file+suffix,original,'utf8');
  fs.writeFileSync(file,result,'utf8');
  console.log('OK: диагностика WebView добавлена. Резервная копия: '+suffix);
  console.log('Открой Первый час, переключи ЦС/RU/ЦС+RU/традиционный, затем Третий час.');
  console.log('Пришли строки [HOURS_WEBVIEW_PROFILE_V2_20261116] из терминала Metro.');
})();
