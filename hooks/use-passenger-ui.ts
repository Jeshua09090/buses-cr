import { passengerDarkSurfaces, passengerLightSurfaces } from '@/constants/passenger-ui';
import { uiPalette } from '@/constants/ui-tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function usePassengerUI() {
  const theme = useColorScheme() ?? 'dark';
  const surface = theme === 'dark' ? passengerDarkSurfaces : passengerLightSurfaces;

  return {
    theme,
    backgroundColor: surface.background,
    gradientTop: surface.gradientTop,
    gradientMid: surface.gradientMid,
    gradientBottom: surface.gradientBottom,
    surfaceBase: surface.surfaceBase,
    surfaceStrong: surface.surfaceStrong,
    surfaceHero: surface.surfaceHero,
    surfaceInset: surface.surfaceInset,
    interactiveNeutral: surface.interactiveNeutral,
    interactiveAccent: surface.interactiveAccent,
    mapScrimTop: surface.mapScrimTop,
    mapScrimBottom: surface.mapScrimBottom,
    ornamentSoft: surface.ornamentSoft,
    dangerSubtle: surface.dangerSubtle,
    glassSubtle: surface.glassSubtle,
    glassStrong: surface.glassStrong,
    surfaceElevated: surface.surfaceElevated,
    surfaceRaised: surface.surfaceRaised,
    dividerSoft: surface.dividerSoft,
    outlineSoft: surface.outlineSoft,
    textPrimary: surface.textPrimary,
    textSecondary: surface.textSecondary,
    textTertiary: surface.textTertiary,
    accentPrimary: uiPalette.primary,
    accentWayfinding: uiPalette.primary,
    accentSecondary: uiPalette.secondary,
    accentSuccess: uiPalette.success,
    accentWarning: uiPalette.warning,
    accentDanger: '#D96A6A',
    statusLive: theme === 'dark' ? 'rgba(25,211,166,0.18)' : '#E8FBF5',
    statusWarning: theme === 'dark' ? 'rgba(227,166,59,0.16)' : '#FFF7EC',
    statusWayfinding: surface.interactiveAccent,
    statusPrimary: surface.interactiveAccent,
    statusDanger: surface.dangerSubtle,
    shadowCard: theme === 'dark' ? '0px 18px 34px rgba(2, 6, 12, 0.18)' : '0px 18px 34px rgba(15, 23, 42, 0.08)',
    shadowFloating: theme === 'dark' ? '0px 24px 48px rgba(2, 6, 12, 0.30)' : '0px 18px 36px rgba(15, 23, 42, 0.12)',
  };
}
