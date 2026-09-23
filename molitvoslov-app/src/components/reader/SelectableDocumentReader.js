import React, {
  useMemo,
  useRef,
} from 'react';

import {
  StyleSheet,
  View,
} from 'react-native';

import {
  WebView,
} from 'react-native-webview';

import {
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
      --background: #F7F4EE;
      --surface: #FFFDF8;
      --text: #302C27;
      --secondary: #756E65;
      --muted: #978E83;
      --accent: #8A5A38;
      --accent-dark: #684229;
      --liturgical: #A33A32;
      --border: rgba(112, 86, 55, 0.18);
      --saved: rgba(206, 162, 72, 0.24);
      --active: rgba(126, 175, 223, 0.36);
      --handle: #4A8CCB;
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
      background: #F3EBDD;
      border-color: rgba(138, 90, 56, 0.30);
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
      background: #F3EBDD;
      border-color: rgba(138, 90, 56, 0.30);
    }

    .prayer-title,
    .section-title {
      margin: 0 0 10px;
      text-align: center;
      color: var(--secondary);
      font-size: 19px;
      line-height: 25px;
      font-weight: 700;
    }

    .section-title {
      color: var(--text);
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
      color: var(--secondary);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      line-height: 15px;
      font-weight: 700;
    }

    .reader-text.secondary {
      color: var(--secondary);
      font-size: 16px;
      line-height: 25px;
    }

    .reader-text.akathist-church {
      color: #292929;
      font-size: 17px;
      line-height: 24px;
    }

    .reader-text.akathist-russian {
      color: #777777;
      font-size: 16px;
      line-height: 23px;
    }

    .reader-text.canon-church {
      color: #292929;
      font-size: 17px;
      line-height: 26px;
    }

    .reader-text.canon-russian {
      color: #777777;
      font-size: 16px;
      line-height: 24px;
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
      color: #AE1721;
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
      background: rgba(126, 175, 223, 0.44);
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
      width: 28px;
      height: 38px;
      z-index: 1001;
      touch-action: none;
    }

    .selection-handle::before {
      content: "";
      position: absolute;
      left: 12px;
      top: 0;
      width: 3px;
      height: 21px;
      border-radius: 2px;
      background: var(--handle);
    }

    .selection-handle::after {
      content: "";
      position: absolute;
      left: 6px;
      top: 19px;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      background: var(--handle);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
    }

    #selection-bar {
      display: none;
      position: fixed;
      left: 14px;
      right: 14px;
      bottom: 14px;
      z-index: 1002;
      min-height: 58px;
      padding: 9px 9px 9px 14px;
      align-items: center;
      gap: 8px;
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
      width: 34px;
      height: 34px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--muted);
      font-size: 25px;
      line-height: 34px;
    }

    #selection-save {
      min-width: 104px;
      height: 38px;
      padding: 0 14px;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 800;
    }

    #selection-save:disabled {
      opacity: 0.4;
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
              'rule-item'
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

                  column.appendChild(
                    textElement
                  );

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


    const appendStyledSegment = (
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
              const word =
                el(
                  'span',
                  'liturgical-word',
                  part
                );

              parent.appendChild(
                word
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

          appendStyledSegment(
            span,
            text.slice(
              start,
              end
            ),
            itemConfigMap
              .get(
                itemId
              )
              ?.accentWords
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
      savedItemId,
      active
    ) => {
      const section =
        (
          DATA.document.sections ||
          []
        ).find(
          item =>
            item.action?.key ===
              actionKey &&
            item.action
              ?.highlightContent
        );

      const documentWide =
        DATA.document.action?.key ===
          actionKey &&
        DATA.document.action
          ?.highlightContent;

      if (
        !section &&
        !documentWide
      ) {
        return;
      }

      const targetSections =
        documentWide
          ? (
              DATA.document.sections ||
              []
            )
          : [
              section,
            ];

      targetSections.forEach(
        targetSection => {
          (
            targetSection.rows ||
            []
          ).forEach(
            row => {
              (
                row.blocks ||
                []
              ).forEach(
                block => {
                  const highlightAnchorType =
                    section
                      ?.action
                      ?.highlightAnchorType ||
                    DATA.document
                      .action
                      ?.highlightAnchorType;

                  if (
                    highlightAnchorType &&
                    block.anchorType !==
                      highlightAnchorType
                  ) {
                    return;
                  }

                  const itemId =
                    Number(
                      block.id
                    );

                  const text =
                    itemTextMap.get(
                      itemId
                    ) ||
                    '';

                  const current =
                    savedRanges.get(
                      itemId
                    ) ||
                    [];

                  const withoutWhole =
                    current.filter(
                      range =>
                        range.actionKey !==
                          actionKey
                    );

                  if (
                    active &&
                    text.length
                  ) {
                    withoutWhole.push({
                      id:
                        savedItemId ||
                        actionKey,

                      actionKey,

                      start:
                        0,

                      end:
                        text.length,
                    });
                  }

                  savedRanges.set(
                    itemId,
                    withoutWhole
                  );

                  renderTextItem(
                    itemId
                  );
                }
              );
            }
          );
        }
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
            14
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
            14
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
        start =
          Math.min(
            point.offset,
            end - 1
          );
      } else if (
        state.drag.mode ===
        'end'
      ) {
        end =
          Math.max(
            point.offset,
            start + 1
          );
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
            430
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
        });
      };


    window.addEventListener(
      'scroll',
      () => {
        updateHandles();

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


    const restoreProgress =
      () => {
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

          renderTextItem(
            itemId
          );
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
      restoreProgress
    );
  </script>
</body>
</html>
`;


const buildHtml = ({
  documentData,
  savedProgress,
}) => {
  const payload = {
    document:
      documentData,

    savedItems:
      documentData.savedItems ||
      [],

    progressAnchorType:
      documentData.progressAnchorType,

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
  onSaved,
  onProgress,
  onAction,
}) {
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
        }),
      [
        documentData,
        savedProgress,
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
      style={styles.container}
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
        colors.background,
    },

    webView: {
      flex: 1,
      backgroundColor:
        colors.background,
    },
  });
