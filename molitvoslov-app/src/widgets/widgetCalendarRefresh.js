import React from 'react';
import {getWidgetInfo, requestWidgetUpdateById} from 'react-native-android-widget';
import {getOfflineCalendarDay, getOfflineCalendarMonth} from '../services/calendarOfflineStore';
import {getCalendarLanguage} from '../services/calendarPreferences';
import {getCalendarDataLanguage} from '../services/languagePreferences';
import {ChurchCalendarWidget} from './ChurchCalendarWidget';
import {loadState, parseMonthKey, reduceState, saveState} from './widgetState';

// This service is deliberately independent from widgetTaskHandler.js.
// The device may already have a customized click handler from the optimized
// ZIP. Refresh must never overwrite its source or its calendar navigation.
export const refreshCalendarWidgetsFromApp = async languageOverride => {
  const language = getCalendarDataLanguage(
    languageOverride || await getCalendarLanguage(),
  );
  const instances = await getWidgetInfo('ChurchCalendar');
  for (const info of instances || []) {
    try {
      const widgetId = info?.widgetId;
      if (!widgetId) continue;
      const previous = await loadState(widgetId);
      const next = reduceState(previous, {widgetAction: 'WIDGET_UPDATE'}, new Date());
      await saveState(widgetId, next);
      const shown = parseMonthKey(next.month);
      const [day, month] = await Promise.all([
        getOfflineCalendarDay(next.selected, language).catch(() => null),
        shown ? getOfflineCalendarMonth(shown.year, shown.month, language)
          .catch(() => null) : Promise.resolve(null),
      ]);
      // A user can browse the widget while its offline data is being loaded.
      // Avoid replacing a newer selection with an outdated refresh.
      const latest = await loadState(widgetId);
      if (!latest ||
          latest.selected !== next.selected ||
          latest.month !== next.month ||
          latest.touchedAt !== next.touchedAt) continue;
      await requestWidgetUpdateById({
        widgetName: 'ChurchCalendar',
        widgetId,
        renderWidget: () => (
          <ChurchCalendarWidget
            day={day}
            monthDays={month?.days || []}
            language={language}
            width={info.width}
            height={info.height}
            monthKey={next.month}
            selectedKey={next.selected}
          />
        ),
      });
    } catch (error) {
      console.warn('[widget] independent refresh:', info?.widgetId,
        error?.message || error);
    }
  }
};
