(function installTheotokosTraditionalDisplay() {
  const fs = require('fs');
  const path = require('path');
  const marker = 'THEOTOKOS_TRADITIONAL_RUBRICS_20261117';
  const list = [
    'src/screens/CanonScreen.js',
    'src/components/reader/selectableDocumentReader/styles.js',
  ];
  const files = list.map(name => {
    const filename = path.join(process.cwd(), ...name.split('/'));
    if (!fs.existsSync(filename)) throw new Error('Не найден файл: ' + name);
    const original = fs.readFileSync(filename, 'utf8');
    return {
      name, filename, original,
      eol: original.includes('\r\n') ? '\r\n' : '\n',
      content: original.replace(/\r\n/g, '\n'),
    };
  });
  if (files.every(file => file.content.includes(marker))) {
    console.log('OK: оформление ЦС-трад канона Богородице уже исправлено.');
    return;
  }
  if (files.some(file => file.content.includes(marker))) {
    throw new Error('Обнаружена частичная предыдущая установка. Данные не изменены.');
  }
  const [canon, styles] = files;
  const once = (file, before, after, label) => {
    const index = file.content.indexOf(before);
    if (index === -1 || file.content.indexOf(before, index + 1) !== -1) {
      throw new Error(file.name + ': изменился код (' + label + '). Файлы не изменены.');
    }
    file.content = file.content.replace(before, after);
  };

  const helpers = `
/* ${marker}
   UI-only rubrics for the Paraklesis canon's traditional-script tab.
   Do not mutate liturgical source or text offsets. */
const THEOTOKOS_TRADITIONAL_SLUG = 'kanon-molebnyy-ko-presvyatoy-bogoroditse';
const THEOTOKOS_TRADITIONAL_ODE = {
  1: 'а҃', 2: 'в҃', 3: 'г҃', 4: 'д҃', 5: 'є҃',
  6: 'ѕ҃', 7: 'з҃', 8: 'и҃', 9: 'ѳ҃',
};
const THEOTOKOS_TRADITIONAL_TITLE =
  'Канѡ́нъ моле́бный ко Прест҃ѣ́й Бцⷣѣ, пое́мый во всѧ́кой ско́рби дꙋше́внѣй и҆ ѡ҆бстоѧ́нїи';
const theotokosNormalizeHeading = (heading) =>
  String(heading || '').normalize('NFD')
    .replace(/[\\u0300-\\u036f\\u0483-\\u0487]/g, '')
    .replace(/ё/g, 'е').toLowerCase().trim();
const getTheotokosTraditionalHeading = (heading) => {
  const h = theotokosNormalizeHeading(heading);
  if (/^(?:канон|канѡн)/u.test(h) && /феостирик|ѳеостирик/u.test(h))
    return 'Канѡ́нъ. Творе́нїе Ѳеостирі́кта мона́ха. Гла́съ и҃-й';
  if (/^(?:псалом|ѱалом)\\s*50\\b/u.test(h))
    return 'Ѱало́мъ н҃';
  if (/^стихир/u.test(h) && /глас/u.test(h))
    return 'Стїхи́ры, гла́съ в҃-й';
  if (/^кондак/u.test(h) && /глас/u.test(h))
    return 'Конда́къ, гла́съ ѕ҃-й';
  if (/^молитва\\s+иная/u.test(h))
    return 'Моли́тва и҆на́ѧ ко Прест҃ѣ́й Бцⷣѣ';
  if (/^молитва\\s+ко/u.test(h))
    return 'Моли́тва ко Прест҃ѣ́й Бцⷣѣ';
  if (/^к\\s+богородице\\s+прилежно/u.test(h))
    return 'КЪ Бцⷣе прилѣ́жнѡ ны́нѣ притеце́мъ';
  if (/^песнь\\s*([1-9])/u.test(h)) {
    const match = /^песнь\\s*([1-9])/u.exec(h);
    return 'Пѣ́снь ' + (THEOTOKOS_TRADITIONAL_ODE[Number(match[1])] || match[1]);
  }
  return heading || '';
};
const getTheotokosTraditionalInlineLabel = (section, sectionType) => {
  if (section?.suppress_inline_label) return '';
  const h = theotokosNormalizeHeading(section?.heading);
  switch (sectionType) {
    case 'irmos':
      return 'І҆рмо́съ:';
    case 'refrain':
      return 'Припѣ́въ:';
    case 'theotokion':
      return 'Бг҃оро́диченъ:';
    case 'troparion':
      // Ordinary troparia have no printed "Тропарь" heading.
      if (/тропар/u.test(h) && /богородиц/u.test(h) && /глас/u.test(h))
        return 'Тропа́рь Бг҃оро́дице, гла́съ д҃-й:';
      if (/тропар/u.test(h) && /глас/u.test(h))
        return 'Тропа́рь, гла́съ в҃-й:';
      return '';
    case 'kontakion':
      return /глас/u.test(h)
        ? 'Конда́къ, гла́съ ѕ҃-й:' : 'Конда́къ:';
    case 'ikos':
      return 'И҆́косъ:';
    case 'sedalen':
      return 'Сѣда́ленъ:';
    case 'svetilen':
      return 'Свѣти́ленъ:';
    case 'prayer':
      if (/молитва\\s+иная/u.test(h))
        return 'Моли́тва и҆на́ѧ ко Прест҃ѣ́й Бцⷣѣ:';
      if (/молитва\\s+ко/u.test(h))
        return 'Моли́тва ко Прест҃ѣ́й Бцⷣѣ:';
      return 'Моли́тва:';
    case 'stichira':
      return 'Стїхи́ра:';
    // The doxologies are already present at the start of the source text.
    case 'glory':
    case 'glory_now':
    case 'now':
    default:
      return '';
  }
};

`;
  once(canon,
    'const getCanonInlineLabel = (section, text, t) => {',
    helpers + 'const getCanonInlineLabel = (section, text, t) => {',
    'вспомогательные традиционные рубрики');

  once(canon,
    `    const showTraditional = viewMode === MODE_TRADITIONAL;`,
    `    const showTraditional = viewMode === MODE_TRADITIONAL;
    const isTheotokosTraditional =
      showTraditional && canon.slug === THEOTOKOS_TRADITIONAL_SLUG;`,
    'режим ЦС-трад канона Богородице');

  const intro = canon.content.indexOf('      if (showTraditional && traditional) {');
  const end = canon.content.indexOf('      if (showChurch && church) {', intro);
  if (intro < 0 || end < 0) throw new Error('Не найден традиционный блок канона. Файлы не изменены.');
  let traditionalBlock = canon.content.slice(intro, end);
  if (traditionalBlock.includes('className: isPenitentialTraditional')) {
    traditionalBlock = traditionalBlock.replace(
      'className: isPenitentialTraditional',
      `className: isTheotokosTraditional
              ? 'canon-church canon-theotokos-traditional canon-' + effectiveSectionType
              : isPenitentialTraditional`);
  } else if (traditionalBlock.includes("className: 'canon-church',")) {
    traditionalBlock = traditionalBlock.replace(
      "className: 'canon-church',",
      `className: isTheotokosTraditional
              ? 'canon-church canon-theotokos-traditional canon-' + effectiveSectionType
              : 'canon-church',`);
  } else throw new Error('Неизвестное традиционное оформление. Файлы не изменены.');

  if (traditionalBlock.includes('label: isPenitentialTraditional')) {
    traditionalBlock = traditionalBlock.replace(
      'label: isPenitentialTraditional',
      "label: isTheotokosTraditional ? '' : isPenitentialTraditional");
  } else if (traditionalBlock.includes("label: canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label")) {
    traditionalBlock = traditionalBlock.replace(
      "label: canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label",
      "label: isTheotokosTraditional ? '' : (canon.slug === 'tri-sovmeshchennykh-kanona' ? '' : label)");
  } else if (traditionalBlock.includes("            label,\n")) {
    traditionalBlock = traditionalBlock.replace(
      "            label,\n",
      "            label: isTheotokosTraditional ? '' : label,\n");
  } else throw new Error('Неизвестный формат label. Файлы не изменены.');

  if (traditionalBlock.includes('inlineLabel: isPenitentialTraditional')) {
    traditionalBlock = traditionalBlock.replace(
      'inlineLabel: isPenitentialTraditional',
      `inlineLabel: isTheotokosTraditional
              ? getTheotokosTraditionalInlineLabel(displaySection, effectiveSectionType)
              : isPenitentialTraditional`);
  } else if (traditionalBlock.includes("inlineLabel: '',")) {
    traditionalBlock = traditionalBlock.replace(
      "inlineLabel: '',",
      `inlineLabel: isTheotokosTraditional
              ? getTheotokosTraditionalInlineLabel(displaySection, effectiveSectionType)
              : '',`);
  } else throw new Error('Неизвестный формат inlineLabel. Файлы не изменены.');

  canon.content = canon.content.slice(0, intro) + traditionalBlock + canon.content.slice(end);

  if (canon.content.includes('        sectionTitle = isPenitentialTraditional')) {
    once(canon,
      `        sectionTitle = isPenitentialTraditional`,
      `        sectionTitle = isTheotokosTraditional
          ? 'Пѣ́снь ' + (THEOTOKOS_TRADITIONAL_ODE[odeNumber] || String(odeNumber))
          : isPenitentialTraditional`,
      'заголовки песней после Покаянного канона');
  } else {
    once(canon,
      `        sectionTitle = t('reading.ode', {number: odeNumber});`,
      `        sectionTitle = isTheotokosTraditional
          ? 'Пѣ́снь ' + (THEOTOKOS_TRADITIONAL_ODE[odeNumber] || String(odeNumber))
          : t('reading.ode', {number: odeNumber});`,
      'заголовки песней');
  }
  once(canon,
    `          sectionTitle = effectiveHeading;`,
    `          sectionTitle = isTheotokosTraditional
            ? getTheotokosTraditionalHeading(effectiveHeading)
            : effectiveHeading;`,
    'заголовки псалма, канона, стихир и молитв');

  // The user's previous canon patch can decorate the very same section.
  // Add this scoped class after sections.push, without modifying any IDs.
  const listStart = canon.content.indexOf('      sections.push({', canon.content.indexOf('      let sectionTitle ='));
  const listEnd = canon.content.indexOf('      });', listStart);
  if (listStart < 0 || listEnd < 0 || canon.content.indexOf('    });', listEnd) < 0)
    throw new Error('Не найден раздел секций канона. Файлы не изменены.');
  const classAddition = `
      if (isTheotokosTraditional) {
        sections[sections.length - 1].className += ' canon-theotokos-traditional-section';
      }
`;
  canon.content = canon.content.slice(0, listEnd + '      });'.length) + classAddition +
    canon.content.slice(listEnd + '      });'.length);

  // Document title belongs to the current language tab; don't apply to RU.
  once(canon,
    `      title: getLocalizedField(canon, 'title', language) || title || t('reading.canon'),`,
    `      title: isTheotokosTraditional
        ? THEOTOKOS_TRADITIONAL_TITLE
        : getLocalizedField(canon, 'title', language) || title || t('reading.canon'),`,
    'название документа в режиме ЦС-трад');
  once(canon,
    `        title={getLocalizedField(canon, 'title', language) || title || t('reading.canon')}`,
    `        title={viewMode === MODE_TRADITIONAL &&
          canon.slug === THEOTOKOS_TRADITIONAL_SLUG
            ? THEOTOKOS_TRADITIONAL_TITLE
            : getLocalizedField(canon, 'title', language) || title || t('reading.canon')}`,
    'верхний заголовок');

  const endStyles = '\n  `;';
  const position = styles.content.lastIndexOf(endStyles);
  if (position < 0 || !['\n  `;', '\n  `;\n'].includes(styles.content.slice(position)))
    throw new Error('Неизвестный конец шаблона CSS. Файлы не изменены.');
  const stylePatch = `
    /* ${marker}: only Theotokos Paraklesis / traditional script. */
    .rule-item.canon-theotokos-traditional-section .reader-label {
      display: none !important;
    }
    .rule-item.canon-theotokos-traditional-section .section-header .prayer-title {
      font-family: 'Ponomar', Georgia, serif !important;
      font-style: normal !important;
      font-weight: 400 !important;
      font-size: 21px;
      line-height: 31px;
      color: var(--accent-dark) !important;
    }
    .rule-item.canon-theotokos-traditional-section .reader-inline .reader-inline-label {
      font-family: 'Ponomar', Georgia, serif !important;
      font-style: normal !important;
      font-weight: 400 !important;
      font-size: 1em;
      line-height: inherit;
      color: var(--liturgical) !important;
      margin-right: 6px;
    }
    .rule-item.canon-theotokos-traditional-section .reader-text.canon-theotokos-traditional {
      font-family: 'Ponomar', Georgia, serif !important;
      text-align: justify !important;
      text-align-last: left !important;
    }
    .rule-item.canon-theotokos-traditional-section .reader-inline.prayer-inline:not(.canon-auto-long-label) .reader-inline-label,
    .rule-item.canon-theotokos-traditional-section .reader-inline.prayer-inline:not(.canon-auto-long-label) .reader-text {
      display: inline !important;
    }
    .rule-item.canon-theotokos-traditional-section .reader-inline.canon-auto-long-label .reader-inline-label,
    .rule-item.canon-theotokos-traditional-section .reader-inline.canon-auto-long-label .reader-text {
      display: block !important;
    }
    .rule-item.canon-theotokos-traditional-section .reader-inline.canon-auto-long-label .reader-inline-label {
      margin-bottom: 3px;
      margin-right: 0;
    }
`;
  styles.content = styles.content.slice(0, position) + stylePatch +
    styles.content.slice(position);
  if (!files.every(file => file.content.includes(marker)))
    throw new Error('Неполная подготовка изменений. Файлы не изменены.');
  const suffix = '.backup-theotokos-traditional-labels-20261117-' +
    new Date().toISOString().replace(/[:.]/g, '-');
  const written = [];
  try {
    for (const file of files) fs.writeFileSync(file.filename + suffix, file.original, 'utf8');
    for (const file of files) {
      fs.writeFileSync(file.filename, file.content.replace(/\n/g, file.eol), 'utf8');
      written.push(file);
    }
  } catch (error) {
    for (const file of written) {
      try { fs.writeFileSync(file.filename, file.original, 'utf8'); } catch (_) {}
    }
    throw error;
  }
  console.log('OK: канон Богородице ЦС-трад — песни и цифры церковнославянские.');
  console.log('OK: Ирмос, Припев, Богородичен, Кондак и молитвы — рубрики перед текстом.');
  console.log('OK: вместо calendar.troparion обычные тропари без подписи.');
  console.log('OK: названия Псалма 50, канона, стихир и гласы переведены на ЦС.');
  console.log('OK: другие режимы чтения, тексты, идентификаторы и закладки сохранены.');
  console.log('Резервные копии: ' + suffix);
})();
