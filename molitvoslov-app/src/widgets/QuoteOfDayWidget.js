'use no memo';

import React from 'react';
import {FlexWidget, ImageWidget, OverlapWidget, TextWidget} from 'react-native-android-widget';
import {FONT, clamp, fitText, getScale, readSize} from './widgetLayout';

// Keep the established bundled background in GitHub. A smaller JPEG from
// the supplied archive can replace this image when imported locally.
const BACKGROUND = require('../../assets/home/hero.png');
const BASE = {width: 240, height: 100};

export const QuoteOfDayWidget = ({quote, width, height}) => {
  const size = readSize(width, height, BASE);
  const scale = getScale(size, BASE, 0.85, 1.7);
  const text = String(quote?.text || '').trim();
  const source = String(quote?.reference || quote?.source || '').trim();

  const padH = Math.round(clamp(size.width * 0.05, 8, 22));
  const padV = Math.round(clamp(size.height * 0.07, 4, 18));
  const innerW = Math.max(1, size.width - padH * 2 - 2);
  const innerH = Math.max(1, size.height - padV * 2 - 2);
  const sourceFont = Math.round(clamp(11 * scale, 9, 15));
  const sourceBlock = sourceFont + 8;
  // On a 1-row widget the quotation has priority over its attribution.
  const showSource = !!source && innerH - sourceBlock >= 28;
  const availableQuoteH = innerH - (showSource ? sourceBlock : 0);
  const fit = fitText({
    text: text || '«Господи, научи меня…»',
    maxWidth: innerW,
    maxHeight: availableQuoteH,
    maxFont: clamp(Math.round(17 * scale), 12, 30),
    minFont: 11,
  });

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Цитата дня. Открыть Молитвослов"
      style={{
        width: 'match_parent', height: 'match_parent',
        borderRadius: 18, overflow: 'hidden', backgroundColor: '#3D2416',
      }}
    >
      <ImageWidget
        image={BACKGROUND}
        imageWidth={size.width}
        imageHeight={size.height}
        resizeMode="cover"
        radius={18}
      />
      <FlexWidget style={{
        width: 'match_parent', height: 'match_parent',
        paddingHorizontal: padH, paddingVertical: padV,
        backgroundColor: 'rgba(52, 30, 17, 0.42)',
        borderRadius: 18, borderWidth: 1, borderColor: '#D7A45E40',
      }}>
        <FlexWidget style={{
          width: 'match_parent',
          height: availableQuoteH,
          justifyContent: 'center',
        }}>
          <TextWidget
            text={text || '«Господи, научи меня…»'}
            allowFontScaling={false}
            maxLines={fit.maxLines}
            style={{
              width: innerW, color: '#F8E7C5',
              fontFamily: FONT, fontSize: fit.fontSize, lineHeight: fit.lineHeight,
            }}
          />
        </FlexWidget>
        {showSource ? (
          <TextWidget
            text={source}
            allowFontScaling={false}
            maxLines={1}
            style={{
              width: innerW, marginTop: 4,
              color: '#E5C58F', fontFamily: FONT,
              fontSize: sourceFont, lineHeight: sourceFont + 4,
            }}
          />
        ) : null}
      </FlexWidget>
    </OverlapWidget>
  );
};
