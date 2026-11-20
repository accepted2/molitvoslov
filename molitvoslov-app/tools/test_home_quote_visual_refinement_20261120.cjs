#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parse} = require('@babel/parser');
const source = fs.readFileSync(path.join(__dirname,'../src/screens/MenuScreen.js'),'utf8');
parse(source,{sourceType:'module',plugins:['jsx']});
for (const token of [
  "top: Math.max(insets.top + 49.5, 77.5)",
  "'rgba(214, 176, 124, 0.68)'",
  "locations={[0, 0.35, 0.63, 0.84, 1]}",
  'height: 142,',
  "fontStyle: 'italic'",
  "lineHeight: 21",
  "textShadowColor: 'rgba(16, 9, 6, 0.94)'",
  'dailyQuoteDisplayText',
  "'«' + dailyQuoteText + '»'",
]) assert(source.includes(token),'Expected quote UI marker: ' + token);
assert(!source.includes("heroImage: {\n    opacity: 1,\n    maxHeight: 320,"),
  'Banner artwork is still clipped at 320px');
assert(!source.includes("'#D6B07C',"),
  'The old fully opaque hard-edged bottom color is still present');
console.log('PASS: soft bottom fade, full-height artwork and +1.5px upper gap.');
console.log('PASS: italic quote with opening/closing marks and readable text contrast.');
console.log('PASS: MenuScreen JavaScript/JSX parses successfully.');
