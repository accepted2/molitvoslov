#!/usr/bin/env node
'use strict';

// One-time migration: the installed APK's calendar is authoritative.
// No calendar HTTP refresh, no AsyncStorage override, no automatic delta cache.
// Edits only the calendar-related functions and screen effects. Keeps backups.
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');

const parse = (source) =>
  parser.parse(source, {sourceType: 'module', plugins: ['jsx']});

const operations = [];
function openSource(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) throw new Error('Missing file: ' + file);
  return {file, absolute, original: fs.readFileSync(absolute, 'utf8')};
}

const calendarExportParameters = {
  getCalendarDay: '(value = new Date(), {language = "ru"} = {})',
  getCalendarMonth: '(year, month, {language = "ru"} = {})',
  getStoredCalendarDay: '(date, language = "ru")',
  getOfflineCalendarDay: '(date, language = "ru")',
  getOfflineCalendarMonth: '(year, month, language = "ru")',
  storeCalendarDay: '(date, language = "ru", data)',
  storeCalendarMonth: '(data, language = "ru")',
};

function exportBodyReplacements(source, names) {
  const ast = parse(source);
  const replacements = [];
  const found = new Set();
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declaration = node.declaration;
    if (declaration?.type === 'FunctionDeclaration') {
      const name = declaration.id?.name;
      if (!Object.prototype.hasOwnProperty.call(names, name)) continue;
      const params = calendarExportParameters[name];
      if (!params) throw new Error('Unsupported export: ' + name);
      found.add(name);
      replacements.push({
        start: declaration.start,
        end: declaration.end,
        value: 'const ' + name + ' = async ' + params + ' => ' + names[name] + ';',
      });
      continue;
    }
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const item of declaration.declarations) {
      const name = item.id?.name;
      if (!Object.prototype.hasOwnProperty.call(names, name)) continue;
      const params = calendarExportParameters[name];
      if (!params || !item.init) throw new Error('Unexpected calendar export: ' + name);
      found.add(name);
      // Replace the initializer as a whole. This also handles concise arrows
      // with parenthesized expressions and local memoization wrappers.
      replacements.push({
        start: item.init.start,
        end: item.init.end,
        value: 'async ' + params + ' => ' + names[name],
      });
    }
  }
  for (const name of Object.keys(names)) {
    if (!found.has(name)) throw new Error('Missing exported function: ' + name);
  }
  return applyReplacements(source, replacements);
}

function applyReplacements(source, replacements) {
  const sorted = replacements.slice().sort((a, b) => b.start - a.start);
  let result = source;
  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];
    if (i && entry.end > sorted[i - 1].start) {
      throw new Error('Overlapping calendar edits');
    }
    result = result.slice(0, entry.start) + entry.value + result.slice(entry.end);
  }
  parse(result);
  return result;
}

const svc = openSource('src/services/churchCalendar.js');
let svcNext = exportBodyReplacements(svc.original, {
  getCalendarDay: '{\n  // Release-only calendar: ignore force/skipOffline/server arguments.\n  return getBundledCalendarDay(value, language);\n}',
  getCalendarMonth: '{\n  // New calendar years arrive in a new app release, never by HTTP refresh.\n  return getBundledCalendarMonth(year, month, language);\n}',
});
const storeImports = parse(svcNext).program.body
  .filter(node => node.type === 'ImportDeclaration' &&
    node.source.value === './calendarOfflineStore');
const localBindings = new Set(storeImports.flatMap(node =>
  node.specifiers.map(specifier => specifier.local.name)));
const missingImports = ['getBundledCalendarDay', 'getBundledCalendarMonth']
  .filter(name => !localBindings.has(name));
if (missingImports.length) {
  svcNext = "import {" + missingImports.join(', ') +
    "} from './calendarOfflineStore';\n" + svcNext;
}
parse(svcNext);
operations.push({source: svc, updated: svcNext});

const store = openSource('src/services/calendarOfflineStore.js');
const storeNext = exportBodyReplacements(store.original, {
  getStoredCalendarDay: '{\n  // Former HTTP cache must never override a freshly installed APK.\n  return null;\n}',
  getOfflineCalendarDay: '{\n  return getBundledCalendarDay(date, language);\n}',
  getOfflineCalendarMonth: '{\n  return getBundledCalendarMonth(year, month, language);\n}',
  storeCalendarDay: '{\n  // Calendar corrections are distributed with the next app release.\n  return false;\n}',
  storeCalendarMonth: '{\n  return false;\n}',
});
operations.push({source: store, updated: storeNext});

