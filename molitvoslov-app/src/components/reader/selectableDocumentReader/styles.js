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

    .reader-language-traditional .reader-text,
    .reader-language-traditional .reader-inline-label {
      font-family: 'Ponomar', Georgia, "Times New Roman", serif;
      font-weight: 400;
      font-variant-ligatures: common-ligatures;
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
.reader-text.psalter-reading-prayers:not(.reader-language-traditional) {
  --liturgical: #B22222;
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

    .reader-text .akathist-initial {
      color: var(--liturgical);
      font-weight: 700;
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
        #FBF0D9;
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
        #171310;
      box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.30);
    }

    body.book-mode.book-night::after {
      box-shadow:
        inset 12px 0 20px -15px rgba(0, 0, 0, 0.72),
        inset -12px 0 20px -15px rgba(0, 0, 0, 0.72),
        inset 0 10px 20px -17px rgba(0, 0, 0, 0.56),
        inset 0 -10px 20px -17px rgba(0, 0, 0, 0.56);
    }

    body.book-mode.book-night .bible-chapter-start .prayer-title {
      color: #D0AA77;
    }

    body.book-mode.book-night .reader-inline-label {
      color: #C28D52;
    }

    body.book-mode.book-night .reader-text.bible-verse {
      color: #E7D7C6;
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
    body.book-mode .reader-text {
      touch-action: none;

    }
    body.book-mode .reader-text.bible-verse {
      color: #3C2A20;
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
      bottom: 22px;
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
    #selection-save {
      min-width: 96px;
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
      right: 8px;
      width: 6px;
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
  `;
