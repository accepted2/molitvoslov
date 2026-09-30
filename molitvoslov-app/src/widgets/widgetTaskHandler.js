import React from 'react';

import {getDailyQuote} from '../services/dailyQuote';
import {getCalendarDay} from '../services/churchCalendar';
import {getCalendarLanguage} from '../services/calendarPreferences';
import {QuoteOfDayWidget} from './QuoteOfDayWidget';
import {ChurchCalendarWidget} from './ChurchCalendarWidget';

export const widgetTaskHandler = async (props) => {
  const {widgetAction, widgetInfo, renderWidget} = props;

  const shouldRender = [
    'WIDGET_ADDED',
    'WIDGET_UPDATE',
    'WIDGET_RESIZED',
  ].includes(widgetAction);

  if (!shouldRender) {
    return;
  }

  if (widgetInfo.widgetName === 'QuoteOfDay') {
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

  if (widgetInfo.widgetName === 'ChurchCalendar') {
    const language = await getCalendarLanguage();
    let day = null;

    try {
      day = await getCalendarDay(new Date(), {
        language,
        force: true,
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
      />
    );
  }
};