const screen = openSource('src/screens/ChurchCalendarScreen.js');
const screenAst = parse(screen.original);
const screenEdits = [];
const monthEffect = [
  'useEffect(() => {',
  '    let active = true;',
  '    const bundled = getBundledCalendarMonth(visibleYear, visibleMonth, dataLanguage);',
  '    setMonthData(bundled);',
  "    setError(bundled ? '' : copy.loadCalendarError);",
  '    setLoadingMonth(!bundled);',
  '    getOfflineCalendarMonth(visibleYear, visibleMonth, dataLanguage)',
  '      .then(month => {',
  '        if (!active) return;',
  '        setMonthData(month);',
  "        setError(month ? '' : copy.loadCalendarError);",
  '      })',
  '      .catch(error => {',
  '        if (active) setError(error?.message || copy.loadCalendarError);',
  '      })',
  '      .finally(() => {',
  '        if (active) setLoadingMonth(false);',
  '      });',
  '    return () => { active = false; };',
  '  }, [dataLanguage, refreshVersion, visibleMonth, visibleYear])',
].join('\n');
const dayEffect = [
  'useEffect(() => {',
  '    let active = true;',
  '    setLoadingDay(true);',
  '    getOfflineCalendarDay(selectedDate, dataLanguage)',
  '      .then(day => {',
  '        if (!active) return;',
  '        setDayData(day);',
  "        setError(day ? '' : copy.loadDayError);",
  '      })',
  '      .catch(error => {',
  '        if (!active) return;',
  '        setDayData(null);',
  '        setError(error?.message || copy.loadDayError);',
  '      })',
  '      .finally(() => {',
  '        if (active) setLoadingDay(false);',
  '      });',
  '    return () => { active = false; };',
  '  }, [dataLanguage, refreshVersion, selectedDate])',
].join('\n');
const matches = {month: 0, day: 0, reconnect: 0};
function scan(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ExpressionStatement' &&
      node.expression?.type === 'CallExpression' &&
      node.expression.callee?.name === 'useEffect') {
    const effectSource = screen.original.slice(node.start, node.end);
    if (effectSource.includes('refreshFromNetwork') &&
        effectSource.includes('getCalendarMonth(')) {
      matches.month += 1;
      screenEdits.push({
        start: node.expression.start,
        end: node.expression.end,
        value: monthEffect,
      });
      return;
    }
    if (effectSource.includes('const loadDay = async') &&
        effectSource.includes('getCalendarDay(')) {
      matches.day += 1;
      screenEdits.push({
        start: node.expression.start,
        end: node.expression.end,
        value: dayEffect,
      });
      return;
    }
    if (effectSource.includes('NetInfo.addEventListener') &&
        effectSource.includes('setRefreshVersion')) {
      // Reconnect should not trigger a calendar refresh from a server.
      matches.reconnect += 1;
      screenEdits.push({start: node.start, end: node.end, value: ''});
      return;
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) if (item?.type) scan(item);
    } else if (value?.type) {
      scan(value);
    }
  }
}
scan(screenAst.program);
if (matches.month > 1 || matches.day > 1 || matches.reconnect > 1) {
  throw new Error('Ambiguous calendar screen effects: ' + JSON.stringify(matches));
}
if (screen.original.includes('refreshFromNetwork') && matches.month !== 1) {
  throw new Error('Cannot safely identify calendar month network refresh effect');
}
if (screen.original.includes('const loadDay = async') &&
    screen.original.includes('getCalendarDay(selectedDate') &&
    matches.day !== 1) {
  throw new Error('Cannot safely identify calendar day network refresh effect');
}
const screenNext = applyReplacements(screen.original, screenEdits)
  // Removing the reconnect effect can leave whitespace-only lines.
  // Clean just these blank lines, preserving existing line endings.
  .replace(/^[ \t]+(?=\r?$)/gm, '');
operations.push({source: screen, updated: screenNext});

const altered = operations.filter(item => item.updated !== item.source.original);
console.log('Calendar release-only checks passed. Mode: ' + (apply ? 'APPLY' : 'CHECK'));
console.log('Screen effects found: ' + JSON.stringify(matches));
for (const item of operations) {
  console.log((item.updated === item.source.original ? 'UNCHANGED ' : 'PATCH ') +
    item.source.file);
}
if (!apply) {
  console.log('No files changed. Run this script with --apply to install.');
  process.exit(0);
}

// Write only after every source has been parsed and validated.
const suffix = '.backup-calendar-release-only-20261123';
for (const item of altered) {
  const backup = item.source.absolute + suffix;
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(item.source.absolute, backup);
  }
}
for (const item of altered) {
  fs.writeFileSync(item.source.absolute, item.updated, 'utf8');
}
console.log('DONE: bundled calendar now takes precedence; HTTP calendar refresh disabled.');
console.log('Backup suffix: ' + suffix);
