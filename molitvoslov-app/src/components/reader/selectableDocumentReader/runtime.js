export const READER_RUNTIME = String.raw`
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
    const activeForItem = itemId => {
      if (!state.active) {
        return null;
      }

      if (Array.isArray(state.active.segments)) {
        return (
          state.active.segments.find(
            segment => Number(segment.itemId) === Number(itemId)
          ) || null
        );
      }

      return Number(state.active.itemId) === Number(itemId)
        ? state.active
        : null;
    };

    const removableSavedRange = active => {
      if (!active) {
        return null;
      }

      const segments =
        Array.isArray(active.segments) && active.segments.length
          ? active.segments
          : [
              {
                itemId: active.itemId,
                start: active.start,
                end: active.end,
              },
            ];

      let sharedIds = null;

      segments.forEach(segment => {
        const matching = savedForItem(segment.itemId).filter(
          range =>
            !range.actionKey &&
            Number.isFinite(Number(range.id)) &&
            segment.start >= range.start &&
            segment.end <= range.end
        );

        const ids = new Set(matching.map(range => Number(range.id)));

        sharedIds =
          sharedIds === null
            ? ids
            : new Set([...sharedIds].filter(id => ids.has(id)));
      });

      const savedId = sharedIds && sharedIds.size ? [...sharedIds][0] : null;

      if (!savedId) {
        return null;
      }

      return (
        savedForItem(segments[0].itemId).find(
          range => Number(range.id) === Number(savedId)
        ) || null
      );
    };

    const itemOrder = () =>
      Array.from(itemTextMap.keys()).map(Number);

    const compareSelectionPoints = (left, right) => {
      const order = itemOrder();
      const leftIndex = order.indexOf(Number(left.itemId));
      const rightIndex = order.indexOf(Number(right.itemId));

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return Number(left.offset) - Number(right.offset);
    };

    const selectionSegmentsBetween = (leftPoint, rightPoint) => {
      let startPoint = leftPoint;
      let endPoint = rightPoint;

      if (compareSelectionPoints(startPoint, endPoint) > 0) {
        startPoint = rightPoint;
        endPoint = leftPoint;
      }

      const order = itemOrder();
      const startIndex = order.indexOf(Number(startPoint.itemId));
      const endIndex = order.indexOf(Number(endPoint.itemId));

      if (startIndex < 0 || endIndex < 0) {
        return [];
      }

      const segments = [];

      for (let index = startIndex; index <= endIndex; index += 1) {
        const itemId = order[index];
        const text = itemTextMap.get(itemId) || '';
        const rawStart =
          index === startIndex ? Number(startPoint.offset || 0) : 0;
        const rawEnd =
          index === endIndex ? Number(endPoint.offset || 0) : text.length;
        const range = normalizeRange(text, rawStart, rawEnd);

        if (range.end > range.start) {
          segments.push({
            itemId,
            start: range.start,
            end: range.end,
          });
        }
      }

      return segments;
    };

    const selectionText = active => {
      const segments =
        Array.isArray(active?.segments) && active.segments.length
          ? active.segments
          : active
            ? [
                {
                  itemId: active.itemId,
                  start: active.start,
                  end: active.end,
                },
              ]
            : [];

      return segments
        .map(segment => {
          const text = itemTextMap.get(Number(segment.itemId)) || '';
          return text.slice(segment.start, segment.end).trim();
        })
        .filter(Boolean)
        .join('\n');
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
  const pattern = /\((?:трижды|3|поклон)\.?\)/giu;
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
   /(?:Таже\s+|Также\s+)?Тропар(?:ь|и)\s*,?\s*глас\s*\d+\s*:/giu,
    // "Тропари сия, глас 6", "Тропарь покаянный, глас шестой" и т. п.
    /Тропар(?:ь|и)\s+(?:сия|покаянн(?:ый|ые|ыя))\s*,?\s*глас\s*(?:6|шест(?:ой|ый))\s*:*/giu,
     /(?:Таже\s+|Также\s+)?Тропар(?:ь|и)\s*,?\s*глас\s*\d+\s*:/giu,

    /(?:^|\n)(Слава:)/giu,
    /(?:^|\n)(И\s+ныне:)/giu,

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

    const plainTail =
      normalizedAkathistTextWithIndex(tail)
        .normalized
        .toLowerCase();

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
      'аще иерей',
      'аще ли ни',
      'если священник',
      'если мирянин',
      'таже постой',
      'затем постой',
      'посем глаголи',
      'затем произноси',
      'и поклонись',
      'и поклонися',
      'и поклонов',
      'священник произносит',
      'или:',
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

  addInitial(0);

  const paragraphPattern =
    /\n[ \t]*\n/g;

  let match = null;

  while (
    (match = paragraphPattern.exec(source))
  ) {
    addInitial(
      match.index + match[0].length
    );
  }

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
    /(?:^|\n)(Разумно да будет,[^\n]*)/giu,

    /(Аще иерей,\s*глаголет:)/giu,
    /(Аще ли ни,\s*глаголи умиленно:)/giu,
    /(Если священник:)/giu,
    /(Если мирянин:)/giu,

    // "Господи, помилуй. (Трижды.)" / "Господи, помилуй, (Трижды.)"
    // — единая служебная строка.
    /(Господи,?\s*помилуй[.,;:]?\s*\(Трижды\.?\))/giu,

    /(Таже постой мало,[^\n]*)/giu,
    /(Затем постой немного,[^\n]*)/giu,

    /(И\s+поклонися,?\s*елико(?:\s+ти)?\s+мощно\.?)/giu,
    /(И\s+поклонись,?\s*сколько хочешь\.?)/giu,
    /(И\s+поклонов,\s*елико(?:\s+ти)?\s+мощно,?\s*с\s+молитвою:)/giu,
    /(И\s+поклонись,?\s*сколько хочешь,?\s*с\s+молитвою:)/giu,

    /(Посем глаголи молитву сию со вниманием:)/giu,
    /(Затем произноси следующую молитву со вниманием:)/giu,

    /(Слава,\s*и\s*ныне:\s*Господи,\s*помилуй\s*\(3\)\.?\s*Благослови\.?)/giu,

    /(Аще иерей,\s*кончает священнически,\s*аще ли простый,\s*кончает сице:)/giu,
    /(Священник произносит отпуст,\s*а мирянин кончает так:)/giu,

    /(?:^|\n)(Или:?)(?=\s)/giu,
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
  /Слава\s+Отцу\s*,?\s*и\s+Сыну\s*,?\s*и\s+Святому\s+Духу\s*[:;,.!?]?|И\s+ныне\s*,?\s*и\s+(?:присно|всегда)\s*,?\s*и\s+во\s+веки\s+веков\s*[.,;:]?\s*аминь\s*[.!?]?|Слава,\s*и\s*ныне:/giu;
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

      const isWhitespaceNode = node =>
        !!node &&
        !String(node.textContent || '').trim();

      const isSeparatorNode = node =>
        !!node &&
        node.nodeType === Node.ELEMENT_NODE &&
        node.classList.contains(
          'psalter-prayer-separator'
        );

      const hideWhitespaceNode = node => {
        if (
          node &&
          node.nodeType === Node.ELEMENT_NODE
        ) {
          node.classList.add(
            'psalter-prayer-gap-hidden'
          );
        }
      };

      root
        .querySelectorAll(
          '.psalter-prayer-rubric-block, .psalter-prayer-title'
        )
        .forEach(block => {
          let previous = block.previousSibling;

          while (
            previous &&
            isWhitespaceNode(previous) &&
            !isSeparatorNode(previous)
          ) {
            hideWhitespaceNode(previous);
            previous = previous.previousSibling;
          }

          let next = block.nextSibling;

          while (
            next &&
            isWhitespaceNode(next) &&
            !isSeparatorNode(next)
          ) {
            hideWhitespaceNode(next);
            next = next.nextSibling;
          }
        });
    };

    const applyBibleDropCap = root => {
      if (
        !bookMode ||
        !root ||
        !root.classList.contains('bible-verse') ||
        !root.closest('.bible-chapter-start')
      ) {
        return;
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = null;

      while ((node = walker.nextNode())) {
        const value = String(node.textContent || '');
        const match = value.match(/[A-Za-zА-Яа-яЁёІіЇїЄєҐґ\u0400-\u052F]/u);

        if (!match) {
          continue;
        }

        const index = match.index;
        const fragment = document.createDocumentFragment();

        if (index > 0) {
          fragment.appendChild(document.createTextNode(value.slice(0, index)));
        }

        fragment.appendChild(el('span', 'bible-drop-cap', value[index]));

        if (index + 1 < value.length) {
          fragment.appendChild(document.createTextNode(value.slice(index + 1)));
        }

        node.replaceWith(fragment);
        return;
      }
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
        const memorialAction = itemConfig?.memorialAction || null;
        const memorialMarkerText = String(memorialAction?.marker || '');
        const memorialMarkerStart =
          memorialMarkerText
            ? text.indexOf(memorialMarkerText)
            : -1;
        const memorialMarkerRange =
          memorialMarkerStart >= 0
            ? {
                start: memorialMarkerStart,
                end: memorialMarkerStart + memorialMarkerText.length,
              }
            : null;
        const isAkathist = String( itemConfig ?.className || '' ).includes( 'akathist-' ) || itemConfig
            ?.sourceType === 'akathist';
        const akathistJoyBreaks = isAkathist ? collectAkathistJoyBreaks( text ) : new Set();
        const akathistInitialRanges = isAkathist ? collectAkathistInitialRanges( text ) : [];
 const isPsalterPrayer =
  String(itemConfig?.className || '')
    .includes('psalter-prayer');

const rawPsalterPrayerAccentRanges =
  isPsalterPrayer
    ? collectPsalterPrayerAccentRanges(text)
    : [];

const psalterRubricRanges =
  isPsalterPrayer
    ? collectPsalterRubricRanges(text)
    : [];

const psalterPrayerAccentRanges =
  rawPsalterPrayerAccentRanges.filter(
    accentRange =>
      !psalterRubricRanges.some(
        rubricRange =>
          accentRange.start >= rubricRange.start &&
          accentRange.end <= rubricRange.end
      )
  );

const isKathismaPrayersAfter =
  itemConfig?.metadata?.section === 'prayers_after';

const psalterPrayerInitialRanges =
  isPsalterPrayer && !isKathismaPrayersAfter
    ? collectPsalterPrayerInitialRanges(text)
        .filter(initialRange =>
          !psalterRubricRanges.some(
            rubricRange =>
              initialRange.start >= rubricRange.start &&
              initialRange.start < rubricRange.end
          )
        )
    : [];

        const isPsalterGlory =
          String(itemConfig?.className || '')
            .includes('psalter-glory');

const rawPsalterRepeatNoteRanges =
  isPsalterGlory || isPsalterPrayer
    ? collectPsalterRepeatNoteRanges(text)
    : [];

const psalterRepeatNoteRanges =
  rawPsalterRepeatNoteRanges.filter(
    repeatRange =>
      !psalterRubricRanges.some(
        rubricRange =>
          repeatRange.start >= rubricRange.start &&
          repeatRange.end <= rubricRange.end
      ) &&
      !psalterPrayerAccentRanges.some(
        accentRange =>
          repeatRange.start >= accentRange.start &&
          repeatRange.end <= accentRange.end
      )
  );

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

        /*
         * Маркер помянника должен оставаться одним DOM-сегментом.
         * Так сохраняется точное соответствие текстовых offset'ов,
         * используемых выделением и сохранёнными фрагментами.
         */
        if (memorialMarkerRange) {
          boundaries.add(memorialMarkerRange.start);
          boundaries.add(memorialMarkerRange.end);

          Array.from(boundaries).forEach(boundary => {
            if (
              boundary > memorialMarkerRange.start &&
              boundary < memorialMarkerRange.end
            ) {
              boundaries.delete(boundary);
            }
          });
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

          const isMemorialMarkerSegment =
            !!memorialMarkerRange &&
            start === memorialMarkerRange.start &&
            end === memorialMarkerRange.end;

          if (isMemorialMarkerSegment) {
            /*
             * Саму рубрику оставляем видимой в тексте.
             * Кнопку добавляем отдельным пустым DOM-элементом,
             * чтобы её подпись через ::after не меняла textContent
             * и не сдвигала offsets выделения/сохранений.
             */
            span.classList.add('memorial-rubric-text');
            span.textContent = text.slice(start, end);

            const memorialButton =
              document.createElement('span');

            memorialButton.classList.add('memorial-open-marker');
            memorialButton.dataset.label =
              memorialAction?.label || 'Открыть помянник';
            memorialButton.setAttribute('role', 'button');
            memorialButton.setAttribute('tabindex', '0');
            memorialButton.setAttribute(
              'aria-label',
              memorialAction?.label || 'Открыть помянник'
            );

            const openMemorial = event => {
              event.preventDefault();
              event.stopPropagation();

              post({
                type: 'memorial-open',
                context: memorialAction?.context || null,
              });
            };

            memorialButton.addEventListener('pointerdown', event => {
              event.stopPropagation();
            });

            memorialButton.addEventListener('click', openMemorial);

            memorialButton.addEventListener('keydown', event => {
              if (event.key === 'Enter' || event.key === ' ') {
                openMemorial(event);
              }
            });

            fragment.appendChild(span);
            fragment.appendChild(memorialButton);
            continue;
          }

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
            normalizedAkathistTextWithIndex(
              psalterRubricText
            )
              .normalized
              .trim()
              .toLowerCase();

          if (isPsalterRubric) {
            const isShortBowRubric =
              (
                normalizedPsalterRubricText.startsWith(
                  'и поклонись'
                ) ||
                normalizedPsalterRubricText.startsWith(
                  'и поклонися'
                )
              ) &&
              !normalizedPsalterRubricText.includes(
                'с молитвою:'
              );

            const isInlineRubric =
              isShortBowRubric ||
              normalizedPsalterRubricText ===
                'или' ||
              normalizedPsalterRubricText ===
                'или:';

            const needsSeparatorBeforeRubric =
              normalizedPsalterRubricText.startsWith(
                'аще ли ни'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'если мирянин'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'таже постой мало'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'затем постой немного'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'посем глаголи молитву сию со вниманием'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'затем произноси следующую молитву со вниманием'
              );

            const needsSeparatorAfterRubric =
              normalizedPsalterRubricText.startsWith(
                'посем глаголи молитву сию со вниманием'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'затем произноси следующую молитву со вниманием'
              ) ||
              normalizedPsalterRubricText.startsWith(
                'слава, и ныне:'
              );

            span.classList.add(
              'psalter-prayer-rubric'
            );

            span.classList.add(
              isInlineRubric
                ? 'psalter-prayer-rubric-inline'
                : 'psalter-prayer-rubric-block'
            );

            if (
              needsSeparatorBeforeRubric &&
              start > 0
            ) {
              span.classList.add(
                'psalter-prayer-rubric-separator-before'
              );
            }

            if (needsSeparatorAfterRubric) {
              span.classList.add(
                'psalter-prayer-rubric-separator-after'
              );
            }
          }

          if (
            isPsalterPrayerAccent &&
            !isPsalterRubric
          ) {
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
  normalizedAkathistTextWithIndex(
    psalterPrayerAccentText
  )
    .normalized
    .trim();

const isPsalterMetaAccent =
   /^Тропар(?:ь|и)(?:\\s|,)/iu.test(
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
   /^Тропар(?:ь|и)(?:\s|,)/iu.test(
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
        compactParagraphGaps( root );
        collapsePsalterRubricTrailingWhitespace( root );
        applyBibleDropCap( root );
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
            const storedSegments = Array.isArray(item.metadata?.selection_segments)
              ? item.metadata.selection_segments
              : null;

            const rawSegments =
              storedSegments && storedSegments.length
                ? storedSegments
                : [
                    {
                      item_id: Number(item.anchor_id),
                      start: Number(item.start_offset),
                      end: Number(item.end_offset),
                    },
                  ];

            rawSegments.forEach(segment => {
              const itemId = Number(segment.item_id ?? segment.itemId);
              const text = itemTextMap.get(itemId);

              if (!text) {
                return;
              }

              const range = normalizeRange(
                text,
                Number(segment.start),
                Number(segment.end)
              );

              if (range.end <= range.start) {
                return;
              }

              const current = savedRanges.get(itemId) || [];

              current.push({
                id: item.id,
                start: range.start,
                end: range.end,
              });

              savedRanges.set(itemId, current);
            });
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
    const locateDomPoint = point => {
      const root = document.querySelector(
        '.reader-text[data-item-id="' + Number(point.itemId) + '"]'
      );

      if (!root) {
        return null;
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let total = 0;
      let node = null;

      while ((node = walker.nextNode())) {
        const length = node.textContent.length;

        if (Number(point.offset) <= total + length) {
          return {
            node,
            offset: Math.max(
              0,
              Math.min(Number(point.offset) - total, length)
            ),
          };
        }

        total += length;
      }

      return null;
    };

    const domRangeForActive = active => {
      if (!active) {
        return null;
      }

      const segments =
        Array.isArray(active.segments) && active.segments.length
          ? active.segments
          : [
              {
                itemId: active.itemId,
                start: active.start,
                end: active.end,
              },
            ];

      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const from = locateDomPoint({
        itemId: firstSegment.itemId,
        offset: firstSegment.start,
      });
      const to = locateDomPoint({
        itemId: lastSegment.itemId,
        offset: lastSegment.end,
      });

      if (!from || !to) {
        return null;
      }

      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      return range;
    };

    const updateHandles = () => {
        if (!state.active) {
          startHandle.style.display = 'none';
          endHandle.style.display = 'none';
          return;
        }

        const range = domRangeForActive(state.active);

        if (!range) {
          return;
        }

        const rects = Array.from(range.getClientRects());

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
          selectionBar.classList.remove('visible');
          return;
        }

        const count = (state.active.segments || []).reduce(
          (total, segment) => total + Math.max(0, segment.end - segment.start),
          0
        );

        selectionBar.classList.add('visible');
        selectionCount.textContent = count + ' симв.';
        selectionCount.classList.remove('error');
        selectionHint.classList.remove('error');

        if (!state.savePending) {
          selectionHint.textContent = 'Выделенный фрагмент';
        }

        const savedRange = removableSavedRange(state.active);

        saveButton.textContent = savedRange ? 'Удалить' : 'Сохранить';
        saveButton.classList.toggle('delete-mode', !!savedRange);
        saveButton.disabled = count <= 0 || state.savePending;
      };

    const setActivePoints = (
      startPoint,
      endPoint,
      anchorStartPoint,
      anchorEndPoint
    ) => {
      const segments = selectionSegmentsBetween(startPoint, endPoint);

      if (!segments.length) {
        return;
      }

      const previousIds = new Set(
        (state.active?.segments || []).map(segment => Number(segment.itemId))
      );
      const nextIds = new Set(segments.map(segment => Number(segment.itemId)));
      const allIds = new Set([...previousIds, ...nextIds]);

      state.active = {
        itemId: Number(segments[0].itemId),
        start: Number(segments[0].start),
        end: Number(segments[segments.length - 1].end),
        startPoint:
          compareSelectionPoints(startPoint, endPoint) <= 0
            ? startPoint
            : endPoint,
        endPoint:
          compareSelectionPoints(startPoint, endPoint) <= 0
            ? endPoint
            : startPoint,
        anchorStartPoint,
        anchorEndPoint,
        segments,
      };

      allIds.forEach(itemId => renderTextItem(itemId));
      updateHandles();
      updateBar();
    };

    const setActive = ( itemId, start, end, anchorStart, anchorEnd ) => {
      setActivePoints(
        {itemId: Number(itemId), offset: start},
        {itemId: Number(itemId), offset: end},
        {itemId: Number(itemId), offset: anchorStart},
        {itemId: Number(itemId), offset: anchorEnd}
      );
    };

    const clearSelection = () => {
        if (!state.active) {
          return;
        }

        const itemIds = new Set(
          (state.active.segments || []).map(segment => Number(segment.itemId))
        );

        if (!itemIds.size && state.active.itemId) {
          itemIds.add(Number(state.active.itemId));
        }

        state.active = null;
        state.drag = null;
        state.pointer = null;
        state.lastDragPoint = null;
        state.savePending = false;

        if ( state.longPressTimer ) {
          clearTimeout( state.longPressTimer );
          state.longPressTimer = null;
        }

        itemIds.forEach(itemId => renderTextItem(itemId));
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
        mode: 'initial',
        pointerId,
        itemId: point.itemId,
      };

      return true;
    };

    const updateFromPoint = ( clientX, clientY ) => {
      if ( !state.active || !state.drag ) {
        return;
      }

      const originConfig = itemConfigMap.get(Number(state.active.itemId));
      const allowAcrossItems =
        bookMode && originConfig?.sourceType === 'bible';

      const point = textOffsetFromPoint(
        clientX,
        clientY,
        allowAcrossItems ? null : state.active.itemId
      );

      if (!point) {
        return;
      }

      if (
        allowAcrossItems &&
        itemConfigMap.get(Number(point.itemId))?.sourceType !== 'bible'
      ) {
        return;
      }

      let startPoint = state.active.startPoint;
      let endPoint = state.active.endPoint;
      let mode = state.drag.mode;

      if (mode === 'start') {
        if (compareSelectionPoints(point, endPoint) < 0) {
          startPoint = point;
        } else {
          startPoint = endPoint;
          endPoint = point;
          mode = 'end';
        }
      } else if (mode === 'end') {
        if (compareSelectionPoints(point, startPoint) > 0) {
          endPoint = point;
        } else {
          endPoint = startPoint;
          startPoint = point;
          mode = 'start';
        }
      } else if (
        compareSelectionPoints(point, state.active.anchorStartPoint) < 0
      ) {
        startPoint = point;
        endPoint = state.active.anchorEndPoint;
      } else {
        startPoint = state.active.anchorStartPoint;
        endPoint =
          compareSelectionPoints(point, state.active.anchorEndPoint) > 0
            ? point
            : state.active.anchorEndPoint;
      }

      state.drag.mode = mode;

      setActivePoints(
        startPoint,
        endPoint,
        state.active.anchorStartPoint,
        state.active.anchorEndPoint
      );
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
        const segments =
          Array.isArray(state.active.segments) && state.active.segments.length
            ? state.active.segments
            : [];

        const count = segments.reduce(
          (total, segment) => total + Math.max(0, segment.end - segment.start),
          0
        );

        if ( count <= 0 ) {
          return;
        }

        const savedRange = removableSavedRange( state.active );

        if (savedRange) {
          state.savePending = true;
          selectionHint.textContent = 'Удаляем...';
          updateBar();

          post({
            type: 'remove-selection',
            itemId: state.active.itemId,
            savedItemId: Number(savedRange.id),
          });

          return;
        }

        const selectedText = selectionText(state.active);

        if (!selectedText) {
          return;
        }

        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];
        const multiItem = segments.length > 1;

        state.savePending = true;
        selectionHint.textContent = 'Сохраняем...';
        updateBar();

        post({
          type: 'save-selection',
          itemId: Number(firstSegment.itemId),
          start: Number(firstSegment.start),
          end: Number(firstSegment.end),
          finalItemId: Number(lastSegment.itemId),
          finalEnd: Number(lastSegment.end),
          text: selectedText,
          segments: segments.map(segment => ({
            item_id: Number(segment.itemId),
            start: Number(segment.start),
            end: Number(segment.end),
          })),
          saveType: multiItem ? 'fragment' : classify(state.active),
          itemTitle: itemTitleMap.get(Number(firstSegment.itemId)) || 'Молитва',
        });
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
        const targetSaveType = target.save_type || target.saveType;
        const targetAnchorType = target.anchor_type || target.anchorType;
        const targetChapterNumber = Number( targetMetadata .chapter_number || 0 );
        if (
          bookMode &&
          targetChapterNumber &&
          ( targetSaveType === 'chapter' || targetAnchorType === 'bible_chapter' )
        ) {
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
        if (targetAnchorType === 'kathisma') {
          window.scrollTo( 0, 0 );
          return true;
        }
        const itemId = findFocusBlockId( target );
        if (itemId) {
          const root = document.querySelector( '.reader-text[data-item-id="' + itemId + '"]' );
          if (!root) {
            return false;
          }
          const bookmarkOffset = Number( targetMetadata .bookmark_offset );
          const hasBookmarkOffset =
            targetSaveType === 'bookmark' &&
            Number.isFinite( bookmarkOffset ) &&
            bookmarkOffset >= 0;
          const hasOffsets = target.start_offset !== null && target.start_offset !== undefined &&
            target.end_offset !== null && target.end_offset !== undefined;
          const wholeTypes = [ 'prayer', 'psalm', 'kathisma', 'chapter', 'section', 'akathist', 'canon',
            'text', ];
          const preciseRange = hasOffsets && !wholeTypes.includes( targetSaveType );
          if (hasBookmarkOffset) {
            if (bookMode && DATA.document .progressOffsetMode === 'page') {
              applyBookPage( bookmarkOffset, false );
            } else {
              const progressRoot = root.closest( '.rule-item[data-track-progress="true"]' ) || root;
              const targetY = Math.max(
                0,
                progressRoot.offsetTop + bookmarkOffset - ( window.innerHeight / 2 )
              );
              window.scrollTo( 0, targetY );
            }
          } else if (preciseRange) {
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
    const goToProgress = progress => {
        if (!progress) {
          return false;
        }
        const anchorId = Number( progress.anchorId ?? progress.anchor_id );
        if (!anchorId) {
          return false;
        }
        const item = document.querySelector(
          '.rule-item[data-track-progress="true"][data-item-id="' + anchorId + '"]'
        );
        if (!item) {
          return false;
        }
        const offset = Math.max( 0, Number( progress.offset || 0 ) );
        if (bookMode) {
          const savedPage =
            DATA.document .progressOffsetMode === 'page'
              ? offset
              : pageForElement( item );
          applyBookPage( savedPage, false );
        } else {
          const target = Math.max( 0, item.offsetTop + offset - ( window.innerHeight / 2 ) );
          window.scrollTo( 0, target );
        }
        item.classList.add( 'focus-target' );
        setTimeout( () => item.classList.remove( 'focus-target' ), 1200 );
        return true;
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
    const setBookFontSize = rawSize => {
      if (!bookMode) {
        return;
      }

      const size = Math.max(14, Math.min(22, Number(rawSize) || 16.5));
      const lineHeight = size * 1.32;
      const dropCapSize = size * 2.72;

      document.documentElement.style.setProperty(
        '--book-font-size',
        size.toFixed(1) + 'px'
      );
      document.documentElement.style.setProperty(
        '--book-line-height',
        lineHeight.toFixed(1) + 'px'
      );
      document.documentElement.style.setProperty(
        '--book-drop-cap-size',
        dropCapSize.toFixed(1) + 'px'
      );

      requestAnimationFrame(() => {
        refreshBookPagination();
        reportProgress();
      });
    };

    const setBookTheme = theme => {
      if (!bookMode) {
        return;
      }

      document.body.classList.toggle('book-night', theme === 'night');
    };

    window.readerApi = {
      saveSucceeded: ( itemId, savedItem ) => {
          const storedSegments = Array.isArray(savedItem?.metadata?.selection_segments)
            ? savedItem.metadata.selection_segments
            : null;

          const segments =
            storedSegments && storedSegments.length
              ? storedSegments
              : [
                  {
                    item_id: Number(itemId),
                    start: Number(savedItem.start_offset),
                    end: Number(savedItem.end_offset),
                  },
                ];

          segments.forEach(segment => {
            const segmentItemId = Number(segment.item_id ?? segment.itemId);
            const current = savedRanges.get(segmentItemId) || [];

            current.push({
              id: savedItem.id,
              start: Number(segment.start),
              end: Number(segment.end),
            });

            savedRanges.set(segmentItemId, current);
          });

          state.savePending = false;
          clearSelection();

          segments.forEach(segment =>
            renderTextItem(Number(segment.item_id ?? segment.itemId))
          );
        },

      removeSavedItem: ( itemId, savedItemId ) => {
          savedItemId = Number(savedItemId);
          const affected = [];

          savedRanges.forEach((ranges, rangeItemId) => {
            if (ranges.some(range => Number(range.id) === savedItemId)) {
              savedRanges.set(
                rangeItemId,
                ranges.filter(range => Number(range.id) !== savedItemId)
              );
              affected.push(Number(rangeItemId));
            }
          });

          state.savePending = false;

          if (state.active) {
            clearSelection();
          }

          if (!affected.length) {
            affected.push(Number(itemId));
          }

          affected.forEach(affectedItemId => renderTextItem(affectedItemId));
        },
      goToProgress: progress => goToProgress( progress ),
      setBookFontSize: size => setBookFontSize(size),
      setBookTheme: theme => setBookTheme(theme),
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
  `;
