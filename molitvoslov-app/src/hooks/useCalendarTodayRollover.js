import {useCallback, useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

// Civil dates are local to the device, not UTC and not a cached server date.
// New Date(y, m, d + 1) correctly crosses month/year and DST boundaries.
export const localCalendarDayKey = (value = new Date()) => [
  value.getFullYear(),
  String(value.getMonth() + 1).padStart(2, '0'),
  String(value.getDate()).padStart(2, '0'),
].join('-');

export const nextLocalMidnightDelay = (value = new Date()) => {
  const next = new Date(
    value.getFullYear(), value.getMonth(), value.getDate() + 1, 0, 0, 2,
  );
  return Math.max(250, next.getTime() - value.getTime());
};

// Keep a user's explicitly chosen historical/future day. Only follow a
// new "today" if the previously displayed day was the previous "today".
export const shouldAdvanceSelectedDay = (selected, previousToday) =>
  selected === previousToday;

// React Navigation may keep previous screens mounted and Android may suspend
// timers while backgrounded. All three checks are needed:
// - near local midnight while app is open;
// - when the app resumes after sleep / timezone change;
// - when the user returns to this screen after navigating away.
export const useCalendarTodayRollover = onDayChanged => {
  const latestCallback = useRef(onDayChanged);
  latestCallback.current = onDayChanged;
  const lastDay = useRef(localCalendarDayKey());

  const checkDay = useCallback(() => {
    const currentDay = localCalendarDayKey();
    const previousDay = lastDay.current;
    if (currentDay === previousDay) return false;
    lastDay.current = currentDay;
    latestCallback.current(previousDay, currentDay);
    return true;
  }, []);

  useFocusEffect(useCallback(() => {
    checkDay();
    return undefined;
  }, [checkDay]));

  useEffect(() => {
    let midnightTimer;
    let stopped = false;
    const scheduleMidnight = () => {
      clearTimeout(midnightTimer);
      if (stopped) return;
      midnightTimer = setTimeout(() => {
        checkDay();
        scheduleMidnight();
      }, nextLocalMidnightDelay());
    };
    const resume = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      checkDay();
      scheduleMidnight();
    });
    // Cheap guard for a clock/timezone change while already foregrounded.
    const heartbeat = setInterval(() => {
      if (AppState.currentState === 'active') checkDay();
    }, 60 * 1000);
    checkDay();
    scheduleMidnight();
    return () => {
      stopped = true;
      clearTimeout(midnightTimer);
      clearInterval(heartbeat);
      resume.remove();
    };
  }, [checkDay]);
};
