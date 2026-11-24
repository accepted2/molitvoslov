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
const channels = new Map();
const requestedChannels = new Map(); // MOLITVOSLOV_SDK57_ANDROID_REMINDER_SOUND_TEST_V1
let seq = 0;
let permitted = true;
let triggerDateAvailable = true;
let fakeNativeRegistration = false;

const storage = {
  getItem: async key => memory.get(key) || null,
  setItem: async (key, value) => { memory.set(key, value); },
};

const expoNotifications = {
  AndroidImportance: {DEFAULT: 3, HIGH: 4},
  SchedulableTriggerInputTypes: {DAILY: 'daily', WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval'},
  IosAuthorizationStatus: {PROVISIONAL: 'provisional', EPHEMERAL: 'ephemeral'},
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async (id, options) => {
    requestedChannels.set(id, options);
    // Simulate Android's read-back of an unmodified default channel sound.
    channels.set(id, {...options, sound: Object.hasOwn(options, "sound")
      ? options.sound : "default"});
  },
  getNotificationChannelAsync: async id => channels.get(id) || null,
  getNextTriggerDateAsync: async () => triggerDateAvailable ? Date.now() + 5 * 60 * 1000 : null,
  getPermissionsAsync: async () => ({granted: permitted, canAskAgain: false}),
  requestPermissionsAsync: async () => ({granted: false}),
  scheduleNotificationAsync: async input => {
    const identifier = 'notification-' + (++seq);
    if (!fakeNativeRegistration) scheduled.set(identifier, input);
    return identifier;
  },
  cancelScheduledNotificationAsync: async id => { scheduled.delete(id); },
  getAllScheduledNotificationsAsync: async () =>
    [...scheduled].map(([identifier, request]) => ({identifier, ...request})),
};

const load = new Function(
  'AsyncStorage', 'Notifications', 'Platform', 'Crypto',
  source + '\nreturn {readPrayerReminders, savePrayerReminder, ' +
  'setPrayerReminderEnabled, deletePrayerReminder, ' +
  'previewPrayerReminder, routeForPrayerReminder, ' +
  'getPrayerReminderScheduleStatuses, reconcilePrayerReminders};'
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
  assert.strictEqual([...scheduled.values()][0].content.sound, true);
  assert.strictEqual(Object.hasOwn(
    requestedChannels.get('prayer-reminders-audible-v2'), 'sound'), false,
    'Do not pass literal default as an Android custom channel sound');
  assert.strictEqual(channels.get('prayer-reminders-audible-v2').sound, 'default',
    'Android read-back can report the system default sound');
  // MOLITVOSLOV_CURRENT_REMINDER_SCHEDULE_VERSION_V1
  // The app can schedule native reminders with v2 or v3. Check that
  // all new and migrated reminders use the same modern version.
  const currentReminderScheduleVersion =
    [...scheduled.values()][0].content.data.reminderScheduleVersion;
  assert.ok(Number.isInteger(currentReminderScheduleVersion) &&
    currentReminderScheduleVersion >= 2,
    'Legacy schedule v1 must never be created by the current app');
  const status = await reminders.getPrayerReminderScheduleStatuses();
  assert.strictEqual(status[0].ready, true);
  assert.strictEqual(status[0].registered, 1);
  assert.strictEqual(status[0].channelAudible, true);

  const next = await reminders.savePrayerReminder({...first, days: [1, 3, 5]});
  assert.strictEqual(next.notificationIds.length, 3);
  assert.deepStrictEqual([...scheduled.values()].map(item => item.trigger.weekday), [2, 4, 6]);
  assert.deepStrictEqual(next.notificationIds.map(id =>
    scheduled.get(id)?.content?.data?.reminderScheduleVersion),
    [currentReminderScheduleVersion, currentReminderScheduleVersion, currentReminderScheduleVersion]);

  await reminders.previewPrayerReminder(first.id);
  assert.strictEqual([...scheduled.values()].filter(item => item.trigger.type === 'timeInterval').length, 1);
  assert.strictEqual([...scheduled.values()].find(item => item.trigger.type === 'timeInterval').content.sound, true);
  assert.strictEqual([...scheduled.values()].find(item => item.trigger.type === 'timeInterval')
    .content.data.reminderScheduleVersion, currentReminderScheduleVersion);

  // A pre-update silent schedule MUST migrate once to the new audible channel.
  for (const id of next.notificationIds) {
    const entry = scheduled.get(id);
    scheduled.set(id, {...entry, content: {
      ...entry.content, sound: false, data: {...entry.content.data, reminderScheduleVersion: 1},
    }});
  }
  const updated = await reminders.reconcilePrayerReminders();
  assert.strictEqual(updated[0].notificationIds.length, 3);
  assert.deepStrictEqual(updated[0].notificationIds.every(id =>
    scheduled.get(id)?.content?.data?.reminderScheduleVersion === currentReminderScheduleVersion), true);
  assert.strictEqual(next.notificationIds.every(id => !scheduled.has(id)), true);
  const alreadyMigrated = await reminders.reconcilePrayerReminders();
  assert.deepStrictEqual(alreadyMigrated[0].notificationIds, updated[0].notificationIds);

  await reminders.setPrayerReminderEnabled(first.id, false);
  assert.strictEqual([...scheduled.values()].filter(item => item.trigger.type === 'weekly').length, 0);

  await reminders.deletePrayerReminder(first.id);
  assert.strictEqual((await reminders.readPrayerReminders()).length, 0);

  triggerDateAvailable = false;
  await assert.rejects(reminders.savePrayerReminder({
    title: 'Несуществующее расписание', target: 'custom', time: '19:30',
    days, enabled: true,
  }), /Android не определил следующее срабатывание/);
  assert.strictEqual((await reminders.readPrayerReminders()).length, 0);
  triggerDateAvailable = true;

  fakeNativeRegistration = true;
  await assert.rejects(reminders.savePrayerReminder({
    title: 'Сбой регистрации Android', target: 'custom', time: '19:35',
    days, enabled: true,
  }), /Android не подтвердил сохранение расписания/);
  assert.strictEqual((await reminders.readPrayerReminders()).length, 0);
  fakeNativeRegistration = false;

  permitted = false;
  await assert.rejects(reminders.savePrayerReminder({
    title: 'Вечернее правило', target: 'evening', time: '21:00',
    days, enabled: true,
  }), /Уведомления запрещены/);
  assert.strictEqual((await reminders.readPrayerReminders()).length, 0);
  assert.strictEqual(reminders.routeForPrayerReminder({target: 'psalter'}).name, 'Psalter');
  console.log('PASS: local reminders (sound / daily / weekly / preview / migration / native registration / invalid trigger / disable / delete / permissions / navigation)');
})().catch(error => {
  console.error('FAIL:', error);
  process.exitCode = 1;
});
