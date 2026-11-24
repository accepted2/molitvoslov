import {getCurrentContent} from './contentStore';
import curated from '../data/curatedDailyQuotes.json';
import longFathers from '../data/curatedLongFatherQuotes.json';
import {selectExtendedDailyQuote} from './extendedDailyQuote';
import userSelected from '../data/curatedRequestedQuotes20261120.json';

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getDateOrdinal = (date) => {
  const utcDays = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );

  return utcDays + 719163;
};

export const getDailyQuote = (requestedDate = new Date()) => {
  const date = requestedDate instanceof Date && !Number.isNaN(requestedDate.getTime())
    ? requestedDate : new Date();
  const today = String(date.getFullYear()) + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
  const ordinal = Math.floor(Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) + 719163;

  const calendar = getCurrentContent()?.daily_quotes;
  const exact = (Array.isArray(calendar) ? calendar : [])
    .find(item => item && item.quote_date === today &&
      typeof item.text === 'string' &&
      item.text.length >= 150 && item.text.length <= 300);
  if (exact) return {...exact, date: today};

  // The 151 old entries remain in curatedDailyQuotes.json for saved hearts,
  // but the daily rotation uses only long patristic and Scripture passages.
  const fathers = [...(longFathers.quotes || []), ...(userSelected.fatherQuotes || [])];
  const chosen = selectExtendedDailyQuote(
    ordinal, fathers, userSelected.bibleQuotes || []);
  if (chosen?.text && chosen.text.length >= 150 && chosen.text.length <= 300)
    return {...chosen, date: today};

  return {
    id: null, text: 'Господи, научи меня молиться.',
    reference: '', source: '', date: today,
  };
};
