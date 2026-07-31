import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { t, type AppLocaleUi, type MessageKey } from './messages';

const STORAGE_KEY = 'ha-react-ui-locale';

type LocaleContextValue = {
  locale: AppLocaleUi;
  setLocale: (l: AppLocaleUi) => void;
  t: (key: MessageKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStored(): AppLocaleUi {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'zh-CN') return v;
  } catch {
    /* ignore */
  }
  return 'zh-CN';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocaleUi>(() =>
    typeof window === 'undefined' ? 'zh-CN' : readStored(),
  );

  const setLocale = useCallback((l: AppLocaleUi) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

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
