
import React, {
  useMemo,
  useRef,
} from 'react';

import {
  StyleSheet,
  View,
} from 'react-native';

import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  WebView,
} from 'react-native-webview';

import {
  deleteSavedItem,
  saveItem,
} from '../../services/savedItems';

import {
  colors,
} from '../../theme';


const scriptSafeJson = value =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');


const HTML_TEMPLATE = String.raw`
<!doctype html>
<html>
<head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
  />

  <style>
    :root {
      --background: #FFF4DE;
      --surface: #FFF8EA;
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
      padding: 14px 14px 88px;
    }

    .rule-title {
      margin: 0 0 18px;
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
      min-height: 34px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      color: var(--secondary);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      line-height: 14px;
      font-weight: 700;
    }

    .document-action.active {
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

    .section-action {
      min-width: 82px;
      min-height: 32px;
      padding: 0 9px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--surface);
      color: var(--secondary);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      line-height: 14px;
      font-weight: 700;
    }

    .section-action.active {
      color: var(--accent-dark);
      background: #F1DFC2;
      border-color: rgba(123, 79, 36, 0.28);
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

    .reader-text.canon-russian .liturgical-word,
    .reader-text.akathist-russian .liturgical-word {
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
      white-space: pre-wrap;
      overflow-wrap: break-word;
      touch-action: pan-y;
    }

    .reader-text span {
      white-space: pre-wrap;
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
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(112, 86, 55, 0.24);
      border-radius: 21px;
      background: rgba(255, 253, 248, 0.96);
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

    const itemConfigMap =
      new Map();

    const savedRanges =
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

      const wrapper =
        el(
          'div',
          'footnotes'
        );

      footnotes.forEach(
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



    const renderDocument = () => {
      if (DATA.document.title) {
        reader.appendChild(
          el(
            'h1',
            'rule-title',
            DATA.document.title
          )
        );
      }

      if (
        DATA.document.description
      ) {
        reader.appendChild(
          el(
            'div',
            'rule-description',
            DATA.document.description
          )
        );
      }

      if (
        DATA.document.action
      ) {
        const actionRow =
          el(
            'div',
            'document-action-row'
          );

        const action =
          el(
            'button',
            DATA.document.action.active
              ? 'document-action active'
              : 'document-action',
            DATA.document.action.label
          );

        action.type =
          'button';

        action.dataset.actionKey =
          DATA.document.action.key;

        actionRow.appendChild(
          action
        );

        reader.appendChild(
          actionRow
        );
      }

      (
        DATA.document.sections ||
        []
      ).forEach(
        section => {
          const wrapper =
            el(
              'section',
              'rule-item ' +
              (
                section.className ||
                ''
              )
            );

          wrapper.dataset.itemId =
            String(
              section.progressAnchorId
            );

          wrapper.dataset.trackProgress =
            section.trackProgress ===
              false
              ? 'false'
              : 'true';

          wrapper.dataset.actionKey =
            section.action?.key ||
            '';

          if (
            section.title ||
            section.action
          ) {
            const header =
              el(
                'div',
                'section-header'
              );

            if (
              section.title
            ) {
              header.appendChild(
                el(
                  'h2',
                  'prayer-title',
                  section.title
                )
              );
            }

            if (
              section.action
            ) {
              const action =
                el(
                  'button',
                  section.action.active
                    ? 'section-action active'
                    : 'section-action',
                  section.action.label
                );

              action.type =
                'button';

              action.dataset.actionKey =
                section.action.key;

              header.appendChild(
                action
              );
            }

            wrapper.appendChild(
              header
            );
          }

          if (
            section.note
          ) {
            wrapper.appendChild(
              el(
                'div',
                'note',
                section.note
              )
            );
          }

          (
            section.rows ||
            []
          ).forEach(
            row => {
              const rowNode =
                el(
                  'div',
                  row.layout ===
                    'parallel'
                    ? 'reader-row reader-row-parallel'
                    : 'reader-row'
                );

              (
                row.blocks ||
                []
              ).forEach(
                block => {
                  const itemId =
                    Number(
                      block.id
                    );

                  itemTextMap.set(
                    itemId,
                    block.text || ''
                  );

                  itemTitleMap.set(
                    itemId,
                    block.itemTitle ||
                    section.title ||
                    'Текст'
                  );

                  itemConfigMap.set(
                    itemId,
                    block
                  );

                  const column =
                    el(
                      'div',
                      'reader-column'
                    );

                  if (
                    block.label
                  ) {
                    column.appendChild(
                      el(
                        'div',
                        'reader-label',
                        block.label
                      )
                    );
                  }

                  const textElement =
                    el(
                      'div',
                      'reader-text ' +
                      (
                        block.className ||
                        ''
                      )
                    );

                  textElement.dataset.itemId =
                    String(
                      itemId
                    );

                  if (
                    block.inlineLabel
                  ) {
                    const normalizedInlineLabel =
                      String(
                        block.inlineLabel ||
                        ''
                      )
                        .normalize(
                          'NFD'
                        )
                        .replace(
                          /[\u0300-\u036f\u0483-\u0487]/g,
                          ''
                        )
                        .trim()
                        .toLowerCase();

                    const inline =
                      el(
                        'div',
                        normalizedInlineLabel
                          .startsWith(
                            'молитва'
                          )
                          ? 'reader-inline prayer-inline'
                          : 'reader-inline'
                      );

                    inline.appendChild(
                      el(
                        'span',
                        'reader-inline-label',
                        block.inlineLabel
                      )
                    );

                    inline.appendChild(
                      textElement
                    );

                    column.appendChild(
                      inline
                    );
                  } else {
                    column.appendChild(
                      textElement
                    );
                  }

                  rowNode.appendChild(
                    column
                  );
                }
              );

              wrapper.appendChild(
                rowNode
              );
            }
          );

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


    const appendAccentWords = (
      parent,
      value,
      accentWords
    ) => {
      if (
        !Array.isArray(
          accentWords
        ) ||
        !accentWords.length
      ) {
        parent.appendChild(
          document.createTextNode(
            value
          )
        );

        return;
      }

      const accents =
        new Set(
          accentWords
        );

      value
        .split(
          /(\s+)/
        )
        .forEach(
          part => {
            if (
              /^\s+$/.test(
                part
              )
            ) {
              parent.appendChild(
                document.createTextNode(
                  part
                )
              );

              return;
            }

            const clean =
              part
                .normalize(
                  'NFD'
                )
                .replace(
                  /[\u0300\u0301\u0340\u0341\u0483-\u0487]/g,
                  ''
                )
                .normalize(
                  'NFC'
                )
                .replace(
                  /^[^А-Яа-яЁё\u0400-\u052F]+/,
                  ''
                )
                .replace(
                  /[^А-Яа-яЁё\u0400-\u052F]+$/,
                  ''
                );

            if (
              accents.has(
                clean
              )
            ) {
              parent.appendChild(
                el(
                  'span',
                  'liturgical-word',
                  part
                )
              );

              return;
            }

            parent.appendChild(
              document.createTextNode(
                part
              )
            );
          }
        );
    };


    const findLiturgicalPhraseRanges =
      value => {
        const normalizedChars =
          [];

        const originalIndex =
          [];

        for (
          let index = 0;
          index < value.length;
          index += 1
        ) {
          const decomposed =
            value[index]
              .normalize(
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

        const pattern =
          /Слава\s+Отцу\s*,?\s*и\s+Сыну\s*,?\s*и\s+Святому\s+Духу\s*[:;,.!?]?|И\s+ныне\s*,?\s*и\s+присно\s*,?\s*и\s+во\s+веки\s+веков\s*[.,;:]?\s*аминь\s*[.!?]?/giu;

        const ranges =
          [];

        let match = null;

        while (
          (
            match =
              pattern.exec(
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
            end < value.length &&
            /[\u0300-\u036f\u0483-\u0487]/u.test(
              value[end]
            )
          ) {
            end += 1;
          }

          if (
            Number.isFinite(
              start
            ) &&
            end > start
          ) {
            ranges.push({
              start,
              end,
            });
          }
        }

        return ranges;
      };


    const findCanonLeadingCueRange =
      value => {
        const normalizedChars =
          [];

        const originalIndex =
          [];

        for (
          let index = 0;
          index < value.length;
          index += 1
        ) {
          const decomposed =
            value[index]
              .normalize(
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
            /^\s*((?:Молитва[^:\n]{0,140})|Ирмос|Припев|Иисусу|Богородичен|Кондак|Икос|Седален|Светилен|Тропарь|Слава|И\s+ныне|Ныне)\s*:/iu
          );

        if (!match) {
          return null;
        }

        const normalizedStart =
          match.index || 0;

        const normalizedEnd =
          normalizedStart +
          match[0].length -
          1;

        const start =
          originalIndex[
            normalizedStart
          ] ??
          0;

        let end =
          (
            originalIndex[
              normalizedEnd
            ] ??
            start
          ) + 1;

        while (
          end < value.length &&
          /[\u0300-\u036f\u0483-\u0487]/u.test(
            value[end]
          )
        ) {
          end += 1;
        }

        const normalizedLabel =
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
            normalizedLabel.startsWith(
              'молитва'
            ),

          short:
            [
              'слава',
              'и ныне',
              'ныне',
            ].includes(
              normalizedLabel
            ),
        };
      };


    const appendStyledSegment = (
      parent,
      value,
      accentWords,
      highlightLiturgicalPhrases =
        true,
      highlightCanonLeadingCue =
        false
    ) => {
      const canonCue =
        highlightCanonLeadingCue
          ? findCanonLeadingCueRange(
              value
            )
          : null;

      const phraseRanges =
        highlightLiturgicalPhrases
          ? findLiturgicalPhraseRanges(
              value
            )
          : [];

      const ranges =
        [
          ...phraseRanges.map(
            range => ({
              ...range,
              className:
                'liturgical-word',
            })
          ),

          ...(canonCue
            ? [
                {
                  start:
                    canonCue.start,

                  end:
                    canonCue.end,

                  className:
                    canonCue.prayerTitle
                      ? 'canon-leading-cue prayer-leading-cue'
                      : (
                          canonCue.short
                            ? 'canon-leading-cue canon-short-cue'
                            : 'canon-leading-cue'
                        ),
                },
              ]
            : []),
        ]
          .sort(
            (
              left,
              right
            ) =>
              left.start -
              right.start
          )
          .filter(
            (
              range,
              index,
              all
            ) =>
              index === 0 ||
              range.start >=
                all[index - 1].end
          );

      if (!ranges.length) {
        appendAccentWords(
          parent,
          value,
          accentWords
        );

        return;
      }

      let cursor = 0;

      ranges.forEach(
        range => {
          if (
            range.start >
            cursor
          ) {
            appendAccentWords(
              parent,
              value.slice(
                cursor,
                range.start
              ),
              accentWords
            );
          }

          parent.appendChild(
            el(
              'span',
              range.className,
              value.slice(
                range.start,
                range.end
              )
            )
          );

          if (
            range.className
              .includes(
                'prayer-leading-cue'
              ) &&
            range.end <
              value.length
          ) {
            parent.appendChild(
              document.createElement(
                'br'
              )
            );
          }

          cursor =
            range.end;
        }
      );

      if (
        cursor <
        value.length
      ) {
        appendAccentWords(
          parent,
          value.slice(
            cursor
          ),
          accentWords
        );
      }
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

        const boundaries =
          new Set([
            0,
            text.length,
          ]);

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

          const itemConfig =
            itemConfigMap.get(
              itemId
            );

          const isRussian =
            String(
              itemConfig
                ?.className ||
              ''
            ).includes(
              'russian'
            ) ||
            itemConfig
              ?.metadata
              ?.language ===
                'russian';

const isCanonChurch =
  String(
    itemConfig
      ?.className ||
    ''
  ).includes(
    'canon-church'
  ) &&
  !isRussian;

const isCanonPrayer =
  itemConfig
    ?.metadata
    ?.section_type ===
      'prayer' ||
  String(
    itemConfig
      ?.className ||
    ''
  ).includes(
    'canon-prayer'
  );

appendStyledSegment(
  span,
  text.slice(
    start,
    end
  ),
  itemConfig
    ?.accentWords,
  !isRussian &&
    !isCanonPrayer,
  isCanonChurch &&
    start === 0
);

          fragment.appendChild(
            span
          );
        }

        root.replaceChildren(
          fragment
        );
      };


    const setSectionWholeHighlight = (
      actionKey,
      _savedItemId,
      active
    ) => {
      const documentWide =
        DATA.document.action?.key ===
        actionKey &&
        DATA.document.action
          ?.highlightContent;

      if (documentWide) {
        document
          .querySelectorAll(
            '.rule-item'
          )
          .forEach(
            wrapper =>
              wrapper.classList.toggle(
                'whole-saved',
                !!active
              )
          );

        return;
      }

      const wrapper =
        document.querySelector(
          '.rule-item[data-action-key="' +
          actionKey +
          '"]'
        );

      wrapper?.classList.toggle(
        'whole-saved',
        !!active
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

        (
          DATA.document.sections ||
          []
        ).forEach(
          section => {
            if (
              section.action
                ?.highlightContent &&
              section.action
                ?.active
            ) {
              setSectionWholeHighlight(
                section.action.key,
                section.action
                  .savedItemId ||
                  section.action.key,
                true
              );
            }
          }
        );

        if (
          DATA.document.action
            ?.highlightContent &&
          DATA.document.action
            ?.active
        ) {
          setSectionWholeHighlight(
            DATA.document.action.key,
            DATA.document.action
              .savedItemId ||
              DATA.document.action.key,
            true
          );
        }
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
        ) &&
        cursor > 0
      ) {
        cursor -= 1;
      }

      if (
        !isWordChar(
          text[cursor]
        )
      ) {
        return null;
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
            650
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
            distance > 9 &&
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


    reader.addEventListener(
      'click',
      event => {
        const action =
          event.target.closest(
            '.section-action, .document-action'
          );

        if (!action) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        post({
          type:
            'section-action',

          actionKey:
            action.dataset
              .actionKey,
        });
      }
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

        const itemConfig =
          itemConfigMap.get(
            active.itemId
          );

        if (
          itemConfig?.fullSaveType &&
          range.start ===
            whole.start &&
          range.end ===
            whole.end
        ) {
          return itemConfig.fullSaveType;
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
            itemId:
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
          itemId:
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
            'Молитва',
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
              '.rule-item[data-track-progress="true"]'
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

        const progressPercent =
          maxScroll > 0
            ? Math.round(
                (
                  window.scrollY /
                  maxScroll
                ) * 100
              )
            : 100;

        post({
          type:
            'progress',

          anchorId:
            Number(
              current.dataset.itemId
            ),

          offset:
            Math.round(
              offset
            ),

          progressPercent:
            Math.max(
              0,
              Math.min(
                progressPercent,
                100
              )
            ),
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


    const findFocusBlockId =
      target => {
        if (!target) {
          return null;
        }

        const anchorType =
          target.anchor_type ||
          target.anchorType;

        const anchorId =
          Number(
            target.anchor_id ??
            target.anchorId
          );

        const metadata =
          target.metadata ||
          {};

        const candidates =
          [];

        itemConfigMap.forEach(
          (
            config,
            itemId
          ) => {
            if (
              config.anchorType !==
                anchorType ||
              Number(
                config.anchorId
              ) !==
                anchorId
            ) {
              return;
            }

            let score = 0;

            const blockMeta =
              config.metadata ||
              {};

            if (
              metadata.language &&
              blockMeta.language ===
                metadata.language
            ) {
              score += 8;
            }

            if (
              metadata.segment &&
              blockMeta.segment ===
                metadata.segment
            ) {
              score += 4;
            }

            if (
              metadata.special &&
              blockMeta.special ===
                metadata.special
            ) {
              score += 4;
            }

            if (
              metadata.chunk_index !==
                undefined &&
              Number(
                blockMeta.chunk_index
              ) ===
                Number(
                  metadata.chunk_index
                )
            ) {
              score += 6;
            }

            candidates.push({
              itemId,
              score,
            });
          }
        );

        if (!candidates.length) {
          return null;
        }

        candidates.sort(
          (
            left,
            right
          ) =>
            right.score -
            left.score
        );

        return Number(
          candidates[0]
            .itemId
        );
      };


    const focusSavedTarget =
      () => {
        const target =
          DATA.focusTarget;

        if (!target) {
          return false;
        }

        const itemId =
          findFocusBlockId(
            target
          );

        if (itemId) {
          const root =
            document.querySelector(
              '.reader-text[data-item-id="' +
              itemId +
              '"]'
            );

          if (!root) {
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

          const wholeTypes = [
            'prayer',
            'psalm',
            'kathisma',
            'chapter',
            'section',
            'akathist',
            'canon',
            'text',
          ];

          const preciseRange =
            hasOffsets &&
            !wholeTypes.includes(
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
              const targetY =
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
                );

              window.scrollTo(
                0,
                targetY
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
        }

        const metadata =
          target.metadata ||
          {};

        const sectionAnchorId =
          Number(
            metadata.psalm_id ||
            metadata.section_id ||
            target.anchor_id ||
            target.anchorId
          );

        if (sectionAnchorId) {
          const section =
            document.querySelector(
              '.rule-item[data-item-id="' +
              sectionAnchorId +
              '"]'
            );

          if (section) {
            const targetY =
              Math.max(
                0,
                section.offsetTop -
                12
              );

            window.scrollTo(
              0,
              targetY
            );

            return true;
          }
        }

        if (
          [
            'akathist',
            'canon',
            'kathisma',
          ].includes(
            target.anchor_type ||
            target.anchorType
          )
        ) {
          window.scrollTo(
            0,
            0
          );

          return true;
        }

        return false;
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
            '.rule-item[data-track-progress="true"][data-item-id="' +
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
        (
          itemId,
          savedItem
        ) => {
          itemId =
            Number(
              itemId
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

      updateAction:
        (
          actionKey,
          label,
          active,
          savedItemId = null
        ) => {
          const action =
            document.querySelector(
              '.section-action[data-action-key="' +
              actionKey +
              '"], .document-action[data-action-key="' +
              actionKey +
              '"]'
            );

          if (action) {
            action.textContent =
              label;

            action.classList
              .toggle(
                'active',
                !!active
              );
          }

          setSectionWholeHighlight(
            actionKey,
            savedItemId,
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


    renderDocument();
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
  documentData,
  savedProgress,
  focusTarget,
}) => {
  const payload = {
    document:
      documentData,

    savedItems:
      documentData.savedItems ||
      [],

    progressAnchorType:
      documentData.progressAnchorType,

    focusTarget:
      focusTarget ||
      null,

    progress:
      savedProgress &&
      savedProgress.anchor_type ===
        documentData.progressAnchorType
          ? {
              anchorId:
                Number(
                  savedProgress
                    .anchor_id
                ),

              offset:
                Number(
                  savedProgress
                    .offset || 0
                ),
            }
          : null,
  };

  return HTML_TEMPLATE.replace(
    '__READER_PAYLOAD__',
    scriptSafeJson(
      payload
    )
  );
};

export default function SelectableDocumentReader({
  documentData,
  savedProgress,
  focusTarget,
  onSaved,
  onProgress,
  onAction,
}) {
  const insets =
    useSafeAreaInsets();

  const webViewRef =
    useRef(null);

  const itemConfigMap =
    useMemo(
      () => {
        const result =
          new Map();

        (
          documentData.sections ||
          []
        ).forEach(
          section => {
            (
              section.rows ||
              []
            ).forEach(
              row => {
                (
                  row.blocks ||
                  []
                ).forEach(
                  block => {
                    result.set(
                      Number(
                        block.id
                      ),
                      block
                    );
                  }
                );
              }
            );
          }
        );

        return result;
      },
      [
        documentData.sections,
      ]
    );

  const html =
    useMemo(
      () =>
        buildHtml({
          documentData,
          savedProgress,
          focusTarget,
        }),
      [
        documentData,
        savedProgress,
        focusTarget,
      ]
    );


  const inject =
    script => {
      webViewRef.current
        ?.injectJavaScript(
          script +
          '; true;'
        );
    };


  const handleMessage =
    async event => {
      let message;

      try {
        message =
          JSON.parse(
            event.nativeEvent
              .data
          );
      } catch {
        return;
      }

      if (
        message.type ===
        'progress'
      ) {
        onProgress?.({
          anchorType:
            documentData.progressAnchorType,

          anchorId:
            Number(
              message.anchorId
            ),

          offset:
            Math.max(
              0,
              Number(
                message.offset ||
                0
              )
            ),

          progressPercent:
            Math.max(
              0,
              Math.min(
                Number(
                  message.progressPercent ||
                  0
                ),
                100
              )
            ),
        });

        return;
      }

      if (
        message.type ===
        'section-action'
      ) {
        if (!onAction) {
          return;
        }

        try {
          const result =
            await onAction(
              message.actionKey
            );

          if (result) {
            inject(
              'window.readerApi && window.readerApi.updateAction(' +
              scriptSafeJson(
                message.actionKey
              ) +
              ',' +
              scriptSafeJson(
                result.label ||
                ''
              ) +
              ',' +
              (
                result.active
                  ? 'true'
                  : 'false'
              ) +
              ',' +
              (
                result.savedItem?.id ||
                result.savedItemId ||
                'null'
              ) +
              ')'
            );

            if (
              result.savedItem &&
              result.itemId
            ) {
              inject(
                'window.readerApi && window.readerApi.saveSucceeded(' +
                Number(
                  result.itemId
                ) +
                ',' +
                scriptSafeJson(
                  result.savedItem
                ) +
                ')'
              );
            }

            if (
              result.removedSavedItemId &&
              result.itemId
            ) {
              inject(
                'window.readerApi && window.readerApi.removeSavedItem(' +
                Number(
                  result.itemId
                ) +
                ',' +
                Number(
                  result.removedSavedItemId
                ) +
                ')'
              );
            }
          }
        } catch (actionError) {
          console.log(
            'Ошибка действия reader:',
            actionError
          );
        }

        return;
      }


      if (
        message.type ===
        'remove-selection'
      ) {
        try {
          await deleteSavedItem(
            Number(
              message.savedItemId
            )
          );

          inject(
            'window.readerApi && window.readerApi.removeSavedItem(' +
            Number(
              message.itemId
            ) +
            ',' +
            Number(
              message.savedItemId
            ) +
            ')'
          );
        } catch (deleteError) {
          console.log(
            'Ошибка удаления выделения:',
            deleteError.message
          );

          inject(
            "window.readerApi && window.readerApi.saveFailed('Не удалось удалить')"
          );
        }

        return;
      }

      if (
        message.type !==
        'save-selection'
      ) {
        return;
      }

      const itemConfig =
        itemConfigMap.get(
          Number(
            message.itemId
          )
        );

      if (!itemConfig) {
        return;
      }

      try {
        const saved =
          await saveItem({
            save_type:
              message.saveType ||
              'fragment',

            source_type:
              itemConfig.sourceType,

            source_id:
              itemConfig.sourceId,

            anchor_type:
              itemConfig.anchorType,

            anchor_id:
              itemConfig.anchorId,

            source_title:
              itemConfig.sourceTitle ||
              documentData.title ||
              '',

            item_title:
              itemConfig.itemTitle ||
              '',

            text:
              message.text,

            start_offset:
              Number(
                message.start
              ),

            end_offset:
              Number(
                message.end
              ),

            metadata:
              itemConfig.metadata ||
              {},
          });

        onSaved?.(
          saved,
          itemConfig
        );

        inject(
          'window.readerApi && window.readerApi.saveSucceeded(' +
          Number(
            message.itemId
          ) +
          ',' +
          scriptSafeJson(
            saved
          ) +
          ')'
        );
      } catch (error) {
        console.log(
          'Ошибка сохранения выделения:',
          error.response?.data ||
          error.message
        );

        inject(
          "window.readerApi && window.readerApi.saveFailed('Не удалось сохранить')"
        );
      }
    };


  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom:
            Math.max(
              insets.bottom,
              8
            ),
        },
      ]}
    >
      <WebView
        ref={
          webViewRef
        }
        source={{
          html,
        }}
        originWhitelist={[
          '*',
        ]}
        javaScriptEnabled
        nestedScrollEnabled
        showsVerticalScrollIndicator={
          false
        }
        domStorageEnabled={
          false
        }
        setSupportMultipleWindows={
          false
        }
        overScrollMode="never"
        textZoom={100}
        onMessage={
          handleMessage
        }
        style={
          styles.webView
        }
      />
    </View>
  );
}


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#FFF4DE',
    },

    webView: {
      flex: 1,
      backgroundColor:
        '#FFF4DE',
    },
  });
