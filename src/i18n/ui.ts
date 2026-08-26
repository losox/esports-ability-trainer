import en from './en.json';
import zh from './zh.json';

const translations = { en, zh };

export type Locale = 'en' | 'zh';

export function getTranslations(locale: Locale) {
  return translations[locale] ?? translations.en;
}

export function t(locale: Locale, key: string): string {
  const keys = key.split('.');
  let value: unknown = translations[locale] ?? translations.en;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }
  return String(value);
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
