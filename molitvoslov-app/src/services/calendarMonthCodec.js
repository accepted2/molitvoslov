// CALENDAR_MONTH_DELTA_V1
// The same calendar event can appear in ru and uk with byte-for-byte equal
// text. Keep each distinct language value, but store identical fields once.
// Pure CommonJS allows the offline generator and Hermes to use one codec.
'use strict';

const FORMAT_KEY = '__molitvoslov_calendar_delta_version';
const UK_KEYS = '__molitvoslov_calendar_uk_keys';
const VERSION = 1;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value);

const copyValue = value => {
  // Do not share arrays/objects between ru and uk after expansion. Some
  // calendar screens enrich day objects after reading them.
  if (value !== null && typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
};

const packCalendarMonth = source => {
  if (!isRecord(source) || !isRecord(source.days)) {
    throw new Error('Calendar month must contain a days object.');
  }
  if (own(source, FORMAT_KEY)) {
    throw new Error('Calendar month is already packed; restore the original before repacking.');
  }
  const packedDays = {};
  for (const [date, day] of Object.entries(source.days)) {
    if (!isRecord(day) || !isRecord(day.ru) || !isRecord(day.uk)) {
      packedDays[date] = day;
      continue;
    }
    if (own(day, UK_KEYS)) {
      throw new Error('Reserved calendar delta key already present on ' + date);
    }
    const delta = {};
    const ukKeys = Object.keys(day.uk);
    for (const key of ukKeys) {
      if (!own(day.ru, key) ||
        JSON.stringify(day.ru[key]) !== JSON.stringify(day.uk[key])) {
        delta[key] = day.uk[key];
      }
    }
    // Keep original language and day properties; the UK language now stores
    // only the fields that differ from RU, plus its exact original key list.
    packedDays[date] = {...day, uk: delta, [UK_KEYS]: ukKeys};
  }
  return {...source, days: packedDays, [FORMAT_KEY]: VERSION};
};

const unpackCalendarMonth = payload => {
  if (!isRecord(payload) || !own(payload, FORMAT_KEY)) return payload;
  if (payload[FORMAT_KEY] !== VERSION) {
    throw new Error('Unsupported calendar month delta version: '+payload[FORMAT_KEY]);
  }
  if (!isRecord(payload.days)) {
    throw new Error('Packed calendar month has no days object.');
  }
  const days = {};
  for (const [date, day] of Object.entries(payload.days)) {
    if (!isRecord(day) || !own(day, UK_KEYS)) {
      days[date] = day;
      continue;
    }
    if (!isRecord(day.ru) || !isRecord(day.uk) || !Array.isArray(day[UK_KEYS])) {
      throw new Error('Invalid calendar delta day: '+date);
    }
    const reconstructed = {};
    for (const key of day[UK_KEYS]) {
      if (typeof key !== 'string' || own(reconstructed,key)) {
        throw new Error('Invalid or duplicated UK field in '+date);
      }
      if (own(day.uk, key)) {
        reconstructed[key] = day.uk[key];
      } else if (own(day.ru, key)) {
        reconstructed[key] = copyValue(day.ru[key]);
      } else {
        throw new Error('Missing shared UK field '+key+' on '+date);
      }
    }
    for (const key of Object.keys(day.uk)) {
      if (!own(reconstructed,key)) {
        throw new Error('UK override not declared in keys: '+key+' on '+date);
      }
    }
    const {[UK_KEYS]: ignored, ...originalDay} = day;
    days[date] = {...originalDay, uk: reconstructed};
  }
  const {[FORMAT_KEY]: ignored, ...originalPayload} = payload;
  return {...originalPayload, days};
};

module.exports = {FORMAT_KEY, VERSION, packCalendarMonth, unpackCalendarMonth};
