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

    html,
    body {
      margin: 0;
      padding: 0;
      background: var(--background);
      color: var(--text);
      font-family: Georgia, "Times New Roman", serif;
      overscroll-behavior: contain;
    }

    body {
      padding: __READER_TOP_PADDING__px 14px 88px;
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


    .memorial-open-wrap {
      margin: 10px 0 0;
      text-align: center;
    }

    .memorial-open-inline {
      padding-top: 2px;
    }

    .memorial-open-button {
      width: min(100%, 260px);
      min-height: 40px;
      padding: 0 14px;
      border: 1px solid rgba(123, 79, 36, 0.24);
      border-radius: 12px;
      background: rgba(138, 90, 56, 0.08);
      color: var(--accent-dark);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 14px;
      line-height: 19px;
      font-weight: 700;
    }

    .memorial-open-button:active {
      background: rgba(138, 90, 56, 0.14);
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

    .section-header {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      margin-bottom: 8px;
    }

    .section-header .prayer-title {
      width: 100%;
      margin-bottom: 0;
      padding: 0 40px;
      text-align: center;
      font-size: 18px;
      line-height: 24px;
      white-space: normal;
      overflow-wrap: normal;
      word-break: normal;
    }

    .title-tail {
      display: inline-block;
      max-width: 100%;
      white-space: normal;
    }

    .favorite-action {
      position: absolute;
      top: 50%;
      left: 0;
      display: flex;
      width: 36px;
      height: 36px;
      padding: 0;
      transform: translateY(-50%);
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: rgba(241, 223, 194, 0.94);
      color: var(--secondary);
    }

    .favorite-action.active {
      color: var(--accent-dark);
      background: #F1DFC2;
      border-color: rgba(123, 79, 36, 0.28);
    }

    .save-heart-icon {
      display: block;
      width: 19px;
      height: 19px;
      flex: 0 0 19px;
      overflow: visible;
      pointer-events: none;
    }

    .prayer-title,
    .section-title {
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

    .reader-text span {
      white-space: inherit;
    }

    .reader-text.evening-minor-liturgical-text {
      font-weight: 600;
      text-align: left !important;
      text-align-last: left !important;
      text-justify: auto !important;
      word-spacing: normal;
    }

    .reader-text.evening-minor-liturgical-text span {
      color: var(--text) !important;
      font-weight: inherit !important;
    }

    /* Вечернее правило имеет несколько собственных
       типографических правил. Они намеренно не применяются
       к утренним молитвам, канонам, акафистам и т. д. */
    .evening-number-break {
      display: block;
      width: 100%;
      height: 0;
      margin: 0;
      padding: 0;
      line-height: 0;
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

    .reader-inline .reader-text {
      display: inline;
    }

    .rule-leading-cue {
      color: var(--liturgical);
      font-weight: 700;
      font-style: italic;
    }

    .rule-leading-cue.prayer-leading-cue {
      display: block;
      margin-bottom: 4px;
    }

    .translation-text {
      margin-top: 8px;
      color: var(--secondary);
      font-size: 16px;
      line-height: 26px;
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

    .liturgical-phrase {
      color: var(--liturgical);
      font-weight: 600;
    }

    .liturgical-block {
      color: var(--liturgical);
      font-weight: 600;
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

    #selection-count.error,
    #selection-hint.error {
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
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
</head>

<body>
  <main id="reader"></main>

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
    const DATA =
      __READER_PAYLOAD__;

    const reader =
      document.getElementById(
        'reader'
      );

    const selectionBar =
      document.getElementById(
        'selection-bar'
      );

    const selectionCount =
      document.getElementById(
        'selection-count'
      );

    const selectionHint =
      document.getElementById(
        'selection-hint'
      );

    const saveButton =
      document.getElementById(
        'selection-save'
      );

    const cancelButton =
      document.getElementById(
        'selection-cancel'
      );

    const startHandle =
      document.getElementById(
        'start-handle'
      );

    const endHandle =
      document.getElementById(
        'end-handle'
      );

    const scrollTrack =
      document.getElementById(
        'reader-scroll-track'
      );

    const scrollThumb =
      document.getElementById(
        'reader-scroll-thumb'
      );

    const scrollTopButton =
      document.getElementById(
        'reader-scroll-top'
      );

    const itemTextMap =
      new Map();

    const itemTitleMap =
      new Map();

    const itemLanguageMap =
      new Map();

    const savedRanges =
      new Map();

    const eveningItemKindMap =
      new Map();

    const state = {
      active: null,
      pointer: null,
      drag: null,
      longPressTimer: null,
      autoScrollFrame: null,
      lastDragPoint: null,
      restoring: true,
      progressTimer: null,
      scrollUiTimer: null,
      lastScrollY: 0,
      savePending: false,
    };


    const post = payload => {
      window.ReactNativeWebView
        ?.postMessage(
          JSON.stringify(
            payload
          )
        );
    };


    const el = (
      tag,
      className,
      text
    ) => {
      const node =
        document.createElement(
          tag
        );

      if (className) {
        node.className =
          className;
      }

      if (
        text !== undefined &&
        text !== null
      ) {
        node.textContent =
          String(text);
      }

      return node;
    };


    const setSaveHeartIcon = (
      button,
      active
    ) => {
      const svg =
        document.createElementNS(
          'http://www.w3.org/2000/svg',
          'svg'
        );

      svg.setAttribute(
        'viewBox',
        '0 0 24 24'
      );

      svg.setAttribute(
        'aria-hidden',
        'true'
      );

      svg.classList.add(
        'save-heart-icon'
      );

      const path =
        document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path'
        );

      path.setAttribute(
        'd',
        'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z'
      );

      path.setAttribute(
        'fill',
        active
        ? '#765238'
    : 'none'
      );

      path.setAttribute(
       'stroke',
       '#765238'
      );

      path.setAttribute(
        'stroke-width',
        '1.8'
      );

      path.setAttribute(
        'stroke-linecap',
        'round'
      );

      path.setAttribute(
        'stroke-linejoin',
        'round'
      );

      svg.appendChild(
        path
      );

      button.replaceChildren(
        svg
      );

      button.title =
        active
          ? 'Убрать из избранного'
          : 'Добавить в избранное';

      button.setAttribute(
        'aria-label',
        button.title
      );
    };


    const titleEl = (
      tag,
      className,
      value
    ) => {
      const node =
        el(
          tag,
          className
        );

      const text =
        String(
          value ||
          ''
        );

      const commaIndex =
        text.indexOf(
          ','
        );

      if (
        commaIndex <= 0 ||
        commaIndex >=
          text.length - 1
      ) {
        node.textContent =
          text;

        return node;
      }

      const before =
        text
          .slice(
            0,
            commaIndex + 1
          )
          .trimEnd();

      const after =
        text
          .slice(
            commaIndex + 1
          )
          .trim();

      node.appendChild(
        document.createTextNode(
          before + ' '
        )
      );

      const tail =
        el(
          'span',
          'title-tail',
          after
        );

      node.appendChild(
        tail
      );

      return node;
    };


    const compactParagraphGaps =
      root => {
        if (!root) {
          return;
        }

        const walker =
          document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT
          );

        const nodes = [];
        let current = null;
        let fullText = '';

        while (
          (
            current =
              walker.nextNode()
          )
        ) {
          nodes.push({
            node:
              current,
            start:
              fullText.length,
            end:
              fullText.length +
              current.textContent.length,
          });

          fullText +=
            current.textContent;
        }

        const ranges = [];
        const pattern =
          /\n[ \t]*\n(?:[ \t]*\n)*/g;

        let match = null;

        while (
          (
            match =
              pattern.exec(
                fullText
              )
          )
        ) {
          const secondNewline =
            match[0]
              .indexOf(
                '\n',
                1
              );

          if (
            secondNewline >= 0
          ) {
            ranges.push({
              start:
                match.index +
                secondNewline,
              end:
                match.index +
                match[0].length,
            });
          }
        }

        if (!ranges.length) {
          return;
        }

        nodes
          .slice()
          .reverse()
          .forEach(
            entry => {
              const intersections =
                ranges
                  .map(
                    range => ({
                      start:
                        Math.max(
                          range.start,
                          entry.start
                        ),
                      end:
                        Math.min(
                          range.end,
                          entry.end
                        ),
                      rangeStart:
                        range.start,
                    })
                  )
                  .filter(
                    part =>
                      part.end >
                      part.start
                  );

              if (
                !intersections.length
              ) {
                return;
              }

              const fragment =
                document.createDocumentFragment();

              let cursor = 0;

              intersections.forEach(
                part => {
                  const localStart =
                    part.start -
                    entry.start;

                  const localEnd =
                    part.end -
                    entry.start;

                  if (
                    localStart >
                    cursor
                  ) {
                    fragment.appendChild(
                      document.createTextNode(
                        entry.node.textContent.slice(
                          cursor,
                          localStart
                        )
                      )
                    );
                  }

                  const gap =
                    el(
                      'span',
                      part.start ===
                        part.rangeStart
                        ? 'paragraph-gap'
                        : 'paragraph-gap-continuation',
                      entry.node.textContent.slice(
                        localStart,
                        localEnd
                      )
                    );

                  fragment.appendChild(
                    gap
                  );

                  cursor =
                    localEnd;
                }
              );

              if (
                cursor <
                entry.node
                  .textContent
                  .length
              ) {
                fragment.appendChild(
                  document.createTextNode(
                    entry.node.textContent.slice(
                      cursor
                    )
                  )
                );
              }

              entry.node.replaceWith(
                fragment
              );
            }
          );
      };


    const hideKnownEditorialMarkers =
      root => {
        if (!root) {
          return;
        }

        const walker =
          document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT
          );

        const nodes = [];
        let node = null;

        while (
          (
            node =
              walker.nextNode()
          )
        ) {
          nodes.push(
            node
          );
        }

        nodes.forEach(
          textNode => {
            const value =
              textNode.textContent ||
              '';

            const marker =
              value.search(
                /1(?=Испове)/u
              );

            if (
              marker < 0
            ) {
              return;
            }

            const fragment =
              document.createDocumentFragment();

            if (marker > 0) {
              fragment.appendChild(
                document.createTextNode(
                  value.slice(
                    0,
                    marker
                  )
                )
              );
            }

            fragment.appendChild(
              el(
                'span',
                'editorial-marker-hidden',
                '1'
              )
            );

            if (
              marker + 1 <
              value.length
            ) {
              fragment.appendChild(
                document.createTextNode(
                  value.slice(
                    marker + 1
                  )
                )
              );
            }

            textNode.replaceWith(
              fragment
            );
          }
        );
      };


    const appendFootnotes = (
      container,
      footnotes
    ) => {
      if (
        !Array.isArray(
          footnotes
        ) ||
        !footnotes.length
      ) {
        return;
      }

      const visibleFootnotes =
        footnotes.filter(
          footnote =>
            !(
              isMorningRule &&
              Number(
                footnote?.number
              ) === 2 &&
              /при желании читается по окончании утренних молитв/i.test(
                String(
                  footnote?.content ||
                  ''
                )
              )
            )
        );

      if (!visibleFootnotes.length) {
        return;
      }

      const wrapper =
        el(
          'div',
          'footnotes'
        );

      visibleFootnotes.forEach(
        footnote => {
          wrapper.appendChild(
            el(
              'div',
              'footnote',
              '[' +
              footnote.number +
              '] ' +
              footnote.content
            )
          );
        }
      );

      container.appendChild(
        wrapper
      );
    };


    const normalizeLiturgicalValue =
      value =>
        String(
          value ||
          ''
        )
          .normalize(
            'NFD'
          )
          .replace(
            /[\u0300-\u036f\u0483-\u0487]/g,
            ''
          )
          .toLowerCase()
          .replace(
            /ё/g,
            'е'
          )
          .replace(
            /[^а-я0-9]+/g,
            ' '
          )
          .trim();

    const ruleIdentity =
      normalizeLiturgicalValue(
        [
          DATA.rule?.name,
          DATA.rule?.slug,
        ]
          .filter(Boolean)
          .join(' ')
      );

    const isEveningRule =
      /(?:^| )вечер/u.test(
        ruleIdentity
      ) ||
      /молитвы на сон грядущим/u.test(
        ruleIdentity
      ) ||
      [
        'molitvy-na-son-griadushchim',
        'molitvy-na-son-gryadushchim',
      ].includes(
        String(
          DATA.rule?.slug ||
          ''
        )
          .trim()
          .toLowerCase()
      ) ||
      /vechern|evening/i.test(
        String(
          DATA.rule?.slug ||
          ''
        )
      );


    const isMorningRule =
      /(?:^| )утрен/u.test(
        ruleIdentity
      ) ||
      [
        'molitvy-utrennie',
      ].includes(
        String(
          DATA.rule?.slug ||
          ''
        )
          .trim()
          .toLowerCase()
      ) ||
      /utrenn|morning/i.test(
        String(
          DATA.rule?.slug ||
          ''
        )
      );


    const isDailyPrayerRule =
      isEveningRule ||
      isMorningRule;


    const normalizeEveningUtilityValue =
      value =>
        String(
          value ||
          ''
        )
          .normalize(
            'NFC'
          )
          .replace(
            /[\u0300-\u036f\u0483-\u0487]/g,
            ''
          )
          .toLowerCase()
          .replace(
            /ё/g,
            'е'
          )
          .replace(
            /[^а-я0-9]+/g,
            ' '
          )
          .trim();


    const normalizedEveningUtilityWithIndex =
      value => {
        const source =
          String(
            value ||
            ''
          );

        const chars = [];
        const originalIndex = [];

        for (
          let index = 0;
          index < source.length;
          index += 1
        ) {
          const originalChar =
            source[index];

          /* Не разлагаем й/Й: иначе breve потеряется вместе
             с ударениями и «помилуй» превратится в «помилуи». */
          if (
            originalChar === 'й' ||
            originalChar === 'Й'
          ) {
            chars.push(
              originalChar
            );
            originalIndex.push(
              index
            );
            continue;
          }

          const decomposed =
            originalChar.normalize(
              'NFD'
            );

          for (const char of decomposed) {
            if (
              /[\u0300-\u036f\u0483-\u0487]/u.test(
                char
              )
            ) {
              continue;
            }

            chars.push(
              char
            );
            originalIndex.push(
              index
            );
          }
        }

        return {
          normalized:
            chars.join(''),
          originalIndex,
        };
      };


    const findEveningUtilityBreakOffset =
      value => {
        if (!isDailyPrayerRule) {
          return null;
        }

        const {
          normalized,
          originalIndex,
        } =
          normalizedEveningUtilityWithIndex(
            value
          );

        const compact =
          normalizeEveningUtilityValue(
            value
          );

        let match = null;

        if (
          compact.startsWith(
            'господи помилуй трижды слава и ныне'
          )
        ) {
          match =
            /Слава\s*,?\s*и\s+ныне\s*:/iu.exec(
              normalized
            );
        } else if (
          compact.startsWith(
            'слава и ныне господи помилуй трижды'
          )
        ) {
          match =
            /Господи\s*,?\s*помилуй/iu.exec(
              normalized
            );
        }

        if (!match) {
          return null;
        }

        const offset =
          originalIndex[
            match.index
          ];

        return Number.isFinite(
          offset
        )
          ? offset
          : null;
      };


    const isEveningCompactLiturgicalValue =
      value => {
        if (!isDailyPrayerRule) {
          return false;
        }

        const content =
          normalizeEveningUtilityValue(
            value
          );

        if (!content) {
          return false;
        }

        const lordHaveMercy =
          /^господи помилуй(?: |$)/u.test(
            content
          ) &&
          (
            /(?:^| )трижды(?: |$)/u.test(
              content
            ) ||
            /(?:^| )12 раз(?: |$)/u.test(
              content
            )
          );

        const gloryAndNow =
          /^слава и ныне(?: |$)/u.test(
            content
          ) &&
          /(?:^| )господи помилуй(?: |$)/u.test(
            content
          );

        return (
          lordHaveMercy ||
          gloryAndNow
        );
      };


    const isEveningCompactLiturgicalItem =
      text => {
        if (!isDailyPrayerRule) {
          return false;
        }

        const utilitySlugs =
          new Set([
            'go-spodi-pomi-lui-trizhdy-sla-va',
            'go-spodi-pomi-lui-raz',
            'sla-va-i-ny-ne-go-spodi',
          ]);

        if (
          utilitySlugs.has(
            String(
              text?.slug ||
              ''
            )
          )
        ) {
          return true;
        }

        return (
          isEveningCompactLiturgicalValue(
            text?.content
          )
        );
      };


    const getEveningItemKind =
      text => {
        if (!isDailyPrayerRule) {
          return '';
        }

        const title =
          normalizeLiturgicalValue(
            text?.title
          );

        if (
          isEveningCompactLiturgicalItem(
            text
          )
        ) {
          return 'minor-liturgical';
        }

        if (
          isEveningRule &&
          /молитва 7(?: я| ая)?/u.test(
            title
          ) &&
          /иоанна златоуста/u.test(
            title
          )
        ) {
          return 'chrysostom';
        }

        if (
          isEveningRule &&
          (
            /исповедание грехов повседневное/u.test(
              title
            ) ||
            (
              /исповедание грехов/u.test(
                title
              ) &&
              /повседнев/u.test(
                title
              )
            )
          )
        ) {
          return 'confession';
        }

        return 'prayer';
      };


    const normalizedTextWithIndex =
      value => {
        const source =
          String(
            value ||
            ''
          );

        const chars = [];
        const originalIndex = [];

        for (
          let index = 0;
          index < source.length;
          index += 1
        ) {
          const decomposed =
            source[index].normalize(
              'NFD'
            );

          for (const char of decomposed) {
            if (
              /[\u0300-\u036f\u0483-\u0487]/u.test(
                char
              )
            ) {
              continue;
            }

            chars.push(
              char
            );
            originalIndex.push(
              index
            );
          }
        }

        return {
          source,
          normalized:
            chars.join(''),
          originalIndex,
        };
      };


    const appendOriginalRange =
      (
        ranges,
        source,
        originalIndex,
        normalizedStart,
        normalizedEnd
      ) => {
        if (
          normalizedEnd <=
            normalizedStart
        ) {
          return;
        }

        const start =
          originalIndex[
            normalizedStart
          ];

        const last =
          originalIndex[
            normalizedEnd - 1
          ];

        if (
          !Number.isFinite(
            start
          ) ||
          !Number.isFinite(
            last
          )
        ) {
          return;
        }

        let end =
          last + 1;

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
      };


    const collectEveningAccentRanges =
      (
        text,
        leadingCue,
        itemKind
      ) => {
        if (
          !isDailyPrayerRule ||
          itemKind ===
            'minor-liturgical'
        ) {
          return [];
        }

        const {
          source,
          normalized,
          originalIndex,
        } =
          normalizedTextWithIndex(
            text
          );

        const ranges = [];

        /* «Слава:» и «И ныне:» — литургические метки,
           поэтому выделяем именно метку, а не весь абзац. */
        const cuePattern =
          /(?:^|\s)((?:Слава|И\s+ныне)\s*:)/giu;

        let cueMatch = null;

        while (
          (
            cueMatch =
              cuePattern.exec(
                normalized
              )
          )
        ) {
          const cue =
            cueMatch[1];

          const relativeStart =
            cueMatch[0]
              .lastIndexOf(
                cue
              );

          const normalizedStart =
            cueMatch.index +
            relativeStart;

          appendOriginalRange(
            ranges,
            source,
            originalIndex,
            normalizedStart,
            normalizedStart +
              cue.length
          );
        }

        const bowPattern =
          /\((?:Поклон|Поклоны)\)/giu;

        let bowMatch = null;

        while (
          (
            bowMatch =
              bowPattern.exec(
                normalized
              )
          )
        ) {
          appendOriginalRange(
            ranges,
            source,
            originalIndex,
            bowMatch.index,
            bowMatch.index +
              bowMatch[0].length
          );
        }

        /* Первая буква каждого настоящего абзаца утреннего
           и вечернего правила получает акцентный цвет. */
        const paragraphStarts = [
          0,
        ];

        const paragraphPattern =
          /\n[ \t]*\n(?:[ \t]*\n)*/g;

        let paragraphMatch = null;

        while (
          (
            paragraphMatch =
              paragraphPattern.exec(
                source
              )
          )
        ) {
          paragraphStarts.push(
            paragraphMatch.index +
            paragraphMatch[0].length
          );
        }

        if (
          leadingCue?.prayerTitle
        ) {
          paragraphStarts[0] =
            leadingCue.end;
        }

        paragraphStarts.forEach(
          rawStart => {
            let start =
              Math.max(
                0,
                rawStart
              );

            while (
              start < source.length &&
              /\s/u.test(
                source[start]
              )
            ) {
              start += 1;
            }

            const tail =
              source.slice(
                start
              );

            const letterMatch =
              tail.match(
                /[А-Яа-яЁёІіЇїЄєҐґ\u0400-\u052F]/u
              );

            if (!letterMatch) {
              return;
            }

            const letterStart =
              start +
              letterMatch.index;

            /* Если абзац начинается с «Слава:» или «И ныне:»,
               эта метка уже целиком входит в акцентный диапазон. */
            if (
              ranges.some(
                range =>
                  letterStart >=
                    range.start &&
                  letterStart <
                    range.end
              )
            ) {
              return;
            }

            let letterEnd =
              letterStart + 1;

            while (
              letterEnd <
                source.length &&
              /[\u0300-\u036f\u0483-\u0487]/u.test(
                source[
                  letterEnd
                ]
              )
            ) {
              letterEnd += 1;
            }

            ranges.push({
              start:
                letterStart,
              end:
                letterEnd,
            });
          }
        );

        return ranges;
      };


    const collectEveningNumberBreaks =
      (
        text,
        itemKind
      ) => {
        if (
          !isEveningRule ||
          itemKind !==
            'chrysostom'
        ) {
          return new Set();
        }

        const offsets =
          new Set();

        const pattern =
          /(?:^|\s)(\d{1,2})\.\s*/gu;

        let match = null;
        let found = 0;

        while (
          (
            match =
              pattern.exec(
                text
              )
          )
        ) {
          found += 1;

          if (found === 1) {
            continue;
          }

          const numberStart =
            match.index +
            match[0]
              .indexOf(
                match[1]
              );

          offsets.add(
            numberStart
          );
        }

        return offsets;
      };



    const isLiturgicalBlock =
      value => {
        const normalized =
          normalizeLiturgicalValue(
            value
          );

        return [
          'слава отцу и сыну и святому духу',
          'и ныне и присно и во веки веков аминь',
        ].includes(
          normalized
        );
      };


    const getRuleInlineLabel =
      text => {
        const rawTitle =
          String(
            text?.title ||
            ''
          )
            .trim()
            .replace(
              /[:;]+$/,
              ''
            );

        if (!rawTitle) {
          return '';
        }

        const normalizedTitle =
          normalizeLiturgicalValue(
            rawTitle
          );

        const inlineTitles =
          new Set([
            'ирмос',
            'припев',
            'богородичен',
            'троичен',
            'крестобогородичен',
            'слава',
            'и ныне',
            'седален',
            'кондак',
            'икос',
            'светилен',
            'тропарь',
            'иисусу',
          ]);

        if (
          !inlineTitles.has(
            normalizedTitle
          )
        ) {
          return '';
        }

        const normalizedText =
          normalizeLiturgicalValue(
            text?.content
          );

        if (
          normalizedText ===
            normalizedTitle ||
          normalizedText.startsWith(
            normalizedTitle +
            ':'
          ) ||
          normalizedText.startsWith(
            normalizedTitle +
            ' '
          )
        ) {
          return '';
        }

        return rawTitle + ':';
      };


    const isMinorLiturgicalItem =
      text => {
        let title =
          normalizeLiturgicalValue(
            text?.title
          );

        if (
          title ===
          'молитва'
        ) {
          title = '';
        }

        const content =
          normalizeLiturgicalValue(
            text?.content
          );

        const combined =
          (
            title +
            ' ' +
            content
          ).trim();

        if (
          /^господи помилуй\b/.test(
            combined
          ) &&
          combined.length < 260
        ) {
          return true;
        }

        if (
          [
            'слава отцу и сыну и святому духу',
            'и ныне и присно и во веки веков аминь',
          ].includes(
            combined
          )
        ) {
          return true;
        }

        return false;
      };


    const renderRule = () => {
      if (isEveningRule) {
        document.body.classList.add(
          'evening-rule'
        );
      }

      if (isMorningRule) {
        document.body.classList.add(
          'morning-rule'
        );
      }

      if (
        DATA.rule.name
      ) {
        reader.appendChild(
          titleEl(
            'h1',
            'rule-title',
            DATA.rule.name
          )
        );
      }

      const viewSwitcher =
        DATA.viewSwitcher;

      if (
        viewSwitcher &&
        Array.isArray(
          viewSwitcher.options
        ) &&
        viewSwitcher.options.length
      ) {
        const switcher =
          el(
            'div',
            'view-switcher'
          );

        viewSwitcher.options.forEach(
          option => {
            const active =
              option.key ===
              viewSwitcher.activeKey;

            const button =
              el(
                'button',
                active
                  ? 'view-switcher-button active'
                  : 'view-switcher-button',
                option.label
              );

            button.type =
              'button';

            button.disabled =
              !!option.disabled;

            button.addEventListener(
              'click',
              () => {
                if (
                  !button.disabled &&
                  !active
                ) {
                  post({
                    type:
                      'view-mode',
                    value:
                      option.key,
                  });
                }
              }
            );

            switcher.appendChild(
              button
            );
          }
        );

        reader.appendChild(
          switcher
        );
      }

      const ruleDescription =
        DATA.viewMode === 'ukrainian'
          ? DATA.rule.description_uk || DATA.rule.description || ''
          : DATA.rule.description || '';

      if (ruleDescription) {
        reader.appendChild(
          el(
            'div',
            'rule-description',
            ruleDescription
          )
        );
      }

      (
        DATA.rule.items ||
        []
      ).forEach(
        item => {
          const wrapper =
            el(
              'section',
              'rule-item'
            );

          wrapper.dataset.itemId =
            String(
              item.id
            );

          if (
            item.item_type ===
            'text' &&
            item.text
          ) {
            const text =
              item.text;

            const eveningItemKind =
              getEveningItemKind(
                text
              );

            eveningItemKindMap.set(
              Number(
                item.id
              ),
              eveningItemKind
            );

            if (eveningItemKind) {
              wrapper.classList.add(
                'evening-rule-item',
                'evening-' +
                  eveningItemKind
              );
            }

            const viewMode =
              DATA.viewMode ||
              'church';

            const localizedTitle =
              viewMode === 'ukrainian'
                ? text.title_uk || text.title || ''
                : text.title || '';

            const localizedDescription =
              viewMode === 'ukrainian'
                ? text.description_uk || text.description || ''
                : text.description || '';

            const normalizedTitle =
              normalizeLiturgicalValue(
                localizedTitle
              );

            const inlineLabel =
              getRuleInlineLabel(
                text
              );

            const displayTitle =
              (
                normalizedTitle ===
                  'молитва' ||
                !!inlineLabel
              )
                ? ''
                : (
                    localizedTitle
                  );

            const displayTitleText =
              displayTitle.replace(
                /(\d+)-([яй])/giu,
                '$1‑$2'
              );

            const churchText =
              text.content ||
              '';

            const russianText =
              text.translation ||
              '';

            const ukrainianText =
              text.translation_uk ||
              '';

            const traditionalText =
              text.traditional_content ||
              '';

            const primaryLanguage =
              viewMode === 'ukrainian' && ukrainianText
                ? 'ukrainian'
                : viewMode === 'ukrainian' && russianText
                  ? 'russian'
                  : viewMode === 'russian' && russianText
                    ? 'russian'
                    : viewMode === 'traditional' && traditionalText
                      ? 'traditional'
                      : 'church';

            const primaryText =
              primaryLanguage === 'ukrainian'
                ? ukrainianText
                : primaryLanguage === 'russian'
                  ? russianText
                  : primaryLanguage === 'traditional'
                    ? traditionalText
                    : churchText;

            const itemTitle =
              displayTitle ||
              localizedDescription ||
              'Текст';

            itemTextMap.set(
              Number(
                item.id
              ),
              primaryText
            );

            itemTitleMap.set(
              Number(
                item.id
              ),
              itemTitle
            );

            itemLanguageMap.set(
              Number(
                item.id
              ),
              primaryLanguage
            );

            const wholeSaved =
              (
                DATA.savedItems ||
                []
              ).find(
                saved =>
                  saved.anchor_type ===
                    'prayer_rule_item' &&
                  Number(
                    saved.anchor_id
                  ) ===
                    Number(
                      item.id
                    ) &&
                  saved.save_type ===
                    'prayer'
              );

            const allowWholeSave =
              !!displayTitle &&
              !isMinorLiturgicalItem(
                text
              );

            if (
              displayTitle ||
              allowWholeSave
            ) {
              const header =
                el(
                  'div',
                  'section-header'
                );

              if (displayTitle) {
                header.appendChild(
                  titleEl(
                    'h2',
                    'prayer-title',
                    displayTitleText
                  )
                );
              }

              if (
                allowWholeSave
              ) {
                const favorite =
                  el(
                    'button',
                    wholeSaved
                      ? 'favorite-action active'
                      : 'favorite-action'
                  );

                favorite.type =
                  'button';

                setSaveHeartIcon(
                  favorite,
                  !!wholeSaved
                );

                favorite.dataset.itemId =
                  String(
                    item.id
                  );

                favorite.dataset.savedItemId =
                  wholeSaved
                    ? String(
                        wholeSaved.id
                      )
                    : '';

                header.appendChild(
                  favorite
                );
              }

              wrapper.appendChild(
                header
              );
            }

            if (
              localizedDescription &&
              text.description_position ===
                'before'
            ) {
              wrapper.appendChild(
                el(
                  'div',
                  'description',
                  localizedDescription
                )
              );
            }

            const textElement =
              el(
                'div',
                eveningItemKind ===
                  'minor-liturgical'
                  ? 'reader-text evening-minor-liturgical-text'
                  : 'reader-text'
              );

            textElement.dataset.itemId =
              String(
                item.id
              );

            if (
              inlineLabel &&
              primaryLanguage ===
                'church'
            ) {
              const inline =
                el(
                  'div',
                  'reader-inline'
                );

              inline.appendChild(
                el(
                  'span',
                  'reader-inline-label',
                  inlineLabel
                )
              );

              inline.appendChild(
                textElement
              );

              wrapper.appendChild(
                inline
              );
            } else {
              wrapper.appendChild(
                textElement
              );
            }

            if (
              DATA.viewMode ===
                'both' &&
              russianText
            ) {
              wrapper.appendChild(
                el(
                  'div',
                  'translation-text',
                  russianText
                )
              );
            }

            if (
              localizedDescription &&
              text.description_position ===
                'after'
            ) {
              wrapper.appendChild(
                el(
                  'div',
                  'description after',
                  localizedDescription
                )
              );
            }

            if (item.note) {
              wrapper.appendChild(
                el(
                  'div',
                  'note',
                  item.note
                )
              );
            }

            appendFootnotes(
              wrapper,
              item.footnotes
            );
          } else if (
            item.item_type ===
            'instruction'
          ) {
            wrapper.appendChild(
              el(
                'div',
                isLiturgicalBlock(
                  item.content
                )
                  ? 'instruction liturgical-block'
                  : 'instruction',
                item.content ||
                ''
              )
            );

            appendFootnotes(
              wrapper,
              item.footnotes
            );
          } else if (
            item.item_type ===
            'section'
          ) {
            if (item.title) {
              wrapper.appendChild(
                el(
                  'h2',
                  'section-title',
                  item.title
                )
              );
            }

            if (item.content) {
              wrapper.appendChild(
                el(
                  'div',
                  isLiturgicalBlock(
                    item.content
                  )
                    ? 'section-content liturgical-block'
                    : 'section-content',
                  item.content
                )
              );
            }

            appendFootnotes(
              wrapper,
              item.footnotes
            );
          }

          if (
            DATA.memorialEnabled &&
            item.item_type ===
              'text' &&
            item.text
          ) {
            const memorialTitle =
              normalizeLiturgicalValue(
                item.text.title
              );

            const memorialKind =
              memorialTitle ===
                'молитва о живых'
                ? 'health'
                : (
                    memorialTitle ===
                      'молитва о усопших' ||
                    memorialTitle ===
                      'молитва об усопших'
                  )
                  ? 'repose'
                  : null;

            if (memorialKind) {
              const memorialWrap =
                el(
                  'div',
                  'memorial-open-wrap memorial-open-inline'
                );

              const memorialButton =
                el(
                  'button',
                  'memorial-open-button',
                  'Открыть помянник'
                );

              memorialButton.type =
                'button';

              memorialButton.addEventListener(
                'click',
                () => {
                  post({
                    type:
                      'memorial-open',

                    context: {
                      source:
                        'prayer_rule',

                      slug:
                        DATA.rule.slug ||
                        '',

                      kind:
                        memorialKind,

                      item_id:
                        Number(
                          item.id
                        ),
                    },
                  });
                }
              );

              memorialWrap.appendChild(
                memorialButton
              );

              wrapper.appendChild(
                memorialWrap
              );
            }
          }

          reader.appendChild(
            wrapper
          );
        }
      );
    };


    const normalizeRange = (
      text,
      start,
      end
    ) => {
      let left =
        Math.max(
          0,
          Math.min(
            start,
            text.length
          )
        );

      let right =
        Math.max(
          left,
          Math.min(
            end,
            text.length
          )
        );

      while (
        left < right &&
        /\\s/.test(
          text[left]
        )
      ) {
        left += 1;
      }

      while (
        right > left &&
        /\\s/.test(
          text[
            right - 1
          ]
        )
      ) {
        right -= 1;
      }

      return {
        start: left,
        end: right,
      };
    };


    const savedForItem =
      itemId =>
        savedRanges.get(
          Number(
            itemId
          )
        ) || [];


    const activeForItem =
      itemId =>
        state.active &&
        Number(
          state.active.itemId
        ) ===
          Number(
            itemId
          )
          ? state.active
          : null;


    const removableSavedRange =
      active => {
        if (!active) {
          return null;
        }

        return (
          savedForItem(
            active.itemId
          ).find(
            range =>
              !range.actionKey &&
              Number.isFinite(
                Number(range.id)
              ) &&
              active.start >=
                range.start &&
              active.end <=
                range.end
          ) ||
          null
        );
      };


    const findLeadingCueRange =
      value => {
        const source =
          String(
            value ||
            ''
          );

        const normalizedChars =
          [];

        const originalIndex =
          [];

        for (
          let index = 0;
          index <
            source.length;
          index += 1
        ) {
          const decomposed =
            source[
              index
            ].normalize(
              'NFD'
            );

          for (
            const char
            of decomposed
          ) {
            if (
              /[\u0300-\u036f\u0483-\u0487]/u.test(
                char
              )
            ) {
              continue;
            }

            normalizedChars.push(
              char
            );

            originalIndex.push(
              index
            );
          }
        }

        const normalized =
          normalizedChars.join(
            ''
          );

        const match =
          normalized.match(
            /^\s*((?:(?:Молитва[^:\n]{0,140})|Ирмос|Припев|Богородичен|Троичен|Крестобогородичен|Слава|И\s+ныне|Седален|Кондак|Икос|Светилен|Тропарь|Иисусу)\s*[:;])/iu
          );

        if (
          !match ||
          !match[1]
        ) {
          return null;
        }

        const normalizedStart =
          match[0].indexOf(
            match[1]
          );

        const normalizedEnd =
          normalizedStart +
          match[1].length -
          1;

        const start =
          originalIndex[
            normalizedStart
          ];

        let end =
          (
            originalIndex[
              normalizedEnd
            ] ??
            start
          ) + 1;

        while (
          end <
            source.length &&
          /[\u0300-\u036f\u0483-\u0487]/u.test(
            source[
              end
            ]
          )
        ) {
          end += 1;
        }

        if (
          !Number.isFinite(
            start
          ) ||
          end <= start
        ) {
          return null;
        }

        const normalizedCue =
          match[1]
            .toLowerCase()
            .replace(
              /\s+/g,
              ' '
            );

        return {
          start,
          end,

          prayerTitle:
            normalizedCue
              .startsWith(
                'молитва'
              ),
        };
      };


    const renderTextItem =
      itemId => {
        const root =
          document.querySelector(
            '.reader-text[data-item-id="' +
            itemId +
            '"]'
          );

        if (!root) {
          return;
        }

        const text =
          itemTextMap.get(
            Number(
              itemId
            )
          ) || '';

        const saved =
          savedForItem(
            itemId
          );

        const active =
          activeForItem(
            itemId
          );

        const mappedEveningItemKind =
          eveningItemKindMap.get(
            Number(
              itemId
            )
          ) || '';

        const isEveningMinorLiturgical =
          mappedEveningItemKind ===
            'minor-liturgical' ||
          isEveningCompactLiturgicalValue(
            text
          );

        const leadingCue =
          isEveningMinorLiturgical
            ? null
            : findLeadingCueRange(
                text
              );

        const eveningItemKind =
          isEveningMinorLiturgical
            ? 'minor-liturgical'
            : mappedEveningItemKind;

        root.classList.toggle(
          'evening-minor-liturgical-text',
          isEveningMinorLiturgical
        );

        const eveningNumberBreaks =
          collectEveningNumberBreaks(
            text,
            eveningItemKind
          );

        const eveningUtilityBreakOffset =
          isEveningMinorLiturgical
            ? findEveningUtilityBreakOffset(
                text
              )
            : null;

        const liturgicalRanges = [];

        if (!isEveningMinorLiturgical) {
          const normalizedChars = [];
          const originalIndex = [];

          for (
            let textIndex = 0;
            textIndex < text.length;
            textIndex += 1
          ) {
            const decomposed =
              text[textIndex].normalize(
                'NFD'
              );

            for (const char of decomposed) {
              if (
                /[\u0300-\u036f\u0483-\u0487]/u.test(
                  char
                )
              ) {
                continue;
              }

              normalizedChars.push(
                char
              );
              originalIndex.push(
                textIndex
              );
            }
          }

          const normalizedText =
            normalizedChars.join(
              ''
            );

          const phrasePattern =
            /Слава\s+Отцу\s*,?\s*и\s+Сыну\s*,?\s*и\s+Святому\s+Духу\s*[:;,.!?]?|И\s+ныне\s*,?\s*и\s+присно\s*,?\s*и\s+во\s+веки\s+веков\s*[.,;:]?\s*аминь\s*[.!?]?/giu;

          let phraseMatch = null;

          while (
            (
              phraseMatch =
                phrasePattern.exec(
                  normalizedText
                )
            )
          ) {
            const normalizedStart =
              phraseMatch.index;

            const normalizedEnd =
              phraseMatch.index +
              phraseMatch[0].length -
              1;

            const rangeStart =
              originalIndex[
                normalizedStart
              ];

            let rangeEnd =
              (
                originalIndex[
                  normalizedEnd
                ] ??
                rangeStart
              ) + 1;

            while (
              rangeEnd < text.length &&
              /[\u0300-\u036f\u0483-\u0487]/u.test(
                text[rangeEnd]
              )
            ) {
              rangeEnd += 1;
            }

            if (
              Number.isFinite(
                rangeStart
              ) &&
              rangeEnd > rangeStart
            ) {
              liturgicalRanges.push({
                start: rangeStart,
                end: rangeEnd,
              });
            }
          }
        }

        collectEveningAccentRanges(
          text,
          leadingCue,
          eveningItemKind
        ).forEach(
          range => {
            liturgicalRanges.push(
              range
            );
          }
        );

        const boundaries =
          new Set([
            0,
            text.length,
          ]);

        if (leadingCue) {
          boundaries.add(
            leadingCue.start
          );

          boundaries.add(
            leadingCue.end
          );
        }

        liturgicalRanges.forEach(
          range => {
            boundaries.add(
              range.start
            );
            boundaries.add(
              range.end
            );
          }
        );

        eveningNumberBreaks.forEach(
          offset => {
            boundaries.add(
              offset
            );
          }
        );

        if (
          Number.isFinite(
            eveningUtilityBreakOffset
          )
        ) {
          boundaries.add(
            eveningUtilityBreakOffset
          );
        }

        saved.forEach(
          range => {
            boundaries.add(
              range.start
            );

            boundaries.add(
              range.end
            );
          }
        );

        if (active) {
          boundaries.add(
            active.start
          );

          boundaries.add(
            active.end
          );
        }

        const points =
          Array.from(
            boundaries
          )
            .map(Number)
            .filter(
              value =>
                Number.isFinite(
                  value
                ) &&
                value >= 0 &&
                value <=
                  text.length
            )
            .sort(
              (a, b) =>
                a - b
            );

        const fragment =
          document.createDocumentFragment();

        for (
          let index = 0;
          index <
            points.length - 1;
          index += 1
        ) {
          const start =
            points[index];

          const end =
            points[
              index + 1
            ];

          if (
            end <= start
          ) {
            continue;
          }

          const midpoint =
            start +
            (
              end - start
            ) /
            2;

          const isSaved =
            saved.some(
              range =>
                midpoint >=
                  range.start &&
                midpoint <
                  range.end
            );

          const isActive =
            !!active &&
            midpoint >=
              active.start &&
            midpoint <
              active.end;

          const isLiturgical =
            !isEveningMinorLiturgical &&
            liturgicalRanges.some(
              range =>
                midpoint >=
                  range.start &&
                midpoint <
                  range.end
            );

          const span =
            document.createElement(
              'span'
            );

          if (isSaved) {
            span.classList.add(
              'saved-highlight'
            );
          }

          if (isActive) {
            span.classList.add(
              'active-highlight'
            );
          }

          if (isLiturgical) {
            span.classList.add(
              'liturgical-phrase'
            );
          }

          if (
            !isEveningMinorLiturgical &&
            leadingCue &&
            start >=
              leadingCue.start &&
            end <=
              leadingCue.end
          ) {
            span.classList.add(
              'rule-leading-cue'
            );

            if (
              leadingCue
                .prayerTitle
            ) {
              span.classList.add(
                'prayer-leading-cue'
              );
            }
          }

          const value =
            text.slice(
              start,
              end
            );

          const normalizedChars =
            [];

          const originalIndex =
            [];

          for (
            let valueIndex = 0;
            valueIndex <
              value.length;
            valueIndex += 1
          ) {
            const decomposed =
              value[
                valueIndex
              ].normalize(
                'NFD'
              );

            for (
              const char
              of decomposed
            ) {
              if (
                /[\u0300-\u036f\u0483-\u0487]/u.test(
                  char
                )
              ) {
                continue;
              }

              normalizedChars.push(
                char
              );

              originalIndex.push(
                valueIndex
              );
            }
          }

          const normalized =
            normalizedChars.join(
              ''
            );

          const phrasePattern =
            /Слава\s+Отцу\s*,?\s*и\s+Сыну\s*,?\s*и\s+Святому\s+Духу\s*[:;,.!?]?|И\s+ныне\s*,?\s*и\s+присно\s*,?\s*и\s+во\s+веки\s+веков\s*[.,;:]?\s*аминь\s*[.!?]?/giu;

          const ranges =
            [];

          let match = null;

          while (
            (
              match =
                phrasePattern.exec(
                  normalized
                )
            )
          ) {
            const normalizedStart =
              match.index;

            const normalizedEnd =
              match.index +
              match[0].length -
              1;

            const rangeStart =
              originalIndex[
                normalizedStart
              ];

            let rangeEnd =
              (
                originalIndex[
                  normalizedEnd
                ] ??
                rangeStart
              ) + 1;

            while (
              rangeEnd <
                value.length &&
              /[\u0300-\u036f\u0483-\u0487]/u.test(
                value[
                  rangeEnd
                ]
              )
            ) {
              rangeEnd += 1;
            }

            if (
              Number.isFinite(
                rangeStart
              ) &&
              rangeEnd >
                rangeStart
            ) {
              ranges.push({
                start:
                  rangeStart,

                end:
                  rangeEnd,
              });
            }
          }

          let cursor = 0;

          ranges.forEach(
            range => {
              if (
                range.start >
                cursor
              ) {
                span.appendChild(
                  document.createTextNode(
                    value.slice(
                      cursor,
                      range.start
                    )
                  )
                );
              }

              span.appendChild(
                el(
                  'span',
                  'liturgical-phrase',
                  value.slice(
                    range.start,
                    range.end
                  )
                )
              );

              cursor =
                range.end;
            }
          );

          if (
            cursor <
              value.length
          ) {
            span.appendChild(
              document.createTextNode(
                value.slice(
                  cursor
                )
              )
            );
          }

          fragment.appendChild(
            span
          );

          if (
            Number.isFinite(
              eveningUtilityBreakOffset
            ) &&
            end ===
              eveningUtilityBreakOffset
          ) {
            fragment.appendChild(
              document.createElement(
                'br'
              )
            );
          }

          if (
            eveningNumberBreaks.has(
              end
            )
          ) {
            const numberBreak =
              document.createElement(
                'br'
              );

            numberBreak.className =
              'evening-number-break';

            fragment.appendChild(
              numberBreak
            );
          }

          if (
            span.classList.contains(
              'prayer-leading-cue'
            ) &&
            end <
              text.length
          ) {
            fragment.appendChild(
              document.createElement(
                'br'
              )
            );
          }
        }

        root.replaceChildren(
          fragment
        );

        hideKnownEditorialMarkers(
          root
        );

        compactParagraphGaps(
          root
        );
      };


    const loadSavedRanges =
      () => {
        (
          DATA.savedItems ||
          []
        ).forEach(
          item => {
            const itemId =
              Number(
                item.anchor_id
              );

            const text =
              itemTextMap.get(
                itemId
              );

            const language =
              itemLanguageMap.get(
                itemId
              ) ||
              'church';

            const savedLanguage =
              item.metadata
                ?.language ||
              'church';

            if (
              savedLanguage !==
              language
            ) {
              return;
            }

            if (!text) {
              return;
            }

            const range =
              normalizeRange(
                text,
                Number(
                  item.start_offset
                ),
                Number(
                  item.end_offset
                )
              );

            if (
              range.end <=
              range.start
            ) {
              return;
            }

            const whole =
              normalizeRange(
                text,
                0,
                text.length
              );

            if (
              item.save_type ===
                'prayer' &&
              range.start ===
                whole.start &&
              range.end ===
                whole.end
            ) {
              document
                .querySelector(
                  '.rule-item[data-item-id="' +
                  itemId +
                  '"]'
                )
                ?.classList
                .add(
                  'whole-saved'
                );

              return;
            }

            const current =
              savedRanges.get(
                itemId
              ) || [];

            current.push({
              id:
                item.id,
              start:
                range.start,
              end:
                range.end,
            });

            savedRanges.set(
              itemId,
              current
            );
          }
        );
      };


    const textOffsetFromPoint = (
      clientX,
      clientY,
      expectedItemId = null
    ) => {
      let caret = null;

      if (
        document.caretRangeFromPoint
      ) {
        caret =
          document.caretRangeFromPoint(
            clientX,
            clientY
          );
      } else if (
        document.caretPositionFromPoint
      ) {
        const position =
          document.caretPositionFromPoint(
            clientX,
            clientY
          );

        if (position) {
          caret =
            document.createRange();

          caret.setStart(
            position.offsetNode,
            position.offset
          );

          caret.collapse(
            true
          );
        }
      }

      if (!caret) {
        return null;
      }

      const node =
        caret.startContainer;

      const parent =
        node.nodeType ===
        Node.ELEMENT_NODE
          ? node
          : node.parentElement;

      const root =
        parent?.closest(
          '.reader-text'
        );

      if (!root) {
        return null;
      }

      const itemId =
        Number(
          root.dataset.itemId
        );

      if (
        expectedItemId !==
          null &&
        Number(
          expectedItemId
        ) !== itemId
      ) {
        return null;
      }

      const walker =
        document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT
        );

      let total = 0;
      let current = null;

      while (
        (
          current =
            walker.nextNode()
        )
      ) {
        if (
          current === node
        ) {
          total +=
            caret.startOffset;

          return {
            itemId,
            offset: total,
          };
        }

        total +=
          current.textContent
            .length;
      }

      return null;
    };


    const wordRangeAt = (
      text,
      offset
    ) => {
      if (!text.length) {
        return null;
      }

      const isWordChar =
        character =>
          /[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\\u0400-\\u052F\\u0300-\\u036F\\u0483-\\u0489'’\\-]/
            .test(
              character ||
              ''
            );

      let cursor =
        Math.max(
          0,
          Math.min(
            offset,
            text.length - 1
          )
        );

      if (
        !isWordChar(
          text[cursor]
        )
      ) {
        const nearby =
          [0, -1, 1, -2, 2]
            .map(delta =>
              cursor + delta
            )
            .find(index =>
              index >= 0 &&
              index < text.length &&
              isWordChar(
                text[index]
              )
            );

        if (
          nearby ===
          undefined
        ) {
          return null;
        }

        cursor = nearby;
      }

      let start =
        cursor;

      let end =
        cursor;

      while (
        start > 0 &&
        isWordChar(
          text[
            start - 1
          ]
        )
      ) {
        start -= 1;
      }

      while (
        end <
          text.length &&
        isWordChar(
          text[end]
        )
      ) {
        end += 1;
      }

      return {
        start,
        end,
      };
    };


    const domRange = (
      itemId,
      start,
      end
    ) => {
      const root =
        document.querySelector(
          '.reader-text[data-item-id="' +
          itemId +
          '"]'
        );

      if (!root) {
        return null;
      }

      const locate =
        targetOffset => {
          const walker =
            document.createTreeWalker(
              root,
              NodeFilter.SHOW_TEXT
            );

          let total = 0;
          let node = null;

          while (
            (
              node =
                walker.nextNode()
            )
          ) {
            const length =
              node.textContent
                .length;

            if (
              targetOffset <=
              total + length
            ) {
              return {
                node,
                offset:
                  Math.max(
                    0,
                    Math.min(
                      targetOffset -
                        total,
                      length
                    )
                  ),
              };
            }

            total +=
              length;
          }

          return null;
        };

      const from =
        locate(
          start
        );

      const to =
        locate(
          end
        );

      if (
        !from ||
        !to
      ) {
        return null;
      }

      const range =
        document.createRange();

      range.setStart(
        from.node,
        from.offset
      );

      range.setEnd(
        to.node,
        to.offset
      );

      return range;
    };


    const updateHandles =
      () => {
        if (!state.active) {
          startHandle.style.display =
            'none';

          endHandle.style.display =
            'none';

          return;
        }

        const range =
          domRange(
            state.active.itemId,
            state.active.start,
            state.active.end
          );

        if (!range) {
          return;
        }

        const rects =
          Array.from(
            range.getClientRects()
          );

        if (!rects.length) {
          return;
        }

        const first =
          rects[0];

        const last =
          rects[
            rects.length - 1
          ];

        startHandle.style.display =
          'block';

        endHandle.style.display =
          'block';

        startHandle.style.left =
          (
            first.left -
            18
          ) +
          'px';

        startHandle.style.top =
          (
            first.bottom -
            3
          ) +
          'px';

        endHandle.style.left =
          (
            last.right -
            18
          ) +
          'px';

        endHandle.style.top =
          (
            last.bottom -
            3
          ) +
          'px';
      };


    const updateBar =
      () => {
        if (!state.active) {
          selectionBar.classList
            .remove(
              'visible'
            );

          return;
        }

        const count =
          state.active.end -
          state.active.start;

        selectionBar.classList
          .add(
            'visible'
          );

        selectionCount.textContent =
          count +
          ' симв.';

        selectionCount.classList
          .remove(
            'error'
          );

        selectionHint.classList
          .remove(
            'error'
          );

        if (
          !state.savePending
        ) {
          selectionHint.textContent =
            'Выделенный фрагмент';
        }

        const savedRange =
          removableSavedRange(
            state.active
          );

        saveButton.textContent =
          savedRange
            ? 'Удалить'
            : 'Сохранить';

        saveButton.classList.toggle(
          'delete-mode',
          !!savedRange
        );

        saveButton.disabled =
          count <= 0 ||
          state.savePending;
      };


    const setActive = (
      itemId,
      start,
      end,
      anchorStart,
      anchorEnd
    ) => {
      const text =
        itemTextMap.get(
          Number(
            itemId
          )
        );

      if (!text) {
        return;
      }

      const range =
        normalizeRange(
          text,
          Math.min(
            start,
            end
          ),
          Math.max(
            start,
            end
          )
        );

      if (
        range.end <=
        range.start
      ) {
        return;
      }

      state.active = {
        itemId:
          Number(
            itemId
          ),
        start:
          range.start,
        end:
          range.end,
        anchorStart:
          anchorStart,
        anchorEnd:
          anchorEnd,
      };

      renderTextItem(
        itemId
      );

      updateHandles();
      updateBar();
    };


    const clearSelection =
      () => {
        if (!state.active) {
          return;
        }

        const itemId =
          state.active.itemId;

        state.active =
          null;
        state.drag =
          null;
        state.pointer =
          null;
        state.lastDragPoint =
          null;
        state.savePending =
          false;

        if (
          state.longPressTimer
        ) {
          clearTimeout(
            state.longPressTimer
          );

          state.longPressTimer =
            null;
        }

        renderTextItem(
          itemId
        );

        updateHandles();
        updateBar();
      };


    const activateAtPoint = (
      x,
      y,
      pointerId
    ) => {
      const point =
        textOffsetFromPoint(
          x,
          y
        );

      if (!point) {
        return false;
      }

      const text =
        itemTextMap.get(
          point.itemId
        );

      const word =
        wordRangeAt(
          text,
          point.offset
        );

      if (!word) {
        return false;
      }

      setActive(
        point.itemId,
        word.start,
        word.end,
        word.start,
        word.end
      );

      state.drag = {
        mode:
          'initial',
        pointerId,
        itemId:
          point.itemId,
      };

      return true;
    };


    const updateFromPoint = (
      clientX,
      clientY
    ) => {
      if (
        !state.active ||
        !state.drag
      ) {
        return;
      }

      const point =
        textOffsetFromPoint(
          clientX,
          clientY,
          state.active.itemId
        );

      if (!point) {
        return;
      }

      const text =
        itemTextMap.get(
          state.active.itemId
        );

      let start =
        state.active.start;

      let end =
        state.active.end;

      if (
        state.drag.mode ===
        'start'
      ) {
        if (
          point.offset <
          end
        ) {
          start =
            point.offset;
        } else {
          start =
            end;
          end =
            Math.max(
              point.offset,
              start + 1
            );
          state.drag.mode =
            'end';
        }
      } else if (
        state.drag.mode ===
        'end'
      ) {
        if (
          point.offset >
          start
        ) {
          end =
            point.offset;
        } else {
          end =
            start;
          start =
            Math.min(
              point.offset,
              end - 1
            );
          state.drag.mode =
            'start';
        }
      } else if (
        point.offset <
        state.active.anchorStart
      ) {
        start =
          point.offset;

        end =
          state.active.anchorEnd;
      } else {
        start =
          state.active.anchorStart;

        end =
          Math.max(
            point.offset,
            state.active.anchorEnd
          );
      }

      start =
        Math.max(
          0,
          Math.min(
            start,
            text.length
          )
        );

      end =
        Math.max(
          0,
          Math.min(
            end,
            text.length
          )
        );

      setActive(
        state.active.itemId,
        start,
        end,
        state.active.anchorStart,
        state.active.anchorEnd
      );
    };


    const autoScroll = () => {
      if (
        !state.drag ||
        !state.lastDragPoint
      ) {
        state.autoScrollFrame =
          null;

        return;
      }

      const point =
        state.lastDragPoint;

      const topZone = 62;
      const bottomZone =
        window.innerHeight -
        92;

      let delta = 0;

      if (
        point.y <
        topZone
      ) {
        delta =
          -Math.max(
            4,
            (
              topZone -
              point.y
            ) /
            4
          );
      } else if (
        point.y >
        bottomZone
      ) {
        delta =
          Math.max(
            4,
            (
              point.y -
              bottomZone
            ) /
            4
          );
      }

      if (delta) {
        window.scrollBy(
          0,
          delta
        );

        updateFromPoint(
          point.x,
          Math.max(
            20,
            Math.min(
              point.y,
              window.innerHeight -
              80
            )
          )
        );
      }

      state.autoScrollFrame =
        requestAnimationFrame(
          autoScroll
        );
    };


    const ensureAutoScroll =
      () => {
        if (
          state.autoScrollFrame
        ) {
          return;
        }

        state.autoScrollFrame =
          requestAnimationFrame(
            autoScroll
          );
      };


    const beginHandleDrag = (
      mode,
      event
    ) => {
      if (!state.active) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      event.currentTarget
        .setPointerCapture(
          event.pointerId
        );

      state.drag = {
        mode,
        pointerId:
          event.pointerId,
        itemId:
          state.active.itemId,
      };

      state.lastDragPoint = {
        x:
          event.clientX,
        y:
          event.clientY,
      };

      ensureAutoScroll();
    };


    const moveHandle =
      event => {
        if (
          !state.drag ||
          state.drag.pointerId !==
            event.pointerId
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        state.lastDragPoint = {
          x:
            event.clientX,
          y:
            event.clientY,
        };

        updateFromPoint(
          event.clientX,
          event.clientY
        );

        ensureAutoScroll();
      };


    const endHandleDrag =
      event => {
        if (
          !state.drag ||
          state.drag.pointerId !==
            event.pointerId
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        state.drag =
          null;

        state.lastDragPoint =
          null;
      };


    startHandle.addEventListener(
      'pointerdown',
      event =>
        beginHandleDrag(
          'start',
          event
        )
    );

    endHandle.addEventListener(
      'pointerdown',
      event =>
        beginHandleDrag(
          'end',
          event
        )
    );

    startHandle.addEventListener(
      'pointermove',
      moveHandle
    );

    endHandle.addEventListener(
      'pointermove',
      moveHandle
    );

    startHandle.addEventListener(
      'pointerup',
      endHandleDrag
    );

    endHandle.addEventListener(
      'pointerup',
      endHandleDrag
    );

    startHandle.addEventListener(
      'pointercancel',
      endHandleDrag
    );

    endHandle.addEventListener(
      'pointercancel',
      endHandleDrag
    );


    document.addEventListener(
      'contextmenu',
      event =>
        event.preventDefault()
    );


    reader.addEventListener(
      'pointerdown',
      event => {
        const root =
          event.target.closest(
            '.reader-text'
          );

        if (!root) {
          return;
        }

        if (state.active) {
          clearSelection();
        }

        state.pointer = {
          pointerId:
            event.pointerId,
          startX:
            event.clientX,
          startY:
            event.clientY,
          lastX:
            event.clientX,
          lastY:
            event.clientY,
          activated:
            false,
        };

        state.longPressTimer =
          setTimeout(
            () => {
              if (
                !state.pointer ||
                state.pointer.pointerId !==
                  event.pointerId
              ) {
                return;
              }

              state.pointer.activated =
                activateAtPoint(
                  state.pointer.lastX,
                  state.pointer.lastY,
                  event.pointerId
                );
            },
            480
          );
      },
      {
        passive: true,
      }
    );


    reader.addEventListener(
      'pointermove',
      event => {
        if (
          !state.pointer ||
          state.pointer.pointerId !==
            event.pointerId
        ) {
          return;
        }

        state.pointer.lastX =
          event.clientX;

        state.pointer.lastY =
          event.clientY;

        if (
          !state.pointer.activated
        ) {
          const distance =
            Math.hypot(
              event.clientX -
                state.pointer.startX,
              event.clientY -
                state.pointer.startY
            );

          if (
            distance > 14 &&
            state.longPressTimer
          ) {
            clearTimeout(
              state.longPressTimer
            );

            state.longPressTimer =
              null;
          }

          return;
        }

        event.preventDefault();

        state.lastDragPoint = {
          x:
            event.clientX,
          y:
            event.clientY,
        };

        updateFromPoint(
          event.clientX,
          event.clientY
        );

        ensureAutoScroll();
      },
      {
        passive: false,
      }
    );


    const finishPointer =
      event => {
        if (
          !state.pointer ||
          state.pointer.pointerId !==
            event.pointerId
        ) {
          return;
        }

        if (
          state.longPressTimer
        ) {
          clearTimeout(
            state.longPressTimer
          );

          state.longPressTimer =
            null;
        }

        state.pointer =
          null;

        if (
          state.drag?.mode ===
          'initial'
        ) {
          state.drag =
            null;

          state.lastDragPoint =
            null;
        }
      };


    reader.addEventListener(
      'pointerup',
      finishPointer
    );

    reader.addEventListener(
      'pointercancel',
      finishPointer
    );


    reader.addEventListener(
      'click',
      event => {
        const favorite =
          event.target.closest(
            '.favorite-action'
          );

        if (!favorite) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        post({
          type:
            'whole-prayer-action',

          itemId:
            Number(
              favorite.dataset
                .itemId
            ),

          savedItemId:
            favorite.dataset
              .savedItemId
              ? Number(
                  favorite.dataset
                    .savedItemId
                )
              : null,
        });
      }
    );


    document.addEventListener(
      'pointerdown',
      event => {
        if (!state.active) {
          return;
        }

        if (
          event.target.closest(
            '#selection-bar, .selection-handle, .active-highlight'
          )
        ) {
          return;
        }

        clearSelection();
      },
      true
    );


    const sentenceRange = (
      text,
      anchor
    ) => {
      let start = anchor;
      let end = anchor;

      while (
        start > 0 &&
        !/[.!?…]/.test(
          text[start - 1]
        )
      ) {
        start -= 1;
      }

      while (
        start <
          text.length &&
        /\\s/.test(
          text[start]
        )
      ) {
        start += 1;
      }

      while (
        end <
          text.length &&
        !/[.!?…]/.test(
          text[end]
        )
      ) {
        end += 1;
      }

      if (
        end <
        text.length
      ) {
        end += 1;
      }

      return normalizeRange(
        text,
        start,
        end
      );
    };


    const paragraphRange = (
      text,
      anchor
    ) => {
      const before =
        text.slice(
          0,
          anchor
        );

      const after =
        text.slice(
          anchor
        );

      const left =
        Math.max(
          before.lastIndexOf(
            '\\n\\n'
          ),
          before.lastIndexOf(
            '\\r\\n\\r\\n'
          )
        );

      const candidates =
        [
          after.indexOf(
            '\\n\\n'
          ),
          after.indexOf(
            '\\r\\n\\r\\n'
          ),
        ].filter(
          value =>
            value >= 0
        );

      const right =
        candidates.length
          ? Math.min(
              ...candidates
            )
          : -1;

      return normalizeRange(
        text,
        left === -1
          ? 0
          : left + 2,
        right === -1
          ? text.length
          : anchor + right
      );
    };


    const classify =
      active => {
        const text =
          itemTextMap.get(
            active.itemId
          ) || '';

        const range =
          normalizeRange(
            text,
            active.start,
            active.end
          );

        const whole =
          normalizeRange(
            text,
            0,
            text.length
          );

        const selected =
          text
            .slice(
              range.start,
              range.end
            )
            .trim();

        if (
          range.start ===
            whole.start &&
          range.end ===
            whole.end
        ) {
          return 'prayer';
        }

        if (
          /^[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\\u0400-\\u052F\\u0300-\\u036F\\u0483-\\u0489'’\\-]+$/
            .test(
              selected
            )
        ) {
          return 'word';
        }

        const sentence =
          sentenceRange(
            text,
            range.start
          );

        if (
          sentence.start ===
            range.start &&
          sentence.end ===
            range.end
        ) {
          return 'sentence';
        }

        const paragraph =
          paragraphRange(
            text,
            range.start
          );

        if (
          paragraph.start ===
            range.start &&
          paragraph.end ===
            range.end
        ) {
          return 'paragraph';
        }

        return 'fragment';
      };


    cancelButton.addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();
        clearSelection();
      }
    );


    saveButton.addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();

        if (
          !state.active ||
          state.savePending
        ) {
          return;
        }

        const count =
          state.active.end -
          state.active.start;

        if (
          count <= 0
        ) {
          return;
        }

        const savedRange =
          removableSavedRange(
            state.active
          );

        if (savedRange) {
          state.savePending =
            true;

          selectionHint.textContent =
            'Удаляем...';

          updateBar();

          post({
            type:
              'remove-selection',
            anchorId:
              state.active.itemId,
            savedItemId:
              Number(
                savedRange.id
              ),
          });

          return;
        }

        const text =
          itemTextMap.get(
            state.active.itemId
          ) || '';

        const selectedText =
          text
            .slice(
              state.active.start,
              state.active.end
            )
            .trim();

        if (!selectedText) {
          return;
        }

        state.savePending =
          true;

        selectionHint.textContent =
          'Сохраняем...';

        updateBar();

        post({
          type:
            'save-selection',
          anchorId:
            state.active.itemId,
          start:
            state.active.start,
          end:
            state.active.end,
          text:
            selectedText,
          saveType:
            classify(
              state.active
            ),
          itemTitle:
            itemTitleMap.get(
              state.active.itemId
            ) ||
            'Текст',
          language:
            itemLanguageMap.get(
              state.active.itemId
            ) ||
            'church',
        });
      }
    );


    const reportProgress =
      () => {
        if (
          state.restoring
        ) {
          return;
        }

        const items =
          Array.from(
            document.querySelectorAll(
              '.rule-item'
            )
          );

        if (!items.length) {
          return;
        }

        const center =
          window.scrollY +
          (
            window.innerHeight /
            2
          );

        let current =
          items[0];

        let bestDistance =
          Infinity;

        items.forEach(
          item => {
            const top =
              item.offsetTop;

            const bottom =
              top +
              item.offsetHeight;

            const distance =
              center < top
                ? top - center
                : center > bottom
                  ? center - bottom
                  : 0;

            if (
              distance <
              bestDistance
            ) {
              bestDistance =
                distance;

              current =
                item;
            }
          }
        );

        const offset =
          Math.max(
            0,
            Math.min(
              current.offsetHeight,
              center -
                current.offsetTop
            )
          );

        const documentHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        const maxScroll = Math.max(0, documentHeight - window.innerHeight);
        const progressPercent = maxScroll > 0
          ? Math.round((window.scrollY / maxScroll) * 100)
          : 100;

        post({
          type: 'progress',
          anchorId: Number(current.dataset.itemId),
          offset: Math.round(offset),
          progressPercent: Math.max(0, Math.min(progressPercent, 100)),
        });
      };


    const updateScrollControls =
      () => {
        const documentHeight =
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          );

        const maxScroll =
          Math.max(
            0,
            documentHeight -
            window.innerHeight
          );

        if (
          maxScroll <= 16
        ) {
          scrollTrack.classList
            .remove('visible');
          scrollTopButton.classList
            .remove('visible');
          return;
        }

        const trackHeight =
          Math.max(
            1,
            scrollTrack.clientHeight
          );

        const thumbHeight =
          Math.max(
            44,
            Math.min(
              trackHeight,
              trackHeight *
              (
                window.innerHeight /
                documentHeight
              )
            )
          );

        const maxThumbTop =
          Math.max(
            0,
            trackHeight -
            thumbHeight
          );

        const thumbTop =
          maxScroll
            ? (
                window.scrollY /
                maxScroll
              ) *
              maxThumbTop
            : 0;

        scrollThumb.style.height =
          thumbHeight +
          'px';

        scrollThumb.style.transform =
          'translateY(' +
          thumbTop +
          'px)';
      };


    const showScrollControls =
      direction => {
        updateScrollControls();

        scrollTrack.classList
          .add('visible');

        scrollTopButton.classList.toggle(
          'visible',
          direction === 'up' &&
          window.scrollY >
            window.innerHeight *
            0.65
        );

        if (
          state.scrollUiTimer
        ) {
          clearTimeout(
            state.scrollUiTimer
          );
        }

        state.scrollUiTimer =
          setTimeout(
            () => {
              if (scrollDrag) {
                return;
              }

              scrollTrack.classList
                .remove('visible');

              scrollTopButton.classList
                .remove('visible');
            },
            950
          );
      };


    let scrollDrag = null;


    const getScrollMetrics =
      () => {
        const documentHeight =
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          );

        return {
          maxScroll:
            Math.max(
              0,
              documentHeight -
              window.innerHeight
            ),

          trackHeight:
            Math.max(
              1,
              scrollTrack.clientHeight
            ),

          thumbHeight:
            Math.max(
              1,
              scrollThumb.offsetHeight
            ),
        };
      };


    const beginScrollDrag =
      event => {
        showScrollControls(
          'none'
        );

        const metrics =
          getScrollMetrics();

        scrollDrag = {
          pointerId:
            event.pointerId,

          startY:
            event.clientY,

          startScroll:
            window.scrollY,

          ...metrics,
        };

        try {
          event.currentTarget
            ?.setPointerCapture?.(
              event.pointerId
            );
        } catch {
          // Некоторые Android WebView не поддерживают pointer capture стабильно.
        }
      };


    const moveScrollDrag =
      event => {
        if (
          !scrollDrag ||
          event.pointerId !==
            scrollDrag.pointerId
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const maxThumbTop =
          Math.max(
            1,
            scrollDrag.trackHeight -
            scrollDrag.thumbHeight
          );

        const deltaY =
          event.clientY -
          scrollDrag.startY;

        window.scrollTo(
          0,
          Math.max(
            0,
            Math.min(
              scrollDrag.maxScroll,
              scrollDrag.startScroll +
              (
                deltaY /
                maxThumbTop
              ) *
              scrollDrag.maxScroll
            )
          )
        );
      };


    const endScrollDrag =
      event => {
        if (
          !scrollDrag ||
          (
            event &&
            event.pointerId !==
              scrollDrag.pointerId
          )
        ) {
          return;
        }

        scrollDrag = null;

        showScrollControls(
          'none'
        );
      };


    scrollThumb.addEventListener(
      'pointerdown',
      event => {
        event.preventDefault();
        event.stopPropagation();

        beginScrollDrag(
          event
        );
      }
    );


    scrollTrack.addEventListener(
      'pointerdown',
      event => {
        if (
          event.target ===
            scrollThumb
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const rect =
          scrollTrack
            .getBoundingClientRect();

        const metrics =
          getScrollMetrics();

        const maxThumbTop =
          Math.max(
            1,
            rect.height -
            metrics.thumbHeight
          );

        const thumbTop =
          Math.max(
            0,
            Math.min(
              maxThumbTop,
              event.clientY -
              rect.top -
              (
                metrics.thumbHeight /
                2
              )
            )
          );

        window.scrollTo(
          0,
          (
            thumbTop /
            maxThumbTop
          ) *
          metrics.maxScroll
        );

        beginScrollDrag(
          event
        );
      }
    );


    document.addEventListener(
      'pointermove',
      moveScrollDrag,
      {
        passive: false,
      }
    );

    document.addEventListener(
      'pointerup',
      endScrollDrag
    );

    document.addEventListener(
      'pointercancel',
      endScrollDrag
    );


    scrollTopButton.addEventListener(
      'click',
      () => {
        window.scrollTo({
          top: 0,
          behavior:
            'smooth',
        });
      }
    );


    window.addEventListener(
      'resize',
      updateScrollControls
    );


    window.addEventListener(
      'scroll',
      () => {
        updateHandles();

        const currentY =
          window.scrollY;

        const direction =
          currentY <
          state.lastScrollY
            ? 'up'
            : 'down';

        state.lastScrollY =
          currentY;

        showScrollControls(
          direction
        );

        if (
          state.progressTimer
        ) {
          clearTimeout(
            state.progressTimer
          );
        }

        state.progressTimer =
          setTimeout(
            reportProgress,
            120
          );
      },
      {
        passive: true,
      }
    );


    const getRangeRect = (
      root,
      startOffset,
      endOffset
    ) => {
      if (!root) {
        return null;
      }

      const text =
        root.textContent ||
        '';

      const start =
        Math.max(
          0,
          Math.min(
            text.length,
            Number(
              startOffset || 0
            )
          )
        );

      const end =
        Math.max(
          start,
          Math.min(
            text.length,
            Number(
              endOffset ?? start
            )
          )
        );

      const walker =
        document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT
        );

      let current = null;
      let total = 0;
      let startNode = null;
      let startLocal = 0;
      let endNode = null;
      let endLocal = 0;

      while (
        (
          current =
            walker.nextNode()
        )
      ) {
        const length =
          current.textContent
            ?.length ||
          0;

        if (
          !startNode &&
          start <=
            total + length
        ) {
          startNode =
            current;

          startLocal =
            Math.max(
              0,
              Math.min(
                length,
                start - total
              )
            );
        }

        if (
          endNode === null &&
          end <=
            total + length
        ) {
          endNode =
            current;

          endLocal =
            Math.max(
              0,
              Math.min(
                length,
                end - total
              )
            );

          break;
        }

        total +=
          length;
      }

      if (!startNode) {
        return null;
      }

      if (!endNode) {
        endNode =
          startNode;

        endLocal =
          startLocal;
      }

      try {
        const range =
          document.createRange();

        range.setStart(
          startNode,
          startLocal
        );

        range.setEnd(
          endNode,
          endLocal
        );

        const rect =
          range.getBoundingClientRect();

        if (
          rect &&
          (
            rect.height ||
            rect.width
          )
        ) {
          return rect;
        }
      } catch {
        return null;
      }

      return null;
    };


    const focusSavedTarget =
      () => {
        const target =
          DATA.focusTarget;

        if (
          !target ||
          (
            target.anchor_type ||
            target.anchorType
          ) !==
            'prayer_rule_item'
        ) {
          return false;
        }

        const itemId =
          Number(
            target.anchor_id ??
            target.anchorId
          );

        if (!itemId) {
          return false;
        }

        const root =
          document.querySelector(
            '.reader-text[data-item-id="' +
            itemId +
            '"]'
          );

        const section =
          document.querySelector(
            '.rule-item[data-item-id="' +
            itemId +
            '"]'
          );

        if (!root) {
          if (section) {
            window.scrollTo(
              0,
              Math.max(
                0,
                section.offsetTop -
                12
              )
            );

            return true;
          }

          return false;
        }

        const hasOffsets =
          target.start_offset !==
            null &&
          target.start_offset !==
            undefined &&
          target.end_offset !==
            null &&
          target.end_offset !==
            undefined;

        const preciseRange =
          hasOffsets &&
          ![
            'prayer',
            'section',
            'text',
          ].includes(
            target.save_type ||
            target.saveType
          );

        if (preciseRange) {
          const rect =
            getRangeRect(
              root,
              Number(
                target.start_offset
              ),
              Number(
                target.end_offset
              )
            );

          if (rect) {
            window.scrollTo(
              0,
              Math.max(
                0,
                window.scrollY +
                rect.top +
                (
                  rect.height /
                  2
                ) -
                (
                  window.innerHeight /
                  2
                )
              )
            );
          } else {
            root.scrollIntoView({
              block:
                'center',
            });
          }
        } else {
          const rootRect =
            root.getBoundingClientRect();

          window.scrollTo(
            0,
            Math.max(
              0,
              window.scrollY +
              rootRect.top -
              18
            )
          );
        }

        root.classList.add(
          'focus-target'
        );

        setTimeout(
          () =>
            root.classList.remove(
              'focus-target'
            ),
          1400
        );

        return true;
      };


    const restoreProgress =
      () => {
        if (
          focusSavedTarget()
        ) {
          setTimeout(
            () => {
              state.restoring =
                false;
            },
            350
          );

          return;
        }

        const progress =
          DATA.progress;

        if (!progress) {
          state.restoring =
            false;
          reportProgress();
          return;
        }

        const item =
          document.querySelector(
            '.rule-item[data-item-id="' +
            progress.anchorId +
            '"]'
          );

        if (!item) {
          state.restoring =
            false;
          return;
        }

        const target =
          Math.max(
            0,
            item.offsetTop +
            progress.offset -
            (
              window.innerHeight /
              2
            )
          );

        window.scrollTo(
          0,
          target
        );

        setTimeout(
          () => {
            state.restoring =
              false;
          },
          350
        );
      };


    window.readerApi = {
      saveSucceeded:
        savedItem => {
          const itemId =
            Number(
              savedItem.anchor_id
            );

          const current =
            savedRanges.get(
              itemId
            ) || [];

          current.push({
            id:
              savedItem.id,
            start:
              Number(
                savedItem.start_offset
              ),
            end:
              Number(
                savedItem.end_offset
              ),
          });

          savedRanges.set(
            itemId,
            current
          );

          state.savePending =
            false;

          clearSelection();

          renderTextItem(
            itemId
          );
        },

      removeSavedItem:
        (
          itemId,
          savedItemId
        ) => {
          itemId =
            Number(
              itemId
            );

          savedItemId =
            Number(
              savedItemId
            );

          const current =
            savedRanges.get(
              itemId
            ) || [];

          savedRanges.set(
            itemId,
            current.filter(
              range =>
                Number(
                  range.id
                ) !==
                savedItemId
            )
          );

          state.savePending =
            false;

          if (
            state.active &&
            Number(
              state.active.itemId
            ) === itemId
          ) {
            clearSelection();
          } else {
            renderTextItem(
              itemId
            );
          }
        },

      updatePrayerAction:
        (
          itemId,
          savedItemId,
          active
        ) => {
          const button =
            document.querySelector(
              '.favorite-action[data-item-id="' +
              itemId +
              '"]'
            );

          if (!button) {
            return;
          }

          button.dataset.savedItemId =
            savedItemId
              ? String(
                  savedItemId
                )
              : '';

          button.classList.toggle(
            'active',
            !!active
          );

          setSaveHeartIcon(
            button,
            !!active
          );

          document
            .querySelector(
              '.rule-item[data-item-id="' +
              itemId +
              '"]'
            )
            ?.classList
            .toggle(
              'whole-saved',
              !!active
            );
        },

      saveFailed:
        message => {
          state.savePending =
            false;

          selectionHint.textContent =
            message ||
            'Не удалось сохранить';

          selectionHint.classList
            .add(
              'error'
            );

          updateBar();
        },
    };


    renderRule();
    loadSavedRanges();

    itemTextMap.forEach(
      (
        _text,
        itemId
      ) =>
        renderTextItem(
          itemId
        )
    );

    requestAnimationFrame(
      () => {
        updateScrollControls();
        restoreProgress();

        setTimeout(
          updateScrollControls,
          180
        );
      }
    );
  </script>
</body>
</html>
`;

const buildHtml = ({
  rule,
  savedItems,
  savedProgress,
  focusTarget,
  viewMode,
  viewSwitcher,
  topContentInset,
  memorialEnabled,
}) => {
  const payload = {
    rule,

    viewMode: viewMode || 'both',

    viewSwitcher: viewSwitcher || null,

    memorialEnabled: !!memorialEnabled,

    savedItems: savedItems.filter(
      (item) =>
        item.anchor_type === 'prayer_rule_item' &&
        item.start_offset !== null &&
        item.end_offset !== null
    ),

    focusTarget: focusTarget || null,

    progress:
      savedProgress?.anchor_type === 'prayer_rule_item'
        ? {
            anchorId: Number(savedProgress.anchor_id),
            offset: Number(savedProgress.offset || 0),
          }
        : null,
  };

  return HTML_TEMPLATE.replace(
    '__READER_TOP_PADDING__',
    String(Math.max(16, Number(topContentInset || 0) + 16))
  ).replace('__READER_PAYLOAD__', scriptSafeJson(payload));
};

export default function PrayerRuleReader({
  rule,
  savedItems,
  savedProgress,
  focusTarget,
  viewMode = 'both',
  viewSwitcher = null,
  topContentInset = 0,
  memorialEnabled = false,
  onSaved,
  onProgress,
  onMemorialOpen,
  onViewModeChange,
}) {
  const insets = useSafeAreaInsets();

  const webViewRef = useRef(null);

  const html = useMemo(
    () =>
      buildHtml({
        rule,
        savedItems,
        savedProgress,
        focusTarget,
        viewMode,
        viewSwitcher,
        topContentInset,
        memorialEnabled,
      }),
    [
      rule,
      savedItems,
      savedProgress,
      focusTarget,
      viewMode,
      viewSwitcher,
      topContentInset,
      memorialEnabled,
    ]
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

    if (message.type === 'progress') {
      onProgress?.({
        anchorType: 'prayer_rule_item',
        anchorId: Number(message.anchorId),
        offset: Math.max(0, Number(message.offset || 0)),
        progressPercent: Math.max(0, Math.min(Number(message.progressPercent || 0), 100)),
      });

      return;
    }

    if (message.type === 'memorial-open') {
      onMemorialOpen?.(message.context || null);

      return;
    }

    if (message.type === 'whole-prayer-action') {
      const itemId = Number(message.itemId);

      const item = (rule.items || []).find((entry) => Number(entry.id) === itemId);

      if (!item?.text) {
        return;
      }

      if (message.savedItemId) {
        try {
          await deleteSavedItem(Number(message.savedItemId));

          inject(
            'window.readerApi && window.readerApi.removeSavedItem(' +
              itemId +
              ',' +
              Number(message.savedItemId) +
              ')'
          );

          inject(
            'window.readerApi && window.readerApi.updatePrayerAction(' + itemId + ',null,false)'
          );
        } catch (deleteError) {
          console.log(
            'Ошибка удаления молитвы из избранного:',
            deleteError.response?.data || deleteError.message
          );
        }

        return;
      }

      const content =
        viewMode === 'ukrainian'
          ? item.text.translation_uk || item.text.translation || item.text.content || ''
          : viewMode === 'russian'
            ? item.text.translation || item.text.content || ''
            : viewMode === 'traditional'
              ? item.text.traditional_content || item.text.content || ''
              : item.text.content || item.text.traditional_content || '';

      try {
        const saved = await saveItem({
          save_type: 'prayer',

          source_type: 'prayer_rule',

          source_id: rule.id,

          anchor_type: 'prayer_rule_item',

          anchor_id: itemId,

          source_title: rule.name,

          item_title: item.text.title || item.text.description || 'Молитва',

          text: content,

          start_offset: 0,

          end_offset: content.length,

          metadata: {
            slug: rule.slug,
          },
        });

        inject('window.readerApi && window.readerApi.saveSucceeded(' + scriptSafeJson(saved) + ')');

        inject(
          'window.readerApi && window.readerApi.updatePrayerAction(' +
            itemId +
            ',' +
            Number(saved.id) +
            ',true)'
        );
      } catch (saveError) {
        console.log(
          'Ошибка добавления молитвы в избранное:',
          saveError.response?.data || saveError.message
        );
      }

      return;
    }

    if (message.type === 'remove-selection') {
      try {
        await deleteSavedItem(Number(message.savedItemId));

        inject(
          'window.readerApi && window.readerApi.removeSavedItem(' +
            Number(message.anchorId) +
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

    try {
      const saved = await saveItem({
        save_type: message.saveType || 'fragment',
        source_type: 'prayer_rule',
        source_id: rule.id,
        anchor_type: 'prayer_rule_item',
        anchor_id: Number(message.anchorId),
        source_title: rule.name,
        item_title: message.itemTitle || 'Молитва',
        text: message.text,
        start_offset: Number(message.start),
        end_offset: Number(message.end),
        metadata: {
          slug: rule.slug,
          language: message.language || 'church',
        },
      });

      onSaved?.(saved);

      inject('window.readerApi && window.readerApi.saveSucceeded(' + scriptSafeJson(saved) + ')');
    } catch (error) {
      console.log('Ошибка сохранения выделения молитвы:', error.response?.data || error.message);

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
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        textZoom={100}
        onMessage={handleMessage}
        style={styles.webView}
      />

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
