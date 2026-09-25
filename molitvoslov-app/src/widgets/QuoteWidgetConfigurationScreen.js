import React, {useEffect} from 'react';
import {View} from 'react-native';
import {getWidgetInfo} from 'react-native-android-widget';

import {getDailyQuote} from '../services/dailyQuote';
import {QuoteOfDayWidget} from './QuoteOfDayWidget';

export const QuoteWidgetConfigurationScreen = ({
                                                 widgetInfo,
                                                 renderWidget,
                                                 setResult,
                                               }) => {
  useEffect(() => {
    const configure = async () => {
      try {
        const widgets = await getWidgetInfo('QuoteOfDay');

        const anotherWidgetExists = widgets.some(
          item => item.widgetId !== widgetInfo.widgetId
        );

        if (anotherWidgetExists) {
          setResult('cancel');
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

        setResult('ok');
      } catch (err) {
        console.log('Ошибка настройки виджета:', err);
        setResult('cancel');
      }
    };

    configure();
  }, [
    renderWidget,
    setResult,
    widgetInfo.height,
    widgetInfo.widgetId,
    widgetInfo.width,
  ]);

  return <View style={{flex: 1}} />;
};