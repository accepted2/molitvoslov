'use no memo';

import React from 'react';
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  TextWidget,
} from 'react-native-android-widget';

import {CALENDAR_MONTHS, calendarText} from '../services/calendarPreferences';
import {formatFast} from '../services/churchCalendar';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildMonthCells = (date, today) => {
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
      today:
        day === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear(),
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

const shiftMonth = (date, delta) =>
  new Date(date.getFullYear(), date.getMonth() + delta, 1);

export const ChurchCalendarWidget = ({
  day,
  language = 'ru',
  width = 320,
  height = 150,
  displayDate,
}) => {
  const lang = language === 'uk' ? 'uk' : 'ru';
  const copy = calendarText(lang);
  const locale = CALENDAR_MONTHS[lang];

  const today = new Date();
  const shownDate =
    displayDate instanceof Date && !Number.isNaN(displayDate.getTime())
      ? displayDate
      : today;

  const previousMonth = shiftMonth(shownDate, -1);
  const nextMonth = shiftMonth(shownDate, 1);
  const cells = buildMonthCells(shownDate, today);
  const weeks = chunk(cells, 7);

  const widgetWidth = Number(width) || 320;
  const widgetHeight = Number(height) || 150;

  const tiny = widgetHeight < 125 || widgetWidth < 255;
  const roomy = widgetHeight >= 185 && widgetWidth >= 300;
  const large = widgetHeight >= 215 || widgetWidth >= 360;

  const feast =
    day?.main_feast?.short_title ||
    day?.main_feast?.title ||
    copy.saintMemory;
  const fast = formatFast(day, lang) || copy.noFastData;
  const iconUrl = day?.main_feast?.icon_url || '';

  const outerPadding = tiny ? 8 : roomy ? 12 : 10;
  const gap = tiny ? 6 : 9;

  const calendarPanelWidth = clamp(
    Math.round(widgetWidth * (tiny ? 0.43 : roomy ? 0.45 : 0.44)),
    tiny ? 104 : 124,
    large ? 176 : 158
  );

  const innerCalendarWidth = calendarPanelWidth - (tiny ? 8 : 12);
  const cellWidth = Math.max(14, Math.floor(innerCalendarWidth / 7));
  const gridWidth = cellWidth * 7;

  const monthHeaderHeight = tiny ? 22 : large ? 30 : 26;
  const weekdayHeight = tiny ? 10 : large ? 14 : 12;
  const availableRowsHeight = Math.max(
    56,
    widgetHeight - outerPadding * 2 - monthHeaderHeight - weekdayHeight - 8
  );
  const rowHeight = clamp(
    Math.floor(availableRowsHeight / weeks.length),
    tiny ? 11 : 14,
    large ? 22 : 19
  );

  const titleSize = tiny ? 9 : large ? 13 : 11;
  const dateSize = tiny ? 18 : large ? 30 : 24;
  const weekdaySize = tiny ? 8 : large ? 11 : 9;
  const feastSize = tiny ? 9 : large ? 14 : 12;
  const fastSize = tiny ? 7 : large ? 10 : 9;
  const monthSize = tiny ? 8 : large ? 12 : 10;
  const numberSize = tiny ? 7 : large ? 11 : 9;
  const weekdayHeaderSize = tiny ? 5 : large ? 8 : 7;
  const arrowSize = tiny ? 15 : large ? 22 : 19;
  const saintImageSize = tiny ? 30 : large ? 48 : 40;

  return (
    <OverlapWidget
      accessibilityLabel={copy.widgetName}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: '#F6E3C3',
      }}
    >
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'row',
          padding: outerPadding,
          gap,
          backgroundColor: '#F6E3C3',
          borderRadius: 22,
          borderWidth: 1,
          borderColor: '#C99A5B',
        }}
      >
        <FlexWidget
          clickAction="OPEN_APP"
          style={{
            flex: 1,
            minWidth: 0,
            height: 'match_parent',
            justifyContent: 'space-between',
            paddingRight: tiny ? 2 : 4,
          }}
        >
          <FlexWidget>
            <TextWidget
              text={copy.calendarTitle}
              allowFontScaling={false}
              maxLines={1}
              style={{
                color: '#7B512F',
                fontFamily: 'Ponomar',
                fontSize: titleSize,
                lineHeight: titleSize + 4,
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={`${today.getDate()} ${locale.genitive[today.getMonth()]}`}
              allowFontScaling={false}
              maxLines={1}
              style={{
                marginTop: tiny ? 1 : 3,
                color: '#2D1C12',
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
                color: '#765A44',
                fontFamily: 'Ponomar',
                fontSize: weekdaySize,
                lineHeight: weekdaySize + 4,
              }}
            />
          </FlexWidget>

          <FlexWidget
            style={{
              marginTop: tiny ? 3 : 7,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {!tiny && iconUrl ? (
              <ImageWidget
                image={iconUrl}
                imageWidth={saintImageSize}
                imageHeight={saintImageSize}
                radius={Math.round(saintImageSize * 0.2)}
                resizeMode="cover"
                style={{marginRight: 7}}
              />
            ) : !tiny ? (
              <FlexWidget
                style={{
                  width: saintImageSize,
                  height: saintImageSize,
                  marginRight: 7,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: Math.round(saintImageSize * 0.2),
                  backgroundColor: '#E7C897',
                }}
              >
                <TextWidget
                  text="☦"
                  allowFontScaling={false}
                  style={{
                    color: '#8B572D',
                    fontFamily: 'Ponomar',
                    fontSize: large ? 24 : 20,
                    lineHeight: large ? 28 : 24,
                  }}
                />
              </FlexWidget>
            ) : null}

            <FlexWidget style={{flex: 1, minWidth: 0}}>
              <TextWidget
                text={feast}
                allowFontScaling={false}
                maxLines={tiny ? 2 : large ? 4 : 3}
                style={{
                  color: '#40291A',
                  fontFamily: 'Ponomar',
                  fontSize: feastSize,
                  lineHeight: feastSize + 4,
                  fontWeight: '700',
                }}
              />

              <TextWidget
                text={fast}
                allowFontScaling={false}
                maxLines={tiny ? 1 : 2}
                style={{
                  marginTop: tiny ? 1 : 4,
                  color: '#806147',
                  fontFamily: 'Ponomar',
                  fontSize: fastSize,
                  lineHeight: fastSize + 4,
                }}
              />
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>

        <FlexWidget
          style={{
            width: calendarPanelWidth,
            height: 'match_parent',
            paddingLeft: tiny ? 7 : 10,
            borderLeftWidth: 1,
            borderLeftColor: '#D5B487',
            alignItems: 'center',
          }}
        >
          <FlexWidget
            style={{
              width: gridWidth,
              height: monthHeaderHeight,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text="‹"
              clickAction="CALENDAR_PREV_MONTH"
              clickActionData={{
                year: previousMonth.getFullYear(),
                month: previousMonth.getMonth() + 1,
              }}
              allowFontScaling={false}
              style={{
                width: cellWidth,
                color: '#8A5B31',
                fontFamily: 'Ponomar',
                fontSize: arrowSize,
                lineHeight: monthHeaderHeight,
                textAlign: 'center',
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={`${locale.nominative[shownDate.getMonth()]} ${shownDate.getFullYear()}`}
              clickAction="CALENDAR_TODAY"
              allowFontScaling={false}
              maxLines={1}
              style={{
                width: gridWidth - cellWidth * 2,
                color: '#4C3020',
                fontFamily: 'Ponomar',
                fontSize: monthSize,
                lineHeight: monthHeaderHeight,
                fontWeight: '700',
                textAlign: 'center',
              }}
            />

            <TextWidget
              text="›"
              clickAction="CALENDAR_NEXT_MONTH"
              clickActionData={{
                year: nextMonth.getFullYear(),
                month: nextMonth.getMonth() + 1,
              }}
              allowFontScaling={false}
              style={{
                width: cellWidth,
                color: '#8A5B31',
                fontFamily: 'Ponomar',
                fontSize: arrowSize,
                lineHeight: monthHeaderHeight,
                textAlign: 'center',
                fontWeight: '700',
              }}
            />
          </FlexWidget>

          <FlexWidget
            style={{
              width: gridWidth,
              height: weekdayHeight,
              flexDirection: 'row',
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
                  color: index >= 5 ? '#A24C40' : '#8A7462',
                  fontFamily: 'Ponomar',
                  fontSize: weekdayHeaderSize,
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
                      width: Math.min(cellWidth, rowHeight),
                      height: rowHeight,
                      color: cell.today
                        ? '#FFF8EA'
                        : index >= 5
                          ? '#A24C40'
                          : '#493225',
                      backgroundColor: cell.today ? '#B97A32' : '#00000000',
                      borderRadius: cell.today
                        ? Math.floor(Math.min(cellWidth, rowHeight) / 2)
                        : 0,
                      fontFamily: 'Ponomar',
                      fontSize: numberSize,
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
