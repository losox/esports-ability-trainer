import { describe, it, expect } from 'vitest';
import { getTranslations, t, getLocalePath, getAlternateLocale } from './ui';

describe('i18n translation system', () => {
  describe('getTranslations', () => {
    it('should return English translations for en locale', () => {
      const translations = getTranslations('en');
      expect(translations.hero.title).toBe('Train Your Core Gaming Abilities');
      expect(translations.nav.home).toBe('Home');
    });

    it('should return Chinese translations for zh locale', () => {
      const translations = getTranslations('zh');
      expect(translations.hero.title).toBe('训练你的竞技游戏底层能力');
      expect(translations.nav.home).toBe('首页');
    });

    it('should fallback to English for unknown locale', () => {
      const translations = getTranslations('fr' as never);
      expect(translations.hero.title).toBe('Train Your Core Gaming Abilities');
    });
  });

  describe('t function', () => {
    it('should return correct value for nested key', () => {
      expect(t('en', 'hero.title')).toBe('Train Your Core Gaming Abilities');
      expect(t('zh', 'hero.title')).toBe('训练你的竞技游戏底层能力');
    });

    it('should return correct value for deep nested key', () => {
      expect(t('en', 'dimensions.d1.name')).toBe('Reaction Speed');
      expect(t('zh', 'dimensions.d1.name')).toBe('反应速度');
    });

    it('should return key itself for missing translation', () => {
      expect(t('en', 'nonexistent.key')).toBe('nonexistent.key');
    });
  });

  describe('getLocalePath', () => {
    it('should return root path for English', () => {
      expect(getLocalePath('en')).toBe('/');
      expect(getLocalePath('en', '/test')).toBe('/test');
    });

    it('should return prefixed path for Chinese', () => {
      expect(getLocalePath('zh')).toBe('/zh');
      expect(getLocalePath('zh', '/test')).toBe('/zh/test');
    });
  });

  describe('getAlternateLocale', () => {
    it('should return zh for en', () => {
      expect(getAlternateLocale('en')).toBe('zh');
    });

    it('should return en for zh', () => {
      expect(getAlternateLocale('zh')).toBe('en');
    });
  });
});
