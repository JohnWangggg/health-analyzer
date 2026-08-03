import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { t, type AppLocaleUi, type MessageKey } from './messages';
import { UI_LOCALE_KEY, readUiLocale } from './uiLocale';

type LocaleContextValue = {
  locale: AppLocaleUi;
  setLocale: (l: AppLocaleUi) => void;
  t: (key: MessageKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocaleUi>(() =>
    typeof window === 'undefined' ? 'zh-CN' : readUiLocale(),
  );

  const setLocale = useCallback((l: AppLocaleUi) => {
    setLocaleState(l);
    try {
      localStorage.setItem(UI_LOCALE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = locale;
    } catch {
      /* ignore */
    }
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey) => t(locale, key),
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
