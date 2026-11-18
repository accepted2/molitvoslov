import AsyncStorage from '@react-native-async-storage/async-storage';

// Android supplies an ID for every installed instance. Never share browsing
// state between calendar widgets placed on separate home screens.
const keyFor = id => 'widget-calendar-state-v2:' + String(id);
export const AUTO_RESET_MS = 30 * 60 * 1000;
const pad = value => String(value).padStart(2, '0');
export const toDateKey = date =>
  date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
export const monthKeyOf = dateKey => String(dateKey).slice(0, 7);

export const parseDateKey = key => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 ||
      day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12);
  return toDateKey(date) === key ? date : null;
};

export const parseMonthKey = key => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]);
  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12
    ? {year, month} : null;
};

export const todayState = (now = new Date()) => ({
  selected: toDateKey(now),
  month: monthKeyOf(toDateKey(now)),
  pinned: false,
  touchedAt: now.getTime(),
});

export const CALENDAR_ACTIONS = [
  'CALENDAR_PREV_MONTH', 'CALENDAR_NEXT_MONTH',
  'CALENDAR_TODAY', 'CALENDAR_SELECT_DAY',
];

// Only a browsing action pins a historic date. A normal periodic update must
// advance an untouched today across midnight. A browsing session expires after
// 30 minutes, and a resize does not reset it.
export const reduceState = (state, {widgetAction, clickAction, data}, now = new Date()) => {
  const today = todayState(now);
  const validState = !!(state && parseDateKey(state.selected) &&
    parseMonthKey(state.month) && Number.isFinite(Number(state.touchedAt)));
  const current = validState ? state : today;
  const age = now.getTime() - Number(current.touchedAt);
  const stale = age > AUTO_RESET_MS || age < -60 * 1000;

  if (widgetAction === 'WIDGET_ADDED') return today;
  if (widgetAction === 'WIDGET_UPDATE') {
    if (!current.pinned || stale) return today;
    return current;
  }
  if (widgetAction === 'WIDGET_RESIZED') return current;

  if (widgetAction === 'WIDGET_CLICK') {
    if (clickAction === 'CALENDAR_TODAY') return today;
    if (clickAction === 'CALENDAR_SELECT_DAY') {
      const selected = parseDateKey(data?.date);
      if (!selected) return current;
      const selectedKey = toDateKey(selected);
      return {selected: selectedKey, month: monthKeyOf(selectedKey),
        pinned: true, touchedAt: now.getTime()};
    }
    if (clickAction === 'CALENDAR_PREV_MONTH' ||
        clickAction === 'CALENDAR_NEXT_MONTH') {
      const target = parseMonthKey(
        String(data?.year || '') + '-' + pad(data?.month ?? ''),
      );
      return target
        ? {...current, month: target.year + '-' + pad(target.month),
          pinned: true, touchedAt: now.getTime()}
        : current;
    }
  }
  return current;
};

export const loadState = async widgetId => {
  if (!Number.isInteger(Number(widgetId)) || Number(widgetId) <= 0) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(widgetId));
    const value = raw ? JSON.parse(raw) : null;
    return value && parseDateKey(value.selected) && parseMonthKey(value.month) &&
      Number.isFinite(Number(value.touchedAt)) ? value : null;
  } catch (_error) {
    return null;
  }
};

export const saveState = async (widgetId, state) => {
  if (!Number.isInteger(Number(widgetId)) || Number(widgetId) <= 0) return;
  try {
    await AsyncStorage.setItem(keyFor(widgetId), JSON.stringify(state));
  } catch (_error) {
    // Browsing state is not critical user data.
  }
};

export const clearState = async widgetId => {
  if (!Number.isInteger(Number(widgetId)) || Number(widgetId) <= 0) return;
  try {
    await AsyncStorage.removeItem(keyFor(widgetId));
  } catch (_error) {}
};
