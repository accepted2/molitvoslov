import React, {useMemo, useRef} from 'react';

import {StyleSheet, View} from 'react-native';

import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {WebView} from 'react-native-webview';

import {LinearGradient} from 'expo-linear-gradient';

import {deleteSavedItem, saveItem} from '../../services/savedItems';

const scriptSafeJson = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const HTML_TEMPLATE = String.raw`
<!doctype html>
<html lang="ru">
<head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
  />

  <style>
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
.reader-text .psalter-prayer-nowrap {
  white-space: nowrap;
}

.reader-text .psalter-prayer-rubric {
  color: var(--secondary);
  font-style: italic;
  font-weight: 600;
}

.reader-text .psalter-prayer-rubric-block {
  display: block;
  margin: 0;
}
.reader-text .psalter-prayer-rubric-separator-before {
  border-top: 1px solid rgba(123, 79, 36, 0.22);
  padding-top: 4px;
  margin-top: 3px;
}

.reader-text .psalter-prayer-rubric-inline {
  display: inline;
  margin: 0;
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

/* В молитвах Псалтири пустая строка не должна превращаться
   в дополнительный большой вертикальный отступ. */
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
  margin: 3px auto;
  background: rgba(123, 79, 36, 0.22);
}

.reader-text.psalter-glory {
  white-space: pre-line;
  text-align: justify;
  text-align-last: auto;
}

.reader-text .psalter-prayer-accent {
  color: var(--liturgical);
  font-weight: 700;
}

/* Служебные формулы: тропарные заголовки и "Господи, помилуй (3/40)". */
.reader-text .psalter-prayer-meta {
  color: var(--secondary);
  font-style: italic;
  font-weight: 600;
}

.reader-text .psalter-prayer-title {
  display: block;
  text-align: left;
  color: var(--liturgical);
  font-weight: 700;
  margin: 1px 0;
}

.reader-text .psalter-repeat-note {
  color: var(--secondary);
  font-weight: 600;
  font-style: italic;
  white-space: nowrap;
}

/* "Слава Отцу... И ныне... Аминь." в молитвах Псалтири
   оформляется так же, как служебная пометка, а не красным. */
.reader-text.psalter-reading-prayers .liturgical-word {
  color: var(--secondary);
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
      height: 100vh;
      overflow: hidden;
      padding: var(--reader-top-padding) 0 var(--reader-bottom-padding);
      touch-action: none;
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
      margin: 4px 0 5px;
      padding: 4px 8px 4px 5px;
    }
    body.book-mode .bible-chapter-start .prayer-title {
      margin: 0;
      text-align: left;
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
    const DATA = __READER_PAYLOAD__;
    const bookMode = DATA.document ?.readerMode === 'book';
    document.body.classList.toggle( 'book-mode', bookMode );
    const reader = document.getElementById( 'reader' );
    const bookViewport = document.getElementById( 'book-viewport' );
    const selectionBar = document.getElementById( 'selection-bar' );
    const selectionCount = document.getElementById( 'selection-count' );
    const selectionHint = document.getElementById( 'selection-hint' );
    const saveButton = document.getElementById( 'selection-save' );
    const cancelButton = document.getElementById( 'selection-cancel' );
    const startHandle = document.getElementById( 'start-handle' );
    const endHandle = document.getElementById( 'end-handle' );
    const scrollTrack = document.getElementById( 'reader-scroll-track' );
    const scrollThumb = document.getElementById( 'reader-scroll-thumb' );
    const scrollTopButton = document.getElementById( 'reader-scroll-top' );
    const bookPageIndicator = document.getElementById( 'book-page-indicator' );
    const itemTextMap = new Map();
    const itemTitleMap = new Map();
    const itemConfigMap = new Map();
    const savedRanges = new Map();
    const state = {
      active: null, pointer: null, drag: null, longPressTimer: null, autoScrollFrame: null,
      lastDragPoint: null, restoring: true, progressTimer: null, scrollUiTimer: null, lastScrollY: 0,
      savePending: false, bookGesture: null, pageTurning: false, bookPage: 0, bookPageCount: 1,
      bookPageWidth: 1, };
    const post = payload => {
      window.ReactNativeWebView ?.postMessage( JSON.stringify( payload ) );
    };
    const el = ( tag, className, text ) => {
      const node = document.createElement( tag );
      if (className) {
        node.className = className;
      }
      if ( text !== undefined && text !== null ) {
        node.textContent = String(text);
      }
      return node;
    };
    const setSaveHeartIcon = ( button, active ) => {
      const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
      svg.setAttribute( 'viewBox', '0 0 24 24' );
      svg.setAttribute( 'aria-hidden', 'true' );
      svg.classList.add( 'save-heart-icon' );
      const path = document.createElementNS( 'http://www.w3.org/2000/svg', 'path' );
      path.setAttribute( 'd',
        'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z'
      );
      path.setAttribute( 'fill', active ? '#765238' : 'none' );
      path.setAttribute( 'stroke', '#765238' );
      path.setAttribute( 'stroke-width', '1.8' );
      path.setAttribute( 'stroke-linecap', 'round' );
      path.setAttribute( 'stroke-linejoin', 'round' );
      svg.appendChild( path );
      button.replaceChildren( svg );
      button.title = active ? 'Убрать из избранного' : 'Добавить в избранное';
      button.setAttribute( 'aria-label', button.title );
    };
    const titleEl = ( tag, className, value ) => {
      const node = el( tag, className );
      const text = String( value || '' );
      const commaIndex = text.indexOf( ',' );
      if ( commaIndex <= 0 || commaIndex >= text.length - 1 ) {
        node.textContent = text;
        return node;
      }
      const before = text .slice( 0, commaIndex + 1 ) .trimEnd();
      const after = text .slice( commaIndex + 1 ) .trim();
      node.appendChild( document.createTextNode( before + ' ' ) );
      node.appendChild( el( 'span', 'title-tail', after ) );
      return node;
    };
    const compactParagraphGaps = root => {
        if (!root) {
          return;
        }
        const walker = document.createTreeWalker( root, NodeFilter.SHOW_TEXT );
        const nodes = [];
        let current = null;
        let fullText = '';
        while ( ( current = walker.nextNode() ) ) {
          nodes.push({
            node: current, start: fullText.length, end: fullText.length + current.textContent.length, });
          fullText += current.textContent;
        }
        const ranges = [];
        const pattern = /\n[ \t]*\n(?:[ \t]*\n)*/g;
        let match = null;
        while ( ( match = pattern.exec( fullText ) ) ) {
          const secondNewline = match[0] .indexOf( '\n', 1 );
          if ( secondNewline >= 0 ) {
            ranges.push({
              start: match.index + secondNewline, end: match.index + match[0].length, });
          }
        }
        if (!ranges.length) {
          return;
        }
        nodes .slice() .reverse() .forEach( entry => {
              const intersections = ranges .map( range => ({
                      start: Math.max( range.start, entry.start ), end: Math.min( range.end, entry.end ),
                      rangeStart: range.start, }) ) .filter( part => part.end >
                      part.start );
              if ( !intersections.length ) {
                return;
              }
              const fragment = document.createDocumentFragment();
              let cursor = 0;
              intersections.forEach( part => {
                  const localStart = part.start - entry.start;
                  const localEnd = part.end - entry.start;
                  if ( localStart > cursor ) {
                    fragment.appendChild( document.createTextNode( entry.node.textContent.slice( cursor,
                          localStart ) ) );
                  }
                  fragment.appendChild( el( 'span', part.start === part.rangeStart ? 'paragraph-gap'
                        : 'paragraph-gap-continuation', entry.node.textContent.slice( localStart, localEnd ) )
                  );
                  cursor = localEnd;
                }
              );
              if ( cursor < entry.node .textContent .length ) {
                fragment.appendChild( document.createTextNode( entry.node.textContent.slice( cursor ) ) );
              }
              entry.node.replaceWith( fragment );
            }
          );
      };
    const hideKnownEditorialMarkers = root => {
        if (!root) {
          return;
        }
        const walker = document.createTreeWalker( root, NodeFilter.SHOW_TEXT );
        const nodes = [];
        let node = null;
        while ( ( node = walker.nextNode() ) ) {
          nodes.push( node );
        }
        nodes.forEach( textNode => {
            const value = textNode.textContent || '';
            const marker = value.search( /1(?=Испове)/u );
            if ( marker < 0 ) {
              return;
            }
            const fragment = document.createDocumentFragment();
            if (marker > 0) {
              fragment.appendChild( document.createTextNode( value.slice( 0, marker ) ) );
            }
            fragment.appendChild( el( 'span', 'editorial-marker-hidden', '1' ) );
            if ( marker + 1 < value.length ) {
              fragment.appendChild( document.createTextNode( value.slice( marker + 1 ) ) );
            }
            textNode.replaceWith( fragment );
          }
        );
      };
    const appendFootnotes = ( container, footnotes ) => {
      if ( !Array.isArray( footnotes ) || !footnotes.length ) {
        return;
      }
      const wrapper = el( 'div', 'footnotes' );
      footnotes.forEach( footnote => {
          wrapper.appendChild( el( 'div', 'footnote', '[' + footnote.number + '] ' + footnote.content ) );
        }
      );
      container.appendChild( wrapper );
    };
    const renderDocument = () => {
      if ( DATA.document.title || DATA.document.action ) {
        const documentHeader = el( 'div', 'document-header' );
        if ( DATA.document.title ) {
          documentHeader.appendChild( titleEl( 'h1', 'rule-title', DATA.document.title ) );
        }
        if ( DATA.document.action ) {
          const action = el( 'button', DATA.document.action.active ? 'document-action active'
                : 'document-action' );
          action.type = 'button';
          setSaveHeartIcon( action, !!DATA.document.action.active );
          action.dataset.actionKey = DATA.document.action.key;
          documentHeader.appendChild( action );
        }
        reader.appendChild( documentHeader );
      }
      const viewSwitcher = DATA.document.viewSwitcher;
      if ( viewSwitcher && Array.isArray( viewSwitcher.options ) && viewSwitcher.options.length ) {
        const switcher = el( 'div', 'view-switcher' );
        viewSwitcher.options.forEach( option => {
            const active = option.key === viewSwitcher.activeKey;
            const button = el( 'button', active ? 'view-switcher-button active' : 'view-switcher-button',
                option.label );
            button.type = 'button';
            button.disabled = !!option.disabled;
            button.addEventListener( 'click', () => {
                if ( !button.disabled && !active ) {
                  post({
                    type: 'view-mode', value: option.key, });
                }
              }
            );
            switcher.appendChild( button );
          }
        );
        reader.appendChild( switcher );
      }
      if ( DATA.document.description ) {
        reader.appendChild( el( 'div', 'rule-description', DATA.document.description ) );
      }
      ( DATA.document.sections || [] ).forEach( section => {
          const wrapper = el( 'section', 'rule-item ' + ( section.className || '' ) );
          wrapper.dataset.itemId = String( section.progressAnchorId );
          wrapper.dataset.trackProgress = section.trackProgress === false ? 'false' : 'true';
          wrapper.dataset.actionKey = section.action?.key || '';
          wrapper.dataset.highlightGroupKey = section.highlightGroupKey || '';
          wrapper.dataset.chapterNumber = section.chapterNumber ? String( section.chapterNumber ) : '';
          if ( section.title || section.action ) {
            const header = el( 'div', 'section-header' );
            if ( section.title ) {
              header.appendChild( titleEl( 'h2', 'prayer-title', section.title ) );
            }
            if ( section.action ) {
              const action = el( 'button', section.action.active ? 'section-action active' : 'section-action'
                );
              action.type = 'button';
              setSaveHeartIcon( action, !!section.action.active );
              action.dataset.actionKey = section.action.key;
              header.appendChild( action );
            }
            wrapper.appendChild( header );
          }
          if ( section.note ) {
            wrapper.appendChild( el( 'div', 'note', section.note ) );
          }
          ( section.rows || [] ).forEach( row => {
            if (row.sharedTitle) {
              wrapper.appendChild(
                el(
                  'div',
                  'psalter-shared-rubric',
                  row.sharedTitle
                )
              );
            }
              const rowNode = el( 'div', row.layout === 'parallel' ? 'reader-row reader-row-parallel'
                    : 'reader-row' );
              ( row.blocks || [] ).forEach( block => {
                  const itemId = Number( block.id );
                  itemTextMap.set( itemId, block.text || '' );
                  itemTitleMap.set( itemId, block.itemTitle || section.title || 'Текст' );
                  itemConfigMap.set( itemId, block );
                  const column = el( 'div', 'reader-column' );
                  if ( block.label ) {
                    column.appendChild( el( 'div', 'reader-label', block.label ) );
                  }
                  const textElement = el( 'div', 'reader-text ' + ( block.className || '' ) );
                  textElement.dataset.itemId = String( itemId );
                  if ( block.inlineLabel ) {
                    const normalizedInlineLabel = String( block.inlineLabel || '' ) .normalize( 'NFD' )
                        .replace( /[\u0300-\u036f\u0483-\u0487]/g, '' ) .trim() .toLowerCase();
                    const inline = el( 'div', normalizedInlineLabel .startsWith( 'молитва' )
                          ? 'reader-inline prayer-inline' : 'reader-inline' );
                    inline.appendChild( el( 'span', 'reader-inline-label', block.inlineLabel ) );
                    inline.appendChild( textElement );
                    column.appendChild( inline );
                  } else {
                    column.appendChild( textElement );
                  }
                  rowNode.appendChild( column );
                }
              );
              wrapper.appendChild( rowNode );
            }
          );
          reader.appendChild( wrapper );
        }
      );
    };
    const normalizeRange = ( text, start, end ) => {
      let left = Math.max( 0, Math.min( start, text.length ) );
      let right = Math.max( left, Math.min( end, text.length ) );
      while ( left < right && /\\s/.test( text[left] ) ) {
        left += 1;
      }
      while ( right > left && /\\s/.test( text[ right - 1 ] ) ) {
        right -= 1;
      }
      return {
        start: left, end: right, };
    };
    const savedForItem = itemId => savedRanges.get( Number( itemId ) ) || [];
    const activeForItem = itemId => state.active && Number( state.active.itemId ) === Number( itemId )
          ? state.active : null;
    const removableSavedRange = active => {
        if (!active) {
          return null;
        }
        return ( savedForItem( active.itemId ).find( range => !range.actionKey && Number.isFinite(
                Number(range.id) ) && active.start >= range.start && active.end <= range.end ) || null );
      };
    const normalizedAkathistTextWithIndex = value => {
        const source = String( value || '' );
        const chars = [];
        const originalIndex = [];
        for ( let index = 0;
          index < source.length;
          index += 1 ) {
          const originalChar = source[index];
          if ( originalChar === 'й' || originalChar === 'Й' ) {
            chars.push( originalChar );
            originalIndex.push( index );
            continue;
          }
          const decomposed = originalChar.normalize( 'NFD' );
          for (const char of decomposed) {
            if ( /[\u0300-\u036f\u0483-\u0487]/u.test( char ) ) {
              continue;
            }
            chars.push( char );
            originalIndex.push( index );
          }
        }
        return {
          normalized: chars.join(''), originalIndex, };
      };
    const collectAkathistJoyBreaks = value => {
        const {
          normalized, originalIndex, } = normalizedAkathistTextWithIndex( value );
        const offsets = new Set();
        const pattern = /Радуйся/giu;
        let match = null;
        while ( ( match = pattern.exec( normalized ) ) ) {
          const offset = originalIndex[ match.index ];
          if ( Number.isFinite( offset ) && offset > 0 ) {
            offsets.add( offset );
          }
        }
        return offsets;
      };
    const collectAkathistInitialRanges = value => {
        const source = String( value || '' );
        const ranges = [];
        const addInitialAt = rawStart => {
            let start = Math.max( 0, rawStart );
            while ( start < source.length && /\s/u.test( source[start] ) ) {
              start += 1;
            }
            const tail = source.slice( start );
            const match = tail.match( /[А-Яа-яЁёІіЇїЄєҐґ\u0400-\u052F]/u );
            if (!match) {
              return;
            }
            const letterStart = start + match.index;
            let letterEnd = letterStart + 1;
            while ( letterEnd < source.length && /[\u0300-\u036f\u0483-\u0487]/u.test( source[ letterEnd ] )
            ) {
              letterEnd += 1;
            }
            ranges.push({
              start: letterStart, end: letterEnd, });
          };
        addInitialAt( 0 );
        collectAkathistJoyBreaks( source ).forEach( offset => {
            addInitialAt( offset );
          }
        );
        return ranges;
      };
const collectPsalterVerseNumberRanges = value => {
  const source = String(value || '');
  const ranges = [];

  let lineStart = 0;

  while (lineStart < source.length) {
    let cursor = lineStart;

    while (
      cursor < source.length &&
      source[cursor] >= '0' &&
      source[cursor] <= '9'
    ) {
      cursor += 1;
    }

    if (cursor > lineStart) {
      if (source[cursor] === '.') {
        cursor += 1;
      }

      const separatorCode =
        cursor < source.length
          ? source.charCodeAt(cursor)
          : 0;

      const hasValidSeparator =
        separatorCode === 32 ||   // обычный пробел
        separatorCode === 160 ||  // NBSP
        separatorCode === 8239;   // narrow NBSP

      if (hasValidSeparator) {
        ranges.push({
          start: lineStart,
          end: cursor,
        });
      }
    }

    const nextNewline =
      source.indexOf(
        String.fromCharCode(10),
        lineStart
      );

    if (nextNewline === -1) {
      break;
    }

    lineStart = nextNewline + 1;
  }

  return ranges;
};
const collectPsalterRepeatNoteRanges = value => {
  const source = String(value || '');
  const ranges = [];

  const pattern =
    /\((?:трижды|3)\.?\)/giu;

  let match = null;

  while ((match = pattern.exec(source))) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return ranges;
};

const collectPsalterPrayerAccentRanges = value => {
  const source = String(value || '');
  const ranges = [];

  const {
    normalized,
    originalIndex,
  } = normalizedAkathistTextWithIndex(source);

  const patterns = [
    /Трисвятое по Отче наш:/giu,

    // "Тропари сия, глас 6", "Тропарь покаянный, глас шестой" и т. п.
    /Тропар(?:ь|и)\s+(?:сия|покаянн(?:ый|ые|ыя))\s*,?\s*глас\s*(?:6|шест(?:ой|ый))\s*:*/giu,

    /(?:^|\n)(Слава:)/giu,
    /(?:^|\n)(И ныне:)/giu,

    // Счётные "Господи, помилуй" — и (3), и (40), с поддержкой надстрочных знаков
    /Господи,\s*помилуй\s*\((?:3|40)\)\.?/giu,

    /(?:^|\n)(Таже\s+молитва)/giu,

    /(?:^|\n)(Молитва\s+Свят(?:ейшей|ей|ой)\s+Живоначальн(?:ей|ой)\s+Троице)/giu,

    /(?:^|\n)(Свят(?:ейшей|ей|ой)\s+Живоначальн(?:ей|ой)\s+Троице)/giu,

    /(?:^|\n)(Молитва)(?=\s|$)/giu,
  ];

  patterns.forEach(pattern => {
    let match = null;

    while ((match = pattern.exec(normalized))) {
      const matchedText =
        match[1] || match[0];

      const offset =
        match[1]
          ? match[0].lastIndexOf(match[1])
          : 0;

      const normalizedStart =
        match.index + offset;

      const normalizedEnd =
        normalizedStart +
        matchedText.length -
        1;

      const start =
        originalIndex[normalizedStart];

      if (!Number.isFinite(start)) {
        continue;
      }

      let end =
        (originalIndex[normalizedEnd] ?? start) + 1;

      while (
        end < source.length &&
        /[\u0300-\u036f\u0483-\u0487]/u.test(
          source[end]
        )
      ) {
        end += 1;
      }

      ranges.push({
        start,
        end,
      });
    }
  });

  const merged = [];

  ranges
    .sort(
      (left, right) =>
        left.start - right.start ||
        right.end - left.end
    )
    .forEach(range => {
      const previous =
        merged[merged.length - 1];

      if (
        previous &&
        range.start <= previous.end
      ) {
        previous.end =
          Math.max(previous.end, range.end);
        return;
      }

      merged.push({
        start: range.start,
        end: range.end,
      });
    });

  return merged;
};

const collectPsalterPrayerInitialRanges = value => {
  const source = String(value || '');
  const ranges = [];

  const addInitial = startIndex => {
    let start = Math.max(0, startIndex);

    while (
      start < source.length &&
      /\s/u.test(source[start])
    ) {
      start += 1;
    }

    const tail = source.slice(start);

    const plainTail = tail
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f\u0483-\u0487]/g,
        ''
      )
      .toLowerCase();

    // Здесь буквица НЕ нужна
    const skipPrefixes = [
      'слава:',
      'слава отцу',
      'слава,',
      'и ныне:',
      'господи, помилуй',
      'трисвятое',
      'тропарь',
      'тропари',
      'таже тропари',
      'также тропари',
      'молитва',
      'и поклонись',
      'и поклонов',
      'священник',
      'мирянин',
    ];

    if (
      skipPrefixes.some(prefix =>
        plainTail.startsWith(prefix)
      )
    ) {
      return;
    }

    const match = tail.match(
      /[А-ЯЁІЇЄҐ\u0400-\u052F]/u
    );

    if (!match) {
      return;
    }

    const letterStart =
      start + match.index;

    ranges.push({
      start: letterStart,
      end: letterStart + 1,
    });
  };

  // Самое начало блока
  addInitial(0);

  // Начало новой самостоятельной молитвы
  const paragraphPattern = /\n[ \t]*\n/g;

  let match = null;

  while (
    (match = paragraphPattern.exec(source))
  ) {
    addInitial(
      match.index + match[0].length
    );
  }

  // Текст после отдельного заголовка "Молитва"
  const prayerTitlePattern =
    /(?:^|\n)Молитва\s*\n\s*/giu;

  while (
    (match = prayerTitlePattern.exec(source))
  ) {
    addInitial(
      match.index + match[0].length
    );
  }

  return ranges.filter(
    (range, index, all) =>
      index ===
      all.findIndex(
        item =>
          item.start === range.start &&
          item.end === range.end
      )
  );
};
const collectPsalterRubricRanges = value => {
  const source = String(value || '');
  const ranges = [];

  const {
    normalized,
    originalIndex,
  } = normalizedAkathistTextWithIndex(source);

  const patterns = [
    // Общая вводная пометка
    /(?:^|\n)(Разумно да будет,[^\n]*)/giu,

    // Указания священнику / мирянину
    /(?:^|\n)(Аще иерей,\s*глаголет:)/giu,
    /(?:^|\n)(Аще ли ни,\s*глаголи умиленно:)/giu,
    /(?:^|\n)(Если священник:)/giu,
    /(?:^|\n)(Если мирянин:)/giu,

    // Перед началом чтения
    /(?:^|\n)(Таже постой мало,[^\n]*)/giu,
    /(?:^|\n)(Затем постой немного,[^\n]*)/giu,

    // Поклоны
    /(И\s+поклонися,\s*елико ти мощно\.?)/giu,
    /(И\s+поклонись,?\s*сколько хочешь\.?)/giu,
    /(?:^|\n)(И\s+поклонов,\s*елико мощно,\s*с молитвою:)/giu,
    /(?:^|\n)(И\s+поклонись,\s*сколько хочешь,\s*с молитвою:)/giu,

    // Перед заключительной молитвой
    /(?:^|\n)(Посем глаголи молитву сию со вниманием:)/giu,
    /(?:^|\n)(Затем произноси следующую молитву со вниманием:)/giu,

    // Окончание
    /(?:^|\n)(Аще иерей,\s*кончает священнически,\s*аще ли простый,\s*кончает сице:)/giu,
    /(?:^|\n)(Священник произносит отпуст,\s*а мирянин кончает так:)/giu,

    // "Или" перед альтернативной молитвой
    /(?:^|\n)(Или:?)(?=\s)/giu,
  ];

  patterns.forEach(pattern => {
    let match = null;

    while ((match = pattern.exec(normalized))) {
      const matchedText = match[1] || match[0];

      const offset = match[1]
        ? match[0].lastIndexOf(match[1])
        : 0;

      const normalizedStart =
        match.index + offset;

      const normalizedEnd =
        normalizedStart +
        matchedText.length -
        1;

      const start =
        originalIndex[normalizedStart];

      if (!Number.isFinite(start)) {
        continue;
      }

      let end =
        (originalIndex[normalizedEnd] ?? start) + 1;

      while (
        end < source.length &&
        /[\u0300-\u036f\u0483-\u0487]/u.test(
          source[end]
        )
      ) {
        end += 1;
      }

      ranges.push({
        start,
        end,
      });
    }
  });

  return ranges;
};

    const appendAccentWords = ( parent, value, accentWords ) => {
      if ( !Array.isArray( accentWords ) || !accentWords.length ) {
        parent.appendChild( document.createTextNode( value ) );
        return;
      }
      const accents = new Set( accentWords );
      value .split( /(\s+)/ ) .forEach( part => {
            if ( /^\s+$/.test( part ) ) {
              parent.appendChild( document.createTextNode( part ) );
              return;
            }
            const clean = part .normalize( 'NFD' ) .replace( /[\u0300\u0301\u0340\u0341\u0483-\u0487]/g, '' )
                .normalize( 'NFC' ) .replace( /^[^А-Яа-яЁё\u0400-\u052F]+/, '' ) .replace(
                  /[^А-Яа-яЁё\u0400-\u052F]+$/, '' );
            if ( accents.has( clean ) ) {
              parent.appendChild( el( 'span', 'liturgical-word', part ) );
              return;
            }
            parent.appendChild( document.createTextNode( part ) );
          }
        );
    };
    const findLiturgicalPhraseRanges = value => {
        const normalizedChars = [];
        const originalIndex = [];
        for ( let index = 0;
          index < value.length;
          index += 1 ) {
          const decomposed = value[index] .normalize( 'NFD' );
          for ( const char of decomposed ) {
            if ( /[\u0300-\u036f\u0483-\u0487]/u.test( char ) ) {
              continue;
            }
            normalizedChars.push( char );
            originalIndex.push( index );
          }
        }
        const normalized = normalizedChars.join( '' );
        const pattern =
  /Слава\s+Отцу\s*,?\s*и\s+Сыну\s*,?\s*и\s+Святому\s+Духу\s*[:;,.!?]?|И\s+ныне\s*,?\s*и\s+(?:присно|всегда)\s*,?\s*и\s+во\s+веки\s+веков\s*[.,;:]?\s*аминь\s*[.!?]?/giu;
        const ranges = [];
        let match = null;
        while ( ( match = pattern.exec( normalized ) ) ) {
          const normalizedStart = match.index;
          const normalizedEnd = match.index + match[0].length - 1;
          const start = originalIndex[ normalizedStart ];
          let end = ( originalIndex[ normalizedEnd ] ?? start ) + 1;
          while ( end < value.length && /[\u0300-\u036f\u0483-\u0487]/u.test( value[end] ) ) {
            end += 1;
          }
          if ( Number.isFinite( start ) && end > start ) {
            ranges.push({
              start, end, });
          }
        }
        return ranges;
      };
    const findCanonLeadingCueRange = value => {
        const normalizedChars = [];
        const originalIndex = [];
        for ( let index = 0;
          index < value.length;
          index += 1 ) {
          const decomposed = value[index] .normalize( 'NFD' );
          for ( const char of decomposed ) {
            if ( /[\u0300-\u036f\u0483-\u0487]/u.test( char ) ) {
              continue;
            }
            normalizedChars.push( char );
            originalIndex.push( index );
          }
        }
        const normalized = normalizedChars.join( '' );
        const match = normalized.match(
            /^\s*((?:Молитва[^:\n]{0,140})|Ирмос|Припев|Иисусу|Богородичен|Кондак|Икос|Седален|Светилен|Тропарь|Слава|И\s+ныне|Ныне)\s*:/iu
          );
        if (!match) {
          return null;
        }
        const normalizedStart = match.index || 0;
        const normalizedEnd = normalizedStart + match[0].length - 1;
        const start = originalIndex[ normalizedStart ] ?? 0;
        let end = ( originalIndex[ normalizedEnd ] ?? start ) + 1;
        while ( end < value.length && /[\u0300-\u036f\u0483-\u0487]/u.test( value[end] ) ) {
          end += 1;
        }
        const normalizedLabel = match[1] .toLowerCase() .replace( /\s+/g, ' ' );
        return {
          start, end,
          prayerTitle: normalizedLabel.startsWith( 'молитва' ),
          short: [ 'слава', 'и ныне', 'ныне', ].includes( normalizedLabel ), };
      };
    const appendStyledSegment = ( parent, value, accentWords, highlightLiturgicalPhrases = true,
      highlightCanonLeadingCue = false ) => {
      const canonCue = highlightCanonLeadingCue ? findCanonLeadingCueRange( value ) : null;
      const phraseRanges = highlightLiturgicalPhrases ? findLiturgicalPhraseRanges( value ) : [];
      const ranges = [ ...phraseRanges.map( range => ({
              ...range, className: 'liturgical-word', }) ),
          ...(canonCue ? [ {
                  start: canonCue.start,
                  end: canonCue.end,
                  className: canonCue.prayerTitle ? 'canon-leading-cue prayer-leading-cue' : ( canonCue.short
                            ? 'canon-leading-cue canon-short-cue' : 'canon-leading-cue' ), }, ] : []), ]
          .sort( ( left, right ) => left.start - right.start ) .filter( ( range, index, all ) =>
              index === 0 || range.start >= all[index - 1].end );
      if (!ranges.length) {
        appendAccentWords( parent, value, accentWords );
        return;
      }
      let cursor = 0;
      ranges.forEach( range => {
          if ( range.start > cursor ) {
            appendAccentWords( parent, value.slice( cursor, range.start ), accentWords );
          }
          parent.appendChild( el( 'span', range.className, value.slice( range.start, range.end ) ) );
          if ( range.className .includes( 'prayer-leading-cue' ) && range.end < value.length ) {
            parent.appendChild( document.createElement( 'br' ) );
          }
          cursor = range.end;
        }
      );
      if ( cursor < value.length ) {
        appendAccentWords( parent, value.slice( cursor ), accentWords );
      }
    };
    const appendPsalterSeparator = fragment => {
      let previous = fragment.lastChild;

      while (
        previous &&
        (
          (
            previous.nodeType === Node.TEXT_NODE &&
            !String(previous.textContent || '').trim()
          ) ||
          (
            previous.nodeType === Node.ELEMENT_NODE &&
            !String(previous.textContent || '').trim() &&
            !previous.classList.contains(
              'psalter-prayer-separator'
            )
          )
        )
      ) {
        previous = previous.previousSibling;
      }

      if (
        previous &&
        previous.nodeType === Node.ELEMENT_NODE &&
        previous.classList.contains(
          'psalter-prayer-separator'
        )
      ) {
        return;
      }

      fragment.appendChild(
        el(
          'span',
          'psalter-prayer-separator'
        )
      );
    };

    const collapsePsalterRubricTrailingWhitespace = root => {
      if (
        !root ||
        !root.classList.contains(
          'psalter-reading-prayers'
        )
      ) {
        return;
      }

      root
        .querySelectorAll(
          '.psalter-prayer-rubric-block'
        )
        .forEach(rubric => {
          let node = rubric.nextSibling;

          while (node) {
            const value =
                    String(node.textContent || '');
                  if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.classList.contains(
          'psalter-prayer-separator'
        )
      ) {
        break;
      }

            if (!value.trim()) {
              if (
                node.nodeType ===
                  Node.ELEMENT_NODE
              ) {
                node.classList.add(
                  'psalter-prayer-gap-hidden'
                );
              }

              node = node.nextSibling;
              continue;
            }

            break;
          }
        });
    };

    const renderTextItem = itemId => {
        const root = document.querySelector( '.reader-text[data-item-id="' + itemId + '"]' );
        if (!root) {
          return;
        }
        const text = itemTextMap.get( Number( itemId ) ) || '';
        const saved = savedForItem( itemId );
        const active = activeForItem( itemId );
        const itemConfig = itemConfigMap.get( itemId );
        const isAkathist = String( itemConfig ?.className || '' ).includes( 'akathist-' ) || itemConfig
            ?.sourceType === 'akathist';
        const akathistJoyBreaks = isAkathist ? collectAkathistJoyBreaks( text ) : new Set();
        const akathistInitialRanges = isAkathist ? collectAkathistInitialRanges( text ) : [];
 const isPsalterPrayer =
  String(itemConfig?.className || '')
    .includes('psalter-prayer');

const psalterPrayerAccentRanges =
  isPsalterPrayer
    ? collectPsalterPrayerAccentRanges(text)
    : [];

const psalterRubricRanges =
  isPsalterPrayer
    ? collectPsalterRubricRanges(text)
    : [];

const psalterPrayerInitialRanges =
  isPsalterPrayer
    ? collectPsalterPrayerInitialRanges(text)
        .filter(initialRange =>
          !psalterRubricRanges.some(
            rubricRange =>
              initialRange.start >= rubricRange.start &&
              initialRange.start < rubricRange.end
          )
        )
    : [];
        const isPsalterGlory =  String(itemConfig?.className || '') .includes('psalter-glory');
       const psalterRepeatNoteRanges =
  isPsalterGlory || isPsalterPrayer
    ? collectPsalterRepeatNoteRanges(text)
    : [];
        const isPsalterText = String( itemConfig ?.className || '' ) .split(' ') .includes('psalter');
const psalterVerseNumberRanges = isPsalterText ? collectPsalterVerseNumberRanges( text ) : [];
        const boundaries = new Set([ 0, text.length, ]);
        akathistJoyBreaks.forEach( offset => {
            boundaries.add( offset );
          }
        );
        akathistInitialRanges.forEach( range => {
            boundaries.add( range.start );
            boundaries.add( range.end );
          })
          psalterPrayerInitialRanges.forEach(range => {
            boundaries.add(range.start);
            boundaries.add(range.end);
          });
           psalterRubricRanges.forEach(range => {
              boundaries.add(range.start);
              boundaries.add(range.end);
});
    
        psalterPrayerAccentRanges.forEach( range => {
            boundaries.add( range.start );
            boundaries.add( range.end );
          }
        );
        psalterRepeatNoteRanges.forEach(
  range => {
    boundaries.add(
      range.start
    );

    boundaries.add(
      range.end
    );
  }
);
        psalterVerseNumberRanges.forEach( range => {
    boundaries.add( range.start );
    boundaries.add( range.end );
  }
);
        saved.forEach( range => {
            boundaries.add( range.start );
            boundaries.add( range.end );
          }
        );
        if (active) {
          boundaries.add( active.start );
          boundaries.add( active.end );
        }
        const points = Array.from( boundaries ) .map(Number) .filter( value => Number.isFinite( value ) &&
                value >= 0 && value <= text.length ) .sort( (a, b) => a - b );
        const fragment = document.createDocumentFragment();
        for ( let index = 0;
          index < points.length - 1;
          index += 1 ) {
          const start = points[index];
          const end = points[ index + 1 ];
          if ( end <= start ) {
            continue;
          }
          const midpoint = start + ( end - start ) / 2;
          const isSaved = saved.some( range => midpoint >= range.start && midpoint < range.end );
          const isActive = !!active && midpoint >= active.start && midpoint < active.end;
          const span = document.createElement( 'span' );
          if (isSaved) {
            span.classList.add( 'saved-highlight' );
          }
          if (isActive) {
            span.classList.add( 'active-highlight' );
          }
          const isAkathistInitial = isAkathist && akathistInitialRanges.some( range => midpoint >=
                  range.start && midpoint <
                  range.end );
          if ( isAkathistInitial ) {
            span.classList.add( 'akathist-initial' );
          }
          const isPsalterPrayerAccent =
            isPsalterPrayer &&
            psalterPrayerAccentRanges.some(
              range =>
                midpoint >= range.start &&
                midpoint < range.end
            );

          const isPsalterPrayerInitial =
            isPsalterPrayer &&
            psalterPrayerInitialRanges.some(
              range =>
                midpoint >= range.start &&
                midpoint < range.end
            );

          const isPsalterRubric =
            isPsalterPrayer &&
            psalterRubricRanges.some(
              range =>
                midpoint >= range.start &&
                midpoint < range.end
            );

          const textBeforeSegment =
            text.slice(0, start).trimEnd();

          const followsPsalterHeading =
            /(?:Трисвятое по Отче наш:|Тропар(?:ь|и)\s+(?:сия|покаянн(?:ый|ые|ыя))\s*,?\s*глас\s*(?:6|шест(?:ой|ый))\s*:*)$/iu
              .test(textBeforeSegment);

          const followsRubric =
            psalterRubricRanges.some(
              range =>
                range.end <= start &&
                text.slice(range.end, start).trim() === ''
            );

          if (
            isPsalterPrayerInitial &&
            start > 0 &&
            !followsPsalterHeading &&
            !followsRubric
          ) {
            appendPsalterSeparator(fragment);
          }

          if (isPsalterPrayerInitial) {
            span.classList.add(
              'psalter-prayer-initial'
            );
          }

          const psalterRubricText =
            isPsalterRubric
              ? text.slice(start, end).trim()
              : '';

          const normalizedPsalterRubricText =
            psalterRubricText
              .normalize('NFD')
              .replace(
                /[\u0300-\u036f\u0483-\u0487]/g,
                ''
              )
              .trim()
              .toLowerCase();

          if (isPsalterRubric) {
            const isInlineRubric =
              normalizedPsalterRubricText.startsWith(
                'и поклонись'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'и поклонися'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'и поклонов'
              );

            const needsSeparatorBeforeTransitionRubric =
              normalizedPsalterRubricText.startsWith(
                'аще ли ни'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'если мирянин'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'Также постой мало,'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'Затем постой немного,'
              );

            if (
              needsSeparatorBeforeTransitionRubric &&
              start > 0
            ) {
              span.classList.add(
    'psalter-prayer-rubric-separator-before'
  );
            }

            span.classList.add(
              'psalter-prayer-rubric'
            );

            span.classList.add(
              isInlineRubric
                ? 'psalter-prayer-rubric-inline'
                : 'psalter-prayer-rubric-block'
            );
          }

          if (isPsalterPrayerAccent) {
            span.classList.add(
              'psalter-prayer-accent'
            );
          }

          const isPsalterRepeatNote =
            psalterRepeatNoteRanges.some(
              range =>
                midpoint >= range.start &&
                midpoint < range.end
            );

          if (isPsalterRepeatNote) {
            span.classList.add(
              'psalter-repeat-note'
            );
          }

          const isPsalterVerseNumber = isPsalterText && psalterVerseNumberRanges.some( range =>
      midpoint >= range.start && midpoint < range.end );
if (isPsalterVerseNumber) {
  span.classList.add( 'psalter-verse-number' );
}
          const isRussian = String( itemConfig ?.className || '' ).includes( 'russian' ) || itemConfig
              ?.metadata ?.language === 'russian';
const isCanonChurch = String( itemConfig ?.className || '' ).includes( 'canon-church' ) && !isRussian;
const isCanonPrayer = itemConfig ?.metadata ?.section_type === 'prayer' || String( itemConfig ?.className ||
    '' ).includes( 'canon-prayer' );
const highlightLiturgicalPhrases =
  isPsalterPrayer ||
  (!isRussian && !isCanonPrayer);

appendStyledSegment(
  span,
  text.slice(start, end),
  itemConfig?.accentWords,
  highlightLiturgicalPhrases,
  isCanonChurch && start === 0
);
 
const psalterPrayerAccentText =
  isPsalterPrayerAccent
    ? text.slice(start, end).trim()
    : '';

const normalizedPsalterPrayerAccentText =
  psalterPrayerAccentText
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f\u0483-\u0487]/g,
      ''
    )
    .trim();

const isPsalterMetaAccent =
  /^Тропар(?:ь|и)\s+/iu.test(
    normalizedPsalterPrayerAccentText
  ) ||
  /^Господи,\s*помилуй\s*\((?:3|40)\)\.?$/iu.test(
    normalizedPsalterPrayerAccentText
  );

if (isPsalterMetaAccent) {
  span.classList.add(
    'psalter-prayer-meta'
  );
}

const isPrayerHeading =
  /^Молитва(?:\s|$)/iu.test(
    normalizedPsalterPrayerAccentText
  ) ||
  /^Свят(?:ейшей|ей|ой)\s+Живоначальн(?:ей|ой)\s+Троице/iu.test(
    normalizedPsalterPrayerAccentText
  ) ||
  /^Таже\s+молитва/iu.test(
    normalizedPsalterPrayerAccentText
  );

const needsSeparatorBeforeHeading =
  isPsalterPrayerAccent &&
  start > 0 &&
  (
    isPrayerHeading ||
    /^Тропар(?:ь|и)\s+/iu.test(
      normalizedPsalterPrayerAccentText
    )
  );

if (needsSeparatorBeforeHeading) {
  appendPsalterSeparator(fragment);
}

if (isPrayerHeading) {
  span.classList.add(
    'psalter-prayer-title'
  );
}

fragment.appendChild(span);

/* Блочная служебная пометка сама переносит следующий текст.
   Дополнительные <br> и разделитель здесь не нужны. */

const needsLineBreakAfter =
  psalterPrayerAccentText ===
    'Трисвятое по Отче наш:';

const hasLineBreakAfter =
  text[end] === '\n' ||
  text[end] === '\r';

if (
  needsLineBreakAfter &&
  !hasLineBreakAfter
) {
  fragment.appendChild(
    document.createElement('br')
  );
}

if (
  isAkathist &&
  akathistJoyBreaks.has(end)
) {
  fragment.appendChild(
    document.createElement('br')
  );
}
         
        }
        root.replaceChildren( fragment );
        hideKnownEditorialMarkers( root );
        collapsePsalterRubricTrailingWhitespace( root );
        compactParagraphGaps( root );
      };
    const refreshSavedBookRunClasses = () => {
        if (!bookMode) {
          return;
        }
        document .querySelectorAll( '.saved-run-start, .saved-run-end' ) .forEach( node => {
              node.classList.remove( 'saved-run-start' );
              node.classList.remove( 'saved-run-end' );
            }
          );
        document .querySelectorAll( '.book-page' ) .forEach( page => {
              const items = Array.from( page.children ) .filter( node => node.classList ?.contains(
                          'rule-item' ) );
              let runStart = null;
              items.forEach( ( item, index ) => {
                  const saved = item.classList .contains( 'whole-saved' );
                  const nextSaved = items[ index + 1 ] ?.classList ?.contains( 'whole-saved' );
                  if ( saved && !runStart ) {
                    runStart = item;
                    item.classList.add( 'saved-run-start' );
                  }
                  if ( saved && !nextSaved ) {
                    item.classList.add( 'saved-run-end' );
                    runStart = null;
                  }
                }
              );
            }
          );
      };
    const setSectionWholeHighlight = ( actionKey, _savedItemId, active ) => {
      const documentWide = DATA.document.action?.key === actionKey && DATA.document.action ?.highlightContent;
      if (documentWide) {
        document .querySelectorAll( '.rule-item' ) .forEach( wrapper => wrapper.classList.toggle(
                'whole-saved', !!active ) );
        refreshSavedBookRunClasses();
        return;
      }
      const groupedWrappers = document.querySelectorAll( '.rule-item[data-highlight-group-key="' + actionKey +
          '"]' );
      if ( groupedWrappers.length ) {
        groupedWrappers.forEach( wrapper => wrapper.classList.toggle( 'whole-saved', !!active ) );
        refreshSavedBookRunClasses();
        return;
      }
      const wrapper = document.querySelector( '.rule-item[data-action-key="' + actionKey + '"]' );
      wrapper?.classList.toggle( 'whole-saved', !!active );
      refreshSavedBookRunClasses();
    };
    const loadSavedRanges = () => {
        ( DATA.savedItems || [] ).forEach( item => {
            const itemId = Number( item.anchor_id );
            const text = itemTextMap.get( itemId );
            if (!text) {
              return;
            }
            const range = normalizeRange( text, Number( item.start_offset ), Number( item.end_offset ) );
            if ( range.end <= range.start ) {
              return;
            }
            const current = savedRanges.get( itemId ) || [];
            current.push({
              id: item.id, start: range.start, end: range.end, });
            savedRanges.set( itemId, current );
          }
        );
        ( DATA.document.sections || [] ).forEach( section => {
            if ( section.action ?.highlightContent && section.action ?.active ) {
              setSectionWholeHighlight( section.action.key, section.action .savedItemId || section.action.key,
                true );
            }
          }
        );
        if ( DATA.document.action ?.highlightContent && DATA.document.action ?.active ) {
          setSectionWholeHighlight( DATA.document.action.key, DATA.document.action .savedItemId ||
              DATA.document.action.key, true );
        }
      };
    const textOffsetFromPoint = ( clientX, clientY, expectedItemId = null ) => {
      let caret = null;
      if ( document.caretRangeFromPoint ) {
        caret = document.caretRangeFromPoint( clientX, clientY );
      } else if ( document.caretPositionFromPoint ) {
        const position = document.caretPositionFromPoint( clientX, clientY );
        if (position) {
          caret = document.createRange();
          caret.setStart( position.offsetNode, position.offset );
          caret.collapse( true );
        }
      }
      if (!caret) {
        return null;
      }
      const node = caret.startContainer;
      const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      const root = parent?.closest( '.reader-text' );
      if (!root) {
        return null;
      }
      const itemId = Number( root.dataset.itemId );
      if ( expectedItemId !== null && Number( expectedItemId ) !== itemId ) {
        return null;
      }
      const walker = document.createTreeWalker( root, NodeFilter.SHOW_TEXT );
      let total = 0;
      let current = null;
      while ( ( current = walker.nextNode() ) ) {
        if ( current === node ) {
          total += caret.startOffset;
          return {
            itemId, offset: total, };
        }
        total += current.textContent .length;
      }
      return null;
    };
    const wordRangeAt = ( text, offset ) => {
      if (!text.length) {
        return null;
      }
      const isWordChar = character =>
          /[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\\u0400-\\u052F\\u0300-\\u036F\\u0483-\\u0489'’\\-]/ .test( character ||
              '' );
      let cursor = Math.max( 0, Math.min( offset, text.length - 1 ) );
      if ( !isWordChar( text[cursor] ) ) {
        const nearby = [0, -1, 1, -2, 2] .map(delta => cursor + delta ) .find(index => index >= 0 &&
              index < text.length && isWordChar( text[index] ) );
        if ( nearby === undefined ) {
          return null;
        }
        cursor = nearby;
      }
      let start = cursor;
      let end = cursor;
      while ( start > 0 && isWordChar( text[ start - 1 ] ) ) {
        start -= 1;
      }
      while ( end < text.length && isWordChar( text[end] ) ) {
        end += 1;
      }
      return {
        start, end, };
    };
    const domRange = ( itemId, start, end ) => {
      const root = document.querySelector( '.reader-text[data-item-id="' + itemId + '"]' );
      if (!root) {
        return null;
      }
      const locate = targetOffset => {
          const walker = document.createTreeWalker( root, NodeFilter.SHOW_TEXT );
          let total = 0;
          let node = null;
          while ( ( node = walker.nextNode() ) ) {
            const length = node.textContent .length;
            if ( targetOffset <= total + length ) {
              return {
                node, offset: Math.max( 0, Math.min( targetOffset - total, length ) ), };
            }
            total += length;
          }
          return null;
        };
      const from = locate( start );
      const to = locate( end );
      if ( !from || !to ) {
        return null;
      }
      const range = document.createRange();
      range.setStart( from.node, from.offset );
      range.setEnd( to.node, to.offset );
      return range;
    };
    const updateHandles = () => {
        if (!state.active) {
          startHandle.style.display = 'none';
          endHandle.style.display = 'none';
          return;
        }
        const range = domRange( state.active.itemId, state.active.start, state.active.end );
        if (!range) {
          return;
        }
        const rects = Array.from( range.getClientRects() );
        if (!rects.length) {
          return;
        }
        const first = rects[0];
        const last = rects[ rects.length - 1 ];
        startHandle.style.display = 'block';
        endHandle.style.display = 'block';
        startHandle.style.left = ( first.left - 18 ) + 'px';
        startHandle.style.top = ( first.bottom - 3 ) + 'px';
        endHandle.style.left = ( last.right - 18 ) + 'px';
        endHandle.style.top = ( last.bottom - 3 ) + 'px';
      };
    const updateBar = () => {
        if (!state.active) {
          selectionBar.classList .remove( 'visible' );
          return;
        }
        const count = state.active.end - state.active.start;
        selectionBar.classList .add( 'visible' );
        selectionCount.textContent = count + ' симв.';
        selectionCount.classList .remove( 'error' );
        selectionHint.classList .remove( 'error' );
        if ( !state.savePending ) {
          selectionHint.textContent = 'Выделенный фрагмент';
        }
        const savedRange = removableSavedRange( state.active );
        saveButton.textContent = savedRange ? 'Удалить' : 'Сохранить';
        saveButton.classList.toggle( 'delete-mode', !!savedRange );
        saveButton.disabled = count <= 0 || state.savePending;
      };
    const setActive = ( itemId, start, end, anchorStart, anchorEnd ) => {
      const text = itemTextMap.get( Number( itemId ) );
      if (!text) {
        return;
      }
      const range = normalizeRange( text, Math.min( start, end ), Math.max( start, end ) );
      if ( range.end <= range.start ) {
        return;
      }
      state.active = {
        itemId: Number( itemId ), start: range.start, end: range.end, anchorStart: anchorStart, anchorEnd:
          anchorEnd, };
      renderTextItem( itemId );
      updateHandles();
      updateBar();
    };
    const clearSelection = () => {
        if (!state.active) {
          return;
        }
        const itemId = state.active.itemId;
        state.active = null;
        state.drag = null;
        state.pointer = null;
        state.lastDragPoint = null;
        state.savePending = false;
        if ( state.longPressTimer ) {
          clearTimeout( state.longPressTimer );
          state.longPressTimer = null;
        }
        renderTextItem( itemId );
        updateHandles();
        updateBar();
      };
    const activateAtPoint = ( x, y, pointerId ) => {
      const point = textOffsetFromPoint( x, y );
      if (!point) {
        return false;
      }
      const text = itemTextMap.get( point.itemId );
      const word = wordRangeAt( text, point.offset );
      if (!word) {
        return false;
      }
      setActive( point.itemId, word.start, word.end, word.start, word.end );
      state.drag = {
        mode: 'initial', pointerId, itemId: point.itemId, };
      return true;
    };
    const updateFromPoint = ( clientX, clientY ) => {
      if ( !state.active || !state.drag ) {
        return;
      }
      const point = textOffsetFromPoint( clientX, clientY, state.active.itemId );
      if (!point) {
        return;
      }
      const text = itemTextMap.get( state.active.itemId );
      let start = state.active.start;
      let end = state.active.end;
      if ( state.drag.mode === 'start' ) {
        if ( point.offset < end ) {
          start = point.offset;
        } else {
          start = end;
          end = Math.max( point.offset, start + 1 );
          state.drag.mode = 'end';
        }
      } else if ( state.drag.mode === 'end' ) {
        if ( point.offset > start ) {
          end = point.offset;
        } else {
          end = start;
          start = Math.min( point.offset, end - 1 );
          state.drag.mode = 'start';
        }
      } else if ( point.offset < state.active.anchorStart ) {
        start = point.offset;
        end = state.active.anchorEnd;
      } else {
        start = state.active.anchorStart;
        end = Math.max( point.offset, state.active.anchorEnd );
      }
      start = Math.max( 0, Math.min( start, text.length ) );
      end = Math.max( 0, Math.min( end, text.length ) );
      setActive( state.active.itemId, start, end, state.active.anchorStart, state.active.anchorEnd );
    };
    const autoScroll = () => {
      if ( bookMode || !state.drag || !state.lastDragPoint ) {
        state.autoScrollFrame = null;
        return;
      }
      const point = state.lastDragPoint;
      const topZone = 62;
      const bottomZone = window.innerHeight - 92;
      let delta = 0;
      if ( point.y < topZone ) {
        delta = -Math.max( 4, ( topZone - point.y ) / 4 );
      } else if ( point.y > bottomZone ) {
        delta = Math.max( 4, ( point.y - bottomZone ) / 4 );
      }
      if (delta) {
        window.scrollBy( 0, delta );
        updateFromPoint( point.x, Math.max( 20, Math.min( point.y, window.innerHeight - 80 ) ) );
      }
      state.autoScrollFrame = requestAnimationFrame( autoScroll );
    };
    const ensureAutoScroll = () => {
        if ( state.autoScrollFrame ) {
          return;
        }
        state.autoScrollFrame = requestAnimationFrame( autoScroll );
      };
    const beginHandleDrag = ( mode, event ) => {
      if (!state.active) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget .setPointerCapture( event.pointerId );
      state.drag = {
        mode, pointerId: event.pointerId, itemId: state.active.itemId, };
      state.lastDragPoint = {
        x: event.clientX, y: event.clientY, };
      ensureAutoScroll();
    };
    const moveHandle = event => {
        if ( !state.drag || state.drag.pointerId !== event.pointerId ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        state.lastDragPoint = {
          x: event.clientX, y: event.clientY, };
        updateFromPoint( event.clientX, event.clientY );
        ensureAutoScroll();
      };
    const endHandleDrag = event => {
        if ( !state.drag || state.drag.pointerId !== event.pointerId ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        state.drag = null;
        state.lastDragPoint = null;
      };
    startHandle.addEventListener( 'pointerdown', event => beginHandleDrag( 'start', event ) );
    endHandle.addEventListener( 'pointerdown', event => beginHandleDrag( 'end', event ) );
    startHandle.addEventListener( 'pointermove', moveHandle );
    endHandle.addEventListener( 'pointermove', moveHandle );
    startHandle.addEventListener( 'pointerup', endHandleDrag );
    endHandle.addEventListener( 'pointerup', endHandleDrag );
    startHandle.addEventListener( 'pointercancel', endHandleDrag );
    endHandle.addEventListener( 'pointercancel', endHandleDrag );
    document.addEventListener( 'contextmenu', event => event.preventDefault() );
    reader.addEventListener( 'pointerdown', event => {
        const root = event.target.closest( '.reader-text' );
        if (!root) {
          return;
        }
        if (state.active) {
          clearSelection();
        }
        state.pointer = {
          pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX,
          lastY: event.clientY, activated: false, };
        state.longPressTimer = setTimeout( () => {
              if ( !state.pointer || state.pointer.pointerId !== event.pointerId ) {
                return;
              }
              state.pointer.activated = activateAtPoint( state.pointer.lastX, state.pointer.lastY,
                  event.pointerId );
            }, 480 );
      }, {
        passive: true, } );
    reader.addEventListener( 'pointermove', event => {
        if ( !state.pointer || state.pointer.pointerId !== event.pointerId ) {
          return;
        }
        state.pointer.lastX = event.clientX;
        state.pointer.lastY = event.clientY;
        if ( !state.pointer.activated ) {
          const distance = Math.hypot( event.clientX - state.pointer.startX, event.clientY -
                state.pointer.startY );
          if ( distance > 14 && state.longPressTimer ) {
            clearTimeout( state.longPressTimer );
            state.longPressTimer = null;
          }
          return;
        }
        event.preventDefault();
        state.lastDragPoint = {
          x: event.clientX, y: event.clientY, };
        updateFromPoint( event.clientX, event.clientY );
        ensureAutoScroll();
      }, {
        passive: false, } );
    const finishPointer = event => {
        if ( !state.pointer || state.pointer.pointerId !== event.pointerId ) {
          return;
        }
        if ( state.longPressTimer ) {
          clearTimeout( state.longPressTimer );
          state.longPressTimer = null;
        }
        state.pointer = null;
        if ( state.drag?.mode === 'initial' ) {
          state.drag = null;
          state.lastDragPoint = null;
        }
      };
    reader.addEventListener( 'pointerup', finishPointer );
    reader.addEventListener( 'pointercancel', finishPointer );
    const clampBookPage = page => Math.max( 0, Math.min( Math.max( 0, state.bookPageCount - 1 ), Number(
              page || 0 ) ) );
    const updateBookPageIndicator = () => {
        if ( !bookMode || !bookPageIndicator ) {
          return;
        }
        bookPageIndicator .textContent = ( state.bookPage + 1 ) + ' / ' + state.bookPageCount;
      };
    const applyBookPage = ( page, animated = false, dragOffset = 0 ) => {
        if ( !bookMode || !bookViewport ) {
          return;
        }
        state.bookPage = clampBookPage( page );
        const pages = Array.from( reader.querySelectorAll( ':scope > .book-page' ) );
        pages.forEach( ( pageNode, index ) => {
            const active = index === state.bookPage;
            pageNode.classList .toggle( 'active', active );
            pageNode.style .transform = active && dragOffset ? 'translate3d(' + ( dragOffset * 0.08 ) +
                  'px,0,0)' : 'translateZ(0)';
            pageNode.style .transition = animated ? 'transform 140ms ease-out, opacity 120ms ease-out'
                : 'none';
          }
        );
        bookViewport.scrollLeft = 0;
        updateBookPageIndicator();
      };
    const bookSourceNodes = () => {
        const nodes = [];
        Array.from( reader.children ).forEach( child => {
            if ( child.classList ?.contains( 'book-page' ) ) {
              nodes.push( ...Array.from( child.children ) );
              return;
            }
            nodes.push( child );
          }
        );
        return nodes;
      };
    const createBookPage = index => {
        const page = el( 'div', 'book-page' );
        page.dataset.pageIndex = String( index );
        reader.appendChild( page );
        return page;
      };
    const paginateBookContent = () => {
        if ( !bookMode || !bookViewport ) {
          return;
        }
        const currentAnchor = reader.querySelector( '.book-page.active .rule-item[data-track-progress="true"]'
          ) ?.dataset ?.itemId || null;
        const nodes = bookSourceNodes();
        reader.replaceChildren();
        reader.classList.add( 'book-track' );
        bookViewport.scrollLeft = 0;
        state.bookPageWidth = Math.max( 1, bookViewport .clientWidth );
        let page = createBookPage( 0 );
        const newPage = () => {
            page = createBookPage( reader.children .length );
            return page;
          };
        nodes.forEach( node => {
            const chapterStart = node.classList ?.contains( 'bible-chapter-start' );
            if ( chapterStart && page.childElementCount ) {
              const used = page.scrollHeight;
              const half = Math.max( 1, page.clientHeight * 0.5 );
              if ( used > half ) {
                newPage();
              }
            }
            const hadContent = page.childElementCount > 0;
            page.appendChild( node );
            const overflowed = page.scrollHeight > page.clientHeight + 1;
            if ( overflowed && hadContent ) {
              page.removeChild( node );
              newPage();
              page.appendChild( node );
            }
          }
        );
        if ( reader.children .length > 1 && !reader.lastElementChild ?.childElementCount ) {
          reader.lastElementChild .remove();
        }
        state.bookPageCount = Math.max( 1, reader.children .length );
        Array.from( reader.children ).forEach( ( pageNode, index ) => {
            pageNode.dataset.pageIndex = String( index );
          }
        );
        refreshSavedBookRunClasses();
        if ( currentAnchor ) {
          const anchor = reader.querySelector( '.rule-item[data-item-id="' + currentAnchor + '"]' );
          if (anchor) {
            state.bookPage = pageForElement( anchor );
          }
        }
        state.bookPage = clampBookPage( state.bookPage );
        applyBookPage( state.bookPage, false );
      };
    const refreshBookPagination = () => {
        paginateBookContent();
      };
    const canTurnBookPage = direction => direction === 'next' ? state.bookPage < state.bookPageCount - 1
          : state.bookPage > 0;
    const pageForElement = element => {
        if ( !bookMode || !element ) {
          return 0;
        }
        const page = element.closest( '.book-page' );
        if (!page) {
          return 0;
        }
        return clampBookPage( Number( page.dataset .pageIndex || 0 ) );
      };
    const resetBookGestureVisual = () => {
        if (!bookMode) {
          return;
        }
        applyBookPage( state.bookPage, true );
      };
    const settleBookPage = page => {
        if (!bookMode) {
          return;
        }
        state.pageTurning = true;
        applyBookPage( page, true );
        setTimeout( () => {
            state.pageTurning = false;
            reportProgress();
          }, 210 );
      };
    document.addEventListener( 'pointerdown', event => {
        if ( !bookMode || state.active || state.pageTurning || event.target.closest(
            '#selection-bar, .selection-handle, button' ) ) {
          return;
        }
        state.bookGesture = {
          pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX,
          lastY: event.clientY, };
      }, {
        passive: true, } );
    document.addEventListener( 'pointermove', event => {
        const gesture = state.bookGesture;
        if ( !gesture || gesture.pointerId !== event.pointerId || state.active || state.pageTurning ) {
          return;
        }
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        const dx = gesture.lastX - gesture.startX;
        const dy = gesture.lastY - gesture.startY;
        if ( Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.15 ) {
          return;
        }
        event.preventDefault();
        const direction = dx < 0 ? 'next' : 'previous';
        const resistance = canTurnBookPage( direction ) ? 0.82 : 0.16;
        const limitedOffset = Math.max( -( state.bookPageWidth * 0.92 ), Math.min( state.bookPageWidth * 0.92,
              dx * resistance ) );
        applyBookPage( state.bookPage, false, limitedOffset );
      }, {
        passive: false, } );
    const finishBookGesture = event => {
        const gesture = state.bookGesture;
        if ( !gesture || gesture.pointerId !== event.pointerId ) {
          return;
        }
        state.bookGesture = null;
        if ( state.active || state.pageTurning ) {
          resetBookGestureVisual();
          return;
        }
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        const horizontalSwipe = Math.abs(dx) >= Math.max( 58, state.bookPageWidth * 0.16 ) && Math.abs(dx) >
            Math.abs(dy) * 1.25;
        if (!horizontalSwipe) {
          resetBookGestureVisual();
          return;
        }
        const direction = dx < 0 ? 'next' : 'previous';
        if ( !canTurnBookPage( direction ) ) {
          resetBookGestureVisual();
          return;
        }
        settleBookPage( state.bookPage + ( direction === 'next' ? 1 : -1 ) );
      };
    document.addEventListener( 'pointerup', finishBookGesture );
    document.addEventListener( 'pointercancel', event => {
        if ( state.bookGesture ?.pointerId === event.pointerId ) {
          state.bookGesture = null;
          resetBookGestureVisual();
        }
      }
    );
    document.addEventListener( 'pointerdown', event => {
        if (!state.active) {
          return;
        }
        if ( event.target.closest( '#selection-bar, .selection-handle, .active-highlight' ) ) {
          return;
        }
        clearSelection();
      }, true );
    reader.addEventListener( 'click', event => {
        const action = event.target.closest( '.section-action, .document-action' );
        if (!action) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        post({
          type: 'section-action',
          actionKey: action.dataset .actionKey, });
      }
    );
    const sentenceRange = ( text, anchor ) => {
      let start = anchor;
      let end = anchor;
      while ( start > 0 && !/[.!?…]/.test( text[start - 1] ) ) {
        start -= 1;
      }
      while ( start < text.length && /\\s/.test( text[start] ) ) {
        start += 1;
      }
      while ( end < text.length && !/[.!?…]/.test( text[end] ) ) {
        end += 1;
      }
      if ( end < text.length ) {
        end += 1;
      }
      return normalizeRange( text, start, end );
    };
    const paragraphRange = ( text, anchor ) => {
      const before = text.slice( 0, anchor );
      const after = text.slice( anchor );
      const left = Math.max( before.lastIndexOf( '\\n\\n' ), before.lastIndexOf( '\\r\\n\\r\\n' ) );
      const candidates = [ after.indexOf( '\\n\\n' ), after.indexOf( '\\r\\n\\r\\n' ), ].filter( value =>
            value >= 0 );
      const right = candidates.length ? Math.min( ...candidates ) : -1;
      return normalizeRange( text, left === -1 ? 0 : left + 2, right === -1 ? text.length : anchor + right );
    };
    const classify = active => {
        const text = itemTextMap.get( active.itemId ) || '';
        const range = normalizeRange( text, active.start, active.end );
        const whole = normalizeRange( text, 0, text.length );
        const selected = text .slice( range.start, range.end ) .trim();
        const itemConfig = itemConfigMap.get( active.itemId );
        if ( itemConfig?.fullSaveType && range.start === whole.start && range.end === whole.end ) {
          return itemConfig.fullSaveType;
        }
        if ( /^[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\\u0400-\\u052F\\u0300-\\u036F\\u0483-\\u0489'’\\-]+$/ .test(
              selected ) ) {
          return 'word';
        }
        const sentence = sentenceRange( text, range.start );
        if ( sentence.start === range.start && sentence.end === range.end ) {
          return 'sentence';
        }
        const paragraph = paragraphRange( text, range.start );
        if ( paragraph.start === range.start && paragraph.end === range.end ) {
          return 'paragraph';
        }
        return 'fragment';
      };
    cancelButton.addEventListener( 'click', event => {
        event.preventDefault();
        event.stopPropagation();
        clearSelection();
      }
    );
    saveButton.addEventListener( 'click', event => {
        event.preventDefault();
        event.stopPropagation();
        if ( !state.active || state.savePending ) {
          return;
        }
        const count = state.active.end - state.active.start;
        if ( count <= 0 ) {
          return;
        }
        const savedRange = removableSavedRange( state.active );
        if (savedRange) {
          state.savePending = true;
          selectionHint.textContent = 'Удаляем...';
          updateBar();
          post({
            type: 'remove-selection', itemId: state.active.itemId, savedItemId: Number( savedRange.id ), });
          return;
        }
        const text = itemTextMap.get( state.active.itemId ) || '';
        const selectedText = text .slice( state.active.start, state.active.end ) .trim();
        if (!selectedText) {
          return;
        }
        state.savePending = true;
        selectionHint.textContent = 'Сохраняем...';
        updateBar();
        post({
          type: 'save-selection', itemId: state.active.itemId, start: state.active.start, end:
            state.active.end, text: selectedText, saveType: classify( state.active ), itemTitle:
            itemTitleMap.get( state.active.itemId ) || 'Молитва', });
      }
    );
    const reportProgress = () => {
        if ( state.restoring ) {
          return;
        }
        const items = Array.from( document.querySelectorAll( '.rule-item[data-track-progress="true"]' ) );
        if (!items.length) {
          return;
        }
        if (bookMode) {
          const currentPage = reader.querySelector( '.book-page[data-page-index="' + state.bookPage + '"]' );
          const current = currentPage ?.querySelector( '.rule-item[data-track-progress="true"]' ) || items[0];
          const denominator = Math.max( 1, state.bookPageCount - 1 );
          const progressPercent = state.bookPageCount <= 1 ? 100 : Math.round( ( state.bookPage / denominator
                  ) * 100 );
          post({
            type: 'progress',
            anchorId: Number( current.dataset .itemId ),
            offset: state.bookPage,
            pageIndex: state.bookPage,
            pageCount: state.bookPageCount,
            progressPercent, });
          return;
        }
        const center = window.scrollY + ( window.innerHeight / 2 );
        let current = items[0];
        let bestDistance = Infinity;
        items.forEach( item => {
            const top = item.offsetTop;
            const bottom = top + item.offsetHeight;
            const distance = center < top ? top - center : center > bottom ? center - bottom : 0;
            if ( distance < bestDistance ) {
              bestDistance = distance;
              current = item;
            }
          }
        );
        const offset = Math.max( 0, Math.min( current.offsetHeight, center - current.offsetTop ) );
        const documentHeight = Math.max( document.body.scrollHeight, document.documentElement.scrollHeight );
        const maxScroll = Math.max( 0, documentHeight - window.innerHeight );
        const progressPercent = maxScroll > 0 ? Math.round( ( window.scrollY / maxScroll ) * 100 ) : 100;
        post({
          type: 'progress',
          anchorId: Number( current.dataset.itemId ),
          offset: Math.round( offset ),
          progressPercent: Math.max( 0, Math.min( progressPercent, 100 ) ), });
      };
    const updateScrollControls = () => {
        const documentHeight = Math.max( document.body.scrollHeight, document.documentElement.scrollHeight );
        const maxScroll = Math.max( 0, documentHeight - window.innerHeight );
        if ( maxScroll <= 16 ) {
          scrollTrack.classList .remove('visible');
          scrollTopButton.classList .remove('visible');
          return;
        }
        const trackHeight = Math.max( 1, scrollTrack.clientHeight );
        const thumbHeight = Math.max( 44, Math.min( trackHeight, trackHeight * ( window.innerHeight /
                documentHeight ) ) );
        const maxThumbTop = Math.max( 0, trackHeight - thumbHeight );
        const thumbTop = maxScroll ? ( window.scrollY / maxScroll ) * maxThumbTop : 0;
        scrollThumb.style.height = thumbHeight + 'px';
        scrollThumb.style.transform = 'translateY(' + thumbTop + 'px)';
      };
    const showScrollControls = direction => {
        updateScrollControls();
        scrollTrack.classList .add('visible');
        scrollTopButton.classList.toggle( 'visible', direction === 'up' && window.scrollY >
            window.innerHeight * 0.65 );
        if ( state.scrollUiTimer ) {
          clearTimeout( state.scrollUiTimer );
        }
        state.scrollUiTimer = setTimeout( () => {
              if (scrollDrag) {
                return;
              }
              scrollTrack.classList .remove('visible');
              scrollTopButton.classList .remove('visible');
            }, 950 );
      };
    let scrollDrag = null;
    const getScrollMetrics = () => {
        const documentHeight = Math.max( document.body.scrollHeight, document.documentElement.scrollHeight );
        return {
          maxScroll: Math.max( 0, documentHeight - window.innerHeight ),
          trackHeight: Math.max( 1, scrollTrack.clientHeight ),
          thumbHeight: Math.max( 1, scrollThumb.offsetHeight ), };
      };
    const beginScrollDrag = event => {
        showScrollControls( 'none' );
        const metrics = getScrollMetrics();
        scrollDrag = {
          pointerId: event.pointerId,
          startY: event.clientY,
          startScroll: window.scrollY,
          ...metrics, };
        try {
          event.currentTarget ?.setPointerCapture?.( event.pointerId );
        } catch {
          // Некоторые Android WebView не поддерживают pointer capture стабильно.
        }
      };
    const moveScrollDrag = event => {
        if ( !scrollDrag || event.pointerId !== scrollDrag.pointerId ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const maxThumbTop = Math.max( 1, scrollDrag.trackHeight - scrollDrag.thumbHeight );
        const deltaY = event.clientY - scrollDrag.startY;
        window.scrollTo( 0, Math.max( 0, Math.min( scrollDrag.maxScroll, scrollDrag.startScroll + ( deltaY /
                maxThumbTop ) * scrollDrag.maxScroll ) ) );
      };
    const endScrollDrag = event => {
        if ( !scrollDrag || ( event && event.pointerId !== scrollDrag.pointerId ) ) {
          return;
        }
        scrollDrag = null;
        showScrollControls( 'none' );
      };
    scrollThumb.addEventListener( 'pointerdown', event => {
        event.preventDefault();
        event.stopPropagation();
        beginScrollDrag( event );
      }
    );
    scrollTrack.addEventListener( 'pointerdown', event => {
        if ( event.target === scrollThumb ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const rect = scrollTrack .getBoundingClientRect();
        const metrics = getScrollMetrics();
        const maxThumbTop = Math.max( 1, rect.height - metrics.thumbHeight );
        const thumbTop = Math.max( 0, Math.min( maxThumbTop, event.clientY - rect.top - (
                metrics.thumbHeight / 2 ) ) );
        window.scrollTo( 0, ( thumbTop / maxThumbTop ) * metrics.maxScroll );
        beginScrollDrag( event );
      }
    );
    document.addEventListener( 'pointermove', moveScrollDrag, {
        passive: false, } );
    document.addEventListener( 'pointerup', endScrollDrag );
    document.addEventListener( 'pointercancel', endScrollDrag );
    scrollTopButton.addEventListener( 'click', () => {
        window.scrollTo({
          top: 0, behavior: 'smooth', });
      }
    );
    window.addEventListener( 'resize', () => {
        if (bookMode) {
          setTimeout( () => {
              refreshBookPagination();
              setTimeout( reportProgress, 80 );
            }, 60 );
          return;
        }
        updateScrollControls();
      }
    );
    window.addEventListener( 'scroll', () => {
        updateHandles();
        const currentY = window.scrollY;
        const direction = currentY < state.lastScrollY ? 'up' : 'down';
        state.lastScrollY = currentY;
        showScrollControls( direction );
        if ( state.progressTimer ) {
          clearTimeout( state.progressTimer );
        }
        state.progressTimer = setTimeout( reportProgress, 120 );
      }, {
        passive: true, } );
    const getRangeRect = ( root, startOffset, endOffset ) => {
      if (!root) {
        return null;
      }
      const text = root.textContent || '';
      const start = Math.max( 0, Math.min( text.length, Number( startOffset || 0 ) ) );
      const end = Math.max( start, Math.min( text.length, Number( endOffset ?? start ) ) );
      const walker = document.createTreeWalker( root, NodeFilter.SHOW_TEXT );
      let current = null;
      let total = 0;
      let startNode = null;
      let startLocal = 0;
      let endNode = null;
      let endLocal = 0;
      while ( ( current = walker.nextNode() ) ) {
        const length = current.textContent ?.length || 0;
        if ( !startNode && start <= total + length ) {
          startNode = current;
          startLocal = Math.max( 0, Math.min( length, start - total ) );
        }
        if ( endNode === null && end <= total + length ) {
          endNode = current;
          endLocal = Math.max( 0, Math.min( length, end - total ) );
          break;
        }
        total += length;
      }
      if (!startNode) {
        return null;
      }
      if (!endNode) {
        endNode = startNode;
        endLocal = startLocal;
      }
      try {
        const range = document.createRange();
        range.setStart( startNode, startLocal );
        range.setEnd( endNode, endLocal );
        const rect = range.getBoundingClientRect();
        if ( rect && ( rect.height || rect.width ) ) {
          return rect;
        }
      } catch {
        return null;
      }
      return null;
    };
    const findFocusBlockId = target => {
        if (!target) {
          return null;
        }
        const anchorType = target.anchor_type || target.anchorType;
        const anchorId = Number( target.anchor_id ?? target.anchorId );
        const metadata = target.metadata || {};
        const candidates = [];
        itemConfigMap.forEach( ( config, itemId ) => {
            if ( config.anchorType !== anchorType || Number( config.anchorId ) !== anchorId ) {
              return;
            }
            let score = 0;
            const blockMeta = config.metadata || {};
            if ( metadata.language && blockMeta.language === metadata.language ) {
              score += 8;
            }
            if ( metadata.segment && blockMeta.segment === metadata.segment ) {
              score += 4;
            }
            if ( metadata.special && blockMeta.special === metadata.special ) {
              score += 4;
            }
            if ( metadata.chunk_index !== undefined && Number( blockMeta.chunk_index ) === Number(
                  metadata.chunk_index ) ) {
              score += 6;
            }
            candidates.push({
              itemId, score, });
          }
        );
        if (!candidates.length) {
          return null;
        }
        candidates.sort( ( left, right ) => right.score - left.score );
        return Number( candidates[0] .itemId );
      };
    const focusSavedTarget = () => {
        const target = DATA.focusTarget;
        if (!target) {
          return false;
        }
        const targetMetadata = target.metadata || {};
        const targetChapterNumber = Number( targetMetadata .chapter_number || 0 );
        if ( bookMode && targetChapterNumber ) {
          const chapterStart = document.querySelector( '.bible-chapter-start[data-chapter-number="' +
              targetChapterNumber + '"]' );
          if (chapterStart) {
            applyBookPage( pageForElement( chapterStart ), false );
            const chapterTitle = chapterStart .querySelector( '.prayer-title' );
            chapterTitle ?.classList.add( 'focus-target' );
            setTimeout( () => chapterTitle ?.classList.remove( 'focus-target' ), 1200 );
            return true;
          }
        }
        const itemId = findFocusBlockId( target );
        if (itemId) {
          const root = document.querySelector( '.reader-text[data-item-id="' + itemId + '"]' );
          if (!root) {
            return false;
          }
          const hasOffsets = target.start_offset !== null && target.start_offset !== undefined &&
            target.end_offset !== null && target.end_offset !== undefined;
          const wholeTypes = [ 'prayer', 'psalm', 'kathisma', 'chapter', 'section', 'akathist', 'canon',
            'text', ];
          const preciseRange = hasOffsets && !wholeTypes.includes( target.save_type || target.saveType );
          if (preciseRange) {
            const rect = getRangeRect( root, Number( target.start_offset ), Number( target.end_offset ) );
            if (bookMode) {
              const targetPage = pageForElement( root );
              applyBookPage( targetPage, false );
            } else if (rect) {
              const targetY = Math.max( 0, window.scrollY + rect.top + ( rect.height / 2 ) - (
                    window.innerHeight / 2 ) );
              window.scrollTo( 0, targetY );
            } else {
              root.scrollIntoView({
                block: 'center', });
            }
          } else if (bookMode) {
            applyBookPage( pageForElement( root ), false );
          } else {
            const rootRect = root.getBoundingClientRect();
            window.scrollTo( 0, Math.max( 0, window.scrollY + rootRect.top - 18 ) );
          }
          root.classList.add( 'focus-target' );
          setTimeout( () => root.classList.remove( 'focus-target' ), 1400 );
          return true;
        }
        const metadata = target.metadata || {};
        const sectionAnchorId = Number( metadata.psalm_id || metadata.section_id || target.anchor_id ||
            target.anchorId );
        if (sectionAnchorId) {
          const section = document.querySelector( '.rule-item[data-item-id="' + sectionAnchorId + '"]' );
          if (section) {
            if (bookMode) {
              applyBookPage( pageForElement( section ), false );
              return true;
            }
            const targetY = Math.max( 0, section.offsetTop - 12 );
            window.scrollTo( 0, targetY );
            return true;
          }
        }
        if ( [ 'akathist', 'canon', 'kathisma', ].includes( target.anchor_type || target.anchorType ) ) {
          window.scrollTo( 0, 0 );
          return true;
        }
        return false;
      };
    const restoreProgress = () => {
        if ( focusSavedTarget() ) {
          setTimeout( () => {
              state.restoring = false;
              if (bookMode) {
                reportProgress();
              }
            }, 350 );
          return;
        }
        const progress = DATA.progress;
        if (!progress) {
          state.restoring = false;
          reportProgress();
          return;
        }
        const item = document.querySelector( '.rule-item[data-track-progress="true"][data-item-id="' +
            progress.anchorId + '"]' );
        if (!item) {
          state.restoring = false;
          return;
        }
        if (bookMode) {
          const savedPage = DATA.document .progressOffsetMode === 'page' ? Number( progress.offset || 0 )
              : pageForElement( item );
          applyBookPage( savedPage, false );
        } else {
          const target = Math.max( 0, item.offsetTop + progress.offset - ( window.innerHeight / 2 ) );
          window.scrollTo( 0, target );
        }
        setTimeout( () => {
            state.restoring = false;
            if (bookMode) {
              reportProgress();
            }
          }, 350 );
      };
    window.readerApi = {
      saveSucceeded: ( itemId, savedItem ) => {
          itemId = Number( itemId );
          const current = savedRanges.get( itemId ) || [];
          current.push({
            id: savedItem.id, start: Number( savedItem.start_offset ), end: Number( savedItem.end_offset ),
          });
          savedRanges.set( itemId, current );
          state.savePending = false;
          clearSelection();
          renderTextItem( itemId );
        },
      removeSavedItem: ( itemId, savedItemId ) => {
          itemId = Number( itemId );
          savedItemId = Number( savedItemId );
          const current = savedRanges.get( itemId ) || [];
          savedRanges.set( itemId, current.filter( range => Number( range.id ) !== savedItemId ) );
          state.savePending = false;
          if ( state.active && Number( state.active.itemId ) === itemId ) {
            clearSelection();
          } else {
            renderTextItem( itemId );
          }
        },
      updateAction: ( actionKey, label, active, savedItemId = null ) => {
          const action = document.querySelector( '.section-action[data-action-key="' + actionKey +
              '"], .document-action[data-action-key="' + actionKey + '"]' );
          if (action) {
            action.classList .toggle( 'active', !!active );
            setSaveHeartIcon( action, !!active );
          }
          setSectionWholeHighlight( actionKey, savedItemId, !!active );
        },
      saveFailed: message => {
          state.savePending = false;
          selectionHint.textContent = message || 'Не удалось сохранить';
          selectionHint.classList .add( 'error' );
          updateBar();
        }, };
    renderDocument();
    loadSavedRanges();
    itemTextMap.forEach( ( _text, itemId ) => renderTextItem( itemId ) );
    requestAnimationFrame( () => {
        if (bookMode) {
          paginateBookContent();
        } else {
          updateScrollControls();
        }
        restoreProgress();
        setTimeout( () => {
            if (bookMode) {
              if ( !state.restoring ) {
                reportProgress();
              }
              return;
            }
            updateScrollControls();
          }, 180 );
      }
    );
  </script>
</body>
</html>
`;

