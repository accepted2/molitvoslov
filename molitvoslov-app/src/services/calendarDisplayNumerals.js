// Display-only Church Slavonic numerals. Calendar dates, ISO keys, API
// queries and stored day numbers always remain ordinary integers.
// The historical titlo is placed on the penultimate numeral letter.
const UNITS = ['', 'а', 'в', 'г', 'д', 'є', 'ѕ', 'з', 'и', 'ѳ'];
const TENS = ['', 'і', 'к', 'л', 'м', 'н', 'ѯ', 'ѻ', 'п', 'ч'];
const HUNDREDS = ['', 'р', 'с', 'т', 'у', 'ф', 'х', 'ѱ', 'ѡ', 'ц'];

export const toChurchSlavonicNumeral = value => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 9999) {
    return String(value);
  }
  const thousands = Math.floor(number / 1000);
  const hundreds = Math.floor((number % 1000) / 100);
  const tens = Math.floor((number % 100) / 10);
  const units = number % 10;
  let digits = thousands ? '҂' + UNITS[thousands] : '';
  if (hundreds) digits += HUNDREDS[hundreds];
  if (tens === 1 && units !== 0) {
    digits += UNITS[units] + TENS[1];
  } else {
    if (tens) digits += TENS[tens];
    if (units) digits += UNITS[units];
  }
  // The 'thousands sign' is not one of the numeral letters.
  const letters = [...digits].filter(char => char !== '҂');
  const titledIndex = Math.max(0, letters.length - 2);
  let seen = 0;
  return [...digits].map(char => {
    if (char === '҂') return char;
    const decorated = seen === titledIndex ? char + '҃' : char;
    seen++;
    return decorated;
  }).join('');
};

export const displayCalendarNumber = (value, language) =>
  language === 'csl_traditional' ? toChurchSlavonicNumeral(value) : value;

export const displayCalendarDateText = (value, language) =>
  language === 'csl_traditional'
    ? String(value).replace(/\d{1,4}/g, match => toChurchSlavonicNumeral(Number(match)))
    : value;
