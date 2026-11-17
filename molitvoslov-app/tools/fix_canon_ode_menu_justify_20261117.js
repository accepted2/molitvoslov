(function installCanonOdeActionsAndJustification() {
  const fs = require('fs');
  const path = require('path');
  const cssPath = path.join(process.cwd(), 'src/components/reader/selectableDocumentReader/styles.js');
  const runtimePath = path.join(process.cwd(), 'src/components/reader/selectableDocumentReader/runtime.js');
  const canonPath = path.join(process.cwd(), 'src/screens/CanonScreen.js');
  const marker = 'CANON_ODE_MENU_JUSTIFY_20261117';
  for (const filename of [cssPath, runtimePath, canonPath]) {
    if (!fs.existsSync(filename)) throw new Error('Не найден: ' + filename);
  }
  const original = fs.readFileSync(cssPath, 'utf8');
  const runtime = fs.readFileSync(runtimePath, 'utf8');
  const canon = fs.readFileSync(canonPath, 'utf8');
  if (original.includes(marker)) {
    console.log('OK: оформление действий и выравнивания канонов уже применено.');
    return;
  }
  if (!runtime.includes("header.appendChild(createReaderActionMenu(") ||
      !runtime.includes("sectionSave,createShareButton('section',sectionIndex)") ||
      !runtime.includes("reader.querySelectorAll('.reader-action-menu.is-open')")) {
    throw new Error('Рендер меню ⋮ отличается от проверенной версии. Ничего не изменено.');
  }
  if (!canon.includes("'canon-section'") ||
      !canon.includes("sectionTitle = t('reading.ode'")) {
    throw new Error('Разметка песней канона отличается от проверенной версии. Ничего не изменено.');
  }
  if (!original.includes('.rule-item.canon-section .reader-text.canon-church') ||
      !original.includes('.reader-inline .reader-text {') ||
      !original.includes('.reader-action-menu.is-open')) {
    throw new Error('CSS канонов или меню ⋮ отличается. Ничего не изменено.');
  }
  const tail = '\n  `;';
  if (!original.endsWith(tail + '\n') && !original.endsWith(tail))
    throw new Error('Не найден конец CSS-шаблона. Ничего не изменено.');
  const patch = `
    /* ${marker}
       У песней канона остаётся только меню ⋮ в заголовке.
       Сохранение/удаление из избранного и передача доступны внутри ⋮.
       Прямые иконки за пределами меню не показываем. */
    body:not(.book-mode) .rule-item.canon-section .section-header > .section-action,
    body:not(.book-mode) .rule-item.canon-section .section-header > .document-action,
    body:not(.book-mode) .rule-item.canon-section .section-header > .inline-share-action,
    body:not(.book-mode) .rule-item.canon-section .section-header > .section-share-action {
      display: none !important;
    }
    body:not(.book-mode) .rule-item.canon-section .section-header.has-reader-action-menu
      > .reader-action-container {
      display: block !important;
    }
    /* Both Russian and Church Slavonic canon text are justified. In a block
       with an inline rubric (e.g., Ирмос/Припев) the actual line box belongs
       to .reader-inline, not to its inline .reader-text child. */
    body:not(.book-mode) .rule-item.canon-section .reader-column,
    body:not(.book-mode) .rule-item.canon-section .reader-inline,
    body:not(.book-mode) .rule-item.canon-section .reader-text.canon-church,
    body:not(.book-mode) .rule-item.canon-section .reader-text.canon-russian {
      text-align: justify !important;
      text-align-last: left !important;
      text-justify: inter-word !important;
      overflow-wrap: break-word;
      word-break: normal;
      -webkit-hyphens: auto;
      hyphens: auto;
    }
`;
  const updated = original.slice(0, original.length - tail.length - (original.endsWith('\n') ? 1 : 0)) +
    patch + tail + (original.endsWith('\n') ? '\n' : '');
  if (!updated.includes(marker) || !updated.includes('text-align: justify !important;')) {
    throw new Error('Не удалось проверить результат. Ничего не изменено.');
  }
  const backup = cssPath + '.backup-canon-menu-justify-20261117-' +
    new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(backup, original, 'utf8');
  try {
    fs.writeFileSync(cssPath, updated, 'utf8');
  } catch (error) {
    fs.writeFileSync(cssPath, original, 'utf8');
    throw error;
  }
  console.log('OK: в канонах оставлено меню ⋮, а отдельные кнопки в заголовках песней скрыты.');
  console.log('OK: основной текст канонов выровнен по ширине, включая строки с Ирмосом и Припевом.');
  console.log('Встроенные команды сохранить/поделиться остаются внутри меню ⋮.');
  console.log('Резервная копия: ' + backup);
})();
