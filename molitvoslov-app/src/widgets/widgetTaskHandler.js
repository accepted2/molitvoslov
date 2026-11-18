import React from 'react';
import {getDailyQuote} from '../services/dailyQuote';
import {getCalendarDay} from '../services/churchCalendar';
import {getOfflineCalendarDay, getOfflineCalendarMonth} from '../services/calendarOfflineStore';
import {getCalendarLanguage} from '../services/calendarPreferences';
import {getCalendarDataLanguage} from '../services/languagePreferences';
import {QuoteOfDayWidget} from './QuoteOfDayWidget';
import {ChurchCalendarWidget} from './ChurchCalendarWidget';
import {
  CALENDAR_ACTIONS, clearState, loadState, parseMonthKey, reduceState, saveState,
} from './widgetState';

const REDRAW_ACTIONS = ['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'];
export const needsWidgetNetwork = (action, clickAction) =>
  action === 'WIDGET_ADDED' || action === 'WIDGET_UPDATE' ||
  (action === 'WIDGET_CLICK' &&
    (clickAction === 'CALENDAR_SELECT_DAY' || clickAction === 'CALENDAR_TODAY'));

const offlineMonth = async (key, language) => {
  const month = parseMonthKey(key);
  if (!month) return [];
  try {
    const result = await getOfflineCalendarMonth(month.year, month.month, language);
    return result?.days || [];
  } catch (error) {
    console.warn('[widget] month cache:', error?.message || error);
    return [];
  }
};

export const widgetTaskHandler = async props => {
  const {widgetAction, clickAction, clickActionData, widgetInfo, renderWidget} = props;
  const name = widgetInfo?.widgetName;

  if (widgetAction === 'WIDGET_DELETED') {
    if (name === 'ChurchCalendar') await clearState(widgetInfo.widgetId);
    return;
  }
  if (name === 'QuoteOfDay') {
    if (!REDRAW_ACTIONS.includes(widgetAction)) return;
    renderWidget(
      <QuoteOfDayWidget quote={getDailyQuote()}
        width={widgetInfo.width} height={widgetInfo.height} />,
    );
    return;
  }
  if (name !== 'ChurchCalendar') return;
  if (widgetAction === 'WIDGET_CLICK' && !CALENDAR_ACTIONS.includes(clickAction)) {
    // OPEN_URI is processed by Android's link handler.
    return;
  }
  if (widgetAction !== 'WIDGET_CLICK' && !REDRAW_ACTIONS.includes(widgetAction)) {
    return;
  }

  const widgetId = widgetInfo.widgetId;
  const previous = await loadState(widgetId);
  const next = reduceState(previous, {
    widgetAction, clickAction, data: clickActionData,
  }, new Date());
  await saveState(widgetId, next);
  const language = getCalendarDataLanguage(await getCalendarLanguage());
  const monthDays = await offlineMonth(next.month, language);

  const draw = day => renderWidget(
    <ChurchCalendarWidget
      day={day}
      monthDays={monthDays}
      language={language}
      width={widgetInfo.width}
      height={widgetInfo.height}
      monthKey={next.month}
      selectedKey={next.selected}
    />,
  );

  let localDay = null;
  try {
    localDay = await getOfflineCalendarDay(next.selected, language);
  } catch (error) {
    console.warn('[widget] day cache:', error?.message || error);
  }
  // Display something promptly even without network availability.
  draw(localDay);

  if (!needsWidgetNetwork(widgetAction, clickAction)) return;
  try {
    const fresh = await getCalendarDay(next.selected, {
      language, force: true, skipOffline: true,
    });
    if (!fresh) return;
    // Avoid overwriting a more recent tap with an older asynchronous result.
    const latest = await loadState(widgetId);
    if (!latest || latest.selected !== next.selected || latest.month !== next.month ||
        latest.touchedAt !== next.touchedAt) return;
    draw(fresh);
  } catch (error) {
    console.warn('[widget] online update:', error?.message || error);
  }
};

// Retain compatibility for callers using the old import path.
export {refreshCalendarWidgetsFromApp} from './widgetCalendarRefresh';
