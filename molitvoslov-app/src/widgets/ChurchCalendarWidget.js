'use no memo';

import React from 'react';
import {FlexWidget, ImageWidget, OverlapWidget, TextWidget} from 'react-native-android-widget';

import {CALENDAR_MONTHS, calendarText} from '../services/calendarPreferences';
import {formatFast} from '../services/churchCalendar';
import {getBundledCalendarIconSource} from '../data/calendarIconAssets';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildMonthCells = (date, today, selectedDate) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = firstWeekday + daysInMonth <= 35 ? 35 : 42;

  return Array.from({length: total}, (_item, index) => {
    const day = index - firstWeekday + 1;

    if (day < 1 || day > daysInMonth) {
      return {
        day: '',
        date: null,
        today: false,
        selected: false,
      };
    }

    const dateKey =
      `${year}-` + `${String(month + 1).padStart(2, '0')}-` + `${String(day).padStart(2, '0')}`;

    return {
      day: String(day),
      date: dateKey,

      today: day === today.getDate() && month === today.getMonth() && year === today.getFullYear(),

      selected:
        day === selectedDate.getDate() &&
        month === selectedDate.getMonth() &&
        year === selectedDate.getFullYear(),
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

const shiftMonth = (date, delta) => new Date(date.getFullYear(), date.getMonth() + delta, 1);

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
    displayDate instanceof Date && !Number.isNaN(displayDate.getTime()) ? displayDate : today;

  const selectedDate = day?.date_gregorian ? new Date(`${day.date_gregorian}T12:00:00`) : today;

  const selectedDateKey =
    `${selectedDate.getFullYear()}-` +
    `${String(selectedDate.getMonth() + 1).padStart(2, '0')}-` +
    `${String(selectedDate.getDate()).padStart(2, '0')}`;

  const previousMonth = shiftMonth(shownDate, -1);
  const nextMonth = shiftMonth(shownDate, 1);
  const cells = buildMonthCells(shownDate, today, selectedDate);
  const weeks = chunk(cells, 7);

  const widgetWidth = Number(width) || 320;
  const widgetHeight = Number(height) || 150;

  const tiny = widgetHeight < 125 || widgetWidth < 255;
  const roomy = widgetHeight >= 185 && widgetWidth >= 300;
  const large = widgetHeight >= 215 || widgetWidth >= 360;

  const feast = day?.main_feast?.short_title || day?.main_feast?.title || copy.saintMemory;
  const fast = formatFast(day, lang) || copy.noFastData;
  const bundledIconSource = getBundledCalendarIconSource(day?.main_feast);
  const iconSource =
    typeof bundledIconSource === 'number' ? bundledIconSource : bundledIconSource?.uri || null;

  const gospel = day?.gospel_title || '—';
  const apostle = day?.apostolic_title || '—';

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
  const rowHeight = Math.max(tiny ? 11 : 14, Math.floor(availableRowsHeight / weeks.length));
  const dayBubbleSize = Math.min(cellWidth, rowHeight, large ? 24 : 20);

  const titleSize = tiny ? 8 : large ? 11 : 10;

  const dateSize = tiny ? 9 : large ? 13 : 11;
  const weekdaySize = tiny ? 8 : large ? 11 : 9;

  const feastSize = tiny ? 9 : large ? 13 : 11;
  const infoLabelSize = tiny ? 7 : large ? 9 : 8;
  const infoTextSize = tiny ? 8 : large ? 11 : 10;
  const monthSize = tiny ? 9 : large ? 13 : 11;
  const numberSize = tiny ? 7 : large ? 12 : 10;
  const weekdayHeaderSize = tiny ? 6 : large ? 9 : 8;
  const arrowSize = tiny ? 15 : large ? 22 : 19;
  const saintImageWidth = tiny ? 28 : large ? 44 : 36;
  const saintImageHeight = tiny ? 38 : large ? 60 : 50;

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
          flexGap: gap,
          backgroundColor: '#F6E3C3',
          borderRadius: 22,
          borderWidth: 1,
          borderColor: '#C99A5B',
        }}
      >
        <FlexWidget
          style={{
            flex: 1,
            minWidth: 0,
            height: 'match_parent',
            justifyContent: 'flex-start',
            paddingRight: tiny ? 2 : 4,
          }}
        >
          {/* Заголовок */}
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

          {/* Дата + день недели в одну строку */}
          <FlexWidget
            style={{
              marginTop: tiny ? 1 : 3,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <TextWidget
              text={`${selectedDate.getDate()} ${locale.genitive[selectedDate.getMonth()]}`}
              allowFontScaling={false}
              maxLines={1}
              style={{
                flex: 1,
                color: '#2D1C12',
                fontFamily: 'Ponomar',
                fontSize: dateSize,
                lineHeight: dateSize + 4,
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={locale.weekdays[selectedDate.getDay()]}
              allowFontScaling={false}
              maxLines={1}
              style={{
                marginLeft: 12,
                color: '#765A44',
                fontFamily: 'Ponomar',
                fontSize: weekdaySize,
                lineHeight: weekdaySize + 4,
                textAlign: 'right',
              }}
            />
          </FlexWidget>

          {/* Икона + святой */}
          <FlexWidget
            style={{
              marginTop: tiny ? 3 : 5,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {iconSource ? (
              <ImageWidget
                image={iconSource}
                imageWidth={saintImageWidth}
                imageHeight={saintImageHeight}
                radius={7}
                resizeMode="cover"
                style={{
                  marginRight: tiny ? 4 : 7,
                }}
              />
            ) : (
              <FlexWidget
                style={{
                  width: saintImageWidth,
                  height: saintImageHeight,
                  marginRight: tiny ? 4 : 7,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 7,
                  backgroundColor: '#E7C897',
                }}
              >
                <TextWidget
                  text="☦"
                  allowFontScaling={false}
                  style={{
                    color: '#8B572D',
                    fontFamily: 'Ponomar',
                    fontSize: tiny ? 16 : large ? 22 : 19,
                    lineHeight: tiny ? 19 : large ? 26 : 23,
                  }}
                />
              </FlexWidget>
            )}

            <FlexWidget
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <TextWidget
                text={feast}
                allowFontScaling={false}
                maxLines={tiny ? 2 : large ? 4 : 3}
                style={{
                  color: '#40291A',
                  fontFamily: 'Ponomar',
                  fontSize: feastSize,
                  lineHeight: feastSize + 3,
                  fontWeight: '700',
                }}
              />
            </FlexWidget>
          </FlexWidget>

          {/* Пост */}

          <FlexWidget
            style={{
              marginTop: tiny ? 3 : 5,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text={lang === 'uk' ? 'ПІСТ' : 'ПОСТ'}
              allowFontScaling={false}
              maxLines={1}
              style={{
                width: tiny ? 30 : 38,
                color: '#A46D38',
                fontFamily: 'Ponomar-Regular',
                fontSize: infoLabelSize,
                lineHeight: infoTextSize + 3,
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={fast}
              allowFontScaling={false}
              maxLines={1}
              style={{
                flex: 1,
                minWidth: 0,
                color: '#6C4A34',
                fontFamily: 'Ponomar-Regular',
                fontSize: infoTextSize,
                lineHeight: infoTextSize + 3,
              }}
            />
          </FlexWidget>

          {/* Евангелие */}
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{
              uri: `molitvoslov://calendar/${selectedDateKey}?section=gospel`,
            }}
            style={{
              marginTop: tiny ? 2 : 3,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text={lang === 'uk' ? 'ЄВ.' : 'ЕВ.'}
              allowFontScaling={false}
              maxLines={1}
              style={{
                width: tiny ? 30 : 38,
                color: '#A46D38',
                fontFamily: 'Ponomar-Regular',
                fontSize: infoLabelSize,
                lineHeight: infoTextSize + 3,
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={gospel}
              allowFontScaling={false}
              maxLines={1}
              style={{
                flex: 1,
                minWidth: 0,
                color: '#4D3424',
                fontFamily: 'Ponomar-Regular',
                fontSize: infoTextSize,
                lineHeight: infoTextSize + 3,
              }}
            />
            <TextWidget
              text="›"
              allowFontScaling={false}
              style={{
                marginLeft: 3,
                color: '#8B5B30',
                fontFamily: 'Ponomar-Regular',
                fontSize: infoTextSize + 3,
                lineHeight: infoTextSize + 4,
                fontWeight: '700',
              }}
            />
          </FlexWidget>

          {/* Апостол */}
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{
              uri: `molitvoslov://calendar/${selectedDateKey}?section=apostle`,
            }}
            style={{
              marginTop: tiny ? 2 : 3,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text={lang === 'uk' ? 'АП.' : 'АП.'}
              allowFontScaling={false}
              maxLines={1}
              style={{
                width: tiny ? 30 : 38,
                color: '#A46D38',
                fontFamily: 'Ponomar-Regular',
                fontSize: infoLabelSize,
                lineHeight: infoTextSize + 3,
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={apostle}
              allowFontScaling={false}
              maxLines={1}
              style={{
                flex: 1,
                minWidth: 0,
                color: '#4D3424',
                fontFamily: 'Ponomar-Regular',
                fontSize: infoTextSize,
                lineHeight: infoTextSize + 3,
              }}
            />
            <TextWidget
              text="›"
              allowFontScaling={false}
              style={{
                marginLeft: 3,
                color: '#8B5B30',
                fontFamily: 'Ponomar-Regular',
                fontSize: infoTextSize + 3,
                lineHeight: infoTextSize + 4,
                fontWeight: '700',
              }}
            />
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
                  clickAction={cell.date ? 'CALENDAR_SELECT_DAY' : undefined}
                  clickActionData={
                    cell.date
                      ? {
                          date: cell.date,
                        }
                      : undefined
                  }
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
                      width: cell.selected || cell.today ? dayBubbleSize : cellWidth,

                      height: cell.selected || cell.today ? dayBubbleSize : rowHeight,

                      color: cell.selected
                        ? '#FFF8EA'
                        : cell.today
                          ? '#8A572D'
                          : index >= 5
                            ? '#A24C40'
                            : '#493225',

                      backgroundColor: cell.selected ? '#B97A32' : '#00000000',

                      borderWidth: cell.today && !cell.selected ? 1 : 0,

                      borderColor: '#B97A32',

                      borderRadius: cell.selected || cell.today ? dayBubbleSize / 2 : 0,

                      fontFamily: 'Ponomar-Regular',
                      fontSize: numberSize,

                      lineHeight: cell.selected || cell.today ? dayBubbleSize : rowHeight,

                      textAlign: 'center',

                      fontWeight: cell.selected || cell.today ? '800' : '500',
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
