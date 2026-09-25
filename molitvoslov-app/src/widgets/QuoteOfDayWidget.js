'use no memo';

import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  TextWidget,
} from 'react-native-android-widget';

const QUOTE_BACKGROUND = require('../../assets/home/page_bg2.png');

export const QuoteOfDayWidget = ({quote, width = 240, height = 100,}) => {
  const text = quote?.text || '';
  const source = quote?.reference || quote?.source || '';

  const widgetWidth = Math.max(Number(width) || 240, 1);
  const widgetHeight = Math.max(Number(height) || 100, 1);

  const compact = widgetHeight < 105;
  const veryCompact = widgetHeight < 82;

  const horizontalPadding = compact ? 10 : 13;
  const verticalPadding = compact ? 5 : 8;

  const headerFontSize =
    veryCompact ? 10 :
      compact ? 12 :
        15;
  // const sourceFontSize = compact ? 8 : 10;

  /*
   * Оставляем фиксированное пространство для:
   * - padding
   * - заголовка
   * - декоративной линии
   * - источника
   *
   * Всё остальное получает сама цитата.
   */
  // const reservedHeight =
  //   verticalPadding * 2 +
  //   (veryCompact ? 14 : compact ? 18 : 22) +
  //   (veryCompact ? 0 : compact ? 6 : 9) +
  //   (source ? (veryCompact ? 10 : compact ? 14 : 17) : 0);
  //
  // const quoteAreaHeight = Math.max(
  //   widgetHeight - reservedHeight,
  //   24
  // );
  const quoteFontSize =
    text.length > 180
      ? veryCompact
        ? 9
        : compact
          ? 11
          : 13
      : text.length > 120
        ? veryCompact
          ? 10
          : compact
            ? 12
            : 14
        : text.length > 80
          ? veryCompact
            ? 11
            : compact
              ? 13
              : 15
          : veryCompact
            ? 12
            : compact
              ? 15
              : 17;

  const quoteLineHeight = quoteFontSize + 4;

  const sourceFontSize =
    veryCompact ? 9 :
      compact ? 10 :
        11;
  const sourceLineHeight = sourceFontSize + 3;

  const usableSourceWidth = Math.max(
    widgetWidth -
    horizontalPadding * 2,
    44
  );

  const sourceCharsPerLine = Math.max(
    Math.floor(
      usableSourceWidth /
      Math.max(
        sourceFontSize * 0.58,
        1
      )
    ),
    12
  );

  const sourceLines = source
    ? Math.min(
        3,
        Math.max(
          1,
          Math.ceil(
            source.length /
            sourceCharsPerLine
          )
        )
      )
    : 0;

  const sourceHeight = sourceLines
    ? sourceLines *
        sourceLineHeight +
      3
    : 0;

  const headerHeight =
    veryCompact ? 0 :
      compact ? 20 :
        26;

  const decorationHeight =
    veryCompact ? 0 :
      compact ? 6 :
        10;

  const availableQuoteHeight = Math.max(
    widgetHeight -
    verticalPadding * 2 -
    headerHeight -
    decorationHeight -
    sourceHeight,
    18
  );

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Цитата дня. Открыть Молитвослов"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#FFF4DE',
      }}
    >
      <ImageWidget
        image={QUOTE_BACKGROUND}
        imageWidth={widgetWidth}
        imageHeight={widgetHeight}
        resizeMode="stretch"
        radius={18}
      />

      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          paddingHorizontal: horizontalPadding,
          paddingTop: verticalPadding,
          paddingBottom: verticalPadding,
          backgroundColor: 'rgba(255, 244, 222, 0.62)',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#7B4F2438',
        }}
      >
        {!veryCompact && (
          <FlexWidget
            style={{
              width: 'match_parent',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text="🪶"
              style={{
                marginRight: 6,
                color: '#A16E35',
                fontSize: headerFontSize,
              }}
            />

            <TextWidget
              text="Цитата дня"
              style={{
                color: '#7A4F2D',
                fontSize: headerFontSize,
                fontWeight: '700',
              }}
            />
          </FlexWidget>
        )}

        {!veryCompact && (
        <FlexWidget
          style={{
            width: compact ? 90 : 120,
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 1,
            marginBottom: compact ? 2 : 4,
          }}
        >
          <FlexWidget
            style={{
              flex: 1,
              height: 1,
              backgroundColor: '#92622F52',
            }}
          />

          <TextWidget
            text="✦"
            style={{
              marginHorizontal: 5,
              color: '#A87943',
              fontSize: 7,
            }}
          />

          <FlexWidget
            style={{
              flex: 1,
              height: 1,
              backgroundColor: '#92622F52',
            }}
          />
        </FlexWidget>
        )}
        <TextWidget
          text={text}
          allowFontScaling={false}
          style={{
            width: 'match_parent',
            height: availableQuoteHeight,
            color: '#3E2A1D',
            fontSize: quoteFontSize,
            // lineHeight: quoteLineHeight,
            fontWeight: '500',
          }}
        />

        {!!source && (
          <TextWidget
            text={source}
            allowFontScaling={false}
            style={{
              marginTop: 2,
              color: '#765238',
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