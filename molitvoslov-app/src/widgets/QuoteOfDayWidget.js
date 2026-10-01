'use no memo';

import React from 'react';
import {FlexWidget, ImageWidget, OverlapWidget, TextWidget} from 'react-native-android-widget';

const QUOTE_BACKGROUND = require('../../assets/home/hero.png');

export const QuoteOfDayWidget = ({quote, width = 240, height = 100}) => {
  const text = quote?.text || '';
  const source = quote?.reference || quote?.source || '';

  const widgetWidth = Math.max(Number(width) || 240, 1);
  const widgetHeight = Math.max(Number(height) || 100, 1);

  // Отступы тоже немного растут вместе с виджетом.
  const horizontalPadding = Math.max(10, Math.min(20, Math.round(widgetWidth * 0.045)));

  const verticalPadding = Math.max(7, Math.min(16, Math.round(widgetHeight * 0.05)));

  /*
   * Базовый размер — 240 × 100.
   * При увеличении площади виджета увеличивается и шрифт.
   */
  const areaScale = Math.sqrt((widgetWidth * widgetHeight) / (240 * 100));

  // Ограничиваем масштаб, чтобы огромный виджет
  // не получил гигантский текст.
  const scale = Math.max(0.85, Math.min(1.85, areaScale));

  // Чем длиннее цитата, тем осторожнее увеличиваем шрифт.
  const textFactor =
    text.length > 190
      ? 0.66
      : text.length > 150
        ? 0.74
        : text.length > 110
          ? 0.84
          : text.length > 75
            ? 0.94
            : 1.08;

  const quoteFontSize = Math.round(Math.max(12, Math.min(28, 15 * scale * textFactor)));

  const quoteLineHeight = Math.round(quoteFontSize * 1.22);

  const sourceFontSize = Math.round(Math.max(9, Math.min(14, quoteFontSize * 0.58)));

  const sourceLineHeight = sourceFontSize + 3;

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Цитата дня. Открыть Молитвослов"
      style={{
        width: 'match_parent',
        height: 'match_parent',

        borderRadius: 18,
        overflow: 'hidden',

        backgroundColor: '#3D2416',
      }}
    >
      <ImageWidget
        image={QUOTE_BACKGROUND}
        imageWidth={widgetWidth}
        imageHeight={widgetHeight}
        resizeMode="cover"
        radius={18}
      />

      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',

          paddingHorizontal: horizontalPadding,
          paddingTop: verticalPadding,
          paddingBottom: verticalPadding,

          backgroundColor: 'rgba(52, 30, 17, 0.42)',

          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#D7A45E40',
        }}
      >
        <FlexWidget
          style={{
            flex: 1,
            width: 'match_parent',
            fontFamily: 'Ponomar-Regular',
            justifyContent: 'center',
          }}
        >
          <TextWidget
            text={text}
            allowFontScaling={false}
            style={{
              width: 'match_parent',
              color: '#F8E7C5',
              fontFamily: 'Ponomar-Regular',
              fontSize: quoteFontSize,
              lineHeight: quoteLineHeight,
              fontWeight: '500',
            }}
          />
        </FlexWidget>

        {!!source && (
          <TextWidget
            text={source}
            allowFontScaling={false}
            style={{
              marginTop: 4,
              color: '#E5C58F',
              fontFamily: 'Ponomar-Regular',
              fontSize: sourceFontSize,
              lineHeight: sourceLineHeight,

              fontWeight: '500',
            }}
          />
        )}
      </FlexWidget>
    </OverlapWidget>
  );
};
