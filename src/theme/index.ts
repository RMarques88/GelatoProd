export const palette = {
  primary: '#4E9F3D',
  primaryDark: '#1E5128',
  accent: '#F5B700',
  background: '#F7F7F8',
  surface: '#FFFFFF',
  text: '#1A1B1E',
  muted: '#5E5F61',
  danger: '#E53E3E',
  success: '#38A169',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  },
};

export const appTheme = {
  colors: palette,
  spacing,
  typography,
};

export type AppTheme = typeof appTheme;
