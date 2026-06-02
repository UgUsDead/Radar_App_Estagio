export const palette = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  primary: '#0ea5e9',
  primaryStrong: '#0284c7',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  offline: '#94a3b8',
  text: '#0f172a',
  textMuted: '#475569',
  border: '#e2e8f0',
  shadow: 'rgba(15, 23, 42, 0.08)'
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999
};

export const typography = {
  title: { fontSize: 22, fontWeight: '700', color: palette.text },
  subtitle: { fontSize: 17, fontWeight: '600', color: palette.text },
  body: { fontSize: 15, color: palette.text },
  muted: { fontSize: 13, color: palette.textMuted }
} as const;
