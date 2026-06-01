import { uiPalette } from '@/constants/ui-tokens';

export const passengerTouch = {
  minimum: 44,
  comfortable: 48,
} as const;

export const passengerRadii = {
  chip: 16,
  control: 18,
  card: 24,
  sheet: 28,
  capsule: 999,
} as const;

export const passengerSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const floatingTabBarMetrics = {
  height: 66,
  marginHorizontal: 16,
  innerPadding: 6,
  safeBottomOffset: 10,
  shadowLift: 28,
} as const;

export const passengerShadows = {
  floating: '0px 16px 30px rgba(2, 6, 23, 0.24)',
  card: '0px 16px 30px rgba(2, 6, 23, 0.12)',
  marker: '0px 12px 24px rgba(2, 6, 23, 0.24)',
} as const;

export const passengerDarkSurfaces = {
  background: uiPalette.bgDark,
  gradientTop: '#111722',
  gradientMid: '#0A0E14',
  gradientBottom: '#080A0D',
  surfaceBase: 'rgba(20, 25, 34, 0.82)',
  surfaceStrong: 'rgba(26, 32, 42, 0.92)',
  surfaceHero: 'rgba(24, 29, 39, 0.96)',
  surfaceInset: 'rgba(12, 16, 23, 0.72)',
  interactiveNeutral: 'rgba(255,255,255,0.055)',
  interactiveAccent: 'rgba(91,108,255,0.16)',
  mapScrimTop: 'rgba(10, 13, 18, 0.84)',
  mapScrimBottom: 'rgba(8, 10, 14, 0.92)',
  ornamentSoft: 'rgba(25, 211, 166, 0.08)',
  dangerSubtle: 'rgba(217,106,106,0.16)',
  glassSubtle: 'rgba(255,255,255,0.050)',
  glassStrong: 'rgba(20, 25, 34, 0.92)',
  surfaceElevated: 'rgba(26, 32, 42, 0.92)',
  surfaceRaised: 'rgba(30, 37, 48, 0.96)',
  dividerSoft: 'rgba(162, 173, 190, 0.11)',
  outlineSoft: 'rgba(162, 173, 190, 0.22)',
  textPrimary: uiPalette.textOnDark,
  textSecondary: uiPalette.textMutedOnDark,
  textTertiary: 'rgba(162, 173, 190, 0.74)',
} as const;

export const passengerLightSurfaces = {
  background: '#F5F7FC',
  gradientTop: '#F4F7FD',
  gradientMid: '#E7EEFF',
  gradientBottom: '#FFFFFF',
  surfaceBase: 'rgba(255,255,255,0.92)',
  surfaceStrong: 'rgba(255,255,255,0.96)',
  surfaceHero: 'rgba(255,255,255,0.98)',
  surfaceInset: '#F3F6FB',
  interactiveNeutral: 'rgba(16, 32, 58, 0.04)',
  interactiveAccent: '#EEF3FF',
  mapScrimTop: 'rgba(244,247,253,0.94)',
  mapScrimBottom: 'rgba(245,247,252,0.92)',
  ornamentSoft: 'rgba(91,124,255,0.07)',
  dangerSubtle: '#FEECEC',
  glassSubtle: 'rgba(255,255,255,0.74)',
  glassStrong: 'rgba(248,250,252,0.88)',
  surfaceElevated: 'rgba(255,255,255,0.94)',
  surfaceRaised: 'rgba(255,255,255,0.98)',
  dividerSoft: '#D7DFEE',
  outlineSoft: '#D8E0EE',
  textPrimary: '#10203A',
  textSecondary: '#627089',
  textTertiary: '#7A8AA5',
} as const;

export function getFloatingTabBarReservedSpace(bottomInset: number) {
  return (
    floatingTabBarMetrics.height +
    Math.max(bottomInset, floatingTabBarMetrics.safeBottomOffset) +
    passengerSpacing.lg +
    floatingTabBarMetrics.innerPadding
  );
}
