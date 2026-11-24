'use strict';
// Safe cold-start App Link fix. Patch only App.js and AppNavigator.js without
// overwriting local customizations. Validate all edits before writing anything.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const marker = 'COLD_START_APP_LINK_RECOVERY_V1';

function replaceOne(text, before, after, label) {
  if (text.split(before).length !== 2) {
    throw new Error(label + ': source structure changed; no files were modified.');
  }
  return text.replace(before, after);
}

function patchApp(source) {
  let s = source.replace(/\r\n/g, '\n');
  if (!s.includes("import {beginStartupAppLinkCapture} from './src/services/startupAppLink';")) {
    s = replaceOne(s,
      "import {AppNavigator} from './src/navigation/AppNavigator';",
      "import {AppNavigator} from './src/navigation/AppNavigator';\n" +
      "import {beginStartupAppLinkCapture} from './src/services/startupAppLink';",
      'App.js import');
  }
  if (!s.includes('beginStartupAppLinkCapture();')) {
    s = replaceOne(s,
      'export default function App() {',
      '// Capture Android launch links before waiting on SQLite, fonts and onboarding.\n' +
      'beginStartupAppLinkCapture();\n\nexport default function App() {',
      'App.js startup');
  }
  return s.replace(/\n/g, source.includes('\r\n') ? '\r\n' : '\n');
}

function patchNavigator(source) {
  let s = source.replace(/\r\n/g, '\n');
  const importLine =
    "import {readStartupAppLink, completeStartupAppLinkCapture} from '../services/startupAppLink';";
  if (!s.includes(importLine)) {
    s = replaceOne(s,
      "import {normalizeIncomingAppLink} from '../services/appLinks';",
      "import {normalizeIncomingAppLink} from '../services/appLinks';\n" +
        importLine, 'AppNavigator.js startup import');
  }
  if (!/\bimport\s*\{[^}]*\bgetStateFromPath\b[^}]*\}\s*from\s*['"]@react-navigation\/native['"]/.test(s)) {
    const navigationImport = /import\s*\{([^}]+)\}\s*from\s*(['"])@react-navigation\/native\2\s*;/g;
    const matches = [...s.matchAll(navigationImport)];
    if (matches.length !== 1) {
      throw new Error('AppNavigator.js: cannot locate NavigationContainer import uniquely.');
    }
    const parts = matches[0][1].split(',').map(x => x.trim()).filter(Boolean);
    if (!parts.includes('getStateFromPath')) parts.push('getStateFromPath');
    s = s.replace(matches[0][0],
      'import {' + parts.join(', ') + '} from ' + matches[0][2] +
      '@react-navigation/native' + matches[0][2] + ';');
  }

  const getStart = /async\s+getInitialURL\s*\(\s*\)\s*\{([\s\S]*?)\}/g;
  const initialMatches = [...s.matchAll(getStart)];
  if (initialMatches.length !== 1) {
    throw new Error('AppNavigator.js: cannot find the initial URL reader uniquely.');
  }
  const currentBody = initialMatches[0][1];
  if (!currentBody.includes('readStartupAppLink()')) {
    if (!/return\s+normalizeIncomingAppLink\s*\(\s*await\s+Linking\.getInitialURL\(\)\s*\)\s*;/.test(currentBody)) {
      throw new Error('AppNavigator.js: custom getInitialURL logic needs manual merge; no files changed.');
    }
    const nextBody = currentBody.replace(
      /return\s+normalizeIncomingAppLink\s*\(\s*await\s+Linking\.getInitialURL\(\)\s*\)\s*;/,
      'return await readStartupAppLink() ||\n      normalizeIncomingAppLink(await Linking.getInitialURL());'
    );
    s = s.replace(initialMatches[0][0], initialMatches[0][0].replace(currentBody,nextBody));
  }

  const configStart = s.indexOf('const linking =');
  const configEnd = s.indexOf('const solidTransition');
  if (configStart < 0 || configEnd <= configStart) {
    throw new Error('AppNavigator.js: cannot isolate React Navigation linking config.');
  }
  const linkPart = s.slice(configStart, configEnd);
  if (!/initialRouteName:\s*['"]Menu['"]/.test(linkPart)) {
    const cfg = /config:\s*\{/g;
    const found = [...linkPart.matchAll(cfg)];
    if (found.length !== 1) throw new Error('AppNavigator.js: unexpected linking config.');
    const replacement = linkPart.replace(found[0][0],
      found[0][0] + "\n    initialRouteName: 'Menu',");
    s = s.slice(0,configStart) + replacement + s.slice(configEnd);
  }

  // Keep any local notification/onReady flow as-is. This is an independent
  // one-shot fallback only when React Navigation incorrectly opened Menu.
  if (!s.includes(marker)) {
    const anchor = '  const pendingReminderRoute = React.useRef(null);';
    const helper = [
      '',
      '  // ' + marker,
      '  const recoverColdStartAppLink = () => {',
      '    readStartupAppLink()',
      '      .then(url => {',
      '        const nav = navigationRef.current;',
      "        if (!url || !nav?.isReady() || nav.getCurrentRoute()?.name !== 'Menu' ||",
      "            !url.startsWith('molitvoslov://')) return;",
      "        const path = url.slice('molitvoslov://'.length);",
      '        const state = getStateFromPath(path, linking.config);',
      '        const target = state?.routes?.[state.routes.length - 1];',
      "        if (target?.name && target.name !== 'Menu') {",
      "          console.log('[links] recover cold-start:', target.name);",
      '          nav.navigate(target.name, target.params);',
      '        }',
      '      })',
      "      .catch(error => console.warn('[links] cold-start:', error?.message || error))",
      '      .finally(completeStartupAppLinkCapture);',
      '  };',
    ].join('\n');
    s = replaceOne(s, anchor, anchor + '\n' + helper,
      'AppNavigator.js navigation refs');
    const ready = 'onReady={onNavigationReady}';
    const wrapped = "onReady={() => {\n" +
      "      const hadPendingNotification = !!pendingReminderRoute.current;\n" +
      "      onNavigationReady();\n" +
      "      if (!hadPendingNotification) recoverColdStartAppLink();\n" +
      "      else completeStartupAppLinkCapture();\n" +
      "    }}";
    s = replaceOne(s, ready, wrapped, 'AppNavigator.js onReady');
  }
  return s.replace(/\n/g, source.includes('\r\n') ? '\r\n' : '\n');
}

const entries = [
  {name:'App.js', patch:patchApp},
  {name:'src/navigation/AppNavigator.js', patch:patchNavigator},
];
const planned = entries.map(e => {
  const file = path.join(root, e.name);
  const original = fs.readFileSync(file, 'utf8');
  return {...e,file,original,updated:e.patch(original)};
});
const changed = planned.filter(e => e.original !== e.updated);
if (!changed.length) {
  console.log('PASS: cold-start App Link recovery already installed.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'cold-start-app-links-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
for(const e of changed)fs.copyFileSync(e.file,path.join(backupDir,e.name.replace(/[\/]/g,'__')));
const completed = [];
try {
  for(const e of changed){fs.writeFileSync(e.file,e.updated,'utf8');completed.push(e)}
} catch(error) {
  for(const e of completed)fs.writeFileSync(e.file,e.original,'utf8');
  throw error;
}
console.log('PASS: cold-start App Links captured before loader and restored after navigation is ready.');
console.log('Changed:',changed.map(e=>e.name).join(', '));
console.log('Backups:',backupDir);
