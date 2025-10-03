import { PropsWithChildren, createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { AppTheme, appTheme } from '@/theme';

type ThemeContextValue = {
  theme: AppTheme;
  colorScheme: 'light' | 'dark';
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const colorScheme = useColorScheme() ?? 'light';

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: appTheme,
      colorScheme,
    }),
    [colorScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used within an AppThemeProvider');
  }

  return context;
}
