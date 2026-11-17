// Run with: node tools/test_local_prayer_reminders_20261117.js
// Pure-JS contract tests: no Expo build, Android device or network required.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const sourceFile = path.join(__dirname, '../src/services/localPrayerReminders.js');
const source = fs.readFileSync(sourceFile, 'utf8')
  // Windows Git checkouts use CRLF. Normalize before stripping ES-module imports.
  .replace(/\r\n?/g, '\n')
  .replace(/^import[^\n]*;\n/gm, '')
  .replace(/export const /g, 'const ');

const memory = new Map();
const scheduled = new Map();
let seq = 0;
let permitted = true;

const storage = {
  getItem: async key => memory.get(key) || null,
  setItem: async (key, value) => { memory.set(key, value); },
};

const expoNotifications = {
  AndroidImportance: {DEFAULT: 3},
  SchedulableTriggerInputTypes: {DAILY: 'daily', WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval'},
  IosAuthorizationStatus: {PROVISIONAL: 'provisional', EPHEMERAL: 'ephemeral'},
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({granted: permitted, canAskAgain: false}),
  requestPermissionsAsync: async () => ({granted: false}),
  scheduleNotificationAsync: async input => {
    const identifier = 'notification-' + (++seq);
    scheduled.set(identifier, input);
    return identifier;
  },
  cancelScheduledNotificationAsync: async id => { scheduled.delete(id); },
  getAllScheduledNotificationsAsync: async () =>
    [...scheduled].map(([identifier]) => ({identifier})),
};

const load = new Function(
  'AsyncStorage', 'Notifications', 'Platform', 'Crypto',
  source + '\nreturn {readPrayerReminders, savePrayerReminder, ' +
  'setPrayerReminderEnabled, deletePrayerReminder, ' +
  'previewPrayerReminder, routeForPrayerReminder};'
);
const reminders = load(storage, expoNotifications, {OS: 'android'},
  {randomUUID: () => 'id-1'});

(async () => {
  const days = [1, 2, 3, 4, 5, 6, 7];
  const first = await reminders.savePrayerReminder({
    title: 'Утреннее правило', target: 'morning', time: '07:00',
    days, enabled: true,
  });
  assert.strictEqual(first.notificationIds.length, 1);
  assert.strictEqual([...scheduled.values()][0].trigger.type, 'daily');

  const next = await reminders.savePrayerReminder({...first, days: [1, 3, 5]});
  assert.strictEqual(next.notificationIds.length, 3);
  assert.deepStrictEqual([...scheduled.values()].map(item => item.trigger.weekday), [2, 4, 6]);

  await reminders.previewPrayerReminder(first.id);
  assert.strictEqual([...scheduled.values()].filter(item => item.trigger.type === 'timeInterval').length, 1);

  await reminders.setPrayerReminderEnabled(first.id, false);
  assert.strictEqual([...scheduled.values()].filter(item => item.trigger.type === 'weekly').length, 0);

  await reminders.deletePrayerReminder(first.id);
  assert.strictEqual((await reminders.readPrayerReminders()).length, 0);

  permitted = false;
  await assert.rejects(reminders.savePrayerReminder({
    title: 'Вечернее правило', target: 'evening', time: '21:00',
    days, enabled: true,
  }), /Уведомления запрещены/);
  assert.strictEqual((await reminders.readPrayerReminders()).length, 0);
  assert.strictEqual(reminders.routeForPrayerReminder({target: 'psalter'}).name, 'Psalter');
  console.log('PASS: local reminders (daily / weekly / preview / disable / delete / permissions / navigation)');
})().catch(error => {
  console.error('FAIL:', error);
  process.exitCode = 1;
});
