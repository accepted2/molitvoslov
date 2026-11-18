#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files=[
 'src/screens/MiscPrayersScreen.js',
 'src/components/navigation/FixedSectionHeader.js',
 'src/components/reader/selectableDocumentReader/styles.js',
];
for(const file of files)assert.doesNotThrow(
 ()=>parse(read(file),{sourceType:'module',plugins:['jsx']}),file+' syntax'
);
const misc=read(files[0]);
const header=read(files[1]);
const styles=read(files[2]);
assert.match(misc,/MOLITVOSLOV_PRAYER_TITLE_HYPHENATION_V1/);
assert.match(misc,/android_hyphenationFrequency="full"/);
assert.match(misc,/textBreakStrategy="highQuality"/);
assert.match(misc,/title\.length > 68 && styles\.compactLongTitle/);
assert.match(misc,/<FixedSectionHeader onHeaderHeightChange=\{setHeaderHeight\}\s+titleHyphenation/);
assert.match(header,/titleHyphenation = false/);
assert.match(header,/android_hyphenationFrequency=\{titleHyphenation \? "full" : undefined\}/);
assert.match(styles,/MOLITVOSLOV_STANDALONE_PRAYER_HYPHENATION_V1/);
assert.match(styles,/#reader\.standalone-prayer \.document-header \.rule-title/);
assert.match(styles,/-webkit-hyphens: auto/);
console.log('PASS: Android automatic word hyphenation in category and prayer titles');
console.log('PASS: long card titles compacted without truncation');
console.log('PASS: WebView hyphenation limited to standalone prayers');
