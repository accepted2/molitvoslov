import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import * as Crypto from 'expo-crypto';

// All reminders are private and stored on this device. Do not request a push token.
// A notification only carries a random ID; personal text stays in local storage.
const STORAGE_KEY = 'molitvoslov:local-prayer-reminders:v1';
const CHANNEL = 'prayer-reminders';
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]; // Monday ... Sunday
let writeQueue = Promise.resolve();

export const REMINDER_TARGETS = [
  {key: 'morning', title: 'Утренние молитвы', body: 'Время утреннего молитвенного правила'},
  {key: 'evening', title: 'Вечерние молитвы', body: 'Время вечернего молитвенного правила'},
  {key: 'gospel', title: 'Евангелие дня', body: 'Откройте сегодняшнее евангельское чтение'},
  {key: 'apostle', title: 'Апостол дня', body: 'Откройте сегодняшнее апостольское чтение'},
  {key: 'psalter', title: 'Псалтирь', body: 'Время продолжить чтение Псалтири'},
  {key: 'continue', title: 'Продолжить чтение', body: 'Вернитесь к сохранённому месту чтения'},
  {key: 'memorial', title: 'Поминовение', body: 'Время помолиться о близких'},
  {key: 'custom', title: 'Своё напоминание', body: 'Время для молитвы'},
];

const targetExists = key => REMINDER_TARGETS.some(target => target.key === key);
const two = number => String(number).padStart(2, '0');

export const normalizedReminderDays = days =>
  Array.isArray(days)
    ? ALL_DAYS.filter(day => days.includes(day))
    : [...ALL_DAYS];

export const reminderTimeValid = text =>
  /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(text || ''));

const normalized = item => ({
  id: String(item.id),
  target: targetExists(item.target) ? item.target : 'custom',
  title: String(item.title || '').trim().slice(0, 110),
  time: reminderTimeValid(item.time) ? item.time : '08:00',
  days: normalizedReminderDays(item.days),
  enabled: item.enabled === true,
  notificationIds: Array.isArray(item.notificationIds)
    ? item.notificationIds.filter(id => typeof id === 'string')
    : [],
});

export const readPrayerReminders = async () => {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '[]');
    return Array.isArray(stored) ? stored.filter(x => x && x.id).map(normalized) : [];
  } catch (error) {
    console.warn('[reminders] read failed:', error?.message || error);
    throw new Error('Не удалось прочитать локальные напоминания.');
  }
};

const writeReminders = reminders => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
const serial = task => {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => {});
  return next;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const channelReady = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Молитвенные напоминания',
      description: 'Напоминания о молитвенных правилах и чтениях',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
    });
  }
};

const hasPermission = permission =>
  permission.granted === true ||
  permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
  permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;

const ensurePermission = async () => {
  await channelReady(); // Android 13+ requires a channel before permission prompt
  let status = await Notifications.getPermissionsAsync();
  if (!hasPermission(status) && status.canAskAgain) {
    status = await Notifications.requestPermissionsAsync();
  }
  if (!hasPermission(status)) {
    throw new Error('Уведомления запрещены. Разрешите их для Молитвослова в настройках телефона.');
  }
};

// A standard repeating daily/weekly trigger works offline, without exact-alarm permission.
const triggerFor = (item, day) => {
  const [hour, minute] = item.time.split(':').map(Number);
  if (day == null) {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour, minute, channelId: CHANNEL,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday: day === 7 ? 1 : day + 1, // Expo: Sunday=1
    hour, minute, channelId: CHANNEL,
  };
};

const schedule = async item => {
  if (!item.enabled) return [];
  await ensurePermission();
  if (!item.days.length) throw new Error('Выберите хотя бы один день недели.');
  const ids = [];
  const target = REMINDER_TARGETS.find(entry => entry.key === item.target);
  try {
    for (const day of item.days.length === 7 ? [null] : item.days) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Молитвослов',
          body: item.title || target?.body || 'Время для молитвы',
          data: {kind: 'molitvoslov-reminder', reminderId: item.id},
          sound: false,
        },
        trigger: triggerFor(item, day),
      });
      ids.push(id);
    }
    return ids;
  } catch (error) {
    await Promise.allSettled(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
    throw error;
  }
};

