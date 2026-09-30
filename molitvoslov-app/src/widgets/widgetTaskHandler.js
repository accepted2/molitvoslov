import React from 'react';

import {getDailyQuote} from '../services/dailyQuote';
import {getCalendarDay} from '../services/churchCalendar';
import {getCalendarLanguage} from '../services/calendarPreferences';
import {QuoteOfDayWidget} from './QuoteOfDayWidget';
import {ChurchCalendarWidget} from './ChurchCalendarWidget';

const resolveCalendarDisplayDate = (props) => {
  if (props.widgetAction !== 'WIDGET_CLICK') {
    return new Date();
  }

  if (props.clickAction === 'CALENDAR_TODAY') {
    return new Date();
  }

  if (
    props.clickAction === 'CALENDAR_PREV_MONTH' ||
    props.clickAction === 'CALENDAR_NEXT_MONTH'
  ) {
    const year = Number(props.clickActionData?.year);
    const month = Number(props.clickActionData?.month);

    if (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    ) {
      return new Date(year, month - 1, 1);
    }
  }

  return null;
};

export const widgetTaskHandler = async (props) => {
  const {widgetAction, widgetInfo, renderWidget} = props;

  if (widgetInfo.widgetName === 'QuoteOfDay') {
    const shouldRenderQuote = [
      'WIDGET_ADDED',
      'WIDGET_UPDATE',
      'WIDGET_RESIZED',
    ].includes(widgetAction);

    if (!shouldRenderQuote) {
      return;
    }

    const quote = getDailyQuote();

    renderWidget(
      <QuoteOfDayWidget
        quote={quote}
        width={widgetInfo.width}
        height={widgetInfo.height}
      />
    );
    return;
  }

  if (widgetInfo.widgetName !== 'ChurchCalendar') {
    return;
  }

  const displayDate = resolveCalendarDisplayDate(props);

  const shouldRenderCalendar =
    ['WIDGET_ADDED', 'WIDGET_UPDATE', 'WIDGET_RESIZED'].includes(widgetAction) ||
    Boolean(displayDate);

  if (!shouldRenderCalendar) {
    return;
  }

  const language = await getCalendarLanguage();
  let day = null;

  try {
    day = await getCalendarDay(new Date(), {
      language,
      force: false,
    });
  } catch (error) {
    console.log('Ошибка обновления виджета календаря:', error?.message || error);
  }

  renderWidget(
    <ChurchCalendarWidget
      day={day}
      language={language}
      width={widgetInfo.width}
      height={widgetInfo.height}
      displayDate={displayDate || new Date()}
    />
  );
};
