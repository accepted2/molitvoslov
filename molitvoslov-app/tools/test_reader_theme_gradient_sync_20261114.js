#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

// Exercise the real HTML builder with a minimal template, without launching RN.
const builderSource = read('src/components/reader/selectableDocumentReader/buildHtml.js')
  .replace(/^import \{HTML_TEMPLATE\} from '\.\/htmlTemplate';\s*/m, '')
  .replace(/export const /g, 'const ');
const template = '<html><head><style>:root {}</style></head><body><div id="reader"></div>' +
  '<script>const data=__READER_PAYLOAD__;</script></body></html>';
const builder = {HTML_TEMPLATE:template};
vm.runInNewContext(builderSource + '\nthis.buildHtml=buildHtml;', builder);
const documentData={readerMode:'book', progressAnchorType:'bible_verse', sections:[]};
const book=builder.buildHtml({
  documentData, topContentInset:70, bottomContentInset:4,
  bookAppearance:{background:'#102030',text:'#EDF0F1',dark:true,palette:'custom',fontSize:21},
});
assert.match(book, /<body class="book-mode book-night book-custom">/);
assert.match(book, /--book-paper:#102030;/);
assert.match(book, /--book-body-color:#EDF0F1;/);
assert.match(book, /--book-font-size:21px;/);
assert.match(book, /--book-line-height:27\.72px;/);
assert.match(book, /--book-drop-cap-size:57\.12px;/);
const ordinary=builder.buildHtml({
  documentData:{readerMode:'standard',progressAnchorType:'prayer',sections:[]},
  bookAppearance:{background:'#102030',text:'#EDF0F1',dark:true,palette:'custom',fontSize:21},
});
assert.doesNotMatch(ordinary, /book-custom/);
assert.doesNotMatch(ordinary, /--book-paper:#102030/);

// Colour and background edits must not reload the Bible HTML or repaginate.
const reader=read('src/components/reader/SelectableDocumentReader.js');
assert.match(reader, /initialBookAppearanceRef/);
assert.match(reader, /htmlReadingSettings = documentData\.readerMode === 'book' \? null : readingSettings/);
assert.match(reader, /initialAppearance = null/);
assert.match(reader, /bookAppearance: documentData\.readerMode === 'book'/);
assert.match(reader, /documentData\.readerMode !== 'book'/);
const runtime=read('src/components/reader/selectableDocumentReader/runtime.js');
assert.match(runtime, /Math\.abs\(currentSize-requestedSize\)>0\.01/);
const styles=read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(styles, /body\.book-mode\.book-custom \{/);
assert.match(styles, /background: var\(--book-paper, #FFF4DE\)/);
assert.ok(styles.lastIndexOf('body.book-mode.book-custom::after') >
  styles.lastIndexOf('body.book-mode.book-night::after'),
  'Custom background must override the book-night edge shadow');

// The reading fade stays fixed even while the header animates out of view.
// It reaches only 4px below the controls and blends softly into the page.
const header=read('src/components/navigation/FixedSectionHeader.js');
assert.match(header, /gradientHeight = headerHeight \+ 4;/);
assert.match(header, /gradientFadeStart = Math\.max\(0, \(headerHeight - 4\) \/ gradientHeight\)/);
assert.match(header, /locations=\{\[0, gradientFadeStart, gradientFadeMiddle, 1\]\}/);
assert.match(header, /style=\{\[styles\.fixedGradient, \{height: gradientHeight\}\]\}/);
assert.doesNotMatch(header, /styles\.fixedGradient[\s\S]{0,120}opacity: visibility\.interpolate/);
const bible=read('src/screens/BibleChapterScreen.js');
// The Bible retains its original, non-compact book header.
const bibleHeader=bible.split('<FixedSectionHeader')[1]?.split('/>')[0] || '';
assert.match(bibleHeader, /dark=\{readerTheme === 'night'\}/);
assert.doesNotMatch(bibleHeader, /compactReading/);
assert.doesNotMatch(bibleHeader, /gradientColor/);
assert.match(bible, /initialAppearance=\{appearance\}/);
assert.match(bible, /!appearanceReady/);
const rules=read('src/screens/PrayerRuleScreen.js');
assert.match(rules, /!appearanceReady/);
assert.match(rules, /initialAppearance=\{appearance\}/);
const ruleReader=read('src/components/reader/PrayerRuleReader.js');
assert.match(ruleReader, /appearanceRef = useRef\(initialAppearance\)/);
assert.match(ruleReader, /initialAppearanceRef\.current/);
const appearance=read('src/services/scopedReaderAppearance.js');
assert.match(appearance, /body:not\(\.book-mode\) \{background:/);
assert.doesNotMatch(appearance, /"var css='body \{background:/);

console.log('PASS: Bible palette stays stable; original Bible header preserved; top fade persists and extends only 4px below prayer header');