const cancel = async ids => {
  const results = await Promise.allSettled((ids || []).map(id =>
    Notifications.cancelScheduledNotificationAsync(id)));
  const failed = results.find(entry => entry.status === 'rejected');
  if (failed) console.warn('[reminders] cancel failed:', failed.reason);
};

export const savePrayerReminder = input => serial(async () => {
  const current = await readPrayerReminders();
  const id = String(input.id || Crypto.randomUUID());
  const old = current.find(item => item.id === id);
  const item = normalized({...input, id, notificationIds: []});
  if (!item.title) throw new Error('Введите название напоминания.');
  if (!reminderTimeValid(input.time)) throw new Error('Укажите время в формате 07:00.');
  if (!item.days.length) throw new Error('Выберите хотя бы один день недели.');

  // New native schedules must exist before the persisted record is changed.
  const ids = await schedule(item);
  const saved = {...item, notificationIds: ids};
  try {
    await writeReminders([...current.filter(entry => entry.id !== id), saved]);
  } catch (error) {
    await cancel(ids);
    throw error;
  }
  if (old) await cancel(old.notificationIds);
  return saved;
});

export const setPrayerReminderEnabled = (id, enabled) => serial(async () => {
  const current = await readPrayerReminders();
  const old = current.find(item => item.id === id);
  if (!old) throw new Error('Напоминание не найдено.');
  if (old.enabled === enabled) return old;
  const changed = {...old, enabled: !!enabled, notificationIds: []};
  const ids = await schedule(changed);
  const saved = {...changed, notificationIds: ids};
  try {
    await writeReminders(current.map(item => item.id === id ? saved : item));
  } catch (error) {
    await cancel(ids);
    throw error;
  }
  await cancel(old.notificationIds);
  return saved;
});

export const deletePrayerReminder = id => serial(async () => {
  const current = await readPrayerReminders();
  const old = current.find(item => item.id === id);
  if (!old) return;
  await writeReminders(current.filter(item => item.id !== id));
  await cancel(old.notificationIds);
});

export const reconcilePrayerReminders = () => serial(async () => {
  const current = await readPrayerReminders();
  const permitted = hasPermission(await Notifications.getPermissionsAsync());
  if (!permitted) return current; // Never prompt in the background
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const known = new Set(scheduled.map(entry => entry.identifier));
  let changed = false;
  const updated = [];
  for (const item of current) {
    if (!item.enabled) {
      updated.push(item);
      continue;
    }
    if (item.notificationIds.length > 0 &&
        item.notificationIds.every(id => known.has(id))) {
      updated.push(item);
      continue;
    }
    // Partial scheduling after a crash: cancel only our own IDs.
    await cancel(item.notificationIds);
    const ids = await schedule(item);
    updated.push({...item, notificationIds: ids});
    changed = true;
  }
  if (changed) await writeReminders(updated);
  return updated;
});

const todayKey = () => {
  const date = new Date();
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate());
};

// Resolve known destinations from the stored reminder, not from untrusted OS data.
export const routeForPrayerReminder = reminder => {
  switch (reminder?.target) {
    case 'morning': return {name: 'PrayerRule', params: {slug: 'molitvy-utrennie'}};
    case 'evening': return {name: 'PrayerRule', params: {slug: 'molitvy-na-son-griadushchim'}};
    case 'gospel': return {name: 'ChurchCalendar', params: {date: todayKey(), section: 'gospel'}};
    case 'apostle': return {name: 'ChurchCalendar', params: {date: todayKey(), section: 'apostle'}};
    case 'psalter': return {name: 'Psalter'};
    case 'continue': return {name: 'ContinueReading'};
    case 'memorial': return {name: 'Memorial'};
    default: return {name: 'Notifications'};
  }
};

export const routeForNotificationResponse = async response => {
  if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const data = response.notification?.request?.content?.data;
  if (data?.kind !== 'molitvoslov-reminder' || typeof data.reminderId !== 'string') {
    return null;
  }
  const records = await readPrayerReminders();
  const item = records.find(entry => entry.id === data.reminderId);
  return item ? routeForPrayerReminder(item) : null;
};
