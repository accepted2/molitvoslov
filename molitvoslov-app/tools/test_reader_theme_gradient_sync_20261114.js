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

// Keep the old palette but use a small, fully fading veil (~two text lines).
// It stays fixed at the top independently of the disappearing controls.
const header=read('src/components/navigation/FixedSectionHeader.js');
assert.match(header, /gradientHeight = Math\.max\(48, Math\.round\(headerHeight \* 0\.65\)\)/);
assert.match(header, /locations=\{\[0, 0\.2, 0\.5, 1\]\}/);
assert.match(header, /style=\{\[styles\.fixedGradient, \{height: gradientHeight\}\]\}/);
assert.doesNotMatch(header, /styles\.fixedGradient[\s\S]{0,120}opacity: visibility\.interpolate/);
const chrome=read('src/services/readerHeaderChrome.js');
assert.match(chrome, /withOpacity\(surface, 0\.99\)/);
assert.match(chrome, /withOpacity\(surface, 0\.91\)/);
assert.match(chrome, /withOpacity\(background, 0\.54\)/);
assert.match(chrome, /withOpacity\(background, 0\)/);
assert.doesNotMatch(header, /gradientFadeStart|gradientFadeMiddle/);

// The button stays light in dark mode: dots and menu labels must stay dark.
const controlInk='#4B301D';
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const lum=h=>rgb(h).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4)
  .reduce((a,c,i)=>a+c*[0.2126,0.7152,0.0722][i],0);
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+0.05)/
  (Math.min(lum(a),lum(b))+0.05);
assert.ok(contrast(controlInk,'#F1DFC2')>=7, 'Three-dot icon must be readable');
const ruleCss=read('src/components/reader/PrayerRuleReader.js');
assert.match(ruleCss, /\.prayer-actions-trigger\s*\{[\s\S]*?color:#4B301D;[\s\S]*?font-size:27px/);
assert.match(ruleCss, /\.prayer-actions-menu \.favorite-action,[\s\S]*?color:#4B301D;/);
const sharedCss=read('src/components/reader/selectableDocumentReader/styles.js');
assert.match(sharedCss, /\.psalter-kathisma-reader \.psalter-psalm-section \.psalter-psalm-menu\s*\{[\s\S]*?color:#4B301D;/);
assert.match(sharedCss, /\.has-reader-action-menu \.reader-action-trigger\s*\{[\s\S]*?color: #4B301D;/);
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

console.log('PASS: Bible theme stable, original Bible header, two-line old-style persistent fade, readable 3-dot controls');
