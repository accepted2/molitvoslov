import React, {useMemo, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';

import {deleteSavedItem, saveItem} from '../../services/savedItems';
import {colors} from '../../theme';


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
      padding: 16px 14px 88px;
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
      white-space: pre-line;
      overflow-wrap: normal;
      word-break: normal;
    }

    .favorite-action {
      position: absolute;
      top: 50%;
      right: 0;
      width: 34px;
      height: 32px;
      padding: 0;
      transform: translateY(-50%);
      border: 1px solid var(--border);
      border-radius: 16px;
      background: rgba(255, 253, 248, 0.92);
      color: var(--secondary);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 21px;
      line-height: 30px;
      font-weight: 500;
    }

    .favorite-action.active {
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
      white-space: pre-wrap;
      overflow-wrap: break-word;
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
      background: rgba(126, 175, 223, 0.44);
    }

    .reader-text.focus-target {
      outline: 2px solid rgba(138, 90, 56, 0.42);
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

    #reader-scroll-track {
      position: fixed;
      top: 10px;
      right: 1px;
      bottom: 72px;
      width: 18px;
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
      right: 4px;
      width: 7px;
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
      reader.appendChild(
        el(
          'h1',
          'rule-title',
          DATA.rule.name
        )
      );

      if (
        DATA.rule.description
      ) {
        reader.appendChild(
          el(
            'div',
            'rule-description',
            DATA.rule.description
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

            const normalizedTitle =
              normalizeLiturgicalValue(
                text.title
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
                    text.title ||
                    ''
                  );

            let displayTitleText =
              displayTitle.replace(
                /(\d+)-([яй])/giu,
                '$1‑$2'
              );

            if (
              displayTitleText.length >
                32 &&
              displayTitleText.includes(
                ','
              )
            ) {
              const commaIndex =
                displayTitleText.indexOf(
                  ','
                );

              const beforeComma =
                displayTitleText
                  .slice(
                    0,
                    commaIndex + 1
                  )
                  .trim();

              const afterComma =
                displayTitleText
                  .slice(
                    commaIndex + 1
                  )
                  .trim();

              if (
                beforeComma &&
                afterComma
              ) {
                displayTitleText =
                  beforeComma +
                  '\n' +
                  afterComma;
              }
            }

            const churchText =
              text.content ||
              '';

            const russianText =
              text.translation ||
              '';

            const viewMode =
              DATA.viewMode ||
              'both';

            const primaryLanguage =
              viewMode ===
                'russian' &&
              russianText
                ? 'russian'
                : 'church';

            const primaryText =
              primaryLanguage ===
                'russian'
                ? russianText
                : churchText;

            const itemTitle =
              displayTitle ||
              text.description ||
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
                  el(
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
                      : 'favorite-action',
                    wholeSaved
                      ? '★'
                      : '☆'
                  );

                favorite.type =
                  'button';

                favorite.title =
                  wholeSaved
                    ? 'Убрать из избранного'
                    : 'Добавить в избранное';

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
              text.description &&
              text.description_position ===
                'before'
            ) {
              wrapper.appendChild(
                el(
                  'div',
                  'description',
                  text.description
                )
              );
            }

            const textElement =
              el(
                'div',
                'reader-text'
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
              text.description &&
              text.description_position ===
                'after'
            ) {
              wrapper.appendChild(
                el(
                  'div',
                  'description after',
                  text.description
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

        const leadingCue =
          findLeadingCueRange(
            text
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

          if (
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

        const hasOverflow =
          maxScroll > 16;

        scrollTrack.classList.toggle(
          'visible',
          hasOverflow
        );

        scrollTopButton.classList.toggle(
          'visible',
          hasOverflow &&
          window.scrollY >
            window.innerHeight * 0.65
        );

        if (!hasOverflow) {
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


    let scrollDrag = null;


    scrollThumb.addEventListener(
      'pointerdown',
      event => {
        event.preventDefault();
        event.stopPropagation();

        const documentHeight =
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          );

        scrollDrag = {
          pointerId:
            event.pointerId,

          startY:
            event.clientY,

          startScroll:
            window.scrollY,

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

        scrollThumb.setPointerCapture?.(
          event.pointerId
        );
      }
    );


    scrollThumb.addEventListener(
      'pointermove',
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
      }
    );


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
      };


    scrollThumb.addEventListener(
      'pointerup',
      endScrollDrag
    );

    scrollThumb.addEventListener(
      'pointercancel',
      endScrollDrag
    );


    scrollTrack.addEventListener(
      'pointerdown',
      event => {
        if (
          event.target !==
            scrollTrack
        ) {
          return;
        }

        event.preventDefault();

        const rect =
          scrollTrack
            .getBoundingClientRect();

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

        const thumbHeight =
          Math.max(
            1,
            scrollThumb.offsetHeight
          );

        const maxThumbTop =
          Math.max(
            1,
            rect.height -
            thumbHeight
          );

        const thumbTop =
          Math.max(
            0,
            Math.min(
              maxThumbTop,
              event.clientY -
              rect.top -
              (
                thumbHeight /
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
          maxScroll
        );
      }
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
        updateScrollControls();

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

          renderTextItem(
            itemId
          );
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

          button.textContent =
            active
              ? '★'
              : '☆';

          button.title =
            active
              ? 'Убрать из избранного'
              : 'Добавить в избранное';

          button.classList.toggle(
            'active',
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
}) => {
  const payload = {
    rule,

    viewMode:
      viewMode ||
      'both',

    savedItems:
      savedItems.filter(
        item =>
          item.anchor_type ===
            'prayer_rule_item' &&
          item.start_offset !==
            null &&
          item.end_offset !==
            null
      ),

    focusTarget:
      focusTarget ||
      null,

    progress:
      savedProgress
        ?.anchor_type ===
        'prayer_rule_item'
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


export default function PrayerRuleReader({
  rule,
  savedItems,
  savedProgress,
  focusTarget,
  viewMode = 'both',
  onSaved,
  onProgress,
}) {
  const webViewRef =
    useRef(null);

  const html =
    useMemo(
      () =>
        buildHtml({
          rule,
          savedItems,
          savedProgress,
          focusTarget,
          viewMode,
        }),
      [
        rule,
        savedItems,
        savedProgress,
        focusTarget,
        viewMode,
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
          anchorType: 'prayer_rule_item',
          anchorId: Number(message.anchorId),
          offset: Math.max(0, Number(message.offset || 0)),
          progressPercent: Math.max(
            0,
            Math.min(Number(message.progressPercent || 0), 100)
          ),
        });

        return;
      }

      if (
        message.type ===
        'whole-prayer-action'
      ) {
        const itemId =
          Number(
            message.itemId
          );

        const item =
          (
            rule.items ||
            []
          ).find(
            entry =>
              Number(
                entry.id
              ) ===
                itemId
          );

        if (
          !item?.text
        ) {
          return;
        }

        if (
          message.savedItemId
        ) {
          try {
            await deleteSavedItem(
              Number(
                message.savedItemId
              )
            );

            inject(
              'window.readerApi && window.readerApi.removeSavedItem(' +
              itemId +
              ',' +
              Number(
                message.savedItemId
              ) +
              ')'
            );

            inject(
              'window.readerApi && window.readerApi.updatePrayerAction(' +
              itemId +
              ',null,false)'
            );
          } catch (deleteError) {
            console.log(
              'Ошибка удаления молитвы из избранного:',
              deleteError.response?.data ||
              deleteError.message
            );
          }

          return;
        }

        const content =
          item.text.content ||
          '';

        try {
          const saved =
            await saveItem({
              save_type:
                'prayer',

              source_type:
                'prayer_rule',

              source_id:
                rule.id,

              anchor_type:
                'prayer_rule_item',

              anchor_id:
                itemId,

              source_title:
                rule.name,

              item_title:
                item.text.title ||
                item.text.description ||
                'Молитва',

              text:
                content,

              start_offset:
                0,

              end_offset:
                content.length,

              metadata: {
                slug:
                  rule.slug,
              },
            });

          inject(
            'window.readerApi && window.readerApi.saveSucceeded(' +
            scriptSafeJson(
              saved
            ) +
            ')'
          );

          inject(
            'window.readerApi && window.readerApi.updatePrayerAction(' +
            itemId +
            ',' +
            Number(
              saved.id
            ) +
            ',true)'
          );
        } catch (saveError) {
          console.log(
            'Ошибка добавления молитвы в избранное:',
            saveError.response?.data ||
            saveError.message
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

      try {
        const saved =
          await saveItem({
            save_type:
              message.saveType ||
              'fragment',
            source_type:
              'prayer_rule',
            source_id:
              rule.id,
            anchor_type:
              'prayer_rule_item',
            anchor_id:
              Number(
                message.anchorId
              ),
            source_title:
              rule.name,
            item_title:
              message.itemTitle ||
              'Молитва',
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
            metadata: {
              slug:
                rule.slug,
              language:
                message.language ||
                'church',
            },
          });

        onSaved?.(
          saved
        );

        inject(
          'window.readerApi && window.readerApi.saveSucceeded(' +
          scriptSafeJson(
            saved
          ) +
          ')'
        );
      } catch (error) {
        console.log(
          'Ошибка сохранения выделения молитвы:',
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
        colors.background,
    },

    webView: {
      flex: 1,
      backgroundColor:
        colors.background,
    },
  });
