export type FleetBusPresentation = {
  id: string;
  plateLabel: string;
  routeName: string;
  operatorLabel: string;
  timeLabel: string;
  timeTone: 'success' | 'warning';
  badges: Array<{ id: string; label: string; tone: 'primary' | 'warning' | 'success' }>;
  isSelected: boolean;
  isStale: boolean;
};

export type SelectedBusSummary = {
  title: string;
  subtitle: string;
  detail: string;
  statusTone: 'success' | 'warning' | 'muted';
  actionLabel: string;
};

export type MapBannerState = {
  pillLabel: string;
  title: string;
  subtitle: string;
};

type BuildFleetBusParams = {
  id: string;
  placa?: string;
  routeName: string;
  operator?: string;
  isSelected: boolean;
  isStale: boolean;
  isSimulated: boolean;
  timeLabel: string;
};

export function buildFleetBusPresentation(params: BuildFleetBusParams): FleetBusPresentation {
  const { id, isSelected, isSimulated, isStale, operator, placa, routeName, timeLabel } = params;

  return {
    id,
    plateLabel: placa || 'Unidad',
    routeName,
    operatorLabel: operator?.trim() ? `Operador: ${operator}` : isStale ? 'Sin reporte reciente' : 'Ubicacion transmitida en vivo',
    timeLabel,
    timeTone: isStale ? 'warning' : 'success',
    badges: [
      { id: 'plate', label: placa || 'Unidad', tone: 'primary' },
      ...(isSimulated ? [{ id: 'sim', label: 'Simulado', tone: 'warning' as const }] : []),
      ...(isStale ? [{ id: 'stale', label: 'Sin senal', tone: 'warning' as const }] : []),
      ...(isSelected && !isStale ? [{ id: 'focus', label: 'En foco', tone: 'success' as const }] : []),
    ],
    isSelected,
    isStale,
  };
}

export function buildSelectedBusSummary(params: {
  routeName: string;
  plateLabel: string;
  isFollowing: boolean;
  isFresh: boolean;
  timeLabel: string;
}): SelectedBusSummary {
  const { isFollowing, isFresh, plateLabel, routeName, timeLabel } = params;

  if (!isFresh) {
    return {
      title: plateLabel,
      subtitle: routeName,
      detail: `Ultimo reporte ${timeLabel}. Revisa la ruta o retoma el seguimiento cuando vuelva a moverse.`,
      statusTone: 'warning',
      actionLabel: 'En pausa',
    };
  }

  if (!isFollowing) {
    return {
      title: plateLabel,
      subtitle: routeName,
      detail: 'Explorando el mapa. Retoma el seguimiento cuando quieras.',
      statusTone: 'muted',
      actionLabel: 'Retomar seguimiento',
    };
  }

  return {
    title: plateLabel,
    subtitle: routeName,
    detail: `Unidad en vivo - ${timeLabel}`,
    statusTone: 'success',
    actionLabel: 'En seguimiento',
  };
}

export function buildMapBannerState(params: {
  title: string;
  pillLabel: string;
  liveCount: number;
  subtitle: string;
}): MapBannerState {
  return {
    pillLabel: params.pillLabel,
    title: params.title,
    subtitle: `${params.liveCount} en vivo · ${params.subtitle}`,
  };
}
