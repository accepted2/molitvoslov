(function installPenitentialTraditionalLabels() {
  const fs = require('fs');
  const path = require('path');
  const marker = 'PENITENTIAL_TRADITIONAL_LABELS_20261117';
  const root = process.cwd();
  const relativeFiles = [
    'src/screens/CanonScreen.js',
    'src/components/reader/selectableDocumentReader/styles.js',
  ];
  const files = relativeFiles.map(name => {
    const file = path.join(root, ...name.split('/'));
    if (!fs.existsSync(file)) throw Error('Не найден: ' + name);
    const original = fs.readFileSync(file,'utf8');
    return {name,file,original,eol:original.includes('\r\n')?'\r\n':'\n',text:original.replace(/\r\n/g,'\n')};
  });
  if(files.every(x=>x.text.includes(marker))){
    console.log('OK: традиционные подписи уже установлены.');
    return;
  }
  if(files.some(x=>x.text.includes(marker))) throw Error('Частичное изменение файлов: остановлено.');
  const [canon,css] = files;
  const once=(obj,oldText,newText,label)=>{
    const i=obj.text.indexOf(oldText);
    if(i<0||obj.text.indexOf(oldText,i+1)>=0)
      throw Error(obj.name+': не найден уникальный фрагмент '+label+'; изменений нет.');
    obj.text=obj.text.replace(oldText,newText);
  };
  const helper=`
/* ${marker}
   Presentation-only headings for the supplied penitential canon's
   Church-Slavonic-script variant. These labels are NOT saved to content. */
const PENITENTIAL_TRADITIONAL_SLUG = 'kanon-pokayannyy-ko-gospodu-iisusu-khristu';
const PENITENTIAL_TRADITIONAL_ODE = {
  1: 'а҃', 2: 'в҃', 3: 'г҃', 4: 'д҃', 5: 'є҃',
  6: 'ѕ҃', 7: 'з҃', 8: 'и҃', 9: 'ѳ҃',
};
const PENITENTIAL_TRADITIONAL_LABEL = {
  irmos: 'І҆рмо́съ:',
  refrain: 'Припѣ́въ:',
  sedalen: 'Сѣда́ленъ, гла́съ ѕ҃-й:',
  theotokion: 'Бг҃оро́диченъ:',
  kontakion: 'Конда́къ:',
  ikos: 'И҆́косъ:',
  svetilen: 'Свѣти́ленъ:',
  prayer: 'Моли́тва:',
};
const getPenitentialTraditionalLabel = (section, type) => {
  if (section?.suppress_inline_label) return '';
  // Ordinary troparia, Glory and And now have no separate header label:
  // their own source text contains the full opening doxology.
  return PENITENTIAL_TRADITIONAL_LABEL[type] || '';
};

`;
  once(canon,"const getCanonInlineLabel = (section, text, t) => {",helper+"const getCanonInlineLabel = (section, text, t) => {",'traditional helpers');
  once(canon,
`    displaySections.forEach((section) => {`,
`    const isPenitentialTraditional =
      showTraditional && canon.slug === PENITENTIAL_TRADITIONAL_SLUG;
    displaySections.forEach((section) => {`,'traditional scope');
  once(canon,
`            language: 'traditional',
            className: 'canon-church',`,
`            language: 'traditional',
            className: isPenitentialTraditional
              ? 'canon-church canon-traditional-penitential canon-' + effectiveSectionType
              : 'canon-church',`,'traditional content class');
  const oldComment=`            // The traditional source already contains all rubrics, and
            // heading-only sections mark the ode boundaries. Avoid printing
            // the generic "Текст" label before each prayer paragraph.
            label: canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label,
            inlineLabel: '',`;
  const newComment=`            // ${marker}: this canon uses the same inline rubric design
            // as the RU/CS reader, but with Church Slavonic orthography.
            // Never display untranslated locale keys (calendar.troparion).
            label: isPenitentialTraditional
              ? ''
              : (canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label),
            inlineLabel: isPenitentialTraditional
              ? getPenitentialTraditionalLabel(section, effectiveSectionType)
              : '',`;
  if(canon.text.includes(oldComment)){
    once(canon,oldComment,newComment,'traditional label and rubric');
  }else{
    // Older main has the same fields but no extended explanatory comment.
    once(canon,
`            label: canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label,
            inlineLabel: '',`,
`            label: isPenitentialTraditional
              ? ''
              : (canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label),
            inlineLabel: isPenitentialTraditional
              ? getPenitentialTraditionalLabel(section, effectiveSectionType)
              : '',`, 'traditional label and rubric');
  }
  once(canon,
`        sectionTitle = t('reading.ode', {number: odeNumber});`,
`        sectionTitle = isPenitentialTraditional
          ? 'Пѣ́снь ' + (PENITENTIAL_TRADITIONAL_ODE[odeNumber] || String(odeNumber))
          : t('reading.ode', {number: odeNumber});`,
'song numbering');
  const endOfSections=`      });
    });

    // RU and CS+RU`;
  const endOfSectionsAlternate=`      });
    });

    // `; // not used, guard exact anchor instead
  // Append a specific class after the section object has been constructed,
  // so this works with either the standalone and the three-dots header code.
  if(canon.text.includes(endOfSections)){
    once(canon,endOfSections,
`      });
      if (isPenitentialTraditional) {
        sections[sections.length - 1].className += ' canon-traditional-penitential-section';
      }
    });

    // RU and CS+RU`, 'section class');
  } else {
    // Resolve only the forEach closing anchored to the following doc code.
    const start=canon.text.indexOf('    displaySections.forEach((section) => {');
    const end=canon.text.indexOf('    });',canon.text.indexOf('      sections.push({',start));
    if(start<0||end<0||end<start)throw Error('Не удалось найти закрытие цикла секций. Ничего не изменено.');
    // The first matching "    });" after sections.push is the actual forEach
    // close, since section object ends with six spaces and then ");".
    canon.text=canon.text.slice(0,end)+
`      if (isPenitentialTraditional) {
        sections[sections.length - 1].className += ' canon-traditional-penitential-section';
      }
` +canon.text.slice(end);
  }
  if(!canon.text.includes('canon-traditional-penitential-section'))
    throw Error('Не удалось выделить нужный канон в DOM.');

  const cssEnding='\n  `;';
  const i=css.text.lastIndexOf(cssEnding);
  if(i<0||!['\n  `;','\n  `;\n'].includes(css.text.slice(i)))
    throw Error('Не найден конец CSS Reader. Изменений нет.');
  const block=`
    /* ${marker} — only the penitential canon / traditional tab */
    .rule-item.canon-traditional-penitential-section .reader-label {
      display: none !important;
    }
    .rule-item.canon-traditional-penitential-section .section-header .prayer-title {
      font-family: 'Ponomar', Georgia, serif !important;
      font-weight: 400;
      font-size: 21px;
      line-height: 31px;
      color: var(--accent-dark) !important;
    }
    .rule-item.canon-traditional-penitential-section .reader-inline .reader-inline-label {
      font-family: 'Ponomar', Georgia, serif !important;
      font-style: normal !important;
      font-weight: 400 !important;
      font-size: 1em;
      line-height: inherit;
      color: var(--liturgical) !important;
      margin-right: 6px;
    }
    .rule-item.canon-traditional-penitential-section .reader-inline.prayer-inline .reader-inline-label,
    .rule-item.canon-traditional-penitential-section .reader-inline.prayer-inline .reader-text {
      display: inline !important;
      margin-bottom: 0;
    }
    .rule-item.canon-traditional-penitential-section .reader-text.canon-traditional-penitential {
      font-family: 'Ponomar', Georgia, serif !important;
      text-align: justify !important;
      text-align-last: left !important;
    }
`;
  css.text=css.text.slice(0,i)+block+css.text.slice(i);
  for(const item of files){
    if(!item.text.includes(marker))throw Error(item.name+': неполное изменение; файлов ещё не записывали.');
  }
  const backupExt='.backup-trad-labels-20261117-'+new Date().toISOString().replace(/[:.]/g,'-');
  const written=[];
  try{
    for(const item of files)fs.writeFileSync(item.file+backupExt,item.original,'utf8');
    for(const item of files){
      fs.writeFileSync(item.file,item.text.replace(/\n/g,item.eol),'utf8');
      written.push(item);
    }
  }catch(error){
    for(const item of written){try{fs.writeFileSync(item.file,item.original,'utf8')}catch(_){}}
    throw error;
  }
  console.log('OK: все песни Покаянного канона в ЦС традиционном названы Пѣ́снь а҃ ... Пѣ́снь ѳ҃.');
  console.log('OK: Ирмос, Припев, Седален, Кондак, Икос, Богородичен и Молитва — церковнославянские рубрики в начале текста.');
  console.log('OK: лишняя подпись calendar.troparion отсутствует, обычные тропари без подписи.');
  console.log('Резервные копии: '+backupExt);
})();
