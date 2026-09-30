'use no memo';

import React from 'react';
import {
  FlexWidget,
  OverlapWidget,
  TextWidget,
} from 'react-native-android-widget';

import {CALENDAR_MONTHS, calendarText} from '../services/calendarPreferences';
import {formatFast} from '../services/churchCalendar';

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

export const ChurchCalendarWidget = ({
  day,
  language = 'ru',
  width = 320,
  height = 150,
}) => {
  const lang = language === 'uk' ? 'uk' : 'ru';
  const copy = calendarText(lang);
  const locale = CALENDAR_MONTHS[lang];
  const today = new Date();
  const cells = buildMonthCells(today);
  const weeks = chunk(cells, 7);
  const compact = Number(height) < 125;
  const feast =
    day?.main_feast?.short_title ||
    day?.main_feast?.title ||
    copy.saintMemory;
  const fast = formatFast(day, lang) || copy.noFastData;

  const horizontalPadding = compact ? 10 : 13;
  const titleSize = compact ? 11 : 12;
  const feastSize = compact ? 11 : 12;
  const calendarNumberSize = compact ? 8 : 9;

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
          paddingVertical: compact ? 9 : 11,
          backgroundColor: '#F4E1C2',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#C79B62',
        }}
      >
        <FlexWidget
          style={{
            flex: 1,
            paddingRight: 10,
            justifyContent: 'space-between',
          }}
        >
          <FlexWidget>
            <TextWidget
              text={copy.calendarTitle}
              allowFontScaling={false}
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
              style={{
                marginTop: 3,
                color: '#2F1E13',
                fontFamily: 'Ponomar',
                fontSize: compact ? 17 : 20,
                lineHeight: compact ? 20 : 23,
                fontWeight: '700',
              }}
            />

            <TextWidget
              text={locale.weekdays[today.getDay()]}
              allowFontScaling={false}
              style={{
                marginTop: 1,
                color: '#8A6547',
                fontFamily: 'Ponomar',
                fontSize: 9,
                lineHeight: 12,
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
                fontSize: 9,
                lineHeight: 12,
              }}
            />
          </FlexWidget>
        </FlexWidget>

        <FlexWidget
          style={{
            width: compact ? 138 : 152,
            paddingLeft: 9,
            borderLeftWidth: 1,
            borderLeftColor: '#D6B88E',
          }}
        >
          <TextWidget
            text={`${locale.nominative[today.getMonth()]} ${today.getFullYear()}`}
            allowFontScaling={false}
            style={{
              width: 'match_parent',
              color: '#5B3A25',
              fontFamily: 'Ponomar',
              fontSize: 10,
              lineHeight: 13,
              fontWeight: '700',
              textAlign: 'center',
            }}
          />

          <FlexWidget
            style={{
              width: 'match_parent',
              flexDirection: 'row',
              marginTop: 4,
            }}
          >
            {locale.miniWeekdays.map((weekday, index) => (
              <TextWidget
                key={weekday}
                text={weekday}
                allowFontScaling={false}
                style={{
                  flex: 1,
                  color: index >= 5 ? '#A05243' : '#8B725E',
                  fontFamily: 'Ponomar',
                  fontSize: 7,
                  lineHeight: 10,
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
                width: 'match_parent',
                flexDirection: 'row',
                marginTop: 1,
              }}
            >
              {week.map((cell, index) => (
                <TextWidget
                  key={`${weekIndex}-${index}`}
                  text={cell.day}
                  allowFontScaling={false}
                  style={{
                    flex: 1,
                    height: compact ? 14 : 16,
                    color: cell.today
                      ? '#FFF7E7'
                      : index >= 5
                        ? '#A05243'
                        : '#493225',
                    backgroundColor: cell.today ? '#A96F35' : '#00000000',
                    borderRadius: cell.today ? 8 : 0,
                    fontFamily: 'Ponomar',
                    fontSize: calendarNumberSize,
                    lineHeight: compact ? 13 : 15,
                    textAlign: 'center',
                    fontWeight: cell.today ? '800' : '500',
                  }}
                />
              ))}
            </FlexWidget>
          ))}
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
};
