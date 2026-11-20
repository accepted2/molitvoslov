import {getCurrentContent} from './contentStore';
import curated from '../data/curatedDailyQuotes.json';
import longFathers from '../data/curatedLongFatherQuotes.json';
import userSelected from '../data/curatedRequestedQuotes20261120.json';
import {selectExtendedDailyQuote} from './extendedDailyQuote';

const formatLocalDate = date =>
  String(date.getFullYear()) + '-' +
  String(date.getMonth() + 1).padStart(2, '0') + '-' +
  String(date.getDate()).padStart(2, '0');

const getDateOrdinal = date =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) + 719163;

// Exactly one stable quote per local calendar day. All 151 legacy quotes
// remain available for favorites, but daily rotation now selects only long
// Fathers and full adjacent Scripture verses from the user-reviewed set.
// Manually dated church-calendar quotations still override the rotation.
export const getDailyQuote = (requestedDate = new Date()) => {
  // Keep the date variable local. Divergent local installers could retain a
  // different parameter name while referencing a missing global `date`.
  const currentDate =
    requestedDate instanceof Date && !Number.isNaN(requestedDate.getTime())
      ? requestedDate
      : new Date();
  const today = formatLocalDate(currentDate);
  const calendarQuotes = getCurrentContent()?.daily_quotes;
  const exact = (Array.isArray(calendarQuotes) ? calendarQuotes : [])
    .find(item => item.quote_date === today &&
      typeof item.text === 'string' && item.text.trim());
  if (exact) return {...exact, date: today};

  // Remove short quotations from the daily rotation, not from saved content.
  const fathers = [...(longFathers.quotes || []), ...(userSelected.fatherQuotes || [])];
  const scripture = userSelected.bibleQuotes || [];
  const chosen = selectExtendedDailyQuote(
    getDateOrdinal(currentDate), fathers, scripture);
  if (chosen) return {...chosen, date: today};

  return {id: null, text: 'Господи, научи меня молиться.',
    reference: '', source: '', date: today};
};
