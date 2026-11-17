(function fixGuardianAngelFinalPrayerTitle() {
 const fs = require('fs'), path = require('path');
 const name = 'src/screens/CanonScreen.js';
 const filename = path.join(process.cwd(), ...name.split('/'));
 const marker = 'GUARDIAN_ANGEL_FINAL_PRAYER_HEADING_20261117';
 if (!fs.existsSync(filename)) throw Error('Не найден файл: '+name);
 const original = fs.readFileSync(filename, 'utf8');
 const newline = original.includes('\r\n') ? '\r\n' : '\n';
 let code = original.replace(/\r\n/g, '\n');
 if (code.includes(marker)) {console.log('OK: полный заголовок молитвы уже установлен.');return;}
 if (!code.includes('GUARDIAN_ANGEL_TRADITIONAL_LABELS_20261117'))
   throw Error('Сначала примени fix_guardian_angel_traditional_labels_20261117.js');
 if (!code.includes('GUARDIAN_ANGEL_TRADITIONAL_RUBRICS_V2_20261117'))
   throw Error('Сначала примени fix_guardian_angel_traditional_rubrics_v2_20261117.js');
 const replaceOnce=(before,after,label)=>{
  const i=code.indexOf(before);
  if(i<0||code.indexOf(before,i+1)!==-1)
    throw Error('Изменён блок '+label+'. Файл не записан.');
  code=code.replace(before,after);
 };
 replaceOnce(
   "    case 'prayer': return 'Мл҃тва:';",
   "    case 'prayer': return ''; // A full standalone title is printed above the prayer.",
   'краткая рубрика Молитва'
 );
 // Keep the whole liturgical heading in a section header: the source text
 // must start with "А҆́гг҃ле...", not with an inserted label.
 replaceOnce(
   '      sections.push({\n        className:',
   `      // ${marker}: the final prayer is a standalone section, not an
      // inline "Мл҃тва:" label. Do not affect RU, ordinary CS or other canons.
      if (
        isGuardianAngelTraditional &&
        effectiveSectionType === 'prayer' &&
        !odeNumber &&
        blocks.length
      ) {
        sectionTitle = 'Мл҃тва къ А҆́гг҃лꙋ-Храни́телю';
      }

      sections.push({
        className:`,
   'заголовок перед заключительной молитвой'
 );
 if (!code.includes(marker) || !code.includes("case 'prayer': return '';"))
   throw Error('Проверка перед записью не пройдена.');
 const backup=filename+'.backup-guardian-final-prayer-title-'+new Date().toISOString().replace(/[:.]/g,'-');
 fs.writeFileSync(backup,original,'utf8');
 try {
  fs.writeFileSync(filename,code.replace(/\n/g,newline),'utf8');
 }catch(error){
  try{fs.writeFileSync(filename,original,'utf8')}catch(_){}
  throw error;
 }
 console.log('OK: вместо короткой рубрики Мл҃тва: выводится самостоятельный заголовок');
 console.log('    Мл҃тва къ А҆́гг҃лꙋ-Храни́телю');
 console.log('OK: под заголовком идёт полный текст молитвы с отдельной строки.');
 console.log('OK: RU, основной ЦС, остальные каноны и данные Django не меняются.');
 console.log('Резервная копия: '+backup);
})();
