import React from 'react';

import {getDailyQuote} from '../services/dailyQuote';
import {getCalendarDay} from '../services/churchCalendar';
import {getCalendarLanguage} from '../services/calendarPreferences';
import {QuoteOfDayWidget} from './QuoteOfDayWidget';
import {ChurchCalendarWidget} from './ChurchCalendarWidget';

const getWidgetCalendarDay = async (value, language) => {
  const dateKey =
    value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
          value.getDate()
        ).padStart(2, '0')}`
      : value;

  /*
   * getCalendarDay сам делает правильный приоритет:
   * онлайн -> свежий сервер + кэш,
   * офлайн -> кэш телефона -> встроенный календарь APK.
   * force=true нужен, чтобы виджет не зависал на старом in-memory значении.
   */
  return getCalendarDay(dateKey, {
    language,
    force: true,
  });
};

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

  /*
   * ЦИТАТА ДНЯ
   */
  if (widgetInfo.widgetName === 'QuoteOfDay') {
    const shouldRenderQuote = ['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'].includes(
      widgetAction
    );

    if (!shouldRenderQuote) {
      return;
    }

    const quote = getDailyQuote();

    renderWidget(
      <QuoteOfDayWidget quote={quote} width={widgetInfo.width} height={widgetInfo.height} />
    );

    return;
  }

  /*
   * ЦЕРКОВНЫЙ КАЛЕНДАРЬ
   */
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

  /*
   * Какой месяц показываем справа
   */
  const displayDate = resolveCalendarDisplayDate(props) || new Date();

  /*
   * Какой день показываем слева:
   *
   * - нажали конкретный день -> этот день
   * - "сегодня" -> сегодняшний
   * - листаем месяц -> сегодняшний день
   * - обычное обновление -> сегодняшний день
   */
  let requestedDayDate = new Date();

  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'CALENDAR_SELECT_DAY') {
    const selectedDate = parseWidgetDate(clickActionData?.date);

    if (selectedDate) {
      requestedDayDate = selectedDate;
    }
  }

  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'CALENDAR_TODAY') {
    requestedDayDate = new Date();
  }

  let day = null;

  try {
    day = await getWidgetCalendarDay(requestedDayDate, language);
  } catch (error) {
    console.log('Ошибка обновления виджета календаря:', error?.message || error);
  }

  /*
   * Если нажали конкретный день,
   * месяц справа тоже должен перейти
   * к этому выбранному дню.
   */
  const finalDisplayDate = clickAction === 'CALENDAR_SELECT_DAY' ? requestedDayDate : displayDate;

  renderWidget(
    <ChurchCalendarWidget
      day={day}
      language={language}
      width={widgetInfo.width}
      height={widgetInfo.height}
      displayDate={finalDisplayDate}
    />
  );
};
