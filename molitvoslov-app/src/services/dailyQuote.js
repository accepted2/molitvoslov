const bundledContent = require('../data/offlineContent.json');

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getDateOrdinal = date => {
  const utcDays = Math.floor(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ) / 86400000
  );

  return utcDays + 719163;
};

export const getDailyQuote = () => {
  const quotes = bundledContent.daily_quotes || [];
  const today = getTodayString();

  const exact = quotes.find(item => item.quote_date === today);

  if (exact) {
    return {
      ...exact,
      date: today,
    };
  }

  const rotation = quotes.filter(item => !item.quote_date);

  if (!rotation.length) {
    return {
      id: null,
      text: 'Молитва и духовное чтение помогают хранить внимание сердца.',
      reference: '',
      source: '',
      date: today,
    };
  }

  const index = getDateOrdinal(new Date()) % rotation.length;

  return {
    ...rotation[index],
    date: today,
  };
};