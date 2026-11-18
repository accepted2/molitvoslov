#!/usr/bin/env node
'use strict';
// READ-ONLY diagnostics of the live source. Does not rewrite or reset files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rel = value => path.relative(root, value).replace(/\\/g, '/');
const read = file => fs.existsSync(path.join(root, file))
  ? fs.readFileSync(path.join(root, file), 'utf8') : '';
const reminders = read('src/services/localPrayerReminders.js');
const menu = read('src/screens/MenuScreen.js');
const prefs = read('src/services/accountPreferencesSync.js');
const screen = read('src/screens/NotificationsScreen.js');
const account = read('src/screens/AccountScreen.js');
console.log('MOLITVOSLOV LOCAL RUNTIME SOURCE DIAGNOSTICS');
console.log('Reminder v3:', reminders.includes('reminderScheduleVersion: 3') &&
  reminders.includes('reminderScheduleVersion === 3') ? 'INSTALLED' : 'NOT INSTALLED');
console.log('Time controls:', screen.includes('stepReminderTime = delta =>') &&
  screen.includes('Точная настройка') ? 'INSTALLED' : 'NOT INSTALLED');
console.log('Idle calendar scheduler:', menu.includes('globalThis.requestIdleCallback') &&
  !menu.includes('InteractionManager.runAfterInteractions') ? 'INSTALLED' : 'NOT INSTALLED');
console.log('Auth re-login handling:', prefs.includes("error.code = 'reauth-required'") &&
  account.includes('Для синхронизации настроек повторно войдите в аккаунт')
  ? 'INSTALLED' : 'NOT INSTALLED');
console.log('Native default sound:', reminders.includes("sound: Platform.OS === 'android' ? true : 'default'")
  ? 'INSTALLED' : 'NOT INSTALLED');
const matches = [];
const checks = [
  {name: 'InteractionManager', re: /\bInteractionManager\b|runAfterInteractions/g},
  {name: 'Sound default', re: /\bsound\s*:\s*['"]default['"]/g},
  {name: 'Cloud warning caller', re: /cloud sync pending|syncAccountPreferences/g},
];
const visit = folder => {
  if (!fs.existsSync(folder)) return;
  for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
    if (['node_modules', '.git', 'data', 'assets', 'reports'].includes(entry.name)) continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (!/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const check of checks) {
        check.re.lastIndex = 0;
        if (check.re.test(lines[i])) {
          matches.push({kind: check.name, file: rel(file), line: i + 1,
            snippet: lines[i].trim().slice(0, 130)});
        }
      }
    }
  }
};
visit(path.join(root, 'src'));
visit(path.join(root, 'App.js'));
console.log('Source matches (not necessarily active at runtime):');
for (const match of matches.slice(0, 75))
  console.log(match.kind + '  ' + match.file + ':' + match.line + '  ' + match.snippet);
console.log('Total matches:', matches.length);
if (matches.length > 75) console.log('(Only first 75 shown)');
console.log('If all fixes say INSTALLED but LogBox still shows the same errors,');
console.log('check whether the phone is running this development bundle or an old native APK.');
console.log('Do not delete app data or clear stored reminders to troubleshoot.');
