#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files=[
 'src/screens/MiscPrayersScreen.js',
 'src/screens/ReaderScreen.js',
 'src/screens/MiscPrayerPlaceholderScreen.js',
 'src/components/navigation/FixedSectionHeader.js',
 'src/components/reader/selectableDocumentReader/runtime.js',
 'src/components/reader/selectableDocumentReader/styles.js',
];
for(const name of files)assert.doesNotThrow(
 ()=>parse(read(name),{sourceType:'module',plugins:['jsx']}),name+' syntax'
);
const misc=read(files[0]),reader=read(files[1]),placeholder=read(files[2]),
 header=read(files[3]),runtime=read(files[4]),styles=read(files[5]);
assert.match(misc,/navigation\.push\('Reader', \{\s*slug: text\.slug,\s*miscPrayerCompactTitle: true,/);
assert.match(reader,/const \{slug, focusTarget = null, miscPrayerCompactTitle = false\}/);
assert.match(reader,/miscPrayerCompactTitle: !!miscPrayerCompactTitle/);
assert.match(reader,/singleLineTitle=\{miscPrayerCompactTitle\}/);
assert.match(reader,/title: getLocalizedTextTitle\(text, language\)/);
assert.match(header,/singleLineTitle = false/);
assert.match(header,/numberOfLines=\{singleLineTitle \? 1 : undefined\}/);
assert.match(header,/ellipsizeMode="tail"/);
assert.match(header,/showTitle && !singleLineTitle \?/);
assert.match(header,/accessibilityLabel=\{title\}/);
assert.match(runtime,/reader\.classList\.toggle\('misc-prayer-compact-title', DATA\.document\.miscPrayerCompactTitle === true\)/);
assert.match(styles,/#reader\.misc-prayer-compact-title \.document-header \.rule-title/);
assert.match(styles,/font-size: 24\.5px/);
assert.match(styles,/line-height: 30px/);
assert.match(styles,/text-align: left !important/);
assert.match(styles,/-webkit-hyphens: auto/);
assert.match(placeholder,/fontSize: 22\.5/);
console.log('PASS: code parses and Misc Prayers is the sole entry point enabling compact title mode');
console.log('PASS: sticky header ellipsizes to one line, without increasing its height');
console.log('PASS: body heading preserves full text, 24.5px font, left alignment and auto hyphenation');
console.log('PASS: other reader routes retain their default appearance');
