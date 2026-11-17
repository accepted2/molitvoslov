(function fixCanonRussianNowAndGloryDivider() {
  const fs = require('fs');
  const path = require('path');
  const marker = 'CANON_RUSSIAN_NOW_GLORY_LINK_20261117';
  const files = [
    {name:'src/services/canonTypography.js'},
    {name:'src/screens/CanonScreen.js'},
    {name:'src/components/reader/selectableDocumentReader/styles.js'},
  ].map(item => {
    const file = path.join(process.cwd(), ...item.name.split('/'));
    if (!fs.existsSync(file)) throw new Error('Не найден файл: ' + item.name);
    const original = fs.readFileSync(file, 'utf8');
    return {...item, file, original, eol: original.includes('\r\n') ? '\r\n' : '\n', content: original.replace(/\r\n/g, '\n')};
  });

  if (files.every(item => item.content.includes(marker))) {
    console.log('OK: цвет русского «И ныне…» и разделители уже исправлены.');
    return;
  }
  if (files.some(item => item.content.includes(marker))) {
    throw new Error('Обнаружено частичное применение предыдущего исправления. Ничего не записано.');
  }
  const [typo, canon, styles] = files;
  const replaceOnce = (item, from, to, label) => {
    const pos = item.content.indexOf(from);
    if (pos === -1 || item.content.indexOf(from, pos + 1) !== -1) {
      throw new Error(item.name + ': не найден уникальный участок (' + label + '). Файлы не изменены.');
    }
    item.content = item.content.replace(from, to);
  };

  const oldDoxology = String.raw`/(?:и\s+)?ныне,?\s+и\s+присно,?\s+(?:и\s+)?во\s*веки\s+веков[ъ]?[ \t]*[.,;:]?[ \t]*амин[ьъ]?[ \t]*[.!?]?/giu,`;
  const newDoxology = String.raw`/(?:и\s+)?ныне,?\s+и\s+(?:присно|всегда),?\s+(?:и\s+)?во\s*веки\s+веков[ъ]?[ \t]*[.,;:]?[ \t]*амин[ьъ]?[ \t]*[.!?]?/giu,`;
  replaceOnce(typo, oldDoxology,
    `// ${marker}: 'И ныне, и всегда' in Russian is one red doxology.\n    ` + newDoxology,
    'русский вариант славословия');

  replaceOnce(canon,
    '    displaySections.forEach((section) => {',
    '    displaySections.forEach((section, sectionIndex) => {',
    'индекс элемента канона');

  replaceOnce(canon,
    `      sections.push({
        className: canon.slug === 'tri-sovmeshchennykh-kanona'`,
    `      // ${marker}: adjoining Glory / And now have no divider between them.
      const nextSection = displaySections[sectionIndex + 1];
      const nextSectionType = nextSection?.display_section_type || nextSection?.section_type;
      const isGloryBeforeNow =
        effectiveSectionType === 'glory' &&
        nextSectionType === 'now' &&
        Number(section.ode_number || 0) === Number(nextSection?.ode_number || 0);

      sections.push({
        className: (canon.slug === 'tri-sovmeshchennykh-kanona'`,
    'маркировка последовательных Слава и И ныне');

  replaceOnce(canon,
    `          : 'canon-section',

        progressAnchorId:`,
    `          : 'canon-section') + (isGloryBeforeNow ? ' canon-glory-before-now' : ''),

        progressAnchorId:`,
    'класс примыкающего славословия');

  const endToken = '\n  `;';
  if (!styles.content.endsWith(endToken + '\n') && !styles.content.endsWith(endToken)) {
    throw new Error('styles.js: изменён конец CSS-шаблона. Файлы не изменены.');
  }
  const patch = `
    /* ${marker}: only the Glory immediately preceding And now.
       Preserve the separator after And now and between independent hymns. */
    body:not(.book-mode) .rule-item.canon-section.canon-glory-before-now {
      border-bottom: none !important;
      margin-bottom: 0 !important;
      padding-bottom: 6px !important;
    }
`;
  const tailAt = styles.content.lastIndexOf(endToken);
  if (tailAt < 0) throw new Error('Не найден конец CSS-шаблона. Файлы не изменены.');
  styles.content = styles.content.slice(0, tailAt) + '\n' + patch +
    styles.content.slice(tailAt);

  const backupExt = '.backup-canon-ru-now-20261117-' +
    new Date().toISOString().replace(/[:.]/g, '-');
  const modified = [];
  try {
    for (const item of files) fs.writeFileSync(item.file + backupExt, item.original, 'utf8');
    for (const item of files) {
      fs.writeFileSync(item.file, item.content.replace(/\n/g, item.eol), 'utf8');
      modified.push(item);
    }
  } catch (error) {
    for (const item of modified) {
      try {fs.writeFileSync(item.file, item.original, 'utf8');} catch (_ignored) {}
    }
    throw error;
  }
  console.log('OK: в русской версии канона полное «И ныне, и всегда, и во веки веков, аминь.» выделяется красным.');
  console.log('OK: нет разделителя между непосредственно следующими друг за другом Слава и И ныне.');
  console.log('OK: церковнославянский исходник, русские тексты и остальные разделители не изменены.');
  console.log('Резервные копии файлов: ' + backupExt);
})();
