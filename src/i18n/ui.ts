import en from './en.json';
import zh from './zh.json';

const translations = { en, zh };

export type Locale = 'en' | 'zh';

export function getTranslations(locale: Locale) {
  return translations[locale] ?? translations.en;
}

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const keys = key.split('.');
  let value: unknown = translations[locale] ?? translations.en;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }
  let result = String(value);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replaceAll(`{${k}}`, String(v));
    }
  }
  return result;
}

export function getLocalePath(locale: Locale, path: string = ''): string {
  if (locale === 'en') {
    return path || '/';
  }
  return `/zh${path}`;
}

export function getAlternateLocale(locale: Locale): Locale {
  return locale === 'en' ? 'zh' : 'en';
}
