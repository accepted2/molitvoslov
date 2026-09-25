import React from 'react';

import {getDailyQuote} from '../services/dailyQuote';
import {QuoteOfDayWidget} from './QuoteOfDayWidget';

export const widgetTaskHandler = async props => {
  const {
    widgetAction,
    widgetInfo,
    renderWidget,
  } = props;

  if (widgetInfo.widgetName !== 'QuoteOfDay') {
    return;
  }

  const renderQuote = () => {
    const quote = getDailyQuote();

    renderWidget(
      <QuoteOfDayWidget
        quote={quote}
        width={widgetInfo.width}
        height={widgetInfo.height}
      />
    );
  };

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      renderQuote();
      break;

    case 'WIDGET_DELETED':
      break;

    default:
      break;
  }
};