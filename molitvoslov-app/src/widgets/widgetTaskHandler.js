import React from 'react';

import {getDailyQuote} from '../services/dailyQuote';
import {getCalendarDay} from '../services/churchCalendar';
import {getOfflineCalendarDay} from '../services/calendarOfflineStore';
import {getCalendarLanguage} from '../services/calendarPreferences';
import {QuoteOfDayWidget} from './QuoteOfDayWidget';
import {ChurchCalendarWidget} from './ChurchCalendarWidget';

const toDateKey = (value) =>
  value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
        value.getDate()
      ).padStart(2, '0')}`
    : value;

const parseWidgetDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T12:00:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveCalendarDisplayDate = (props) => {
  if (props.widgetAction !== 'WIDGET_CLICK') {
    return new Date();
  }

  if (props.clickAction === 'CALENDAR_TODAY') {
    return new Date();
  }

  if (props.clickAction === 'CALENDAR_SELECT_DAY') {
    return parseWidgetDate(props.clickActionData?.date);
  }

  if (props.clickAction === 'CALENDAR_PREV_MONTH' || props.clickAction === 'CALENDAR_NEXT_MONTH') {
    const year = Number(props.clickActionData?.year);
    const month = Number(props.clickActionData?.month);

    if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
      return new Date(year, month - 1, 1);
    }
  }

  return null;
};

export const widgetTaskHandler = async (props) => {
  const {widgetAction, clickAction, clickActionData, widgetInfo, renderWidget} = props;

  if (widgetInfo.widgetName === 'QuoteOfDay') {
    const shouldRenderQuote = ['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'].includes(
      widgetAction
    );

    if (!shouldRenderQuote) {
      return;
    }

    renderWidget(
      <QuoteOfDayWidget
        quote={getDailyQuote()}
        width={widgetInfo.width}
        height={widgetInfo.height}
      />
    );

    return;
  }

  if (widgetInfo.widgetName !== 'ChurchCalendar') {
    return;
  }

  const normalUpdate = ['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'].includes(widgetAction);
  const calendarClick =
    widgetAction === 'WIDGET_CLICK' &&
    [
      'CALENDAR_PREV_MONTH',
      'CALENDAR_NEXT_MONTH',
      'CALENDAR_TODAY',
      'CALENDAR_SELECT_DAY',
    ].includes(clickAction);

  if (!normalUpdate && !calendarClick) {
    return;
  }

  const language = await getCalendarLanguage();
  const displayDate = resolveCalendarDisplayDate(props) || new Date();

  let requestedDayDate = new Date();

  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'CALENDAR_SELECT_DAY') {
    requestedDayDate = parseWidgetDate(clickActionData?.date) || requestedDayDate;
  }

  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'CALENDAR_TODAY') {
    requestedDayDate = new Date();
  }

  const finalDisplayDate = clickAction === 'CALENDAR_SELECT_DAY' ? requestedDayDate : displayDate;

  const dateKey = toDateKey(requestedDayDate);

  // Сначала обязательно рисуем виджет только из локальных данных.
  // Сеть никогда не должна задерживать первое появление виджета.
  let localDay = null;

  try {
    localDay = await getOfflineCalendarDay(dateKey, language);
  } catch (error) {
    console.log('Ошибка локальных данных виджета календаря:', error?.message || error);
  }

  renderWidget(
    <ChurchCalendarWidget
      day={localDay}
      language={language}
      width={widgetInfo.width}
      height={widgetInfo.height}
      displayDate={finalDisplayDate}
    />
  );

  const monthNavigation =
    widgetAction === 'WIDGET_CLICK' &&
    (clickAction === 'CALENDAR_PREV_MONTH' || clickAction === 'CALENDAR_NEXT_MONTH');

  // При перелистывании месяца справа сеть вообще не нужна.
  if (monthNavigation) {
    return;
  }

  // После мгновенной локальной отрисовки можно тихо получить свежий день
  // и перерисовать тот же виджет. Ошибка сети уже не оставит пустое место.
  try {
    const freshDay = await getCalendarDay(dateKey, {
      language,
      force: true,
      skipOffline: true,
    });

    if (freshDay) {
      renderWidget(
        <ChurchCalendarWidget
          day={freshDay}
          language={language}
          width={widgetInfo.width}
          height={widgetInfo.height}
          displayDate={finalDisplayDate}
        />
      );
    }
  } catch (error) {
    console.log('Фоновое обновление виджета календаря:', error?.message || error);
  }
};
