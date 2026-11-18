'use no memo';

import React from 'react';
import {FlexWidget, ImageWidget, OverlapWidget, TextWidget} from 'react-native-android-widget';
import {CALENDAR_MONTHS, calendarText} from '../services/calendarPreferences';
import {formatFast, getCalendarDayAppearance} from '../services/churchCalendar';
import {getBundledCalendarIconSource} from '../data/calendarIconAssets';
import {FONT, clamp, fitOneLine, fitText, getScale, readSize, textWidth} from './widgetLayout';
import {parseDateKey, parseMonthKey, toDateKey} from './widgetState';

const BASE = {width: 320, height: 150};
const ROWS = 6;
const BORDER = 1;
const MIN_CELL = 15;
const APPEARANCE_BG = {
  fast: '#A78AB9',
  feast: '#ECD2A2',
  easter: '#ECD2A2',
  solid: '#DEE4CB',
  memorial: '#DECDD1',
};

const buildWeeks = (year, month, todayKey, selectedKey, monthDays = []) => {
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const markers = new Map(monthDays.map(day => [day.date_gregorian, day]));
  const weeks = [];
  for (let row = 0; row < ROWS; row++) {
    const week = [];
    for (let col = 0; col < 7; col++) {
      const day = row * 7 + col - first + 1;
      if (day < 1 || day > count) {
        week.push({day: '', date: null, selected: false, today: false, appearance: null});
        continue;
      }
      const date = toDateKey(new Date(year, month, day));
      week.push({
        day: String(day),
        date,
        selected: date === selectedKey,
        today: date === todayKey,
        appearance: getCalendarDayAppearance(markers.get(date)),
      });
    }
    weeks.push(week);
  }
  return weeks;
};

