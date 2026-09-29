export const READER_STYLES = String.raw`
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
  text-align: left;
  text-align-last: left;
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


.reader-text .memorial-open-marker {
  display: block;
  width: min(100%, 280px);
  min-height: 44px;
  margin: 12px auto;
  padding: 0;
  border: 1px solid rgba(123, 79, 36, 0.24);
  border-radius: 12px;
  background: rgba(138, 90, 56, 0.08);
  color: transparent;
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
  min-height: 42px;
  padding: 0 16px;
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

.reader-text .psalter-repeat-note {
  color: var(--secondary);
  font-weight: 600;
  font-style: italic;
  white-space: nowrap;
}

.reader-text.psalter-reading-prayers .liturgical-word {
  color: var(--liturgical);
  font-style: italic;
  font-weight: 600;
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
        linear-gradient(
          90deg,
          rgba(115, 74, 38, 0.035),
          transparent 8%,
          transparent 92%,
          rgba(115, 74, 38, 0.035)
        ),
        #FFF4DE;
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
      padding: 0 18px;
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
      padding-top: 5px;

    }
    body.book-mode .bible-chapter-start .section-header {
      margin: 0px 0 5px;
      padding: 1px 8px 4px 5px;

    }
    body.book-mode .bible-chapter-start .prayer-title {
      margin-left: 63px;
      text-align: center;
      color: #71472C;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 17px;
      line-height: 22px;
      font-weight: 700;
      letter-spacing: 0.20px;

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
      margin-right: 5px;
      color: #98622E;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 10px;
      line-height: 1;
      font-weight: 700;
      font-style: normal;

      vertical-align: super;
    }
    body.book-mode .reader-text {
      touch-action: none;

    }
    body.book-mode .reader-text.bible-verse {
      color: #38271D;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 18px;
      line-height: 28px;
      letter-spacing: 0;
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
      display: block;
      position: fixed;
      left: 50%;
      bottom: 8px;
      z-index: 997;
      min-width: 68px;
      padding: 3px 10px;
      transform: translateX(-50%);
      border-radius: 999px;
      background: rgba( 255, 244, 222, 0.94 );
      color: rgba( 92, 61, 39, 0.72 );
      font-family: Georgia, "Times New Roman", serif;
      font-size: 12px;
      line-height: 18px;
      letter-spacing: 0.65px;
      text-align: center;
      box-shadow: 0 1px 5px rgba( 74, 45, 28, 0.08 );
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
    .reader-text.focus-target {
      outline: 2px solid rgba(161, 110, 53, 0.45);
      outline-offset: 5px;
      border-radius: 5px;
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
      right: 7px;
      width: 8px;
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
