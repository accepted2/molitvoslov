import {getCurrentContent} from './contentStore';
import curated from '../data/curatedDailyQuotes.json';
import longFathers from '../data/curatedLongFatherQuotes.json';
import {selectExtendedDailyQuote} from './extendedDailyQuote';

const formatLocalDate = date =>
  String(date.getFullYear()) + '-' +
  String(date.getMonth() + 1).padStart(2, '0') + '-' +
  String(date.getDate()).padStart(2, '0');

const getDateOrdinal = date =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) + 719163;

// Exactly one stable quote per local calendar day. The existing 151 curated
// entries remain intact for saved hearts; new long Fathers are additionally
// available offline. Scripture passages are extended from adjacent verses.
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

  const chosen = selectExtendedDailyQuote(
    getDateOrdinal(currentDate), longFathers.quotes || [], curated.quotes || []);
  if (chosen) return {...chosen, date: today};

  return {id: null, text: 'Господи, научи меня молиться.',
    reference: '', source: '', date: today};
};
