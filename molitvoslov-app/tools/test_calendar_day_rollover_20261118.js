#!/usr/bin/env node
'use strict';
// Guard against a stale "today" after midnight, app resume, or tab focus.
// Tests local dates (including year/month changes and DST) and both screen paths.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const parser=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const hookCode=read('src/hooks/useCalendarTodayRollover.js');
const home=read('src/screens/MenuScreen.js');
const calendar=read('src/screens/ChurchCalendarScreen.js');
for(const [name,source] of [
 ['useCalendarTodayRollover',hookCode],['MenuScreen',home],['ChurchCalendarScreen',calendar]
])assert.doesNotThrow(()=>parser.parse(source,{sourceType:'module',plugins:['jsx']}),
 name+' has invalid JS/JSX');

const plain=hookCode.replace(/^import .+;\n/gm,'')
 .replace(/\bexport const /gm,'const ');
const helpers=new Function(plain+
 '\nreturn {localCalendarDayKey, nextLocalMidnightDelay, shouldAdvanceSelectedDay};')();
const {localCalendarDayKey,nextLocalMidnightDelay,shouldAdvanceSelectedDay}=helpers;
for(const [ymd,key] of [
 [[2026,10,18],'2026-11-18'],
 [[2026,10,30],'2026-11-30'],
 [[2026,11,31],'2026-12-31'],
 [[2027,0,1],'2027-01-01'],
 [[2027,1,28],'2027-02-28'],
])assert.equal(localCalendarDayKey(new Date(...ymd)),key);
assert.ok(shouldAdvanceSelectedDay('2026-11-18','2026-11-18'));
assert.equal(shouldAdvanceSelectedDay('2026-11-17','2026-11-18'),false);
assert.equal(shouldAdvanceSelectedDay('2026-11-20','2026-11-18'),false);
assert.equal(shouldAdvanceSelectedDay('2026-12-31','2026-11-30'),false);
for(const date of [
 new Date(2026,10,18,23,59,58,500),
 new Date(2026,10,30,23,59,58),
 new Date(2026,11,31,23,59,58),
 new Date(2027,1,28,23,59,58),
 new Date(2027,2,28,23,59,58),
]){
 const nextMidnight=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1,0,0,2);
 const delay=nextLocalMidnightDelay(date);
 assert.ok(delay>=250&&Math.abs(delay-(nextMidnight-date))<1,
   'Rollover must use next LOCAL midnight');
}
// New Date(y,m,d+1) handles daylight saving shifts naturally, including
// 23/25 hour local days. No hard-coded 24h intervals permitted.
assert.doesNotMatch(hookCode,/24\s*\*\s*60\s*\*\s*60/);
assert.match(hookCode,/new Date\(\s*value\.getFullYear\(\), value\.getMonth\(\), value\.getDate\(\) \+ 1/);

const appEvents={};
let syntheticNow=new Date(2026,10,18,23,59,55).getTime();
const RealDate=Date;
class ClockDate extends RealDate {
 constructor(...args){super(...(args.length?args:[syntheticNow]))}
 static now(){return syntheticNow}
}
const timers=[],intervals=[],callbacks=[],stateUpdates=[];
const useRef=initial=>({current:initial});
const useState=initial=>[initial,value=>stateUpdates.push(value)];
const useCallback=callback=>callback;
const useEffect=cb=>{callbacks.push(cb());};
const useFocusEffect=cb=>{appEvents.focus=cb;cb();};
const AppState={
 currentState:'active',
 addEventListener:(event,callback)=>{appEvents.state=callback;return {remove(){}};},
};
const fakeSetTimeout=(callback,delay)=>{const obj={callback,delay};timers.push(obj);return obj};
const fakeSetInterval=(callback,delay)=>{const obj={callback,delay};intervals.push(obj);return obj};
const fn=new Function(
 'Date','useRef','useState','useCallback','useEffect','useFocusEffect','AppState',
 'setTimeout','clearTimeout','setInterval','clearInterval',
 plain+'\nreturn useCalendarTodayRollover;'
)(ClockDate,useRef,useState,useCallback,useEffect,useFocusEffect,AppState,
 fakeSetTimeout,()=>{},fakeSetInterval,()=>{});
const rollover=[];
fn((oldToday,newToday)=>rollover.push([oldToday,newToday]));
assert.equal(timers.length,1);
assert.equal(intervals.length,1);
assert.equal(intervals[0].delay,60000);
syntheticNow=new Date(2026,10,19,0,0,3).getTime();
timers[0].callback(); // App left open across midnight
assert.deepEqual(rollover,[['2026-11-18','2026-11-19']]);
assert.deepEqual(stateUpdates,['2026-11-19']);
appEvents.focus(); // Returning to screen does not double-increment
appEvents.state('active');
assert.equal(rollover.length,1);
syntheticNow=new Date(2026,10,21,7,0,0).getTime();
appEvents.state('active'); // Android woke after two days of sleep
assert.deepEqual(rollover[1],['2026-11-19','2026-11-21']);
assert.equal(stateUpdates[1],'2026-11-21');

assert.match(home,/const calendarLocalToday = useCalendarTodayRollover\(/);
assert.match(home,/toCalendarDate\(selectedCalendarDateRef\.current\), previousToday/);
assert.match(home,/calendarLocalToday\]/);
assert.match(home,/setCalendarSelectedDate\(nextDate\)/);
assert.match(home,/setCalendarVisibleMonth\(visible =>/);
assert.match(calendar,/const calendarTodayKey = useCalendarTodayRollover\(/);
assert.match(calendar,/setSelectedDate\(currentToday\)/);
assert.match(calendar,/const today = calendarTodayKey/);
assert.match(calendar,/selectedDateRef\.current, previousToday/);
// The home widget has had two equivalent implementations. In both cases it
// must show the actual local "today", not a manually browsed calendar date.
const validTodaySelection = [
  /day\?\.date_gregorian === todayKey/,
  /selectedKey === todayKey\s*\?\s*day\s*:\s*await getOfflineCalendarDay\(new Date\(\), dataLanguage\)/,
];
const validTodayLookup = [
  /getOfflineCalendarDay\(todayKey,\s*getCalendarDataLanguage\(language\)\)/,
  /getOfflineCalendarDay\(new Date\(\),\s*dataLanguage\)/,
];
assert.ok(validTodaySelection.some(pattern => pattern.test(home)),
  'Home widget must select the real current date');
assert.ok(validTodayLookup.some(pattern => pattern.test(home)),
  'Home widget must load the real current date if another date is selected');
console.log('PASS: automatic date rollover at midnight, foreground resume and screen refocus');
console.log('PASS: no duplicate rollover, preserve manually selected dates and refresh today ring');
console.log('PASS: local calendar month/year boundaries and always-current-day Android widget');
