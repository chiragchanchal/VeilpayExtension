import { readMeta, writeMeta } from '@/core/vault/storage';
import { en, type EnglishMessages } from './en';

export type Locale = 'en';
export type MessageKey =
  | 'brand'
  | 'version'
  | `common.${keyof EnglishMessages['common']}`
  | `errors.${keyof EnglishMessages['errors']}`
  | `approval.${keyof EnglishMessages['approval']}`
  | `wallet.${keyof EnglishMessages['wallet']}`
  | `status.${keyof EnglishMessages['status']}`
  | `x402.${keyof EnglishMessages['x402']}`
  | `vap.${keyof EnglishMessages['vap']}`;

export interface TranslationParams {
  [name: string]: string | number;
}

const LOCALE_KEY = 'settings.locale';
let activeLocale: Locale = 'en';

function lookup(key: MessageKey): string {
  const parts = key.split('.');
  let value: unknown = en;
  for (const part of parts) {
    if (typeof value !== 'object' || value === null || !(part in value)) return key;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : key;
}

/** Translate a semantic key, replacing `{name}` placeholders when supplied. */
export function t(key: MessageKey, params?: TranslationParams): string {
  let message = lookup(key);
  if (params !== undefined) {
    message = message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  }
  return message;
}

export function getLocale(): Locale {
  return activeLocale;
}

/** English is currently the only shipped locale; this keeps the future seam typed. */
export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

/** Load the persisted locale, falling back safely to English. */
export async function loadLocale(): Promise<Locale> {
  const stored = await readMeta<string>(LOCALE_KEY).catch(() => undefined);
  activeLocale = stored === 'en' ? 'en' : 'en';
  return activeLocale;
}

/** Persist a supported locale for a future multi-locale build. */
export async function persistLocale(locale: Locale): Promise<void> {
  setLocale(locale);
  await writeMeta(LOCALE_KEY, locale);
}

/** Narrow hook-free API for incremental migration in React components. */
export function useTranslation(): { t: typeof t; locale: Locale } {
  return { t, locale: activeLocale };
}

export { en };
