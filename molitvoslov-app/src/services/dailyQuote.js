import {getCurrentContent} from './contentStore';
import curated from '../data/curatedDailyQuotes.json';

const formatLocalDate = date =>
  String(date.getFullYear()) + '-' +
  String(date.getMonth() + 1).padStart(2, '0') + '-' +
  String(date.getDate()).padStart(2, '0');

const getDateOrdinal = date =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) + 719163;

// Exactly one stable quote per local calendar day. All 151 curated entries are
// available offline; their IDs stay stable for saved hearts across releases.
// Manually dated church-calendar quotations can still override the rotation.
export const getDailyQuote = (date = new Date()) => {
  const today = formatLocalDate(date);
  const exact = (getCurrentContent()?.daily_quotes || [])
    .find(item => item.quote_date === today &&
      typeof item.text === 'string' && item.text.trim());
  if (exact) return {...exact, date: today};

  const quotes = curated.quotes || [];
  if (!quotes.length) {
    return {id: null, text: 'Господи, научи меня молиться.',
      reference: '', source: '', date: today};
  }
  const item = quotes[((getDateOrdinal(date) % quotes.length) + quotes.length) % quotes.length];
  return {...item, date: today};
};
