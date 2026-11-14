export const READER_STYLES = String.raw`
    @font-face {
      font-family: 'Ponomar';
      src: url("__PONOMAR_FONT_URL__") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: block;
    }

    :root {
      --background: #FFF4DE;
      --surface: #F8E9CF;
      --text: #3E2A1D;
      --secondary: #765238;
      --muted: #9B806A;
      --accent: #A16E35;
      --accent-dark: #7A4F2D;
      --liturgical: #9B3B32;
      --border: rgba(123, 79, 36, 0.20);
      --saved: rgba(194, 145, 73, 0.24);
      --active: rgba(161, 110, 53, 0.22);
      --handle: #9A693A;
      --book-font-size: 16.5px;
      --book-line-height: 21.8px;
      --book-drop-cap-size: 45px;
    }
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--background);
      color: var(--text);
      font-family: Georgia, "Times New Roman", serif;
      overscroll-behavior: contain;
    }
    body {
      --reader-top-padding: __READER_TOP_PADDING__px;
      --reader-bottom-padding: __READER_BOTTOM_PADDING__px;
      padding: var(--reader-top-padding) 14px var(--reader-bottom-padding);
    }

    /* Inline saint/calendar reading keeps the same custom fragment-selection
       engine, without creating an editable Android text field. */
    body.embedded-reader {
      padding: 0 !important;
      margin: 0 !important;
      overflow: hidden;
    }
    body.embedded-reader .rule-item {
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }
    body.embedded-reader .reader-row,
    body.embedded-reader .reader-column {
      margin: 0 !important;
      padding: 0 !important;
    }
    body.embedded-reader #reader-scroll-track,
    body.embedded-reader #reader-scroll-top,
    body.embedded-reader .document-header,
    body.embedded-reader .view-switcher {
      display: none !important;
    }
    /* Selection gestures stay in the WebView; the save bar is the same
       app-wide React Native selection bar used in prayer categories. */
    body.embedded-reader #selection-bar,
    body.embedded-reader .selection-handle {
      display: none !important;
    }
    body.embedded-reader .reader-text {
      white-space: pre-line;
      -webkit-user-select: none;
      user-select: none;
    }

    .reader-language-traditional .reader-text,
    .reader-language-traditional .reader-inline-label {
      font-family: 'Ponomar', Georgia, "Times New Roman", serif;
      font-weight: 400;
      font-variant-ligatures: common-ligatures;
    }
    /* The combined Three Canons' traditional UCS source has been
       converted to real Unicode Church Slavonic. Ponomar renders the
       letters, accents and titla without the original ASCII glyph codes.
       Restore subtle separators between distinct prayers and stanzas.
       Refrains also need their own divider before the following troparion. */
    .rule-item.three-combined-traditional.three-combined-paragraph {
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(123, 79, 36, 0.20);
    }
    .rule-item.three-combined-traditional.three-combined-refrain {
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(123, 79, 36, 0.20);
    }
    .rule-item.three-combined-traditional.three-combined-heading {
      margin-top: 14px;
      margin-bottom: 11px;
      padding-bottom: 9px;
      border-bottom: 1px solid rgba(123, 79, 36, 0.24);
    }
    .rule-item.three-combined-traditional .reader-column.reader-language-traditional .reader-text {
      font-family: 'Ponomar', Georgia, serif;
      font-size: 18px;
      line-height: 1.8;
      font-weight: 400;
      font-synthesis: none;
      font-variant-ligatures: common-ligatures;
    }
    .rule-item.three-combined-traditional .reader-column.reader-language-traditional .canon-initial {
      color: var(--liturgical) !important;
      font-weight: 400 !important;
      text-transform: none !important;
    }
    /* Traditional headings are now Unicode as well. */
    .rule-item.three-combined-canon.three-combined-traditional .section-title,
    .rule-item.three-combined-canon.three-combined-traditional .section-header .prayer-title {
      font-family: 'Ponomar', Georgia, serif;
      font-size: 20px;
      line-height: 1.5;
      font-weight: 400;
      font-style: normal;
      font-variant-ligatures: common-ligatures;
      color: var(--secondary);
    }
    /* Заголовки Псалтири в традиционном церковнославянском режиме */
.psalter-traditional-headings .rule-title,
.psalter-traditional-headings .section-header .prayer-title {
  font-family: 'Ponomar', Georgia, serif;
  font-weight: 400;
  font-variant-ligatures: common-ligatures;
}
    .view-switcher {
      display: flex;
      gap: 4px;
      margin: 0 0 14px;
      padding: 4px;
      border: 1px solid rgba(123, 79, 36, 0.18);
      border-radius: 14px;
      background: rgba(161, 110, 53, 0.10);
      font-family: system-ui, -apple-system, sans-serif;
    }
    .view-switcher-button {
      flex: 1;
      min-height: 38px;
      padding: 0 8px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: #765238;
      font-size: 12px;
      font-weight: 700;
    }
    .view-switcher-button.active {
      background: #7A4F2D;
      color: #FFF8EA;
      box-shadow: 0 1px 3px rgba(90, 56, 34, 0.14);
    }
    .view-switcher-button:disabled {
      opacity: 0.32;
    }
    .rule-title {
      margin: 0 0 12px;
      text-align: center;
      color: var(--accent-dark);
      font-size: 26px;
      line-height: 32px;
      font-weight: 700;
    }
    .rule-description {
      margin: -5px 0 18px;
      color: var(--secondary);
      font-size: 14px;
      line-height: 21px;
      font-style: italic;
    }
    .rule-item {
      position: relative;
      margin-bottom: 14px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .rule-item:last-child {
      border-bottom: 0;
    }
    .rule-item.whole-saved {
      margin-left: -8px;
      margin-right: -8px;
      padding: 10px 8px 14px;
      border-radius: 12px;
      background: rgba(161, 110, 53, 0.075);
      box-shadow: inset 0 0 0 1px rgba(123, 79, 36, 0.18);
    }
    /* Saved psalm styling must not include the separate "Glory..." prayer. */
    .rule-item.psalter-psalm-section.whole-saved {
      margin-left: 0;
      margin-right: 0;
      padding: 0 0 14px;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .rule-item.psalter-psalm-section.whole-saved .psalter-psalm-verses-row {
      margin-left: -8px;
      margin-right: -8px;
      padding: 10px 8px;
      border-radius: 12px;
      background: rgba(161, 110, 53, 0.075);
      box-shadow: inset 0 0 0 1px rgba(123, 79, 36, 0.18);
    }
    .document-action-row {
      display: flex;
      justify-content: center;
      margin: -6px 0 16px;
    }
    .document-action {
      display: flex;
      min-height: 36px;
      padding: 0 14px;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: var(--surface);
      color: var(--secondary);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      line-height: 18px;
      font-weight: 700;
      white-space: nowrap;
    }
    .document-action.active {
      color: var(--accent-dark);
      background: #F1DFC2;
      border-color: rgba(123, 79, 36, 0.28);
    }
    .document-header {
      position: relative;
      display: flex;
      min-height: 40px;
      margin-bottom: 12px;
      align-items: center;
      justify-content: center;
    }
    .document-header .rule-title {
      width: 100%;
      margin: 0;
      padding: 0 44px;
    }
    .document-header .document-action {
      position: absolute;
      top: 50%;
      right: 0;
      display: flex;
      width: 36px;
      height: 36px;
      min-width: 36px;
      min-height: 36px;
      padding: 0;
      transform: translateY(-50%);
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: rgba(241, 223, 194, 0.94);
      color: var(--secondary);
    }
    .document-header .document-action.active {
      color: var(--accent-dark);
      background: #F1DFC2;
      border-color: rgba(123, 79, 36, 0.28);
    }
    /* In the kathisma reader hearts sit on the left, opposite their previous position. */
    .psalter-kathisma-reader .document-header .document-action,
    body:not(.book-mode) .psalter-kathisma-reader .section-action {
      left: 0;
      right: auto;
    }
    body:not(.book-mode) .section-header {
      position: relative;
      min-height: 34px;
      margin-bottom: 8px;
      justify-content: center;
    }
    body:not(.book-mode) .section-header .prayer-title {
      width: 100%;
      margin-bottom: 0;
      padding: 0 40px;
      text-align: center;
    }
    body:not(.book-mode) .section-action {
      position: absolute;
      top: 50%;
      right: 0;
      display: flex;
      width: 36px;
      height: 36px;
      min-width: 36px;
      min-height: 36px;
      padding: 0;
      transform: translateY(-50%);
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: rgba(241, 223, 194, 0.94);
      color: var(--secondary);
    }
    body:not(.book-mode) .section-action.active {
      color: var(--accent-dark);
      background: #F1DFC2;
      border-color: rgba(123, 79, 36, 0.28);
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .section-header .prayer-title {
      flex: 1;
      margin-bottom: 0;
    }
    .title-tail {
      display: inline-block;
      max-width: 100%;
      white-space: normal;
    }
    .section-action {
      display: flex;
      width: 36px;
      height: 36px;
      min-width: 36px;
      min-height: 36px;
      padding: 0;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: var(--surface);
      color: var(--secondary);
    }
    .section-action.active {
      color: var(--accent-dark);
    }
    /* Psalms in a kathisma use one small three-dot menu on the left.
       Other prayer sections retain their paired save/share controls. */
    .psalter-kathisma-reader .document-header .rule-title {
      padding-left:0;
      padding-right:0;
    }
    .psalter-kathisma-reader .psalter-psalm-section .psalter-menu-header {
      position:relative;
      min-height:34px;
      justify-content:center;
    }
    .psalter-kathisma-reader .psalter-psalm-section
      .psalter-menu-header .prayer-title {
      padding-left:42px;
      padding-right:42px;
    }
    .psalter-kathisma-reader .psalter-psalm-section .psalter-psalm-menu {
      position:absolute;
      left:0;
      right:auto;
      top:50%;
      transform:translateY(-50%);
      display:flex;
      align-items:center;
      justify-content:center;
      width:32px;
      min-width:32px;
      height:32px;
      padding:0;
      border-radius:16px;
      border:1px solid var(--border);
      background:rgba(241,223,194,.94);
      /* Fixed dark glyph on the existing light control background. */
      color:#4B301D;
      font-family:Georgia,serif;
      font-size:23px;
      line-height:29px;
      cursor:pointer;
      touch-action:manipulation;
    }
    /* Consistent paired actions across akathists, canons, kathismas,
       miscellaneous prayers and liturgical hours. No changes to text spans. */
    .inline-share-action {
      width: 34px;
      height: 34px;
      min-width: 34px;
      min-height: 34px;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: 17px;
      color: var(--secondary);
      background: rgba(241,223,194,.94);
      cursor: pointer;
      touch-action: manipulation;
    }
    .inline-share-action svg {pointer-events:none}
    .document-header .document-share-action {
      position:absolute;
      top:50%;
      right:0;
      transform:translateY(-50%);
    }
    .document-header .rule-title {
      padding-right:82px;
    }
    .document-header .document-action {
      right:39px;
    }
    .psalter-kathisma-reader .document-header .document-action {
      left:0;
      right:auto;
    }
    .section-header .section-share-action {
      flex:0 0 34px;
    }
    body:not(.book-mode) .section-header .section-share-action {
      position:absolute;
      top:50%;
      right:0;
      transform:translateY(-50%);
    }
    body:not(.book-mode) .section-header.has-share-action .section-action {
      right:39px;
    }
    body:not(.book-mode) .psalter-kathisma-reader .section-header.has-share-action .section-action {
      left:0;
      right:auto;
    }
    body:not(.book-mode) .section-header.has-share-action .prayer-title {
      padding-right:82px;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion {
      position:relative;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion-toggle {
      padding-right:82px;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion > .section-share-action {
      position:absolute;
      right:10px;
      top:7px;
      z-index:2;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion > .hours-accordion-save {
      position:absolute;
      display:flex;
      align-items:center;
      justify-content:center;
      top:7px;
      right:49px;
      left:auto;
      width:34px;
      height:34px;
      min-width:34px;
      min-height:34px;
      transform:none;
      z-index:2;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion:has(.hours-accordion-save)
      > .hours-accordion-toggle {padding-right:122px;}

    .save-heart-icon {
      display: block;
      width: 19px;
      height: 19px;
      flex: 0 0 19px;
      overflow: visible;
      pointer-events: none;
    }
    .prayer-title, .section-title {
      margin: 0 0 10px;
      text-align: center;
      color: var(--accent-dark);
      font-size: 19px;
      line-height: 25px;
      font-weight: 700;
    }
    .section-title {
      color: #5A3822;
      font-size: 20px;
    }
    .description {
      margin: 0 4px 8px;
      color: var(--liturgical);
      font-size: 13px;
      line-height: 20px;
      font-style: italic;
    }
    .description.after {
      margin-top: 8px;
      margin-bottom: 0;
    }
    .note {
      margin-top: 8px;
      color: var(--accent);
      font-size: 13px;
      line-height: 20px;
      font-style: italic;
    }
    .instruction {
      color: var(--accent-dark);
      font-size: 14px;
      line-height: 22px;
      font-style: italic;
    }
    .section-content {
      color: var(--text);
      font-size: 16px;
      line-height: 26px;
    }
    .reader-row {
      margin-bottom: 10px;
    }
    .reader-row:last-child {
      margin-bottom: 0;
    }
    /* Separate the final psalm verse from the following Glory prayer. */
    .psalter-kathisma-reader .reader-row.psalter-glory-row {
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      margin-top: 12px;
      margin-bottom: 12px;
      padding-top: 12px;
      padding-bottom: 12px;
    }
    /* The section already has its own bottom divider: avoid a double line
       when Glory is the final row (notably before the 17th kathisma prayers). */
    .psalter-kathisma-reader .rule-item .reader-row.psalter-glory-row:last-child {
      border-bottom: 0;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .reader-row-parallel {
      display: flex;
      flex-direction: row;
      align-items: stretch;
    }
    .reader-column {
      min-width: 0;
      flex: 1;
    }
    .reader-row-parallel .reader-column {
      padding: 0 9px;
    }
    .reader-row-parallel .reader-column:first-child {
      padding-left: 0;
      border-right: 1px solid var(--border);
    }
    .reader-row-parallel .reader-column:last-child {
      padding-right: 0;
    }
    .reader-label {
      margin-bottom: 5px;
      color: var(--accent);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      line-height: 15px;
      font-weight: 800;
      letter-spacing: 0.25px;
    }
    .reader-text.secondary {
      color: var(--secondary);
      font-size: 16px;
      line-height: 25px;
    }
    /* User-authored prayers are displayed as text, never as an editable field.
       Preserve their own line breaks and paragraph boundaries. */
    .reader-text.personal-prayer {
      white-space: pre-line;
      overflow-wrap: break-word;
      text-align: justify;
    }
    .reader-text.akathist-church {
      color: var(--text);
      font-size: 17px;
      line-height: 24px;
    }
    .reader-text.akathist-russian {
      color: var(--secondary);
      font-size: 16px;
      line-height: 23px;
    }
    .reader-text.psalter {
    white-space: pre-line;
  text-align: justify;
  text-align-last: left;
  text-justify: inter-word;
  word-break: normal;
  overflow-wrap: normal;
  -webkit-hyphens: manual;
  hyphens: manual;
  /*-webkit-hyphenate-character: "‐";*/
  /*hyphenate-character: "‐";*/
  /*hyphenate-limit-chars: 5 2 2;*/
    }
.reader-text .psalter-verse-number {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
}
/* Красные буквенные номера стихов только в традиционном ЦС. */
.reader-language-traditional .reader-text.psalter .psalter-verse-number,
.reader-language-traditional .reader-text.psalter .psalter-verse-number .liturgical-word {
  color: #B22222 !important;
}
.reader-text.psalter.secondary .psalter-verse-number {

  color: var(--color-late-gray);
}
/* Parenthesized "(Поклон)" is a brown rubric in ordinary prayers,
   including CS/RU parallel rows. The Psalter keeps its own styling. */
.reader-text .rubric-bow,
.reader-text .rubric-bow.liturgical-word,
.reader-text .rubric-bow .liturgical-word,
.reader-text .rubric-bow * {
  color: var(--secondary) !important;
  font-style: normal !important;
}

.reader-text .psalter-prayer-initial {
  color: var(--liturgical);
  font-weight: 700;
}

.reader-text .psalter-prayer-rubric {
  color: var(--secondary);
  font-style: italic;
  font-weight: 600;
}

.reader-text .psalter-prayer-rubric-block {
  display: block;
  margin: 1px 0;
}

/* In the Russian prayer after the Psalter, the bow rubric is followed
   by an explicit newline. Do not add an extra block break before the prayer. */
.reader-text.psalter-reading-prayers .psalter-civil-bow-rubric-compact {
  display: inline !important;
  margin: 0 !important;
  padding-bottom: 0 !important;
}
.reader-text .psalter-prayer-rubric-inline {
  display: inline;
  margin: 0;
}

.reader-text .psalter-prayer-rubric-separator-before,
.reader-text .psalter-prayer-rubric-separator-after {
  position: relative;
  display: block;
}

.reader-text .psalter-prayer-rubric-separator-before {
  padding-top: 6px;
  margin-top: 2px;
}

.reader-text .psalter-prayer-rubric-separator-after {
  padding-bottom: 6px;
  margin-bottom: 2px;
}

.reader-text .psalter-prayer-rubric-separator-before::before,
.reader-text .psalter-prayer-rubric-separator-after::after {
  content: "";
  position: absolute;
  left: 5%;
  width: 90%;
  height: 1px;
  background: rgba(123, 79, 36, 0.22);
}

.reader-text .psalter-prayer-rubric-separator-before::before {
  top: 0;
}

.reader-text .psalter-prayer-rubric-separator-after::after {
  bottom: 0;
}

.reader-text.psalter-prayer {
  white-space: pre-line;
  text-align: justify;
  text-align-last: auto;
}

.psalter-shared-rubric {
  margin: 2px 0 12px;
  color: var(--secondary);
  font-size: 14px;
  line-height: 20px;
  font-style: italic;
  font-weight: 600;
  text-align: center;
}

.reader-text.psalter-reading-prayers,
.reader-text.psalter-reading-prayers.secondary {
  font-size: 15px;
  line-height: 23px;
  font-weight: 400;
  font-style: normal;
}

.reader-text.psalter-reading-prayers:not(.secondary) {
  text-align: justify;
  text-align-last: left;
}
/* Consistent rubric red in all non-traditional before/after Psalter prayers.
   The traditional Church Slavonic rendering retains its own palette. */
.reader-text.psalter-reading-prayers {
  --liturgical: #B22222;
}
.reader-language-traditional .reader-text.psalter-reading-prayers {
  --liturgical: #9B3B32;
}
/* Keep "глас 6" together: if it does not fit, move both words. */
.reader-text.psalter-reading-prayers .psalter-civil-tropar-tone {
  display: inline !important;
  white-space: nowrap !important;
  overflow-wrap: normal !important;
  word-break: keep-all !important;
}
.reader-text.psalter-reading-prayers .psalter-civil-tropar-tone * {
  white-space: nowrap !important;
  overflow-wrap: normal !important;
}

/* Only the Church Slavonic column in parallel Psalter prayers. */
.reader-row-parallel .reader-column:first-child .reader-text.psalter-reading-prayers {
  overflow-wrap: normal;
  word-break: normal;
  hyphens: manual;
  -webkit-hyphens: manual;
}

.reader-language-traditional .reader-text.psalter-reading-prayers {
  text-align: justify;
  text-align-last: left;
}


/* Traditional pre-Psalter introduction: heading color, original typeface and weight. */
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-opening-heading,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-opening-heading .liturgical-word {
  color: #765238 !important;
  font-style: normal !important;
}

/* Keep all styled pieces of a prayer heading inside one centered line. */
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-title-line {
  display: block;
  width: 100%;
  text-align: center;
  text-align-last: center;
  white-space: normal;
}
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-title-line .psalter-standalone-center-title {
  display: inline !important;
  width: auto;
}
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-bow,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-bow .liturgical-word {
  color: #765238 !important;
  font-weight: 400 !important;
  font-style: normal !important;
}
/* The Trinity prayer heading is centered without an underline. */
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-center-title {
  display: block;
  width: 100%;
  text-align: center;
  text-align-last: center;
  color: #765238 !important;
  font-style: normal !important;
  font-weight: 400 !important;
  word-break: normal;
  overflow-wrap: normal;
}
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-center-title .liturgical-word {
  display: inline !important;
  color: inherit !important;
  font-style: inherit !important;
  font-weight: inherit !important;
}
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-mercy,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-mercy .liturgical-word {
  color: #B22222 !important;
  font-style: normal !important;
  font-weight: 400 !important;
}
/* Closing instruction after the three invitations is entirely a rubric. */
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-final-rubric,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-final-rubric .liturgical-word {
  color: #765238 !important;
  font-weight: 400 !important;
  font-style: italic !important;
}
/* Initials of prayer paragraphs (not rubrics or headings). */
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-prayer-initial,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-prayer-initial .liturgical-word {
  color: #B22222 !important;
  font-style: normal !important;
  font-weight: 400 !important;
}
/* Traditional Ephrem prayer: red initial and the three bow instructions. */
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-ephrem-initial,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-ephrem-initial .liturgical-word,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-ephrem-bow,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-ephrem-bow .liturgical-word {
  color: #B22222 !important;
  font-style: normal !important;
  font-weight: 400 !important;
}
/* Psalter: standalone prayers before/after reading, traditional Ponomar. */
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-heading,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-heading .liturgical-word {
  color: #765238 !important;
  font-weight: 700 !important;
  font-style: normal !important;
  display: inline;
}
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-heading .liturgical-word {
  display: inline !important;
}
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-rubric,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-rubric .liturgical-word {
  color: #765238 !important;
  font-style: italic !important;
  font-weight: 400 !important;
}
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-glory,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-glory .liturgical-word {
  color: #B22222 !important;
  font-weight: 700 !important;
  font-style: normal !important;
}
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-mercy,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-standalone-mercy .liturgical-word {
  color: #B22222 !important;
  font-weight: 400 !important;
  font-style: normal !important;
}

/* Opening Psalter prayers: red mercy response, except the unchanged Ponomar view. */
.reader-text.psalter-reading-prayers:not(.reader-language-traditional) .psalter-civil-before-mercy,
.reader-text.psalter-reading-prayers:not(.reader-language-traditional) .psalter-civil-before-mercy .liturgical-word {
  color: #B22222 !important;
  font-style: normal !important;
}

/* Civil Psalter Trinity heading: the entire second line shares the first line's style. */
.reader-text.psalter-reading-prayers .psalter-civil-trinity-second-line {
  display: block;
  width: 100%;
  text-align: center;
  text-align-last: center;
  color: var(--secondary) !important;
  font-weight: 700;
  font-style: normal;
}
.reader-text.psalter-reading-prayers .psalter-civil-trinity-second-line *,
.reader-text.psalter-reading-prayers .psalter-civil-trinity-second-line .liturgical-word {
  color: var(--secondary) !important;
  font-weight: 700 !important;
  font-style: normal !important;
}

/* Keep the complete threefold mercy response on a single visual line. */
.reader-text.psalter-reading-prayers .psalter-civil-mercy-together {
  display: inline-block;
  white-space: nowrap;
}
/* Parallel CS + RU: do not force the whole mercy phrase into one narrow column line. */
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-mercy-together {
  display: block;
  width: 100%;
  white-space: normal !important;
  max-width: 100%;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-parallel-mercy-words {
  display: block !important;
  width: 100%;
  white-space: nowrap !important;
  text-align: left;
  text-align-last: left;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-parallel-mercy-words > span,
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-parallel-mercy-words .liturgical-word {
  display: inline !important;
  white-space: nowrap !important;
}
/* The repeat note gets its own visual line in parallel pre-Psalter prayer. */
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-parallel-repeat-note {
  display: block !important;
  width: 100%;
  white-space: nowrap !important;
  text-align: left;
  text-align-last: left;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-parallel-repeat-note > span {
  display: inline !important;
  white-space: nowrap !important;
}

/* The note is a single ordinary text line; redundant source blank
   lines are removed by the renderer rather than hidden with negative margins. */
.reader-row-parallel .reader-column:first-child .reader-text.psalter-reading-prayers .psalter-parallel-repeat-note {
  margin: 0 !important;
  padding: 0 !important;
  line-height: inherit !important;
}
/* Match the ordinary prayer text size while preserving the Trinity title wrapping. */
.reader-row-parallel .reader-column:first-child .reader-text.psalter-reading-prayers .psalter-civil-trinity-second-line {
  font-size: inherit;
  line-height: inherit;
  word-break: normal;
  overflow-wrap: normal;
  hyphens: manual;
  -webkit-hyphens: manual;
}

/* Keep only the mercy words together in narrow parallel columns. */
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-mercy-together .psalter-civil-before-mercy {
  white-space: nowrap !important;
  display: inline-block;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-mercy-together > span:first-child {
  white-space: nowrap;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-mercy-together .psalter-repeat-note {
  display: block;
  white-space: nowrap;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-mercy-together .psalter-prayer-rubric-block {
  display: block;
}
.reader-text.psalter-reading-prayers .psalter-civil-mercy-together .psalter-prayer-rubric-block {
  display: inline;
  margin: 0;
}

/* Trisagion after Psalter reading: rubric stays brown, mercy words red. */
.reader-text.psalter-reading-prayers .psalter-civil-after-mercy,
.reader-text.psalter-reading-prayers .psalter-civil-after-mercy .liturgical-word {
  color: #B22222 !important;
  font-style: normal !important;
}
/* Keep post-Psalter mercy words, comma and repeat instruction together. */
.reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together,
.reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together * {
  display: inline !important;
  white-space: nowrap !important;
  word-break: keep-all !important;
  overflow-wrap: normal !important;
}
.reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together {
  display: inline-block;
  white-space: nowrap !important;
}
.reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together .psalter-prayer-rubric-block {
  display: inline !important;
  margin: 0;
}
/* Parallel CS + RU only: allow the "(Трижды.)" note to wrap as
   a whole when it does not fit beside "Господи, помилуй". */
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together {
  display: inline !important;
  width: auto !important;
  white-space: normal !important;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together > span {
  white-space: normal !important;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together .psalter-repeat-note,
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together .psalter-prayer-rubric,
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-civil-after-mercy-together .psalter-prayer-rubric * {
  display: inline !important;
  white-space: nowrap !important;
}

/* Threefold note AFTER Psalter: its own line in parallel CS + RU only. */
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-parallel-after-repeat-note {
  display: block !important;
  width: 100%;
  white-space: nowrap !important;
  text-align: left;
  text-align-last: left;
}
.reader-row-parallel .reader-text.psalter-reading-prayers .psalter-parallel-after-repeat-note > span {
  display: inline !important;
  white-space: nowrap !important;
}

/* Final blessing after Psalter: red response while retaining rubric styling. */
.reader-text.psalter-reading-prayers .psalter-civil-final-response,
.reader-text.psalter-reading-prayers .psalter-civil-final-response .liturgical-word {
  color: #B22222 !important;
  font-style: normal !important;
  font-weight: 700 !important;
}
.reader-text.psalter-reading-prayers .paragraph-gap {
  height: 0;
}

.reader-text.psalter-reading-prayers .psalter-prayer-gap-hidden {
  display: none;
}

.reader-text .psalter-prayer-separator {
  display: block;
  width: 90%;
  height: 1px;
  margin: 4px auto;
  background: rgba(123, 79, 36, 0.22);
}

.reader-text.psalter-glory {
  white-space: pre-line;
  text-align: justify;
  text-align-last: auto;
}
/* Традиционное церковнославянское славословие */
.reader-language-traditional .reader-text.psalter-glory {
  font-family: 'Ponomar', serif;
  font-weight: 400;
  font-size: 18px;
  line-height: 1.65;
  color: #2B190F;

  letter-spacing: normal;
  word-spacing: normal;
  text-align: left;
  text-align-last: left;

  overflow-wrap: normal;
  word-break: normal;
  -webkit-hyphens: none;
  hyphens: none;

  font-variant-ligatures: common-ligatures;
  font-synthesis: none;
}

/* Обычный текст славословия */
.reader-language-traditional .reader-text.psalter-glory,
.reader-language-traditional .reader-text.psalter-glory .liturgical-word {
  color: #2B190F;
  font-weight: 400;
}

/* Красным только специально отмеченные строки */
.reader-language-traditional .reader-text.psalter-glory .psalter-glory-red,
.reader-language-traditional .reader-text.psalter-glory .psalter-glory-red .liturgical-word {
  color: #B22222;
  font-weight: 400;
}

/* Подсказка поминовения */
.reader-language-traditional .reader-text.psalter-glory .memorial-rubric-text {
  color: var(--secondary);
  font-family: 'Ponomar', serif;
  font-weight: 400;
  font-style: italic;
}

.reader-text .memorial-rubric-text {
  color: var(--secondary);
  font-size: 14px;
  line-height: 21px;
  font-style: italic;
}

.reader-text .memorial-open-marker {
  display: block;
  width: min(100%, 260px);
  min-height: 40px;
  margin: 8px auto 2px;
  padding: 0;
  border: 1px solid rgba(123, 79, 36, 0.24);
  border-radius: 12px;
  background: rgba(138, 90, 56, 0.08);
  font-size: 0;
  line-height: 0;
  text-align: center;
  text-align-last: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.reader-text .memorial-open-marker::after {
  content: attr(data-label);
  display: flex;
  min-height: 38px;
  padding: 0 14px;
  align-items: center;
  justify-content: center;
  color: var(--accent-dark);
  font-family: serif;
  font-size: 14px;
  line-height: 19px;
  font-weight: 700;
  letter-spacing: 0.1px;
}

.reader-text .memorial-open-marker:active {
  background: rgba(138, 90, 56, 0.14);
}

.reader-text .psalter-prayer-accent {
  color: var(--liturgical);
  font-weight: 700;
}

.reader-text .psalter-prayer-meta {
  color: var(--secondary);
  font-style: italic;
  font-weight: 600;
}

.reader-text .psalter-prayer-title {
  display: block;
  margin: 0;
  color: var(--secondary);
  font-weight: 700;
  font-style: normal;
  text-align: center;
    text-align-last: center;
}
/* Keep "Молитва" in the Psalter's original subdued brown.
   The reader can wrap a liturgical span inside this heading, which must
   inherit the heading palette instead of becoming red. */
.rule-item.psalter-post-kathisma-part .section-header .prayer-title,
.reader-text.psalter-prayer .psalter-prayer-title,
.reader-text.psalter-reading-prayers .psalter-prayer-title,
.reader-text.psalter-prayer .psalter-prayer-title .liturgical-word,
.reader-text.psalter-reading-prayers .psalter-prayer-title .liturgical-word {
  color: #765238 !important;
}
.reader-text .psalter-repeat-note,
.reader-language-traditional .reader-text.psalter-glory .psalter-repeat-note {
  color: #765238 !important;
  font-weight: 700 !important;
  font-style: italic !important;
  white-space: nowrap;
}

/* The repeat note in standalone traditional Psalter prayers is a plain rubric. */
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-repeat-note,
.reader-language-traditional .reader-text.psalter-reading-prayers .psalter-repeat-note .liturgical-word {
  color: #765238 !important;
  font-weight: 400 !important;
  font-style: normal !important;
  white-space: nowrap;
}

.reader-text.psalter-reading-prayers .liturgical-word {
  color: var(--liturgical);
  font-style: italic;
  font-weight: 600;
}
.reader-language-traditional .reader-text.psalter-prayer .psalter-first-kathisma-intro,
.reader-language-traditional .reader-text.psalter-prayer .psalter-first-kathisma-intro .liturgical-word {
  color: #765238 !important;
  font-weight: 400 !important;
  font-style: normal !important;
}
.reader-language-traditional .reader-text.psalter-prayer .psalter-prayer-tropar-heading,
.reader-language-traditional .reader-text.psalter-prayer .psalter-prayer-tropar-heading .liturgical-word {
  color: #765238 !important;
  font-weight: 700 !important;
  font-style: normal !important;
}
.reader-language-traditional .reader-text.psalter-prayer .psalter-traditional-mercy,
.reader-language-traditional .reader-text.psalter-prayer .psalter-traditional-mercy .liturgical-word {
  color: #B22222 !important;
  font-weight: 400 !important;
  font-style: normal !important;
}
.reader-language-traditional .reader-text.psalter-prayer .psalter-traditional-prayer-title {
  display: block;
  margin: 9px 0 -30px;
  line-height: 1.15;
  color: var(--accent-dark) !important;
  font-family: 'Ponomar', serif;
  font-weight: 400;
  text-align: center;
  text-align-last: center;
}
.reader-language-traditional .reader-text.psalter-prayer .psalter-traditional-prayer-red,
.reader-language-traditional .reader-text.psalter-prayer .psalter-traditional-prayer-red .liturgical-word {
  color: #B22222 !important;
  font-weight: 400;
}
.reader-language-traditional .reader-text.psalter-prayer .psalter-traditional-and-now,
.reader-language-traditional .reader-text.psalter-prayer .psalter-traditional-and-now .liturgical-word {
  color: #B22222 !important;
  font-weight: 700 !important;
}
/* The final prayer of kathisma 20 is body text, not a red rubric. */
.reader-language-traditional .reader-text.psalter-prayer .psalter-last-kathisma-prayer-body,
.reader-language-traditional .reader-text.psalter-prayer .psalter-last-kathisma-prayer-body .liturgical-word {
  color: #2B190F !important;
  font-weight: 400 !important;
  font-style: normal !important;
}
.reader-language-traditional .reader-text.psalter-prayer .psalter-traditional-prayer-red {
  color: #B22222;
  font-family: 'Ponomar', serif;
  font-weight: 400;
}

    /* Akathists use the same heading brown as the other reader categories. */
    body:not(.book-mode) .rule-item.akathist-section .section-header .prayer-title {
      /* Override the runtime injected generic heading color: var(--text) !important. */
      color: #765238 !important;
      font-style: normal;
    }
    /* Entire invocations (not only their initial letters) are red in every tab. */
    .reader-text .akathist-initial,
    .reader-text .akathist-initial .liturgical-word {
      color: var(--liturgical) !important;
      font-weight: 700;
      font-style: normal;
    }
    /* WebView keeps Alleluia and its punctuation together if it must wrap. */
    .reader-text .akathist-alleluia {
      display: inline-block;
      white-space: nowrap;
      color: var(--liturgical) !important;
      font-weight: 700;
      font-style: normal;
    }
    .reader-text .akathist-alleluia span,
    .reader-text .akathist-alleluia .liturgical-word {
      color: inherit !important;
    }
    .reader-text.canon-church {
      color: var(--text);
      font-size: 17px;
      line-height: 26px;
    }
    .reader-text.canon-russian {
      color: var(--secondary) !important;
      font-size: 16px;
      line-height: 24px;
      font-style: normal !important;
      font-weight: 400 !important;
    }
    /* CS + RU canon: match the subdued translation style used for prayers.
       Only the original hymn receives liturgical red initials and cues. */
    .rule-item.canon-section .reader-text.canon-russian.canon-parallel-translation {
      color: var(--secondary) !important;
      font-size: 16px;
      line-height: 26px;
      font-style: normal !important;
      font-weight: 400 !important;
    }
    .rule-item.canon-section .reader-text.canon-parallel-translation .liturgical-word {
      color: inherit !important;
      font-style: inherit !important;
      font-weight: inherit !important;
    }
    /* Justified canon text with browser-side automatic hyphenation.
       CSS never modifies the source, saved text, or selection offsets. */
    .rule-item.canon-section .reader-text.canon-church,
    .rule-item.canon-section .reader-text.canon-russian {
      text-align: justify !important;
      text-align-last: left !important;
      text-justify: inter-word !important;
      word-spacing: normal !important;
      overflow-wrap: break-word;
      word-break: normal;
      -webkit-hyphens: auto;
      hyphens: auto;
      -webkit-hyphenate-character: "‐";
      hyphenate-character: "‐";
      hyphenate-limit-chars: 6 3 3;
    }
    .reader-text.canon-russian .liturgical-word, .reader-text.akathist-russian .liturgical-word {
      color: inherit;
      font-style: inherit;
      font-weight: inherit;
    }
    .rule-item.canon-section .section-header .prayer-title {
      color: var(--accent-dark);
      font-size: 18px;
      line-height: 23px;
      font-weight: 700;
    }
    /* Only canonical hymn sections use these visual decorations.
       No source string or selection offset is modified by their styles. */
    .rule-item.canon-section .reader-text .canon-initial,
    .rule-item.canon-section .reader-text .canon-initial .liturgical-word {
      color: var(--liturgical) !important;
      text-transform: uppercase;
      font-weight: 700;
      font-style: normal;
    }
    .rule-item.canon-section .reader-text .canon-short-cue,
    .rule-item.canon-section .reader-text .canon-short-cue .liturgical-word,
    .rule-item.canon-section .reader-text .canon-glory-cue,
    .rule-item.canon-section .reader-text .canon-glory-cue .liturgical-word,
    .rule-item.canon-section .reader-text .canon-prayer-cue,
    .rule-item.canon-section .reader-text .canon-prayer-cue .liturgical-word,
    .rule-item.canon-section .reader-text .canon-long-cue,
    .rule-item.canon-section .reader-text .canon-long-cue .liturgical-word,
    .rule-item.canon-section .reader-text .canon-doxology,
    .rule-item.canon-section .reader-text .canon-doxology .liturgical-word {
      color: var(--liturgical) !important;
      font-weight: 700;
    }
    .rule-item.canon-section .reader-text .canon-long-cue,
    .rule-item.canon-section .reader-text .canon-short-cue,
    .rule-item.canon-section .reader-text .canon-prayer-cue {
      font-style: italic;
    }
    .rule-item.canon-section .reader-text .canon-short-cue.canon-initial,
    .rule-item.canon-section .reader-text .canon-prayer-cue.canon-initial,
    .rule-item.canon-section .reader-text .canon-glory-cue {
      font-style: normal;
    }
    .rule-item.canon-section .reader-text .canon-repeat-note,
    .rule-item.canon-section .reader-text .canon-repeat-note .liturgical-word {
      color: #765238 !important;
      font-weight: 600;
      font-style: normal;
      white-space: nowrap;
    }
    /* Traditional three combined canons: [Три́жды.], [Покло́нъ.],
       [Три́жды и покло́ны трѝ.] and numeral counts are quiet rubrics,
       not red prayer text. Keep superscripts and titla in Ponomar. */
    .rule-item.three-combined-traditional .reader-text .canon-repeat-note,
    .rule-item.three-combined-traditional .reader-text .canon-repeat-note .liturgical-word {
      color: #765238 !important;
      font-family: 'Ponomar', Georgia, serif;
      font-size: 0.94em;
      font-weight: 400 !important;
      font-style: normal !important;
      text-transform: none !important;
      white-space: nowrap;
    }
    /* The nested generic liturgical span must not shrink twice. */
    .rule-item.three-combined-traditional .reader-text .canon-repeat-note .liturgical-word {
      font-size: inherit;
    }
    /* Scoped to the traditional Three Combined Canons.
       "Подо́бенъ:" alone is the red rubric; the melody title stays brown.
       Two named invocations after prayers are red in full. */
    .rule-item.three-combined-traditional .reader-text .canon-podoben-cue,
    .rule-item.three-combined-traditional .reader-text .canon-podoben-cue .liturgical-word,
    .rule-item.three-combined-traditional .reader-text .canon-full-refrain,
    .rule-item.three-combined-traditional .reader-text .canon-full-refrain .liturgical-word {
      color: var(--liturgical) !important;
      font-family: 'Ponomar', Georgia, serif;
      font-style: normal !important;
      font-weight: 400 !important;
      text-transform: none !important;
    }
    .rule-item.canon-section .reader-inline.canon-long-label .reader-inline-label {
      display: block;
      margin-right: 0;
      margin-bottom: 3px;
    }
    .rule-item.canon-section .reader-inline.canon-long-label .reader-text {
      display: block;
    }
    .reader-inline {
      display: block;
    }
    .reader-inline-label {
      display: inline;
      margin-right: 5px;
      color: var(--liturgical);
      font-size: 16px;
      line-height: 26px;
      font-weight: 700;
      font-style: italic;
    }
    .canon-leading-cue {
      color: var(--liturgical);
      font-weight: 700;
      font-style: italic;
    }
    .canon-leading-cue.canon-short-cue {
      font-style: normal;
    }
    .canon-leading-cue.prayer-leading-cue {
      display: block;
      margin-bottom: 4px;
    }
    .reader-inline .reader-text {
      display: inline;
    }
    .reader-inline.prayer-inline .reader-inline-label {
      display: block;
      margin-right: 0;
      margin-bottom: 4px;
    }
    .reader-inline.prayer-inline .reader-text {
      display: block;
    }
    .reader-text {
      color: var(--text);
      font-size: 17px;
      line-height: 29px;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: normal;
      -webkit-hyphens: auto;
      hyphens: auto;
      -webkit-hyphenate-character: "‐";
      hyphenate-character: "‐";
      hyphenate-limit-chars: 6 3 3;
      text-align: justify;
      text-align-last: auto;
      text-justify: inter-word;
      touch-action: pan-y;
    }
    body.book-mode {
      width: 100vw;
      height: 100.5vh;
      overflow: hidden;
      padding: var(--reader-top-padding) 0 var(--reader-bottom-padding);
      touch-action: none;
      text-align: justify;
      background:
        radial-gradient(circle at 16% 8%, rgba(170, 118, 62, 0.055), transparent 28%),
        radial-gradient(circle at 82% 78%, rgba(145, 94, 49, 0.045), transparent 34%),
        linear-gradient(
          90deg,
          rgba(166, 112, 50, 0.115) 0%,
          rgba(166, 112, 50, 0.050) 3.5%,
          transparent 8%,
          transparent 92%,
          rgba(166, 112, 50, 0.050) 96.5%,
          rgba(166, 112, 50, 0.115) 100%
        ),
        linear-gradient(
          180deg,
          rgba(151, 98, 43, 0.045) 0%,
          transparent 8%,
          transparent 92%,
          rgba(151, 98, 43, 0.050) 100%
        ),
        var(--book-paper,#FBF0D9);
      box-shadow: inset 0 0 24px rgba(110, 70, 30, 0.10);
    }

    body.book-mode::after {
      content: "";
      position: fixed;
      inset: 0;
      z-index: 996;
      pointer-events: none;
      box-shadow:
        inset 12px 0 20px -15px rgba(139, 87, 34, 0.36),
        inset -12px 0 20px -15px rgba(139, 87, 34, 0.36),
        inset 0 10px 20px -17px rgba(139, 87, 34, 0.24),
        inset 0 -10px 20px -17px rgba(139, 87, 34, 0.24);
    }

    body.book-mode.book-night {
      --background: #171310;
      --surface: #211A16;
      --text: #E8D8C5;
      --secondary: #BBA48E;
      --muted: #8F7C6B;
      --accent: #C49A62;
      --accent-dark: #D1AE7A;
      --liturgical: #D98578;
      --border: rgba(218, 185, 143, 0.16);
      --saved: rgba(194, 145, 73, 0.18);
      --active: rgba(208, 164, 104, 0.20);
      --handle: #D2A66E;
      background:
        radial-gradient(circle at 15% 10%, rgba(115, 82, 53, 0.10), transparent 30%),
        radial-gradient(circle at 85% 80%, rgba(104, 72, 47, 0.08), transparent 34%),
        linear-gradient(
          90deg,
          rgba(0, 0, 0, 0.30) 0%,
          rgba(0, 0, 0, 0.10) 5%,
          transparent 10%,
          transparent 90%,
          rgba(0, 0, 0, 0.10) 95%,
          rgba(0, 0, 0, 0.30) 100%
        ),
        var(--book-paper,#171310);
      box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.30);
    }

    /* A user-selected colour must be flat: no old parchment/brown texture
       bleeding through on chapter switches or when changing the palette. */
    body.book-mode.book-custom {
      background: var(--book-paper, #FFF4DE);
      box-shadow: none;
    }
    body.book-mode.book-night::after {
      box-shadow:
        inset 12px 0 20px -15px rgba(0, 0, 0, 0.72),
        inset -12px 0 20px -15px rgba(0, 0, 0, 0.72),
        inset 0 10px 20px -17px rgba(0, 0, 0, 0.56),
        inset 0 -10px 20px -17px rgba(0, 0, 0, 0.56);
    }
    body.book-mode.book-custom::after {
      box-shadow: none;
    }

    body.book-mode.book-night .bible-chapter-start .prayer-title {
      color: #D0AA77;
    }

    body.book-mode.book-night .reader-inline-label {
      color: #C28D52;
    }

    body.book-mode.book-night .reader-text.bible-verse {
      color: var(--book-body-color,#E7D7C6);
    }

    body.book-mode.book-night .bible-drop-cap {
      color: #D06F5F;
      text-shadow: none;
    }
    #book-viewport {
      display: contents;
    }
    body.book-mode #book-viewport {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      overscroll-behavior: none;
      contain: paint;
    }
    body.book-mode #reader {
      width: 100%;
      height: 100%;
      min-height: 0;
      max-width: none;
      margin: 0;
      padding: 0;
    }
    body.book-mode #reader.book-track {
      position: relative;
      display: block;
      overflow: hidden;
    }
    body.book-mode .book-page {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      padding: 0 8px;
      overflow: hidden;
      box-sizing: border-box;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      transform: translateZ(0);
    }
    body.book-mode .book-page.active {
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
    }
    body.book-mode .rule-title {
      margin: 0 0 4px;
      padding: 0 26px;
      color: #3E2A1D;
      font-size: 23px;
      line-height: 29px;

      letter-spacing: 0.10px;
    }
    body.book-mode .rule-description {
      margin: 0 0 8px;
      text-align: center;
      color: #8B694D;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 12px;
      line-height: 18px;
      font-style: normal;
      letter-spacing: 0.35px;
    }
    body.book-mode .rule-item, body.book-mode .rule-item:last-child {
      margin: 0;
      padding: 0;
      border-bottom: 0;
    }
    body.book-mode .bible-chapter-start {
      padding-top: 2px;

    }
    body.book-mode .bible-chapter-start .section-header {
      margin: 0 0 2px;
      padding: 0 4px 2px 2px;

    }
    body.book-mode .bible-chapter-start .prayer-title {
      margin-left: 54px;
      text-align: center;
      color: #7A5134;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15px;
      line-height: 19px;
      font-weight: 700;
      letter-spacing: 0.16px;

    }
    body.book-mode .bible-chapter-start .section-action {
      display: flex;
      min-width: 36px;
      width: 36px;
      height: 36px;
      min-height: 36px;

      margin-right: 0;
      padding: 0;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 18px;
      color: var(--secondary);
      background: rgba(241, 223, 194, 0.94);
      font-size: inherit;
      line-height: normal;
    }
    body.book-mode .bible-chapter-start .section-action.active {
      color: var(--accent-dark);
      background: #F1DFC2;
      border-color: rgba(123, 79, 36, 0.28);

    }
    body.book-mode .bible-verse-section.whole-saved {
      position: relative;
      z-index: 0;
      margin: 0;
      padding: 0;

      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    body.book-mode .bible-chapter-start.whole-saved {
      padding-top: 5px;

    }
    body.book-mode .bible-verse-section.whole-saved::before {
      content: "";
      position: absolute;

      z-index: -1;
      top: 0;
      bottom: 0;
      left: -9px;
      right: -9px;
      background: rgba( 161, 110, 53, 0.085 );
      pointer-events: none;
    }
    body.book-mode .bible-verse-section.whole-saved.saved-run-start::before {
      top: -6px;
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
    }
    body.book-mode .bible-verse-section.whole-saved.saved-run-end::before {
      bottom: -7px;
      border-bottom-left-radius: 16px;
      border-bottom-right-radius: 16px;
    }
    body.book-mode .bible-verse-section.whole-saved.saved-run-start.saved-run-end::before {
      border-radius: 15px;
    }
    body.book-mode .reader-row, body.book-mode .reader-row:last-child {
      margin-bottom: 0;
    }
    body.book-mode .reader-column {
      padding: 0;
    }
    body.book-mode .reader-inline-label {
      margin-right: 2px;
      color: #A06B34;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 9px;
      line-height: 1;
      font-weight: 700;
      font-style: normal;

      vertical-align: super;
    }
    /* Keep the cross-reference button outside the selectable Scripture text,
       but flow it after the last word of the verse (not after its number). */
    body.book-mode .reader-inline.has-bible-crossrefs {
      text-align: justify;
      text-align-last: auto;
      text-justify: inter-word;
    }
    body.book-mode .reader-inline.has-bible-crossrefs .reader-text.bible-verse {
      display: inline;
    }
    body.book-mode .bible-crossref-button {
      display: inline-block;
      min-width: 15px;
      min-height: 17px;
      margin-left: 2px;
      padding: 0 2px;
      border: none;
      background: transparent;
      color: #93693E;
      font-family: Georgia, serif;
      font-size: 12px;
      font-style: normal;
      font-weight: 600;
      line-height: 1.1;
      vertical-align: baseline;
      white-space: nowrap;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
    }
    body.book-mode.book-night .bible-crossref-button {
      color: #D3A16E;
    }
    body.book-mode .reader-text {
      touch-action: none;

    }
    body.book-mode .reader-text.bible-verse {
      color: var(--book-body-color,#3C2A20);
      font-family: Georgia, "Times New Roman", serif;
      font-size: var(--book-font-size);
      line-height: var(--book-line-height);
      letter-spacing: -0.03px;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: normal;
      -webkit-hyphens: auto;
      hyphens: auto;
      -webkit-hyphenate-character: "‐";
      hyphenate-character: "‐";
      hyphenate-limit-chars: 6 3 3;
      text-align: justify;
      text-align-last: auto;
      text-justify: inter-word;
    }

    @keyframes bible-calendar-passage-flash {
      0%, 47% { background-color: rgba(201, 166, 88, 0.29); }
      100% { background-color: transparent; }
    }
    body.book-mode .bible-verse-section.calendar-passage-verse .reader-text.bible-verse {
      animation: bible-calendar-passage-flash 2100ms ease-out both;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      border-radius: 2px;
    }
    /* The book-mode rule above is more specific than the generic reader
       language rule. Apply Ponomar explicitly to CSL Bible glyphs and
       diacritics, otherwise Android WebView falls back to Georgia. */
    body.book-mode .reader-language-traditional .reader-text.bible-verse {
      font-family: 'Ponomar', Georgia, serif;
      font-weight: 400;
      font-synthesis: none;
      font-variant-ligatures: common-ligatures;
      overflow-wrap: normal;
      word-break: normal;
      -webkit-hyphens: manual;
      hyphens: manual;
    }
    body.book-mode .reader-language-traditional .bible-drop-cap {
      font-family: 'Ponomar', Georgia, serif;
      font-weight: 400;
      font-synthesis: none;
    }
    body.book-mode .reader-language-traditional .reader-inline-label {
      font-family: 'Ponomar', Georgia, serif;
      font-weight: 400;
    }
    /* Traditional numbering and the inline parallel-place marker must use
       the same installed Church Slavonic typeface as the verse body. */
    body.book-mode .reader-language-traditional .bible-crossref-button {
      font-family: 'Ponomar', Georgia, serif;
      font-weight: 400;
    }

    body.book-mode .bible-chapter-start.csl-bible-verse .note {
      font-family: 'Ponomar', Georgia, serif;
      font-size: 15px;
      line-height: 1.5;
      font-weight: 400;
      color: #765238;
      padding-bottom: 3px;
    }
    body.book-mode .bible-chapter-start.csl-bible-verse .prayer-title {
      font-family: 'Ponomar', Georgia, serif;
      font-weight: 400;
    }
    body.book-mode .bible-verse-section + .bible-verse-section {
      margin-top: 0 !important;
    }

    body.book-mode .bible-chapter-start .reader-inline {
      position: relative;
      display: block;
      padding-left: 12px;
    }

    body.book-mode .bible-chapter-start .reader-inline-label {
      position: absolute;
      top: 3px;
      left: 0;
      margin-right: 0;
    }

    body.book-mode .bible-chapter-start .reader-inline .reader-text.bible-verse {
      display: block;
    }
    /* The opening verse uses an indented/drop-cap layout, but its
       cross-reference still needs to follow the verse text in the same line. */
    body.book-mode .bible-chapter-start .reader-inline.has-bible-crossrefs .reader-text.bible-verse {
      display: inline;
    }

    body.book-mode .bible-drop-cap {
      float: left;
      margin: 2px 6px -1px 0;
      color: #A04432;
      font-family: Georgia, "Times New Roman", serif;
      font-size: var(--book-drop-cap-size);
      line-height: 0.82;
      font-weight: 700;
      text-shadow: 0 1px 0 rgba(255, 250, 236, 0.78);
    }
    body.book-mode .reader-text.focus-target, body.book-mode .prayer-title.focus-target {
      outline-color: rgba( 152, 98, 46, 0.32 );
      outline-offset: 4px;

    }
    body.book-mode #reader-scroll-track, body.book-mode #reader-scroll-top {
      display: none !important;
    }
    #book-page-indicator {
      display: none;
    }
    body.book-mode #book-page-indicator {
      display: none;
    }
    .reader-text span {
      white-space: inherit;
    }
    .paragraph-gap {
      display: block;
      width: 100%;
      height: 8px;
      overflow: hidden;
      font-size: 0;
      line-height: 0;
      white-space: pre;
    }
    .paragraph-gap-continuation {
      display: none;
    }
    .editorial-marker-hidden {
      display: none;
    }
    .liturgical-word {
      color: var(--liturgical);
      font-weight: 700;
    }
    .saved-highlight {
      background: var(--saved);
      border-radius: 3px;
    }
    /* Whole-item favorites shade the outer card; fragment marks within
       it must not add a second permanent background. Manual selections
       still show their temporary active highlight. */
    .rule-item.whole-saved .saved-highlight:not(.active-highlight) {
      background: transparent !important;
    }
    .active-highlight {
      background: var(--active);
      border-radius: 3px;
    }
    .saved-highlight.active-highlight {
      background: rgba(161, 110, 53, 0.30);
    }
    .search-focus { background: rgba(161, 110, 53, 0.08); }
    /* Highlight the sentence with one continuous translucent background,
       without the double outline on each wrapped line. */
    .search-hit,
    mark.search-hit {
      background: rgba(201, 166, 88, 0.32);
      color: inherit;
      border-radius: 2px;
      padding: 0;
      outline: none;
      transition: background-color 420ms ease-out;
    }
    .book-mode .search-hit {
      background: rgba(201, 166, 88, 0.32);
    }
    .search-hit.search-hit-fade,
    mark.search-hit.search-hit-fade,
    .book-mode .search-hit.search-hit-fade {
      background-color: transparent;
    }
    .reader-text.focus-target {
    /* Убрано: обводка вокруг всего блока только отвлекает.
     Подсветка искомого слова — через .search-hit. */
    }
    .footnotes {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }
    .footnote {
      margin-bottom: 4px;
      color: var(--secondary);
      font-size: 12px;
      line-height: 18px;
    }
    .selection-handle {
      display: none;
      position: fixed;
      width: 36px;
      height: 44px;
      z-index: 1001;
      touch-action: none;
    }
    .selection-handle::before {
      content: "";
      position: absolute;
      left: 16px;
      top: 0;
      width: 4px;
      height: 24px;
      border-radius: 2px;
      background: var(--handle);
    }
    .selection-handle::after {
      content: "";
      position: absolute;
      left: 9px;
      top: 21px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--handle);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
    }
    #selection-bar {
      display: none;
      position: fixed;
      left: 14px;
      right: 14px;
      bottom: calc(104px + env(safe-area-inset-bottom, 0px));
      z-index: 1002;
      min-height: 52px;
      padding: 7px 8px 7px 12px;
      align-items: center;
      gap: 6px;
      border: 1px solid rgba(112, 86, 55, 0.25);
      border-radius: 18px;
      background: var(--surface);
      box-shadow: 0 4px 16px rgba(71, 59, 46, 0.18);
      font-family: system-ui, -apple-system, sans-serif;
    }
    #selection-bar.visible {
      display: flex;
    }
    .selection-info {
      min-width: 0;
      flex: 1;
    }
    #selection-count {
      color: var(--accent-dark);
      font-size: 12px;
      line-height: 15px;
      font-weight: 800;
    }
    #selection-hint {
      margin-top: 2px;
      color: var(--muted);
      font-size: 11px;
      line-height: 14px;
    }
    #selection-count.error, #selection-hint.error {
      color: var(--liturgical);
    }
    #selection-cancel {
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--muted);
      font-size: 25px;
      line-height: 34px;
    }
    #selection-share {
      min-width: 70px;
      height: 36px;
      padding: 0 7px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: transparent;
      color: var(--accent-dark);
      font-size: 12px;
      font-weight: 700;
    }
    #selection-share:disabled { opacity: .42; }
    #selection-save {
      min-width: 80px;
      height: 36px;
      padding: 0 14px;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 800;
    }
    #selection-save.delete-mode {
      background: #8E3B35;
    }
    #selection-save:disabled {
      opacity: 0.4;
    }

    /* HOURS_READER_TYPOGRAPHY_V1 — only the new Hours reader.
       Text is plain and selectable; headings and rubrics use source metadata.
       Existing Psalter, prayer-rule, akathist and canon styles are unchanged. */
    .rule-item.hours-section {
      margin-bottom: 18px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--border);
    }
    .rule-item.hours-section:last-child {
      border-bottom: 0;
    }
    body:not(.book-mode) .rule-item.hours-section .section-header {
      margin: 8px 0 14px;
      min-height: 28px;
      justify-content: center;
    }
    body:not(.book-mode) .rule-item.hours-section .section-header .prayer-title {
      color: var(--accent-dark);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 19px;
      line-height: 26px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0;
      margin: 0;
      padding: 0 8px;
    }
    .rule-item.hours-section.hours-section-psalm .section-header .prayer-title {
      color: var(--accent-dark);
      font-size: 18px;
      font-weight: 700;
    }
    /* Hours titles have no underline or trailing decorative rule. */
    .rule-item.hours-section .section-header::after {
      content: none !important;
      display: none !important;
    }
    .rule-item.hours-section .section-header .prayer-title {
      text-decoration: none !important;
      border-bottom: 0 !important;
      box-shadow: none !important;
    }
    .rule-item.hours-section.hours-section-conditional {
      margin: 16px 0;
      padding: 6px 0 14px 12px;
      border-left: 2px solid var(--border);
      border-bottom: 0;
    }
    .rule-item.hours-section.hours-section-conditional .section-header .prayer-title {
      color: var(--secondary);
      font-size: 16px;
      line-height: 23px;
      font-weight: 600;
      text-align: left;
    }
    /* Subtle inline dropdowns for optional First Hour sequences.
       Content remains in the native selectable document when expanded. */
    .rule-item.hours-section.hours-collapsible {
      margin: 11px 0 14px;
      padding: 0;
      border: 0;
      background: transparent;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion {
      margin: 0;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 49px;
      padding: 12px 14px;
      color: var(--accent-dark);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 16px;
      line-height: 22px;
      font-weight: 700;
      list-style: none;
      cursor: pointer;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion-toggle::-webkit-details-marker {
      display: none;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion-toggle::after {
      content: "⌄";
      flex: 0 0 auto;
      color: var(--accent-dark);
      font-size: 22px;
      line-height: 18px;
      font-weight: 400;
      transform: rotate(0deg);
      transition: transform 140ms ease;
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion[open] > .hours-accordion-toggle::after {
      transform: rotate(180deg);
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion[open] > .hours-accordion-toggle {
      border-bottom: 1px solid var(--border);
    }
    .rule-item.hours-section.hours-collapsible .hours-accordion-content {
      padding: 12px 14px 14px;
      background: transparent;
    }
    .rule-item.hours-section.hours-section-instruction .reader-text.hours-text {
      font-size: 14px;
      line-height: 1.55;
      color: var(--secondary);
      text-align: left;
      text-align-last: left;
    }
    .rule-item.hours-section.hours-section-postpsalm {
      /* The final Psalm already has a bottom rule. Never double it. */
      margin-top: 0;
      border-top: 0;
      padding-top: 0;
    }
    .rule-item.hours-section.hours-section-hymn .reader-text.hours-heading {
      color: var(--accent-dark);
    }
    .rule-item.hours-section.hours-section-opening .reader-text {
      text-align: left;
      text-align-last: left;
    }
    .rule-item.hours-section.hours-section-rubric .reader-text.hours-rubric {
      color: var(--accent-dark);
      font-style: normal;
    }
    .rule-item.hours-section .reader-row {
      margin-bottom: 11px;
    }
    .rule-item.hours-section .reader-row:last-child {
      margin-bottom: 0;
    }
    .rule-item.hours-section .reader-text.hours-text {
      color: var(--text);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 17px;
      line-height: 1.59;
      font-style: normal;
      font-weight: 400;
      white-space: pre-line;
      text-align: justify;
      text-align-last: left;
      text-justify: inter-word;
      overflow-wrap: break-word;
      word-break: normal;
      -webkit-hyphens: auto;
      hyphens: auto;
    }
    /* Full Russian Hours are a primary reading language too, not a
       dimmed translation or web-page preview. */
    .rule-item.hours-section .reader-text.hours-russian {
      color: var(--text);
      font-size: 17px;
      line-height: 1.59;
    }
    /* Russian-only must be as dark, full-sized and justified as the ЦС tab.
       Only the parallel translation uses a secondary shade. */
    .rule-item.hours-section .reader-text.hours-russian-primary {
      color: var(--text) !important;
      font-size: 17px;
      line-height: 1.59;
      white-space: normal !important;
      text-align: justify !important;
      text-align-last: left !important;
    }
    .rule-item.hours-section .reader-text.hours-russian-parallel {
      color: var(--secondary) !important;
      white-space: normal !important;
    }
    /* Preserve line breaks only where two different speakers appear or
       where the Alleluia response was explicitly broken after line one. */
    .rule-item.hours-section .reader-text.hours-preserve-line-breaks {
      white-space: pre-line !important;
    }
    .rule-item.hours-section .reader-text.hours-traditional {
      font-family: 'Ponomar', Georgia, serif;
      font-size: 20px;
      line-height: 1.75;
      font-weight: 400;
      -webkit-hyphens: manual;
      hyphens: manual;
    }
    .rule-item.hours-traditional-section .section-header .prayer-title {
      font-family: 'Ponomar', Georgia, serif !important;
      font-size: 22px !important;
      font-weight: 400 !important;
    }
    .rule-item.hours-section .reader-text.hours-heading {
      font-size: 18px;
      line-height: 1.42;
      font-weight: 700;
      color: var(--accent-dark);
      text-align: center;
      text-align-last: center;
      margin-top: 8px;
    }
    .rule-item.hours-section .reader-text.hours-rubric {
      font-size: 14px;
      line-height: 1.53;
      font-weight: 600;
      color: var(--accent-dark);
      text-align: left;
      text-align-last: left;
      padding-top: 4px;
    }
    .rule-item.hours-section .reader-text.hours-dialogue {
      text-align: left;
      text-align-last: left;
    }
    .rule-item.hours-section .reader-text.hours-response {
      text-align: center;
      text-align-last: center;
      line-height: 1.65;
    }
    .rule-item.hours-section .reader-text.hours-doxology {
      color: var(--text);
      text-align: left;
      text-align-last: left;
    }
    /* Psalm first letters are part of the word itself, not drop caps. */
    .rule-item.hours-section .reader-text.hours-text::first-letter {
      float: none !important;
      margin: 0 !important;
      padding: 0 !important;
      font-size: inherit !important;
      line-height: inherit !important;
    }
    /* Prevent justification and Android WebView breaking the initial glyph
       away from its first word (e.g. Глаголы in Psalm 5). */
    .rule-item.hours-section .reader-text .hours-initial-word {
      display: inline !important;
      white-space: nowrap !important;
      word-spacing: normal !important;
      letter-spacing: normal !important;
    }
    /* Android WebView can justify across adjacent styled spans even inside
       a nowrap inline wrapper. A single inline-block for the FIRST PSALM WORD
       keeps the red Г visually joined to "лаголы" without modifying text,
       glyph offsets or coloring. Other liturgical initials are unaffected. */
    .rule-item.hours-section-psalm .reader-text .hours-initial-word {
      display: inline-block !important;
      white-space: nowrap !important;
      text-align: left !important;
      text-align-last: left !important;
      word-spacing: normal !important;
      letter-spacing: normal !important;
      vertical-align: baseline !important;
    }
    .rule-item.hours-section .reader-text .hours-mark-initial {
      display: inline !important;
      float: none !important;
      vertical-align: baseline !important;
      margin: 0 !important;
      padding: 0 !important;
      color: var(--liturgical) !important;
      font-size: inherit !important;
      line-height: inherit !important;
      font-weight: 700;
    }
    .rule-item.hours-section .reader-text.hours-traditional .hours-mark-initial {
      font-weight: 400;
    }
    .rule-item.hours-section .reader-text .hours-mark-speaker,
    .rule-item.hours-section .reader-text .hours-mark-cue {
      color: var(--liturgical) !important;
      font-style: normal !important;
      font-weight: 700;
    }
    .rule-item.hours-section .reader-text .hours-mark-mercy,
    .rule-item.hours-section .reader-text .hours-mark-alleluia {
      color: var(--liturgical) !important;
      font-style: normal !important;
      font-weight: 700;
    }
    .rule-item.hours-section .reader-text .hours-mark-doxology {
      color: var(--accent-dark) !important;
      font-weight: 600;
      font-style: normal !important;
    }
    .rule-item.hours-section .reader-text .hours-mark-repeat {
      color: var(--secondary) !important;
      font-weight: 400;
      font-style: normal !important;
      white-space: nowrap;
    }

    /* Only the explicitly marked rows of the First Hour receive rules. */
    .rule-item.hours-section .reader-row.hours-row-divider-after {
      padding-bottom: 12px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    /* Align the post-Psalm Alleluia and mercy on the normal left margin. */
    .rule-item.hours-section-postpsalm .reader-text.hours-response {
      text-align: left !important;
      text-align-last: left !important;
    }
    .rule-item.hours-section-postpsalm .reader-text .hours-mark-alleluia,
    .rule-item.hours-section-postpsalm .reader-text .hours-mark-mercy {
      color: var(--text) !important;
      font-weight: 400 !important;
    }
    .rule-item.hours-section-postpsalm .reader-text .hours-mark-repeat {
      font-size: 1.05em;
      font-weight: 500;
    }
    /* Liturgical instructions are brief marginal notes, not prayers. */
    .rule-item.hours-section-instruction .reader-text.hours-presentation-comment {
      color: var(--secondary) !important;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 14px !important;
      line-height: 1.45 !important;
      font-style: italic !important;
      font-weight: 400 !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    .rule-item.hours-section-hymn .reader-text.hours-presentation-placeholder {
      color: var(--accent-dark) !important;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15px !important;
      line-height: 1.42 !important;
      font-style: italic !important;
      font-weight: 400 !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    .rule-item.hours-section-hymn .reader-text.hours-presentation-rubric-label {
      color: var(--accent-dark) !important;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15px !important;
      line-height: 1.4 !important;
      font-style: italic !important;
      font-weight: 500 !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    .rule-item.hours-section-hymn .reader-row.hours-row-compact-after {
      margin-bottom: 2px !important;
    }

    /* First Hour: the Trisagion rubric flows directly into weekday choices.
       No horizontal rule or excessive whitespace before their accordions. */
    .rule-item.hours-section.hours-no-bottom-divider {
      margin-bottom: 4px !important;
      padding-bottom: 0 !important;
      border-bottom: 0 !important;
    }
    .rule-item.hours-section.hours-no-bottom-divider + .rule-item.hours-collapsible {
      margin-top: 5px !important;
    }
    .rule-item.hours-section-rubric .reader-text.hours-presentation-liturgical-label {
      color: var(--liturgical) !important;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 16px !important;
      line-height: 1.48 !important;
      font-weight: 600 !important;
      font-style: normal !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    /* Tropar and kondak placeholders share the same italic brown treatment. */
    .rule-item.hours-section-rubric .reader-text.hours-presentation-placeholder,
    .rule-item.hours-section-hymn .reader-text.hours-presentation-placeholder {
      color: var(--accent-dark) !important;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15px !important;
      line-height: 1.44 !important;
      font-style: italic !important;
      font-weight: 600 !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    .rule-item.hours-section-rubric .reader-text.hours-presentation-comment {
      color: var(--secondary) !important;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 14px !important;
      line-height: 1.48 !important;
      font-style: italic !important;
      font-weight: 400 !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    .rule-item.hours-section-conditional .reader-text .hours-mark-cue {
      color: var(--liturgical) !important;
      font-weight: 700 !important;
    }

    /* First Hour, final rubrics: a single rule after the Saturday option. */
    .rule-item.hours-section.hours-divider-before {
      border-top: 1px solid var(--border) !important;
      padding-top: 12px !important;
      margin-top: 10px !important;
    }
    /* The 40 / 12 / thrice responses belong to the normal left text edge. */
    .rule-item.hours-section .reader-text.hours-presentation-left-response {
      text-align: left !important;
      text-align-last: left !important;
    }
    /* Editorially marked service cues: no italics, normal font size. */
    .rule-item.hours-section .reader-text.hours-presentation-liturgical-red {
      color: var(--liturgical) !important;
      font-size: 16px !important;
      line-height: 1.5 !important;
      font-style: normal !important;
      font-weight: 600 !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    /* Trisagion label is also used in the concluding prayer section. */
    .rule-item.hours-section .reader-text.hours-presentation-liturgical-label {
      color: var(--liturgical) !important;
      font-size: 16px !important;
      line-height: 1.48 !important;
      font-weight: 600 !important;
      font-style: normal !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    /* The choir's words remain normal text; only "Хор:" is rubric red. */
    .rule-item.hours-section .reader-text.hours-dialogue {
      color: var(--text);
    }

    /* A rubric inside the optional St Ephrem prayer is a comment, never
       main prayer text or an enlarged red initial. */
    .rule-item.hours-section.hours-collapsible .reader-text.hours-presentation-comment {
      color: var(--secondary) !important;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 14px !important;
      line-height: 1.48 !important;
      font-weight: 400 !important;
      font-style: italic !important;
      text-align: left !important;
      text-align-last: left !important;
    }
    .rule-item.hours-section.hours-collapsible .reader-row.hours-row-compact-after {
      margin-bottom: 3px !important;
    }

    /* Standalone RU uses the same red liturgical accents as the ЦС reader.
       In CS+RU the Russian translation keeps its secondary color scheme. */
    .rule-item.hours-section .reader-text.hours-russian-primary .hours-mark-devotional,
    .rule-item.hours-section-postpsalm .reader-text.hours-russian-primary .hours-mark-alleluia,
    .rule-item.hours-section-postpsalm .reader-text.hours-russian-primary .hours-mark-mercy {
      color: var(--liturgical) !important;
      font-weight: 700 !important;
      font-style: normal !important;
    }
    /* A note quoting "Слава Отцу..." is still a NOTE, never prayer-red.
       Also guard against generic reader inline mark styles. */
    .rule-item.hours-section .reader-text.hours-presentation-comment,
    .rule-item.hours-section .reader-text.hours-presentation-comment span {
      color: var(--secondary) !important;
      font-style: italic !important;
      font-weight: 400 !important;
    }
    .rule-item.hours-section .reader-text.hours-presentation-comment .hours-mark-devotional,
    .rule-item.hours-section .reader-text.hours-presentation-comment .hours-mark-mercy,
    .rule-item.hours-section .reader-text.hours-presentation-comment .hours-mark-doxology {
      color: var(--secondary) !important;
      font-weight: 400 !important;
    }

    /* An ordinary prayer spoken by the priest/reader in the First Hour.
       Explicitly neutralize red full-doxology styling in this dialogue only. */
    .rule-item.hours-section .reader-text.hours-presentation-plain-prayer,
    .rule-item.hours-section .reader-text.hours-presentation-plain-prayer span {
      color: var(--text) !important;
      font-style: normal !important;
    }

    /* Final First Hour choir in CS, RU and CS + RU: suppress all inherited
       doxology coloring, including nested spans from the shared renderer. */
    .rule-item.hours-section .reader-text.hours-presentation-choir-response,
    .rule-item.hours-section .reader-text.hours-presentation-choir-response span:not(.hours-mark-speaker),
    .rule-item.hours-section .reader-text.hours-presentation-choir-response span:not(.hours-mark-speaker) * {
      color: var(--text) !important;
      font-weight: 400 !important;
    }
    .rule-item.hours-section .reader-text.hours-presentation-choir-response .hours-mark-speaker,
    .rule-item.hours-section .reader-text.hours-presentation-choir-response .hours-mark-speaker * {
      color: var(--liturgical) !important;
      font-weight: 700 !important;
    }

    /* Strongly scoped first-hour visual exceptions. They complement
       the runtime's per-segment color, with no effect on other services. */
    .rule-item.hours-section
    .reader-text.hours-russian-primary.hours-presentation-final-trinity
    .hours-mark-initial {
      color: var(--liturgical) !important;
      font-weight: 700 !important;
      font-size: inherit !important;
    }
    .rule-item.hours-section
    .reader-text.hours-russian-primary.hours-presentation-choir-response,
    .rule-item.hours-section
    .reader-text.hours-russian-primary.hours-presentation-choir-response span:not(.hours-mark-speaker) {
      color: var(--text) !important;
      font-weight: 400 !important;
    }
    .rule-item.hours-section
    .reader-text.hours-russian-primary.hours-presentation-choir-response
    .hours-mark-speaker {
      color: var(--liturgical) !important;
      font-weight: 700 !important;
    }


    /* Traditional First Hour: all rubrics, labels, notes and native accordion
       summaries are genuine Church Slavonic Unicode rendered with Ponomar.
       Never change the parallel, ordinary CS or Russian hours readers. */
    .rule-item.hours-traditional-section.hours-collapsible .hours-accordion-toggle {
      font-family: 'Ponomar', Georgia, serif !important;
      color: var(--liturgical) !important;
      font-size: 19px !important;
      font-weight: 400 !important;
      font-style: normal !important;
      line-height: 1.6 !important;
    }
    .rule-item.hours-traditional-section .reader-text.hours-traditional,
    .rule-item.hours-traditional-section .reader-text.hours-traditional span {
      font-family: 'Ponomar', Georgia, serif !important;
      font-style: normal !important;
    }
    .rule-item.hours-traditional-section .reader-text.hours-traditional.hours-presentation-comment,
    .rule-item.hours-traditional-section .reader-text.hours-traditional.hours-presentation-comment span {
      color: var(--secondary) !important;
      font-family: 'Ponomar', Georgia, serif !important;
      font-size: 17px !important;
      font-style: normal !important;
      font-weight: 400 !important;
    }
    .rule-item.hours-traditional-section .reader-text.hours-traditional.hours-presentation-placeholder,
    .rule-item.hours-traditional-section .reader-text.hours-traditional.hours-presentation-rubric-label {
      font-family: 'Ponomar', Georgia, serif !important;
      font-size: 18px !important;
      font-style: normal !important;
      font-weight: 400 !important;
    }
    .rule-item.hours-traditional-section .reader-text.hours-traditional.hours-presentation-liturgical-label,
    .rule-item.hours-traditional-section .reader-text.hours-traditional.hours-presentation-liturgical-red {
      font-family: 'Ponomar', Georgia, serif !important;
      font-size: 18px !important;
      font-style: normal !important;
      font-weight: 400 !important;
    }
    .rule-item.hours-traditional-section .reader-text.hours-traditional .hours-mark-devotional,
    .rule-item.hours-traditional-section .reader-text.hours-traditional .hours-mark-speaker,
    .rule-item.hours-traditional-section .reader-text.hours-traditional .hours-mark-cue,
    .rule-item.hours-traditional-section .reader-text.hours-traditional .hours-mark-mercy,
    .rule-item.hours-traditional-section .reader-text.hours-traditional .hours-mark-alleluia {
      color: var(--liturgical) !important;
      font-weight: 400 !important;
      font-style: normal !important;
    }
    .rule-item.hours-traditional-section .reader-text.hours-traditional .hours-mark-repeat {
      color: var(--secondary) !important;
      font-weight: 400 !important;
      font-style: normal !important;
      white-space: nowrap;
    }

    /* First Hour responses with 3/12/40 repetitions start at the left. */
    .rule-item.hours-section .reader-text.hours-mercy-left,
    .rule-item.hours-section .reader-text.hours-presentation-shared-mercy,
    .rule-item.hours-section .reader-text.hours-presentation-left-response {
      text-align: left !important;
      text-align-last: left !important;
    }

    /* First Hour ЦС + РУС: shared rubrics and doxologies are not duplicated.
       Both language columns are retained only for genuinely different texts. */
    .rule-item.hours-parallel-first-hour
    .reader-text.hours-presentation-shared-doxology .hours-mark-devotional,
    .rule-item.hours-parallel-first-hour
    .reader-text.hours-presentation-shared-alleluia .hours-mark-devotional,
    .rule-item.hours-parallel-first-hour
    .reader-text.hours-presentation-shared-mercy .hours-mark-devotional {
      color: var(--liturgical) !important;
      font-style: normal !important;
      font-weight: 700 !important;
    }
    .rule-item.hours-parallel-first-hour
    .reader-text.hours-presentation-shared-alleluia .hours-mark-repeat,
    .rule-item.hours-parallel-first-hour
    .reader-text.hours-presentation-shared-mercy .hours-mark-repeat {
      color: var(--secondary) !important;
      font-style: normal !important;
      font-weight: 400 !important;
    }
    /* One centered Bogorodichen caption sits above the two translated texts,
       including inside the Great Lent disclosure. */
    .rule-item.hours-parallel-first-hour
    .reader-text.hours-presentation-shared-heading {
      width: 100%;
      color: var(--liturgical) !important;
      text-align: center !important;
      text-align-last: center !important;
      font-size: 16px !important;
      line-height: 1.45 !important;
      font-style: normal !important;
      font-weight: 600 !important;
      padding: 3px 0 5px;
    }
    .rule-item.hours-parallel-first-hour
    .reader-text.hours-presentation-shared-heading .hours-mark-cue {
      color: var(--liturgical) !important;
    }
    .rule-item.hours-section.hours-collapsible.hours-divider-after-dropdown {
      border-bottom: 1px solid var(--border) !important;
      padding-bottom: 15px !important;
      margin-bottom: 18px !important;
    }

    /* Third Hour: follow First Hour typography in the Church Slavonic tab.
       These rules are scoped to ordinary-3 and do not alter the Psalter or
       the existing First Hour. */
    .rule-item.hours-third-hour
    .reader-text.hours-presentation-shared-doxology .hours-mark-devotional,
    .rule-item.hours-third-hour
    .reader-text.hours-presentation-shared-alleluia .hours-mark-devotional,
    .rule-item.hours-third-hour
    .reader-text.hours-presentation-shared-mercy .hours-mark-devotional {
      color: var(--liturgical) !important;
      font-weight: 700 !important;
      font-style: normal !important;
    }
    .rule-item.hours-third-hour
    .reader-text.hours-presentation-shared-alleluia .hours-mark-repeat,
    .rule-item.hours-third-hour
    .reader-text.hours-presentation-shared-mercy .hours-mark-repeat {
      color: var(--secondary) !important;
      font-weight: 400 !important;
      font-style: normal !important;
    }
    .rule-item.hours-third-hour .reader-text.hours-presentation-shared-mercy,
    .rule-item.hours-third-hour .reader-text.hours-response {
      text-align: left !important;
      text-align-last: left !important;
    }
    .rule-item.hours-third-hour.hours-collapsible .hours-accordion-toggle {
      color: var(--accent-dark) !important;
      font-style: normal !important;
      font-family: Georgia, "Times New Roman", serif;
    }
    .rule-item.hours-third-hour.hours-collapsible
    .reader-text.hours-presentation-rubric-label {
      color: var(--liturgical) !important;
      font-weight: 600 !important;
      font-style: normal !important;
      text-align: left !important;
      text-align-last: left !important;
    }

    #reader-scroll-track {
      position: fixed;
      top: 10px;
      right: 0;
      bottom: 72px;
      width: 30px;
      z-index: 998;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
      touch-action: none;
    }
    #reader-scroll-track.visible {
      opacity: 1;
      pointer-events: auto;
    }
    #reader-scroll-thumb {
      position: absolute;
      top: 0;
      right: 9px;
      width: 4px;
      min-height: 44px;
      border-radius: 999px;
      background: rgba(104, 66, 41, 0.48);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
      touch-action: none;
    }
    #reader-scroll-top {
      display: none;
      position: fixed;
      right: 13px;
      bottom: 82px;
      z-index: 999;
      width: 42px;
      height: 42px;
      padding: 0;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(112, 86, 55, 0.24);
      border-radius: 21px;
      background: rgba(248, 233, 207, 0.96);
      color: var(--accent-dark);
      box-shadow: 0 3px 12px rgba(71, 59, 46, 0.18);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 23px;
      line-height: 40px;
      font-weight: 700;
    }
    #reader-scroll-top.visible {
      display: block;
      animation: reader-control-in 120ms ease-out;
    }
    @keyframes reader-control-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      } to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    /* Single action menu on the left. Ponomar/reader text styles unchanged. */
    body:not(.book-mode) .has-reader-action-menu {
      position: relative;
      overflow: visible;
    }
    body:not(.book-mode) .reader-action-container {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 50;
      font-family: system-ui, sans-serif;
    }
    body:not(.book-mode) .has-reader-action-menu .reader-action-trigger {
      position: relative;
      width: 34px;
      height: 34px;
      padding: 0;
      border-radius: 17px;
      border: 1px solid var(--border);
      background: rgba(241,223,194,.96);
      /* The reader's --secondary may be nearly white in dark/custom themes. */
      color: #4B301D;
      font-size: 25px;
      line-height: 29px;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
    }
    body:not(.book-mode) .reader-action-menu {
      display: none;
      position: absolute;
      top: 34px;
      left: 0;
      width: 210px;
      padding: 5px;
      background: #FFF4DE;
      border: 1px solid rgba(120,80,42,.3);
      border-radius: 12px;
      box-shadow: 0 6px 18px rgba(47,27,15,.25);
      z-index: 65;
    }
    body:not(.book-mode) .reader-action-menu.is-open {
      display: flex;
      flex-direction: column;
    }
    body:not(.book-mode) .reader-action-menu .section-action,
    body:not(.book-mode) .reader-action-menu .document-action,
    body:not(.book-mode) .reader-action-menu .inline-share-action {
      position: relative !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      transform: none !important;
      width: 100% !important;
      height: 42px !important;
      min-height: 42px !important;
      margin: 0 !important;
      padding: 0 11px !important;
      border: 0 !important;
      border-radius: 8px !important;
      background: transparent !important;
      color: #70482E !important;
      display: flex !important;
      justify-content: flex-start !important;
      gap: 10px;
      font-size: 13px;
      font-weight: 600;
      text-align: left;
    }
    body:not(.book-mode) .reader-action-menu .section-action::after,
    body:not(.book-mode) .reader-action-menu .document-action::after {
      content: 'Добавить к себе';
    }
    body:not(.book-mode) .reader-action-menu .section-action.active::after,
    body:not(.book-mode) .reader-action-menu .document-action.active::after {
      content: 'Убрать из избранного';
    }
    body:not(.book-mode) .reader-action-menu .inline-share-action::after {
      content: 'Поделиться';
    }
    body:not(.book-mode) .document-header.has-reader-action-menu .rule-title,
    body:not(.book-mode) .section-header.has-reader-action-menu .prayer-title {
      padding-left: 45px !important;
      padding-right: 45px !important;
    }
    body:not(.book-mode) .hours-accordion.has-reader-action-menu .reader-action-container {
      top: 7px;
      left: 9px;
      transform: none;
    }
    body:not(.book-mode) .hours-accordion.has-reader-action-menu .hours-accordion-toggle {
      padding-left: 53px;
      padding-right: 15px;
    }
  `;
