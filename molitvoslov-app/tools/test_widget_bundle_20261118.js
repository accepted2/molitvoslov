#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const load = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const layoutSrc = load('src/widgets/widgetLayout.js');
const stateSrc = load('src/widgets/widgetState.js');
const handlerSrc = load('src/widgets/widgetTaskHandler.js');
const churchSrc = load('src/widgets/ChurchCalendarWidget.js');
const quoteSrc = load('src/widgets/QuoteOfDayWidget.js');
const homeSrc = load('src/screens/MenuScreen.js');
const appConfig = JSON.parse(load('app.json'));
for (const [name, code] of [
  ['widgetLayout', layoutSrc], ['widgetState', stateSrc],
  ['widgetTaskHandler', handlerSrc], ['ChurchCalendarWidget', churchSrc],
  ['QuoteOfDayWidget', quoteSrc], ['MenuScreen', homeSrc],
]) {
  assert.doesNotThrow(() => parser.parse(code, {
    sourceType: 'module', plugins: ['jsx'],
  }), name + ' must parse');
}

const plain = src => src.replace(/^import[^\n]*\n/gm, '')
  .replace(/\bexport const /g, 'const ');
const layout = new Function(plain(layoutSrc) + '\nreturn {' +
  'FONT,readSize,countLines,getScale,fitOneLine,fitText,calendarWidgetGeometry};')();
assert.equal(layout.FONT, 'sans-serif');
const {calendarWidgetGeometry: geometry} = layout;

for (const [w,h] of [
  [250,110],[250,150],[280,110],[280,145],[320,110],
  [320,150],[320,185],[360,150],[420,210],[520,240],[720,300],
]) {
  const box = geometry(w,h);
  assert.ok(box.leftW >= 85, w + 'x' + h + ': left column too narrow');
  assert.ok(box.gridW + box.panelPadLeft + 1 <= box.panelW,
    w + 'x' + h + ': calendar grid overflows right column');
  assert.ok(box.monthHeaderH + box.weekdayH + box.rowH * 6 <= box.contentH,
    w + 'x' + h + ': month header and six weeks overflow height');
  assert.ok(box.pad * 2 + box.panelW + box.gap + box.leftW + 2 <= w,
    w + 'x' + h + ': widget columns overrun width');
  assert.ok(box.bubble <= box.rowH && box.bubble <= box.cellW);
  assert.ok(box.arrowW * 2 <= box.gridW);
}
for (const text of [
  'Слава Богу за всё.',
  'Блаженны милостивые, ибо они помилованы будут.',
  'Великое множество слов '.repeat(35),
]) {
  for (const [width,height] of [[85,28],[210,64],[480,170]]) {
    const fit = layout.fitText({text,maxWidth:width,maxHeight:height,maxFont:27,minFont:11});
    assert.ok(fit.fontSize >= 11 && fit.fontSize <= 27);
    assert.ok(fit.maxLines >= 1 && fit.maxLines * fit.lineHeight <= height);
  }
}

// Validate exact local dates: JavaScript Date otherwise normalizes 31 February.
const storage = new Map();
const asyncStorage = {
  getItem: async k => storage.get(k) || null,
  setItem: async (k,v) => {storage.set(k,v);},
  removeItem: async k => {storage.delete(k);},
};
const state = new Function('AsyncStorage', plain(stateSrc) +
 '\nreturn {parseDateKey,parseMonthKey,toDateKey,todayState,reduceState,'+
 'loadState,saveState,clearState,AUTO_RESET_MS};')(asyncStorage);

assert.equal(state.parseDateKey('2026-02-29'),null);
assert.equal(state.parseDateKey('2026-04-31'),null);
assert.equal(state.parseDateKey('2026-13-01'),null);
assert.equal(state.parseDateKey('2026-00-05'),null);
assert.ok(state.parseDateKey('2028-02-29') instanceof Date);
assert.deepEqual(state.parseMonthKey('2026-11'),{year:2026,month:11});
assert.equal(state.parseMonthKey('2026-13'),null);

const morning = new Date(2026,10,18,8,0);
const added = state.reduceState(null,{widgetAction:'WIDGET_ADDED'},morning);
assert.equal(added.selected,'2026-11-18');
assert.equal(added.month,'2026-11');
const browse = state.reduceState(added,{
  widgetAction:'WIDGET_CLICK',
  clickAction:'CALENDAR_PREV_MONTH',
  data:{year:2026,month:10},
},new Date(2026,10,18,8,1));
assert.equal(browse.selected,'2026-11-18');
assert.equal(browse.month,'2026-10');
assert.equal(browse.pinned,true);
const resized = state.reduceState(browse,{widgetAction:'WIDGET_RESIZED'},
  new Date(2026,10,18,8,2));
