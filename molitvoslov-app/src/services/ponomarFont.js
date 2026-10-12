import {PONOMAR_FONT_BASE64} from '../data/ponomarFontBase64.generated';

const PONOMAR_DATA_URI = `data:font/ttf;base64,${PONOMAR_FONT_BASE64}`;

export const getCachedPonomarFontDataUri = () => PONOMAR_DATA_URI;

export const loadPonomarFontDataUri = async () => PONOMAR_DATA_URI;
