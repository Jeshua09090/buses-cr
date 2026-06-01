export type UiPaletteName = 'aquaNavy' | 'sunsetGraphite' | 'forestInk' | 'graphiteBlue';

type UiPalette = {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  bgDark: string;
  surfaceDark: string;
  surfaceDarkElevated: string;
  borderDark: string;
  textOnDark: string;
  textMutedOnDark: string;
};

export const UI_PALETTES: Record<UiPaletteName, UiPalette> = {
  aquaNavy: {
    primary: '#5B7CFF',
    secondary: '#22D3EE',
    success: '#2DD4BF',
    warning: '#F59E0B',
    bgDark: '#070E1D',
    surfaceDark: '#101B30',
    surfaceDarkElevated: '#16233A',
    borderDark: '#253654',
    textOnDark: '#F8FAFC',
    textMutedOnDark: '#9FB0CA',
  },
  sunsetGraphite: {
    primary: '#FF7A59',
    secondary: '#FFB86B',
    success: '#34D399',
    warning: '#FBBF24',
    bgDark: '#121317',
    surfaceDark: '#1B1E25',
    surfaceDarkElevated: '#242934',
    borderDark: '#353C4A',
    textOnDark: '#F3F4F6',
    textMutedOnDark: '#A9AFBC',
  },
  forestInk: {
    primary: '#34D399',
    secondary: '#67E8F9',
    success: '#86EFAC',
    warning: '#F59E0B',
    bgDark: '#061311',
    surfaceDark: '#0D1F1D',
    surfaceDarkElevated: '#15312D',
    borderDark: '#27524B',
    textOnDark: '#ECFDF5',
    textMutedOnDark: '#9ACAB9',
  },
  graphiteBlue: {
    primary: '#5B6CFF',
    secondary: '#6DD6C7',
    success: '#19D3A6',
    warning: '#E3A63B',
    bgDark: '#0B0D10',
    surfaceDark: '#141922',
    surfaceDarkElevated: '#1A202A',
    borderDark: '#303847',
    textOnDark: '#F5F7FB',
    textMutedOnDark: '#A2ADBE',
  },
};

// Switch this value to quickly test another visual direction.
export const ACTIVE_UI_PALETTE: UiPaletteName = 'graphiteBlue';

export const uiPalette = UI_PALETTES[ACTIVE_UI_PALETTE];
