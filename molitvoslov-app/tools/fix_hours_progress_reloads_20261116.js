(function install(){
const fs=require('fs'),path=require('path');
const p=path.join(process.cwd(),'src/components/reader/SelectableDocumentReader.js');
if(!fs.existsSync(p))throw Error('Не найден '+p);
const before=fs.readFileSync(p,'utf8');
const marker='HOURS_STABLE_CONTENT_20261116';
if(before.includes(marker)){console.log('OK: уже применено');return}
if(!before.includes("const html = useMemo("))throw Error('Не найден html useMemo. Файл не изменён.');
const patterns=[/source\s*=\s*\{\s*\{\s*html\s*,?\s*\}\s*\}/g,/source\s*=\s*\{\s*webViewSource\s*\}/g];
const occurrences=patterns.flatMap(re=>[...before.matchAll(re)]);
if(occurrences.length!==1)throw Error('source WebView обнаружен '+occurrences.length+' раз. Файл не изменён.');
const hookAnchor='  const inject = (script) => {';
if(before.split(hookAnchor).length!==2)throw Error('Не найден уникальный inject. Файл не изменён.');
const guard=`  // HOURS_STABLE_CONTENT_20261116:
  // Preserve the same WebView HTML across progress and measured-inset updates.
  // Switching tabs changes documentData, and appearance/font changes retain
  // their own invalidation. Other reader categories are unaffected.
  const hoursHtmlCacheRef = useRef(null);
  const isHoursDocument = documentData?.progressAnchorType === 'hours_row';
  let hoursDisplayedHtml = html;
  if (isHoursDocument) {
    const previous = hoursHtmlCacheRef.current;
    const sameDocument = previous &&
      previous.documentData === documentData &&
      previous.settings === htmlReadingSettings &&
      previous.font === ponomarFontDataUri &&
      previous.focusTarget === focusTarget &&
      previous.hasSavedProgress === !!savedProgress &&
      previous.embedded === embedded &&
      previous.embeddedStyle === embeddedTextStyle;
    if (sameDocument) {
      hoursDisplayedHtml = previous.html;
    } else {
      hoursHtmlCacheRef.current = {
        documentData, settings: htmlReadingSettings,
        font: ponomarFontDataUri, focusTarget,
        hasSavedProgress: !!savedProgress,
        embedded, embeddedStyle: embeddedTextStyle, html,
      };
    }
  }
  const stableHoursWebViewSource = useMemo(
    () => ({html: isHoursDocument ? hoursDisplayedHtml : html}),
    [isHoursDocument, hoursDisplayedHtml, html]
  );

`;
let after=before.replace(hookAnchor,guard+hookAnchor);
const replacement = "source={stableHoursWebViewSource}";
const match=occurrences[0][0];
if(!after.includes(match))throw Error('Не удалось найти WebView source после вставки; файл не изменён.');
after=after.replace(match,replacement);
const backup=p+'.backup-hours-stable-'+new Date().toISOString().replace(/[:.]/g,'-');
fs.writeFileSync(backup,before,'utf8');
fs.writeFileSync(p,after,'utf8');
console.log('OK: для Часов включена стабилизация содержимого WebView. Бэкап: '+backup);
console.log('Тексты, переключение языков и другие категории чтения не изменены.');
console.log('Если повторы остались, сравни количество LOAD_START с диагностикой.');
})();
