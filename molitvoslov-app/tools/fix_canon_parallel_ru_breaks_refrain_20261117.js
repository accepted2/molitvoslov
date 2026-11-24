(function installCanonParallelRuPresentationFix() {
  const fs = require('fs');
  const path = require('path');
  const marker = 'CANON_PARALLEL_RU_BREAKS_NO_REFRAIN_LABEL_20261117';
  const relativeFiles = [
    'src/services/canonTypography.js',
    'src/screens/CanonScreen.js',
    'src/components/reader/selectableDocumentReader/styles.js',
  ];
  const files = relativeFiles.map(name => {
    const filename = path.join(process.cwd(), ...name.split('/'));
    if (!fs.existsSync(filename)) throw new Error('Не найден: ' + name);
    const original = fs.readFileSync(filename, 'utf8');
    return {name, filename, original, eol:original.includes('\r\n')?'\r\n':'\n', content:original.replace(/\r\n/g,'\n')};
  });
  if (files.every(file => file.content.includes(marker))) {
    console.log('OK: переносы Слава/И ныне и удаление подписи Припев в параллельном RU уже применены.');
    return;
  }
  if (files.some(file => file.content.includes(marker))) {
    throw new Error('Изменение уже частично присутствует. Ничего не записано.');
  }
  const [typography, screen, css] = files;
  const replaceOnce = (file, oldPart, newPart, label) => {
    const i = file.content.indexOf(oldPart);
    if (i < 0 || file.content.indexOf(oldPart, i + 1) >= 0) {
      throw new Error(file.name + ': не найден уникальный фрагмент (' + label + '). Ничего не изменено.');
    }
    file.content = file.content.replace(oldPart, newPart);
  };
  const anchor = `  const initials = [];

  // Keep the established short headings`;
  const addition = `  const initials = [];

  // ${marker}
  // In CS+RU, preserve the Russian column's subdued appearance. Insert only
  // visual line breaks after complete doxologies, not red initials or cues.
  // Suppress an author-supplied "Припев:" prefix visually without rewriting
  // the text used by selection, search, bookmarks or share links.
  if (options.parallelTranslation === true) {
    const mapped = normalizeWithOffsets(text);
    const breaks = new Set();
    const hidden = [];
    if (sectionType !== 'prayer') {
      const doxologies = [
        /слава\\s+(?:отцу|оцу),?\\s+и\\s+(?:сыну|сну),?\\s+и\\s+(?:святому|стому)\\s+(?:духу|дху)[ \\t]*[.:;!?]?/giu,
        /(?:и\\s+)?ныне,?\\s+и\\s+(?:присно|всегда),?\\s+(?:и\\s+)?во\\s*веки\\s+веков[ъ]?[ \\t]*[.,;:]?[ \\t]*амин[ьъ]?[ \\t]*[.!?]?/giu,
      ];
      for (const pattern of doxologies) {
        for (const match of mapped.normalized.matchAll(pattern)) {
          const lastOffset = mapped.offsets[match.index + match[0].length - 1];
          if (!Number.isInteger(lastOffset)) continue;
          // markAfter adds a BR position; use a throwaway initials list.
          markAfter(text, extendCombiningMarks(text, lastOffset + 1), breaks, []);
        }
      }
    }
    if (sectionType === 'refrain') {
      const rubric = /^\\s*(?:\\[\\s*припев\\s*\\]|припев\\s*[:.])\\s*/iu.exec(mapped.normalized);
      if (rubric && rubric[0].length && rubric[0].length < mapped.normalized.length) {
        const start = mapped.offsets[0];
        const lastOffset = mapped.offsets[rubric[0].length - 1];
        if (Number.isInteger(start) && Number.isInteger(lastOffset)) {
          hidden.push({
            start,
            end: extendCombiningMarks(text, lastOffset + 1),
            kind: 'parallel-refrain-label',
          });
        }
      }
    }
    return {
      ranges: hidden,
      breakBefore: [...breaks].sort((a,b) => a-b),
      standaloneInlineLabel: false,
      prayerProse: sectionType === 'prayer',
    };
  }

  // Keep the established short headings`;
  replaceOnce(typography,anchor,addition,'русские параллельные возгласы');

  replaceOnce(screen,
`        // Canon-specific visual ranges; never rewrite text or save offsets.
        canonTypography: isParallelTranslation
          ? null
          : buildCanonTypography(`,
`        // Canon-specific visual ranges; never rewrite text or save offsets.
        // ${marker}: CS+RU also needs non-coloring linebreak ranges.
        canonTypography: buildCanonTypography(`,
    'включить типографику в переводе');

  replaceOnce(screen,
`              {
                initialOnlyFirstParagraph: !!section.grouped_prayer,`,
`              {
                parallelTranslation: isParallelTranslation,
                initialOnlyFirstParagraph: !!section.grouped_prayer,`,
    'передача режима параллельного перевода');

  const endToken = '\n  `;';
  const tail = css.content.lastIndexOf(endToken);
  if (tail < 0 || tail < css.content.length-8) {
    // Ensure we only insert before the CSS template's terminating backtick.
    const suffix = css.content.slice(tail);
    if (!(suffix === '\n  `;\n' || suffix === '\n  `;')) {
      throw new Error(css.name + ': изменён конец стилей. Ничего не записано.');
    }
  }
  if (!['\n  `;','\n  `;\n'].includes(css.content.slice(tail)))
    throw new Error(css.name + ': конец CSS неизвестен. Ничего не записано.');
  const cssRules = `
    /* ${marker}: suppress only an embedded Russian "Припев:" rubric in
       CS+RU. The refrain itself stays visible, selectable and shareable. */
    .rule-item.canon-section .reader-text.canon-russian.canon-parallel-translation
      .canon-parallel-refrain-label {
      display: none !important;
    }
`;
  css.content = css.content.slice(0, tail) + cssRules + css.content.slice(tail);

  // Catch a malformed script before touching local files, including the
  // persisted Russian source and previously saved reader offsets.
  if (!files.every(file => file.content.includes(marker))) {
    throw new Error('Ошибка полноты правки. Ничего не записано.');
  }
  const backupSuffix = '.backup-canon-parallel-ru-20261117-' +
    new Date().toISOString().replace(/[:.]/g,'-');
  const written = [];
  try {
    for (const file of files) fs.writeFileSync(file.filename + backupSuffix,file.original,'utf8');
    for (const file of files) {
      fs.writeFileSync(file.filename,file.content.replace(/\n/g,file.eol),'utf8');
      written.push(file);
    }
  } catch (error) {
    for (const file of written) {
      try {fs.writeFileSync(file.filename,file.original,'utf8')} catch (_) {}
    }
    throw error;
  }
  console.log('OK: в параллельном CS+RU русский текст после «Слава...» и «И ныне...» начинается с новой строки.');
  console.log('OK: встроенная подпись «Припев:» скрыта только в русской колонке, текст припева сохранён.');
  console.log('OK: красные буквы в параллельный перевод не добавлены, данные Django не изменяются.');
  console.log('Резервные копии: '+backupSuffix);
})();