const buildHtml = ({
                     documentData,
                     savedProgress,
                     focusTarget,
                     topContentInset,
                     bottomContentInset,
                   }) => {
  const payload = {
    document: documentData,

    savedItems: documentData.savedItems || [],

    progressAnchorType: documentData.progressAnchorType,

    focusTarget: focusTarget || null,

    progress:
      savedProgress && savedProgress.anchor_type === documentData.progressAnchorType
        ? {
          anchorId: Number(savedProgress.anchor_id),

          offset: Number(savedProgress.offset || 0),
        }
        : null,
  };

  const bookMode = documentData.readerMode === 'book';

  const resolvedTopPadding = bookMode
    ? Math.max(0, Number(topContentInset || 0))
    : Math.max(14, Number(topContentInset || 0) + 14);

  const resolvedBottomPadding = bookMode ? Math.max(34, Number(bottomContentInset || 0)) : 88;

  return HTML_TEMPLATE.replace('__READER_TOP_PADDING__', String(resolvedTopPadding))
    .replace('__READER_BOTTOM_PADDING__', String(resolvedBottomPadding))
    .replace('__READER_PAYLOAD__', scriptSafeJson(payload));
};

export default function SelectableDocumentReader({
                                                   documentData,
                                                   savedProgress,
                                                   focusTarget,
                                                   topContentInset = 0,
                                                   bottomContentInset = 0,
                                                   onSaved,
                                                   onProgress,
                                                   onAction,
                                                   onViewModeChange,
                                                   onPageTurn,
                                                 }) {
  const insets = useSafeAreaInsets();

  const webViewRef = useRef(null);

  const itemConfigMap = useMemo(() => {
    const result = new Map();

    (documentData.sections || []).forEach((section) => {
      (section.rows || []).forEach((row) => {
        (row.blocks || []).forEach((block) => {
          result.set(Number(block.id), block);
        });
      });
    });

    return result;
  }, [documentData.sections]);

  const html = useMemo(
    () =>
      buildHtml({
        documentData,
        savedProgress,
        focusTarget,
        topContentInset,
        bottomContentInset,
      }),
    [documentData, savedProgress, focusTarget, topContentInset, bottomContentInset]
  );

  const inject = (script) => {
    webViewRef.current?.injectJavaScript(script + '; true;');
  };

  const handleMessage = async (event) => {
    let message;

    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (message.type === 'view-mode') {
      onViewModeChange?.(message.value);

      return;
    }

    if (message.type === 'page-turn') {
      onPageTurn?.(message.direction);

      return;
    }

    if (message.type === 'progress') {
      onProgress?.({
        anchorType: documentData.progressAnchorType,

        anchorId: Number(message.anchorId),

        offset: Math.max(0, Number(message.offset || 0)),

        progressPercent: Math.max(0, Math.min(Number(message.progressPercent || 0), 100)),

        pageIndex: Number.isFinite(Number(message.pageIndex)) ? Number(message.pageIndex) : null,

        pageCount: Number.isFinite(Number(message.pageCount)) ? Number(message.pageCount) : null,
      });

      return;
    }

    if (message.type === 'section-action') {
      if (!onAction) {
        return;
      }

      try {
        const result = await onAction(message.actionKey);

        if (result) {
          inject(
            'window.readerApi && window.readerApi.updateAction(' +
            scriptSafeJson(message.actionKey) +
            ',' +
            scriptSafeJson(result.label || '') +
            ',' +
            (result.active ? 'true' : 'false') +
            ',' +
            (result.savedItem?.id || result.savedItemId || 'null') +
            ')'
          );

          if (result.savedItem && result.itemId) {
            inject(
              'window.readerApi && window.readerApi.saveSucceeded(' +
              Number(result.itemId) +
              ',' +
              scriptSafeJson(result.savedItem) +
              ')'
            );
          }

          if (result.removedSavedItemId && result.itemId) {
            inject(
              'window.readerApi && window.readerApi.removeSavedItem(' +
              Number(result.itemId) +
              ',' +
              Number(result.removedSavedItemId) +
              ')'
            );
          }
        }
      } catch (actionError) {
        console.log('Ошибка действия reader:', actionError);
      }

      return;
    }

    if (message.type === 'remove-selection') {
      try {
        await deleteSavedItem(Number(message.savedItemId));

        inject(
          'window.readerApi && window.readerApi.removeSavedItem(' +
          Number(message.itemId) +
          ',' +
          Number(message.savedItemId) +
          ')'
        );
      } catch (deleteError) {
        console.log('Ошибка удаления выделения:', deleteError.message);

        inject("window.readerApi && window.readerApi.saveFailed('Не удалось удалить')");
      }

      return;
    }

    if (message.type !== 'save-selection') {
      return;
    }

    const itemConfig = itemConfigMap.get(Number(message.itemId));

    if (!itemConfig) {
      return;
    }

    try {
      const saved = await saveItem({
        save_type: message.saveType || 'fragment',

        source_type: itemConfig.sourceType,

        source_id: itemConfig.sourceId,

        anchor_type: itemConfig.anchorType,

        anchor_id: itemConfig.anchorId,

        source_title: itemConfig.sourceTitle || documentData.title || '',

        item_title: itemConfig.itemTitle || '',

        text: message.text,

        start_offset: Number(message.start),

        end_offset: Number(message.end),

        metadata: itemConfig.metadata || {},
      });

      onSaved?.(saved, itemConfig);

      inject(
        'window.readerApi && window.readerApi.saveSucceeded(' +
        Number(message.itemId) +
        ',' +
        scriptSafeJson(saved) +
        ')'
      );
    } catch (error) {
      console.log('Ошибка сохранения выделения:', error.response?.data || error.message);

      inject("window.readerApi && window.readerApi.saveFailed('Не удалось сохранить')");
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <WebView
        ref={webViewRef}
        source={{
          html,
        }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={documentData.readerMode !== 'book'}
        nestedScrollEnabled={documentData.readerMode !== 'book'}
        showsVerticalScrollIndicator={false}
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        textZoom={100}
        onMessage={handleMessage}
        style={styles.webView}
      />

      {documentData.readerMode !== 'book' && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255, 244, 222, 0)', 'rgba(255, 244, 222, 0.72)', '#FFF4DE']}
          locations={[0, 0.58, 1]}
          style={[
            styles.bottomFade,
            {
              bottom: Math.max(insets.bottom, 8),
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF4DE',
  },

  webView: {
    flex: 1,
    backgroundColor: '#FFF4DE',
  },

  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 28,
  },
});
