(function upgradeGuardianAngelTraditionalRubrics() {
  const fs = require('fs');
  const path = require('path');
  const marker = 'GUARDIAN_ANGEL_TRADITIONAL_RUBRICS_V2_20261117';
  const names = [
    'src/screens/CanonScreen.js',
    'src/components/reader/selectableDocumentReader/styles.js',
  ];
  const files = names.map(name => {
    const filename = path.join(process.cwd(), ...name.split('/'));
    if (!fs.existsSync(filename)) throw new Error('Не найден: '+name);
    const original = fs.readFileSync(filename,'utf8');
    return {name,filename,original,eol:original.includes('\r\n')?'\r\n':'\n',content:original.replace(/\r\n/g,'\n')};
  });
  const [canon,css] = files;
  if (files.every(f=>f.content.includes(marker))) {
    console.log('OK: ЦС-трад рубрики канона Ангелу Хранителю v2 уже применены.');
    return;
  }
  if (files.some(f=>f.content.includes(marker)))
    throw new Error('Исправление применено частично. Файлы не изменены.');
  if (!files.every(f=>f.content.includes('GUARDIAN_ANGEL_TRADITIONAL_LABELS_20261117'))) {
    throw new Error(
      'Сначала запусти node .\\tools\\fix_guardian_angel_traditional_labels_20261117.js'
    );
  }
  const once=(f,from,to,meaning)=>{
    const i=f.content.indexOf(from);
    if(i<0||f.content.indexOf(from,i+1)>=0)
      throw new Error(f.name+': не найден уникальный фрагмент '+meaning+'; изменений нет.');
    f.content=f.content.replace(from,to);
  };
  // A source section may be stored as "other" in Django. Do not render
  // its short liturgical cue as a separate, often Russian, section heading.
  once(canon,
    `const guardianTraditionalHeading = (source) => {
  const h = angelHeadingNormalized(source);`,
    `const guardianTraditionalHeading = (source) => {
  const h = angelHeadingNormalized(source);
  // Also catch the literal locale key BEFORE a legacy normalizer converts
  // Latin "a" to Cyrillic "а", which would hide "calendar.troparion".
  if (String(source || '').trim().toLowerCase() === 'calendar.troparion')
    return '';
  // ${marker}: these are inline rubrics or cues, NOT heading sections.
  if (/^(?:слава(?:\\s+и\\s+ныне)?|и\\s+ныне|ирмос|припев|иисусу|богородичен|бгородичен|calendar\\.troparion)(?=$|[\\s:,.])/u.test(h))
    return '';
  if (/^тропар(?:ь)?\\s*$/u.test(h)) return '';`,
    'отмена отдельных служебных заголовков');
  once(canon,
    `const guardianAngelTraditionalInlineLabel = (section, sectionType, tradText) => {
  if (section?.suppress_inline_label) return '';
  const h = angelHeadingNormalized(section?.heading);
  const source = String(tradText || '');
  if (source.slice(0,90).includes('І҆и҃се') ||
      h.includes('иисус') || h.includes('иису'))
    return 'І҆и҃сꙋ:';`,
    `const guardianAngelTraditionalInlineLabel = (section, sectionType, tradText) => {
  if (section?.suppress_inline_label) return '';
  const h = angelHeadingNormalized(section?.heading);
  const source = String(tradText || '');
  // ${marker}: handle backend's "other" and "troparion" aliases,
  // while keeping rubrics attached to their own text, not above as labels.
  if (/^(?:богородичен|бгородичен)/u.test(h))
    return 'Бг҃оро́диченъ:';
  if (/^(?:иисусу|иисусе|иису)/u.test(h) ||
      /гд[ⷭ҇]?и\\s+і҆и҃се/u.test(source.slice(0,50)))
    return 'І҆и҃сꙋ:';
  if (/^ирмос/u.test(h)) return 'І҆рмо́съ:';
  if (/^припев/u.test(h)) return 'Припѣ́въ:';`,
    'рубрики для псалмов, Богородична и Иисусу');
  once(canon,
    `    case 'troparion':
      // Only the opening tone-6 troparion has an explicit rubric. Within
      // odes, no "calendar.troparion" or generic troparion headings.
      return section?.ode_number ? '' :
        (/тропар/u.test(h) || /глас\\s*6/u.test(h)) ? 'Тропа́рь:' : '';
    case 'sedalen': return 'Сѣда́ленъ:';
    case 'kontakion': return 'Конда́къ:';`,
    `    case 'troparion':
      // Ordinary troparia carry NO "calendar.troparion" label.
      // Only the opening troparion has its own heading and tone.
      if (section?.ode_number) return '';
      return /тропар/u.test(h) && /глас\\s*6/u.test(h)
        ? 'Тропа́рь, гла́съ ѕ҃-й:'
        : '';
    case 'sedalen':
      return /глас\\s*2/u.test(h) ? 'Сѣда́ленъ, гла́съ в҃-й:' : 'Сѣда́ленъ:';
    case 'kontakion':
      return /глас\\s*4/u.test(h) ? 'Конда́къ, гла́съ д҃-й:' : 'Конда́къ:';`,
    'тропарь гласа 6, седален, кондак');

  const ending='\n  `;';
  const pos=css.content.lastIndexOf(ending);
  if(pos<0||!['\n  `;','\n  `;\n'].includes(css.content.slice(pos)))
    throw new Error('Конец файла CSS изменён. Ничего не записано.');
  const rules=`
    /* ${marker}: only Guardian Angel canon, traditional-script sections. */
    .rule-item.canon-guardian-angel-traditional-section .reader-label {
      display: none !important;
    }
    .rule-item.canon-guardian-angel-traditional-section .reader-inline .reader-inline-label {
      font-family: 'Ponomar', Georgia, serif !important;
      font-style: normal !important;
      color: var(--liturgical) !important;
    }
`;
  css.content=css.content.slice(0,pos)+rules+css.content.slice(pos);
  if(!files.every(f=>f.content.includes(marker)))throw new Error('Неполная подготовка исправления.');
  const backup='.backup-guardian-angel-trad-rubrics-v2-'+new Date().toISOString().replace(/[:.]/g,'-');
  const changed=[];
  try{
    for(const f of files)fs.writeFileSync(f.filename+backup,f.original,'utf8');
    for(const f of files){fs.writeFileSync(f.filename,f.content.replace(/\n/g,f.eol),'utf8');changed.push(f);}
  }catch(error){
    for(const f of changed)try{fs.writeFileSync(f.filename,f.original,'utf8');}catch(_){}
    throw error;
  }
  console.log('OK: убраны русские мелкие подписи Слава, И ныне, Тропарь, calendar.troparion.');
  console.log('OK: І҆рмо́съ, Припѣ́въ, І҆и҃сꙋ и Бг҃оро́диченъ — в начале соответствующего текста.');
  console.log('OK: открывающий Тропа́рь, гла́съ ѕ҃-й; кондак и седален — в ЦС-трад.');
  console.log('OK: другие каноны, RU, основной ЦС и Django не изменены.');
  console.log('Резервные копии: '+backup);
})();