assert.deepEqual(resized,browse);
const retained = state.reduceState(browse,{widgetAction:'WIDGET_UPDATE'},
  new Date(2026,10,18,8,10));
assert.deepEqual(retained,browse);
const reset = state.reduceState(browse,{widgetAction:'WIDGET_UPDATE'},
  new Date(2026,10,18,8,32));
assert.equal(reset.month,'2026-11');
assert.equal(reset.pinned,false);
const midnight = state.reduceState(added,{widgetAction:'WIDGET_UPDATE'},
  new Date(2026,10,19,0,1));
assert.equal(midnight.selected,'2026-11-19');

const invalid = state.reduceState(added,{
  widgetAction:'WIDGET_CLICK',clickAction:'CALENDAR_SELECT_DAY',
  data:{date:'2026-02-31'},
},morning);
assert.deepEqual(invalid,added);
const selected = state.reduceState(added,{
  widgetAction:'WIDGET_CLICK',clickAction:'CALENDAR_SELECT_DAY',
  data:{date:'2026-12-25'},
},morning);
assert.equal(selected.month,'2026-12');
assert.equal(selected.selected,'2026-12-25');

const weeksSource = 'const ROWS = 6;\n' + churchSrc.slice(
  churchSrc.indexOf('const buildWeeks ='),
  churchSrc.indexOf('export const ChurchCalendarWidget ='),
);
assert.ok(weeksSource.length > 100);
const buildWeeks = new Function('getCalendarDayAppearance','toDateKey',
  weeksSource + '\nreturn buildWeeks;')(
  item => item?.appearance || null,
  state.toDateKey,
);
for (const [year,month] of [
  [2026,10],[2026,11],[2027,0],[2027,1],[2027,4],[2028,1],
]) {
  const displayed = buildWeeks(year,month,'2026-11-18','2026-11-18',[]);
  assert.equal(displayed.length,6,'always six rows');
  assert.ok(displayed.every(row=>row.length===7));
  const dates=displayed.flat().filter(x=>x.date);
  assert.equal(dates.length,new Date(year,month+1,0).getDate());
  assert.equal(new Set(dates.map(x=>x.date)).size,dates.length);
}
const names=appConfig.expo.plugins
  .find(x=>Array.isArray(x)&&x[0]==='react-native-android-widget')[1]
  .widgets.map(w=>w.name);
assert.deepEqual(names,['QuoteOfDay','ChurchCalendar']);
assert.match(churchSrc,/clickAction=\{cell\.date \? 'CALENDAR_SELECT_DAY'/);
assert.match(churchSrc,/clickAction="CALENDAR_PREV_MONTH"/);
assert.match(churchSrc,/clickAction="CALENDAR_NEXT_MONTH"/);
assert.match(churchSrc,/clickAction="CALENDAR_TODAY"/);
assert.match(churchSrc,/molitvoslov:\/\/calendar\//);
assert.match(handlerSrc,/getWidgetInfo\('ChurchCalendar'\)/);
assert.match(handlerSrc,/requestWidgetUpdateById/);
assert.match(handlerSrc,/latest\.touchedAt !== next\.touchedAt/);
assert.match(handlerSrc,/needsWidgetNetwork/);
assert.match(homeSrc,/refreshCalendarWidgetsFromApp\(language\)/);
assert.doesNotMatch(homeSrc,/widgetName: 'ChurchCalendar',\s*renderWidget:/);
assert.match(quoteSrc,/fitText\(/);
assert.match(quoteSrc,/showSource/);
assert.doesNotMatch(quoteSrc, /Ponomar(?:-Regular)?/i);
assert.doesNotMatch(churchSrc, /Ponomar(?:-Regular)?/i);

async function testStateIsolation() {
  await state.saveState(101,browse);
  await state.saveState(202,selected);
  assert.equal((await state.loadState(101)).month,'2026-10');
  assert.equal((await state.loadState(202)).month,'2026-12');
  await state.clearState(101);
  assert.equal(await state.loadState(101),null);
  assert.equal((await state.loadState(202)).selected,'2026-12-25');
}
testStateIsolation().then(()=>{
 console.log('PASS: widget layouts at 11 sizes and calendar grids across 6 months');
 console.log('PASS: strict calendar dates, per-ID state, resize, timeout and midnight');
 console.log('PASS: native Android sans-serif font, existing widget IDs and navigation actions');
}).catch(error=>{console.error(error);process.exitCode=1;});
