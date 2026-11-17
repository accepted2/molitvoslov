(function installGuardianAngelTraditionalCanonStyling() {
  const fs = require('fs');
  const path = require('path');
  const marker = 'GUARDIAN_ANGEL_TRADITIONAL_LABELS_20261117';
  const relativeFiles = [
    'src/screens/CanonScreen.js',
    'src/components/reader/selectableDocumentReader/styles.js',
  ];
  const files = relativeFiles.map(name => {
    const filename = path.join(process.cwd(), ...name.split('/'));
    if (!fs.existsSync(filename)) throw Error('Не найден: ' + name);
    const original = fs.readFileSync(filename, 'utf8');
    return {name, filename, original, eol: original.includes('\r\n') ? '\r\n' : '\n',
      code: original.replace(/\r\n/g, '\n')};
  });
  const [canon, css] = files;
  if (files.every(f => f.code.includes(marker))) {
    console.log('OK: оформление ЦС-трад канона Ангелу Хранителю уже установлено.');
    return;
  }
  if (files.some(f => f.code.includes(marker)))
    throw Error('Частично установленное исправление; ничего не изменено.');
  if (!canon.code.includes('THEOTOKOS_TRADITIONAL_RUBRICS_20261117'))
    throw Error('Сначала примени исправление рубрик предыдущего канона Богородице.');

  const replaceOnce = (file, from, to, meaning) => {
    const at = file.code.indexOf(from);
    if (at < 0 || file.code.indexOf(from, at+1) >= 0)
      throw Error(file.name+': не найден уникальный фрагмент ('+meaning+'). Ничего не записано.');
    file.code = file.code.replace(from, to);
  };

  const helpers = `
/* ${marker}: Guardian Angel canon, traditional variant only.
   Labels and headings are UI presentation; text and offsets remain unchanged. */
const isGuardianAngelCanon = (canon) => {
  const title = String(canon?.title || '').toLocaleLowerCase('ru-RU');
  return title.includes('ангел') && title.includes('хранител');
};
const GUARDIAN_ANGEL_ODE_NUMERALS = {
  1: 'а҃', 2: 'в҃', 3: 'г҃', 4: 'д҃', 5: 'є҃',
  6: 'ѕ҃', 7: 'з҃', 8: 'и҃', 9: 'ѳ҃',
};
const GUARDIAN_ANGEL_TRAD_TITLE = 'Канѡ́нъ А҆́гг҃лꙋ-Храни́телю';
const angelHeadingNormalized = (source) =>
  String(source || '').normalize('NFD')
    .replace(/[\\u0300-\\u036f\\u0483-\\u0487]/g, '')
    .replace(/ё/g,'е').replace(/a/g, 'а')
    .toLowerCase().trim();
const guardianTraditionalHeading = (source) => {
  const h = angelHeadingNormalized(source);
  if (/^тропар/u.test(h) && /глас/u.test(h) && /6/u.test(h))
    return 'Тропа́рь, гла́съ ѕ҃-й';
  if (/^канон/u.test(h) && /глас/u.test(h) && /8/u.test(h))
    return 'Канѡ́нъ, гла́съ и҃-й';
  if (/^седален/u.test(h) && /глас/u.test(h))
    return 'Сѣда́ленъ, гла́съ в҃-й';
  if (/^кондак/u.test(h) && /глас/u.test(h))
    return 'Конда́къ, гла́съ д҃-й';
  if (/^икос/u.test(h))
    return 'І҆́косъ';
  if (/^молитва/u.test(h) && /ангел/u.test(h))
    return 'Мл҃тва къ А҆́гг҃лꙋ-Храни́телю';
  const ode = /^песнь\\s*([1-9])/u.exec(h);
  if (ode)
    return 'Пѣ́снь '+(GUARDIAN_ANGEL_ODE_NUMERALS[Number(ode[1])]||ode[1]);
  return source || '';
};
const guardianAngelTraditionalInlineLabel = (section, sectionType, tradText) => {
  if (section?.suppress_inline_label) return '';
  const h = angelHeadingNormalized(section?.heading);
  const source = String(tradText || '');
  if (source.slice(0,90).includes('І҆и҃се') ||
      h.includes('иисус') || h.includes('иису'))
    return 'І҆и҃сꙋ:';
  switch (sectionType) {
    case 'irmos': return 'І҆рмо́съ:';
    case 'refrain': return 'Припѣ́въ:';
    case 'theotokion': return 'Бг҃оро́диченъ:';
    case 'troparion':
      // Only the opening tone-6 troparion has an explicit rubric. Within
      // odes, no "calendar.troparion" or generic troparion headings.
      return section?.ode_number ? '' :
        (/тропар/u.test(h) || /глас\\s*6/u.test(h)) ? 'Тропа́рь:' : '';
    case 'sedalen': return 'Сѣда́ленъ:';
    case 'kontakion': return 'Конда́къ:';
    case 'ikos': return 'І҆́косъ:';
    case 'prayer': return 'Мл҃тва:';
    case 'glory':
    case 'now':
    default: return '';
  }
};
`;
  replaceOnce(canon,
    'const getCanonInlineLabel = (section, text, t) => {',
    helpers+'\nconst getCanonInlineLabel = (section, text, t) => {',
    'помощники церковнославянских заголовков');
  replaceOnce(canon,
    `    const isTheotokosTraditional =
      showTraditional && canon.slug === THEOTOKOS_TRADITIONAL_SLUG;`,
    `    const isTheotokosTraditional =
      showTraditional && canon.slug === THEOTOKOS_TRADITIONAL_SLUG;
    const isGuardianAngelTraditional =
      showTraditional && isGuardianAngelCanon(canon);`,
    'отдельный режим ЦС-трад Ангелу Хранителю');

  const blockStart = canon.code.indexOf('      if (showTraditional && traditional) {');
  const blockEnd = canon.code.indexOf('      if (showChurch && church) {', blockStart);
  if (blockStart < 0 || blockEnd < 0) throw Error('Не найден блок традиционного текста.');
  let tradBlock = canon.code.slice(blockStart, blockEnd);
  const required = [
    'className: isTheotokosTraditional',
    "label: isTheotokosTraditional",
    'inlineLabel: isTheotokosTraditional',
  ];
  if (!required.every(x => tradBlock.includes(x)))
    throw Error('Неизвестный формат существующих традиционных блоков.');
  tradBlock = tradBlock.replace('className: isTheotokosTraditional',
    `className: isGuardianAngelTraditional
              ? 'canon-church canon-guardian-angel-traditional canon-' + effectiveSectionType
              : isTheotokosTraditional`);
  tradBlock = tradBlock.replace('label: isTheotokosTraditional',
    `label: isGuardianAngelTraditional ? '' : isTheotokosTraditional`);
  tradBlock = tradBlock.replace('inlineLabel: isTheotokosTraditional',
    `inlineLabel: isGuardianAngelTraditional
              ? guardianAngelTraditionalInlineLabel(displaySection, effectiveSectionType, traditional)
              : isTheotokosTraditional`);
  canon.code = canon.code.slice(0, blockStart)+tradBlock+canon.code.slice(blockEnd);

  replaceOnce(canon,
    `        sectionTitle = isTheotokosTraditional
          ? 'Пѣ́снь '`,
    `        sectionTitle = isGuardianAngelTraditional
          ? 'Пѣ́снь ' + (GUARDIAN_ANGEL_ODE_NUMERALS[odeNumber] || String(odeNumber))
          : isTheotokosTraditional
          ? 'Пѣ́снь '`,
    'названия песней в ЦС-трад');
  replaceOnce(canon,
    `          sectionTitle = isTheotokosTraditional`,
    `          sectionTitle = isGuardianAngelTraditional
            ? guardianTraditionalHeading(effectiveHeading)
            : isTheotokosTraditional`,
    'названия тропаря, седальна, кондака, икоса и молитвы');

  // Attach a class to the rendered section without changing the section's
  // ID, actual text or bookmark offsets; tolerate other canon patches.
  const sectionStart = canon.code.indexOf('      sections.push({',canon.code.indexOf('      let sectionTitle ='));
  const sectionEnd = canon.code.indexOf('      });',sectionStart);
  if(sectionStart<0||sectionEnd<0||canon.code.indexOf('    });',sectionEnd)<0)
    throw Error('Не найден цикл построения разделов канона.');
  canon.code = canon.code.slice(0,sectionEnd+'      });'.length)+`
      if (isGuardianAngelTraditional) {
        sections[sections.length - 1].className += ' canon-guardian-angel-traditional-section';
      }
`+canon.code.slice(sectionEnd+'      });'.length);

  replaceOnce(canon,
    `      title: isTheotokosTraditional`,
    `      title: isGuardianAngelTraditional
        ? GUARDIAN_ANGEL_TRAD_TITLE
        : isTheotokosTraditional`,
    'внутреннее название канона в ЦС-трад');
  if (canon.code.includes('justifyTraditionalDocumentTitle: isTheotokosTraditional,')) {
    replaceOnce(canon,
      'justifyTraditionalDocumentTitle: isTheotokosTraditional,',
      'justifyTraditionalDocumentTitle: isTheotokosTraditional || isGuardianAngelTraditional,',
      'оформление внутреннего заголовка без изменения шапки');
  }
  const terminator='\n  `;';
  const pos=css.code.lastIndexOf(terminator);
  if(pos<0||!['\n  `;', '\n  `;\n'].includes(css.code.slice(pos)))
    throw Error('Конец CSS читателя изменился.');

  const styles = `
    /* ${marker} — Guardian Angel canon, traditional tab only */
    .rule-item.canon-guardian-angel-traditional-section .reader-label {
      display:none !important;
    }
    .rule-item.canon-guardian-angel-traditional-section .section-header .prayer-title {
      font-family:'Ponomar', Georgia, serif !important;
      font-style:normal !important;
      font-weight:400 !important;
      font-size:21px;
      line-height:31px;
      color:var(--accent-dark) !important;
    }
    .rule-item.canon-guardian-angel-traditional-section .reader-inline .reader-inline-label {
      font-family:'Ponomar', Georgia, serif !important;
      font-style:normal !important;
      font-weight:400 !important;
      font-size:1em;
      line-height:inherit;
      color:var(--liturgical) !important;
      margin-right:6px;
    }
    .rule-item.canon-guardian-angel-traditional-section .reader-text.canon-guardian-angel-traditional {
      font-family:'Ponomar', Georgia, serif !important;
      text-align:justify !important;
      text-align-last:left !important;
    }
    .rule-item.canon-guardian-angel-traditional-section .reader-inline.prayer-inline:not(.canon-auto-long-label) .reader-inline-label,
    .rule-item.canon-guardian-angel-traditional-section .reader-inline.prayer-inline:not(.canon-auto-long-label) .reader-text {
      display:inline !important;
    }
    .rule-item.canon-guardian-angel-traditional-section .reader-inline.canon-auto-long-label .reader-inline-label,
    .rule-item.canon-guardian-angel-traditional-section .reader-inline.canon-auto-long-label .reader-text {
      display:block !important;
    }
    .rule-item.canon-guardian-angel-traditional-section .reader-inline.canon-auto-long-label .reader-inline-label {
      margin:0 0 3px !important;
    }
`;
  css.code=css.code.slice(0,pos)+styles+css.code.slice(pos);
  if(!files.every(x=>x.code.includes(marker)))
    throw Error('Изменение частичное, ничего не записано.');
  const backup='.backup-guardian-angel-trad-labels-'+new Date().toISOString().replace(/[:.]/g,'-');
  const updated=[];
  try{
    for(const file of files)fs.writeFileSync(file.filename+backup,file.original,'utf8');
    for(const file of files) {
      fs.writeFileSync(file.filename,file.code.replace(/\n/g,file.eol),'utf8');
      updated.push(file);
    }
  }catch(e){
    for(const file of updated)try{fs.writeFileSync(file.filename,file.original,'utf8');}catch(_){}
    throw e;
  }
  console.log('OK: канон Ангелу Хранителю — церковнославянские песни, гласы, седален, кондак, икос и молитва.');
  console.log('OK: Ирмос, Припев, Иисусу и Богородичен оформлены в начале текста.');
  console.log('OK: calendar.troparion и обычные подписи Тропарь скрыты в ЦС-трад.');
  console.log('OK: верхняя шапка остаётся русской, внутренний заголовок — ЦС-трад.');
  console.log('Резервные копии: '+backup);
})();
