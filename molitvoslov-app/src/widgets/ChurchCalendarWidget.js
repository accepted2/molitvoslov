'use no memo';

import React from 'react';
import {FlexWidget, OverlapWidget, TextWidget} from 'react-native-android-widget';

import {CALENDAR_MONTHS, calendarText} from '../services/calendarPreferences';
import {formatFast} from '../services/churchCalendar';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildMonthCells = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = firstWeekday + daysInMonth <= 35 ? 35 : 42;

  return Array.from({length: total}, (_item, index) => {
    const day = index - firstWeekday + 1;

    if (day < 1 || day > daysInMonth) {
      return {day: '', today: false};
    }

    return {
      day: String(day),
      today: day === date.getDate(),
    };
  });
};

const chunk = (items, size) => {
  const rows = [];

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }

  return rows;
};

export const ChurchCalendarWidget = ({day, language = 'ru', width = 320, height = 150}) => {
  const lang = language === 'uk' ? 'uk' : 'ru';
  const copy = calendarText(lang);
  const locale = CALENDAR_MONTHS[lang];
  const today = new Date();
  const cells = buildMonthCells(today);
  const weeks = chunk(cells, 7);

  const widgetWidth = Number(width) || 320;
  const widgetHeight = Number(height) || 150;
  const compact = widgetHeight < 145;
  const narrow = widgetWidth < 285;

  const feast = day?.main_feast?.short_title || day?.main_feast?.title || copy.saintMemory;
  const fast = formatFast(day, lang) || copy.noFastData;

  const horizontalPadding = compact ? 9 : 12;
  const verticalPadding = compact ? 8 : 10;
  const titleSize = compact ? 10 : 11;
  const feastSize = compact ? 10 : 11;
  const dateSize = compact ? 17 : 19;

  /*
   * Android home-screen widgets are rendered through RemoteViews/image output.
   * flex: 1 on seven tiny TextWidgets is not reliable on every launcher:
   * some launchers squeeze all weekday labels and dates into the left edge.
   *
   * Use explicit cell widths so the seven calendar columns always keep
   * their geometry regardless of the launcher-reported widget size.
   */
  const desiredCalendarWidth = clamp(
    Math.round(widgetWidth * (narrow ? 0.4 : 0.36)),
    narrow ? 102 : 108,
    compact ? 124 : 136
  );
  const panelInset = 8;
  const cellWidth = Math.max(14, Math.floor((desiredCalendarWidth - panelInset) / 7));
  const gridWidth = cellWidth * 7;
  const calendarPanelWidth = gridWidth + panelInset;
  const weekdayHeight = compact ? 9 : 10;
  const rowHeight = compact ? 13 : 15;
  const calendarNumberSize = compact ? 7 : 8;
  const todayBubbleSize = compact ? 12 : 14;

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      accessibilityLabel={copy.widgetName}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#F4E1C2',
      }}
    >
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'row',
          paddingHorizontal: horizontalPadding,
          paddingVertical: verticalPadding,
          backgroundColor: '#F4E1C2',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#C79B62',
        }}
      >
        <FlexWidget
          style={{
            flex: 1,
            minWidth: 0,
            paddingRight: compact ? 7 : 9,
            justifyContent: 'space-between',
          }}
        >
          <FlexWidget>
            <TextWidget
              text={copy.calendarTitle}
              allowFontScaling={false}
              maxLines={1}
              style={{
                color: '#6A4328',
                fontFamily: 'Ponomar',
                fontSize: titleSize,
                lineHeight: titleSize + 3,
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={`${today.getDate()} ${locale.genitive[today.getMonth()]}`}
              allowFontScaling={false}
              maxLines={1}
              style={{
                marginTop: 3,
                color: '#2F1E13',
                fontFamily: 'Ponomar',
                fontSize: dateSize,
                lineHeight: dateSize + 3,
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={locale.weekdays[today.getDay()]}
              allowFontScaling={false}
              maxLines={1}
              style={{
                marginTop: 1,
                color: '#8A6547',
                fontFamily: 'Ponomar',
                fontSize: 9,
                lineHeight: 11,
              }}
            />
          </FlexWidget>

          <FlexWidget>
            <TextWidget
              text={feast}
              allowFontScaling={false}
              maxLines={compact ? 2 : 3}
              style={{
                color: '#4A3020',
                fontFamily: 'Ponomar',
                fontSize: feastSize,
                lineHeight: feastSize + 4,
                fontWeight: '600',
              }}
            />

            <TextWidget
              text={fast}
              allowFontScaling={false}
              maxLines={1}
              style={{
                marginTop: 3,
                color: '#7B593F',
                fontFamily: 'Ponomar',
                fontSize: 8,
                lineHeight: 11,
              }}
            />
          </FlexWidget>
        </FlexWidget>

        <FlexWidget
          style={{
            width: calendarPanelWidth,
            paddingLeft: panelInset,
            borderLeftWidth: 1,
            borderLeftColor: '#D6B88E',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text={`${locale.nominative[today.getMonth()]} ${today.getFullYear()}`}
            allowFontScaling={false}
            maxLines={1}
            style={{
              width: gridWidth,
              color: '#5B3A25',
              fontFamily: 'Ponomar',
              fontSize: compact ? 8 : 9,
              lineHeight: compact ? 11 : 12,
              fontWeight: '700',
              textAlign: 'center',
            }}
          />

          <FlexWidget
            style={{
              width: gridWidth,
              flexDirection: 'row',
              marginTop: compact ? 2 : 3,
            }}
          >
            {locale.miniWeekdays.map((weekday, index) => (
              <TextWidget
                key={`weekday-${index}`}
                text={weekday}
                allowFontScaling={false}
                maxLines={1}
                style={{
                  width: cellWidth,
                  height: weekdayHeight,
                  color: index >= 5 ? '#A05243' : '#8B725E',
                  fontFamily: 'Ponomar',
                  fontSize: compact ? 5 : 6,
                  lineHeight: weekdayHeight,
                  textAlign: 'center',
                  fontWeight: '700',
                }}
              />
            ))}
          </FlexWidget>

          {weeks.map((week, weekIndex) => (
            <FlexWidget
              key={`week-${weekIndex}`}
              style={{
                width: gridWidth,
                height: rowHeight,
                flexDirection: 'row',
              }}
            >
              {week.map((cell, index) => (
                <FlexWidget
                  key={`${weekIndex}-${index}`}
                  style={{
                    width: cellWidth,
                    height: rowHeight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TextWidget
                    text={cell.day}
                    allowFontScaling={false}
                    maxLines={1}
                    style={{
                      width: cell.today ? todayBubbleSize : cellWidth,
                      height: rowHeight,
                      color: cell.today ? '#FFF7E7' : index >= 5 ? '#A05243' : '#493225',
                      backgroundColor: cell.today ? '#A96F35' : '#00000000',
                      borderRadius: cell.today ? todayBubbleSize / 2 : 0,
                      fontFamily: 'Ponomar',
                      fontSize: calendarNumberSize,
                      lineHeight: rowHeight,
                      textAlign: 'center',
                      fontWeight: cell.today ? '800' : '500',
                    }}
                  />
                </FlexWidget>
              ))}
            </FlexWidget>
          ))}
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
};
