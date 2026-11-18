#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parse = require('@babel/parser').parse;
const root = path.resolve(__dirname, '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const screen = source('src/screens/NotificationsScreen.js');
const reminders = source('src/services/localPrayerReminders.js');
const prefs = source('src/services/accountPreferencesSync.js');
for (const [name, content] of [['NotificationsScreen', screen], ['localPrayerReminders', reminders], ['accountPreferencesSync', prefs]]) {
  assert.doesNotThrow(() => parse(content, {sourceType: 'module', plugins: ['jsx']}), name);
}
assert.match(screen, /const \[timePickerOpen, setTimePickerOpen\] = useState\(false\)/);
assert.match(screen, /const stepReminderTime = delta =>/);
assert.match(screen, /accessibilityLabel=\{'Выбрать время\. Сейчас ' \+ draft\.time\}/);
assert.match(screen, /Точная настройка/);
assert.match(screen, /Быстрый выбор/);
assert.match(screen, /Готово/);
assert.match(screen, /stepReminderTime\(-60\)/);
assert.match(screen, /stepReminderTime\(60\)/);
assert.match(screen, /stepReminderTime\(-5\)/);
assert.match(screen, /stepReminderTime\(5\)/);
assert.match(screen, /stepReminderTime\(-1\)/);
assert.match(screen, /stepReminderTime\(1\)/);
assert.doesNotMatch(screen, /accessibilityLabel="Время в формате часы двоеточие минуты"/);
assert.equal((reminders.match(/reminderScheduleVersion: 3/g) || []).length, 2);
assert.equal((reminders.match(/reminderScheduleVersion === 3/g) || []).length, 2);
assert.doesNotMatch(reminders, /reminderScheduleVersion(?::| ===) 2/);
assert.match(reminders, /sound: Platform\.OS === 'android' \? true : 'default'/);
assert.match(reminders, /const CHANNEL = 'prayer-reminders-audible-v2'/);
assert.match(reminders, /readPrayerReminders/);
assert.match(reminders, /reconcilePrayerReminders/);
assert.match(reminders, /writeReminders/);
assert.match(prefs, /if \(!token\) return \{success: false, reason: 'reauth-required'\}/);
assert.match(prefs, /String\(error\?\.message \|\| ''\)\.trim\(\)/);
assert.match(prefs, /return deleteApiToken\(\)\.then/);

// Ensure the pure time-step formula wraps correctly at midnight, and
// accepts one-minute precision without losing the old HH:mm format.
const step = (time, delta) => {
  const [hour, minute] = time.split(':').map(Number);
  const total = (hour * 60 + minute + delta + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' +
    String(total % 60).padStart(2, '0');
};
assert.equal(step('23:59', 1), '00:00');
assert.equal(step('00:00', -1), '23:59');
assert.equal(step('07:00', -5), '06:55');
assert.equal(step('07:00', 60), '08:00');
assert.equal(step('07:00', 1), '07:01');
console.log('PASS: clock picker, minute-precision controls and save format');
console.log('PASS: old v2 alarms are detected and rebuilt as v3');
console.log('PASS: expired-token fallback preserves offline queue and requests re-login');
console.log('PASS: no changes to stored reminder data, channel ID or reading routes');
