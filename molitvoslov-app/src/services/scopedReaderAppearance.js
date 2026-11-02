import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCachedBackendUser} from './backendAuth';
import {getReadingSettings, DEFAULT_READING_SETTINGS} from './readerPreferences';

const PREFIX = '@molitvoslov/scoped-reader-appearance/v1';
export const READER_PALETTES = Object.freeze({
  parchment: {background: '#FFF4DE', surface: '#F8E9CF', text: '#3E2A1D'},
  warm: {background: '#DEBE94', surface: '#E8CDA8', text: '#3B281A'},
  ivory: {background: '#FFFDF3', surface: '#F5EFE0', text: '#352D26'},
  night: {background: '#29231F', surface: '#413831', text: '#F4E7D2'},
});
const validHex = (value, fallback) => /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value).toUpperCase() : fallback;
export const normalizeReaderAppearance = (value = {}) => ({
  fontSize: Math.max(14, Math.min(28, Number(value.fontSize) || 17)),
  palette: Object.prototype.hasOwnProperty.call(READER_PALETTES, value.palette) || value.palette === 'custom'
    ? value.palette : 'parchment',
  customBackground: validHex(value.customBackground, '#FFF4DE'),
  customText: validHex(value.customText, '#3E2A1D'),
});
export const resolveReaderAppearance = (settings) => {
  const normalized = normalizeReaderAppearance(settings);
  const palette = normalized.palette === 'custom'
    ? {background: normalized.customBackground, surface: normalized.customBackground, text: normalized.customText}
    : READER_PALETTES[normalized.palette];
  return {...normalized, ...palette};
};
export const isDarkReaderBackground = (hex) => {
  const color = validHex(hex, '#FFF4DE');
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luminance < 0.48;
};
export const withOpacity = (hex, alpha = 1) => {
  const color = validHex(hex, '#FFF4DE');
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  return 'rgba(' + rgb.join(',') + ',' + alpha + ')';
};
const ownerScope = async () => {
  const user = await getCachedBackendUser().catch(() => null);
  return user?.id ? 'account-' + encodeURIComponent(String(user.id)) : 'guest';
};
export const getScopedAppearanceKey = async ({sourceType, sourceId}) =>
  PREFIX + ':' + (await ownerScope()) + ':' +
  encodeURIComponent(String(sourceType || 'reader')) + ':' +
  encodeURIComponent(String(sourceId || ''));
export const loadScopedAppearance = async (scope) => {
  const key = await getScopedAppearanceKey(scope);
  const globalSettings = await getReadingSettings().catch(() => DEFAULT_READING_SETTINGS);
  let saved = null;
  try {
    const raw = await AsyncStorage.getItem(key);
    saved = raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[reader appearance] load:', error?.message || error);
  }
  return {key, value: normalizeReaderAppearance({...globalSettings, ...(saved || {})}), inherited: !saved};
};
export const storeScopedAppearance = async (key, appearance) => {
  if (key) await AsyncStorage.setItem(key, JSON.stringify(normalizeReaderAppearance(appearance)));
};
export const resetScopedAppearance = async (key) => {
  if (key) await AsyncStorage.removeItem(key);
  return normalizeReaderAppearance(await getReadingSettings().catch(() => DEFAULT_READING_SETTINGS));
};
/** Update WebView styles without modifying its HTML source, losing scroll position or changing liturgical span colors. */
export const applyReaderAppearance = (webView, appearance, isRule = false) => {
  if (!webView || !appearance) return;
  const v = resolveReaderAppearance(appearance);
  const safe = JSON.stringify({background:v.background, surface:v.surface, text:v.text, size:v.fontSize, traditional:Math.min(30, v.fontSize + 2)});
  const selector = isRule ? '.reader-text' : 'body:not(.book-mode) .reader-text';
  const traditional = isRule ? '.traditional-mode .reader-text' : 'body:not(.book-mode) .reader-language-traditional .reader-text';
  // Recolor ordinary headings/explanations, but leave liturgical rubrics
  // (including traditional red invocations, verse numbers and bows) intact.
  const scope = isRule ? '' : 'body:not(.book-mode) ';
  const headingSelector = [
    '.rule-title', '.prayer-title', '.section-title', '.rule-description',
    '.description', '.note', '.instruction', '.reader-label', '.reader-inline-label',
  ].map(name => scope + name).join(',');
  const secondarySelector = isRule
    ? '.translation-text, .section-content'
    : 'body:not(.book-mode) .reader-text.secondary, body:not(.book-mode) .reader-text.akathist-russian, body:not(.book-mode) .section-content';
  const js = "(function(){var s=" + safe + ";var root=document.documentElement;" +
    "root.style.setProperty('--background',s.background);" +
    "root.style.setProperty('--surface',s.surface);" +
    "root.style.setProperty('--text',s.text);" +
    "root.style.setProperty('--reading-font-size',s.size+'px');" +
    "root.style.setProperty('--traditional-reading-font-size',s.traditional+'px');" +
    "var css='body {background:'+s.background+' !important;color:'+s.text+' !important;} " +
    selector + "{font-size:'+s.size+'px !important;color:'+s.text+' !important;} " +
    traditional + "{font-size:'+s.traditional+'px !important;} " +
    headingSelector + "{color:'+s.text+' !important;} " +
    secondarySelector + "{color:'+s.text+' !important;}';" +
    "var node=document.getElementById('molitvoslov-local-appearance');" +
    "if(!node){node=document.createElement('style');node.id='molitvoslov-local-appearance';document.head.appendChild(node);}" +
    "node.textContent=css;})(); true;";
  webView.injectJavaScript(js);
};
