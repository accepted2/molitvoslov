import {READER_RUNTIME} from './runtime';
import {READER_STYLES} from './styles';

export const HTML_TEMPLATE = String.raw`
<!doctype html>
<html lang="ru">
<head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
  />

  <style>
${READER_STYLES}
</style>
</head>

<body>
  <div id="book-viewport">
    <main id="reader"></main>
  </div>

  <div
    id="start-handle"
    class="selection-handle"
  ></div>

  <div
    id="end-handle"
    class="selection-handle"
  ></div>

  <div id="reader-scroll-track">
    <div id="reader-scroll-thumb"></div>
  </div>

  <button
    id="reader-scroll-top"
    type="button"
    aria-label="Наверх"
  >
    ↑
  </button>

  <div
    id="book-page-indicator"
    aria-hidden="true"
  ></div>

  <div id="selection-bar">
    <div class="selection-info">
      <div id="selection-count"></div>
      <div id="selection-hint">
        Выделенный фрагмент
      </div>
    </div>

    <button
      id="selection-cancel"
      type="button"
    >
      ×
    </button>

    <button
      id="selection-save"
      type="button"
    >
      Сохранить
    </button>
  </div>

  <script>
${READER_RUNTIME}
</script>
</body>
</html>
`;