export const ChurchCalendarWidget = ({
  day,
  monthDays = [],
  language = 'ru',
  width,
  height,
  monthKey,
  selectedKey,
}) => {
  const lang = language === 'uk' ? 'uk' : 'ru';
  const locale = CALENDAR_MONTHS[lang];
  const copy = calendarText(lang);
  const now = new Date();
  const currentKey = toDateKey(now);
  const selectedDate = parseDateKey(selectedKey) || now;
  const effectiveSelected = toDateKey(selectedDate);
  const shown = parseMonthKey(monthKey) || {
    year: selectedDate.getFullYear(),
    month: selectedDate.getMonth() + 1,
  };
  const shownMonth = shown.month - 1;
  const shownYear = shown.year;
  const weeks = buildWeeks(shownYear, shownMonth, currentKey, effectiveSelected, monthDays);

  const size = readSize(width, height, BASE);
  const W = size.width, H = size.height;
  const scale = getScale(size, BASE, 0.8, 1.5);
  const pad = Math.round(clamp(10 * scale, 7, 14));
  const gap = Math.round(clamp(8 * scale, 5, 12));
  const contentH = Math.max(1, H - pad * 2 - BORDER * 2);
  const panelPadLeft = Math.round(clamp(8 * scale, 5, 12));

  // Protect both columns even on launchers that report unexpectedly narrow
  // widget dimensions. The calendar grid retains 7 equal columns.
  const idealPanel = Math.round(W * 0.46);
  const maximumPanel = Math.max(7 * MIN_CELL + panelPadLeft + 1,
    Math.min(240, W - pad * 2 - gap - 85));
  const panelW = clamp(idealPanel, 7 * MIN_CELL + panelPadLeft + 1, maximumPanel);
  const leftW = Math.max(1, W - 2 * BORDER - 2 * pad - gap - panelW);
  const cellW = Math.max(MIN_CELL, Math.floor((panelW - panelPadLeft - 1) / 7));
  const gridW = cellW * 7;

  const monthHeaderH = Math.round(clamp(22 * scale, 16, 30));
  const showWeekdays = contentH >= 110;
  const weekdayH = showWeekdays ? Math.round(clamp(11 * scale, 9, 15)) : 0;
  const availableRowH = Math.max(1, contentH - monthHeaderH - weekdayH);
  const rowH = Math.max(1, Math.floor(availableRowH / ROWS));
  const dayFont = Math.round(clamp(Math.min(rowH, cellW) * 0.58, 7, 15));
  const bubble = Math.max(6, Math.min(cellW - 2, rowH - 1, 26));
  const weekdayFont = Math.round(clamp(weekdayH * 0.72, 7, 11));
  const arrowW = Math.round(cellW * 1.4);

  const monthTitle = fitOneLine({
    candidates: [
      locale.nominative[shownMonth] + ' ' + shownYear,
      locale.nominative[shownMonth],
    ],
    maxWidth: Math.max(1, gridW - arrowW * 2),
    maxFont: Math.round(clamp(11 * scale, 8, 14)),
    minFont: 8,
  });
  const previous = new Date(shownYear, shownMonth - 1, 1);
  const next = new Date(shownYear, shownMonth + 1, 1);

  const titleF = Math.round(clamp(10 * scale, 8, 13));
  const dateF = Math.round(clamp(13 * scale, 10, 18));
  const weekdayF = Math.round(clamp(10 * scale, 8, 13));
  const feastF = Math.round(clamp(12 * scale, 9, 16));
  const infoF = Math.round(clamp(10.5 * scale, 8, 14));

  const titleH = titleF + 5;
  const dateH = dateF + 4;
  const feastLineH = feastF + 3;
  const infoRowH = infoF + 6;
  const feastMinimum = Math.max(feastLineH, Math.min(2 * feastLineH + 4,
    contentH - dateH - infoRowH - 3));

  let used = dateH + 2 + feastMinimum + infoRowH;
  const showGospel = !!day && used + infoRowH <= contentH;
  if (showGospel) used += infoRowH;
  const showApostle = !!day && showGospel && used + infoRowH <= contentH;
  if (showApostle) used += infoRowH;
  const showTitle = used + titleH <= contentH;
  if (showTitle) used += titleH;
  const feastBlockH = Math.max(feastLineH, feastMinimum + contentH - used);

  const feast = String(day?.main_feast?.short_title ||
    day?.main_feast?.title || copy.saintMemory);
  const fast = formatFast(day, lang) || copy.noFastData;
  const gospel = day?.gospel_title || '—';
  const apostle = day?.apostolic_title || '—';

  const bundled = getBundledCalendarIconSource(day?.main_feast);
  const iconSource = typeof bundled === 'number' ? bundled : bundled?.uri || null;
  const iconH = Math.min(feastBlockH, Math.round(64 * scale));
  const showIcon = !!iconSource && leftW >= 140 && iconH >= 34;
  const iconW = Math.round(iconH * 0.72);
  const feastTextW = Math.max(1, leftW - (showIcon ? iconW + 6 : 0));
  const feastFit = fitText({
    text: feast, maxWidth: feastTextW, maxHeight: feastBlockH,
    maxFont: feastF, minFont: 9,
  });

  const dateText = selectedDate.getDate() + ' ' + locale.genitive[selectedDate.getMonth()];
  const weekdayText = locale.weekdays[selectedDate.getDay()];
  const showWeekday = textWidth(dateText, dateF) +
    textWidth(weekdayText, weekdayF) + 10 <= leftW;
  const dateW = showWeekday
    ? Math.max(1, Math.min(leftW - 1, Math.round(textWidth(dateText, dateF)) + 6))
    : leftW;
  const labelW = Math.round(infoF * 3.4);
  const arrowTextW = infoF + 4;

  const infoRow = (label, value, section) => (
    <FlexWidget
      clickAction={section ? 'OPEN_URI' : undefined}
      clickActionData={section
        ? {uri: 'molitvoslov://calendar/' + effectiveSelected + '?section=' + section}
        : undefined}
      style={{width: leftW, height: infoRowH, marginTop: 0,
        flexDirection: 'row', alignItems: 'center'}}
    >
      <TextWidget
        text={label} allowFontScaling={false} maxLines={1}
        style={{width: labelW, color: '#A46D38', fontFamily: FONT,
          fontSize: infoF, lineHeight: infoF + 3}}
      />
      <TextWidget
        text={String(value || '—')} allowFontScaling={false} maxLines={1}
        style={{width: Math.max(1, leftW - labelW - (section ? arrowTextW : 0)),
          color: section ? '#4D3424' : '#6C4A34',
          fontFamily: FONT, fontSize: infoF, lineHeight: infoF + 3}}
      />
      {section ? (
        <TextWidget text="›" allowFontScaling={false} maxLines={1}
          style={{width: arrowTextW, fontFamily: FONT, color: '#8B5B30',
            fontSize: infoF + 3, lineHeight: infoF + 4, textAlign: 'right'}}
        />
      ) : null}
    </FlexWidget>
  );

  return (
    <OverlapWidget
      accessibilityLabel={copy.widgetName}
      style={{width: 'match_parent', height: 'match_parent',
        borderRadius: 22, overflow: 'hidden', backgroundColor: '#F6E3C3'}}
    >
      <FlexWidget style={{
        width: 'match_parent', height: 'match_parent',
        flexDirection: 'row', padding: pad, backgroundColor: '#F6E3C3',
        borderRadius: 22, borderWidth: BORDER, borderColor: '#C99A5B',
      }}>
        <FlexWidget style={{
          width: leftW, height: contentH, marginRight: gap, justifyContent: 'flex-start',
        }}>
          {showTitle ? (
            <TextWidget text={copy.calendarTitle} allowFontScaling={false} maxLines={1}
              style={{width: leftW, color: '#7B512F', fontFamily: FONT,
                fontSize: titleF, lineHeight: titleF + 4}}
            />
          ) : null}
          <FlexWidget style={{
            width: leftW, height: dateH, flexDirection: 'row', alignItems: 'center',
          }}>
            <TextWidget text={dateText} allowFontScaling={false} maxLines={1}
              style={{width: dateW, color: '#2D1C12', fontFamily: FONT,
                fontSize: dateF, lineHeight: dateF + 4}}
            />
            {showWeekday ? (
              <TextWidget text={weekdayText} allowFontScaling={false} maxLines={1}
                style={{width: Math.max(1, leftW - dateW), color: '#765A44',
                  fontFamily: FONT, fontSize: weekdayF,
                  lineHeight: weekdayF + 4, textAlign: 'right'}}
              />
            ) : null}
          </FlexWidget>
          <FlexWidget style={{
            width: leftW, height: feastBlockH, marginTop: 2,
            flexDirection: 'row', alignItems: 'center',
          }}>
            {showIcon ? (
              <ImageWidget image={iconSource}
                imageWidth={iconW} imageHeight={iconH}
                resizeMode="cover" radius={7} style={{marginRight: 6}}
              />
            ) : null}
            <TextWidget text={feast} allowFontScaling={false}
              maxLines={feastFit.maxLines}
              style={{width: feastTextW, color: '#40291A', fontFamily: FONT,
                fontSize: feastFit.fontSize, lineHeight: feastFit.lineHeight}}
            />
          </FlexWidget>
          {infoRow(lang === 'uk' ? 'ПІСТ' : 'ПОСТ', fast)}
          {showGospel ? infoRow(lang === 'uk' ? 'ЄВ.' : 'ЕВ.', gospel, 'gospel') : null}
          {showApostle ? infoRow('АП.', apostle, 'apostle') : null}
        </FlexWidget>

        <FlexWidget style={{
          width: panelW, height: contentH, paddingLeft: panelPadLeft,
          borderLeftWidth: 1, borderLeftColor: '#D5B487',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <FlexWidget style={{
            width: gridW, height: monthHeaderH,
            flexDirection: 'row', alignItems: 'center',
          }}>
            <TextWidget text="‹" clickAction="CALENDAR_PREV_MONTH"
              clickActionData={{year: previous.getFullYear(), month: previous.getMonth() + 1}}
              allowFontScaling={false}
              style={{width: arrowW, color: '#8A5B31', fontFamily: FONT,
                fontSize: Math.round(clamp(monthHeaderH * 0.8, 14, 24)),
                lineHeight: monthHeaderH, textAlign: 'center'}}
            />
            <TextWidget text={monthTitle.text} clickAction="CALENDAR_TODAY"
              allowFontScaling={false} maxLines={1}
              style={{width: Math.max(1, gridW - 2 * arrowW), color: '#4C3020',
                fontFamily: FONT, fontSize: monthTitle.fontSize,
                lineHeight: monthHeaderH, textAlign: 'center'}}
            />
            <TextWidget text="›" clickAction="CALENDAR_NEXT_MONTH"
              clickActionData={{year: next.getFullYear(), month: next.getMonth() + 1}}
              allowFontScaling={false}
              style={{width: arrowW, color: '#8A5B31', fontFamily: FONT,
                fontSize: Math.round(clamp(monthHeaderH * 0.8, 14, 24)),
                lineHeight: monthHeaderH, textAlign: 'center'}}
            />
          </FlexWidget>
          {showWeekdays ? (
            <FlexWidget style={{width: gridW, height: weekdayH, flexDirection: 'row'}}>
              {locale.miniWeekdays.map((weekDay, index) => (
                <TextWidget key={'weekday-' + index}
                  text={weekDay} allowFontScaling={false} maxLines={1}
                  style={{width: cellW, height: weekdayH,
                    color: index >= 5 ? '#A24C40' : '#8A7462',
                    fontFamily: FONT, fontSize: weekdayFont,
                    lineHeight: weekdayH, textAlign: 'center'}}
                />
              ))}
            </FlexWidget>
          ) : null}
          {weeks.map((week, rowIndex) => (
            <FlexWidget key={'row-' + rowIndex} style={{
              width: gridW, height: rowH, flexDirection: 'row',
            }}>
              {week.map((cell, columnIndex) => {
                const marked = cell.selected || cell.today || !!cell.appearance;
                const background = cell.selected ? '#B97A32'
                  : APPEARANCE_BG[cell.appearance] || '#00000000';
                return (
                  <FlexWidget key={rowIndex + '-' + columnIndex}
                    clickAction={cell.date ? 'CALENDAR_SELECT_DAY' : undefined}
                    clickActionData={cell.date ? {date: cell.date} : undefined}
                    style={{width: cellW, height: rowH,
                      alignItems: 'center', justifyContent: 'center'}}
                  >
                    <TextWidget
                      text={cell.day} allowFontScaling={false} maxLines={1}
                      style={{width: marked ? bubble : cellW,
                        height: marked ? bubble : rowH,
                        color: cell.selected ? '#FFF8EA' :
                          cell.today ? '#8A572D' :
                            columnIndex >= 5 ? '#A24C40' : '#493225',
                        backgroundColor: background,
                        borderWidth: cell.today && !cell.selected ? 1 : 0,
                        borderColor: '#B97A32',
                        borderRadius: marked ? bubble / 2 : 0,
                        fontFamily: FONT, fontSize: dayFont,
                        lineHeight: marked ? bubble : rowH,
                        textAlign: 'center'}}
                    />
                  </FlexWidget>
                );
              })}
            </FlexWidget>
          ))}
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
};
