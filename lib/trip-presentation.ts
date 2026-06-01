import { EtaModel } from '@/lib/home-eta';
import { PlannedJourney } from '@/lib/journey-planner';

export type TripMetaPill = {
  id: string;
  label: string;
  icon:
    | 'walk-outline'
    | 'cash-outline'
    | 'time-outline'
    | 'pulse-outline'
    | 'flag-outline'
    | 'swap-horizontal-outline';
  tone: 'wayfinding' | 'live' | 'warning' | 'neutral';
};

export type TripOptionPresentation = {
  id: string;
  routeId: number;
  routeName: string;
  routeCode: string | null;
  fareLabel: string;
  operatorLabel: string;
  etaLabel: string;
  etaMinutes: number;
  confidenceLabel: string;
  walkToBoardLabel: string;
  walkToDropLabel: string;
  totalWalkLabel: string;
  detailSummary: string;
  isBest: boolean;
  transferLabel: string | null;
  transferCount: number;
  metaPills: TripMetaPill[];
};

export type PrimaryJourneySummary = {
  title: string;
  subtitle: string;
  routeCode: string | null;
  fareLabel: string;
  etaLabel: string;
  walkLabel: string;
  destinationName: string;
};

export type ServiceStateSummary = {
  title: string;
  detail: string;
  tone: 'live' | 'warning' | 'neutral';
  coverageLabel: 'Normal' | 'Cobertura reducida' | 'Sin senal fresca';
  liveLabel: string;
  actionLabel: string;
};

export type NearbyStopPresentation = {
  id: string;
  stopName: string;
  routeId: string;
  routeName: string;
  routeCode: string;
  distanceLabel: string;
  distanceMeters: number;
  actionLabel: string;
};

type BuildTripOptionParams = {
  journey: PlannedJourney;
  eta: EtaModel;
  formatFare: (value?: number | null) => string | null;
  formatWalkLabel: (meters: number) => string;
  estimateWalkMinutes: (meters: number) => number;
  formatRouteDisplayName: (value?: string | null) => string;
  isBest: boolean;
};

function buildLegDisplayLabel(
  routeName: string | null | undefined,
  routeCode: string | null | undefined,
  formatRouteDisplayName: (value?: string | null) => string,
) {
  const trimmedRouteName = routeName?.trim();
  if (trimmedRouteName) {
    return formatRouteDisplayName(trimmedRouteName);
  }

  const trimmedRouteCode = routeCode?.trim();
  if (trimmedRouteCode) {
    return trimmedRouteCode;
  }

  return 'Ruta disponible';
}

export function buildTripOptionPresentation({
  journey,
  eta,
  formatFare,
  formatWalkLabel,
  estimateWalkMinutes,
  formatRouteDisplayName,
  isBest,
}: BuildTripOptionParams): TripOptionPresentation {
  const fareLabel = formatFare(journey.totalFare) ?? 'Sin tarifa';
  const legLabels = journey.legs.map((leg) =>
    buildLegDisplayLabel(leg.routeName, leg.routeCode, formatRouteDisplayName),
  );
  const routeName =
    journey.kind === 'transfer'
      ? Array.from(new Set(legLabels)).join(' luego ')
      : legLabels[0] ?? buildLegDisplayLabel(journey.routeName, journey.routeCode, formatRouteDisplayName);
  const primaryLegLabel = legLabels[0] ?? routeName;
  const secondaryLegLabel = legLabels[1] ?? null;
  const walkToBoardLabel = `Toma ${primaryLegLabel} en ${journey.boardStopName} | ${formatWalkLabel(journey.originWalkMeters)}`;
  const walkToDropLabel =
    journey.kind === 'transfer' && secondaryLegLabel
      ? `Luego toma ${secondaryLegLabel} y baja en ${journey.dropStopName} | ${formatWalkLabel(journey.destinationWalkMeters)}`
      : `Baja en ${journey.dropStopName} | ${formatWalkLabel(journey.destinationWalkMeters)}`;
  const totalWalkMinutes = estimateWalkMinutes(journey.totalWalkMeters);
  const confidenceLabel = `Confianza ${eta.confidence}`;
  const routeCodeLabel =
    journey.routeCodes.length > 1
      ? journey.routeCodes.join(' + ')
      : journey.routeCode?.trim() || null;
  const metaPills: TripMetaPill[] = [
    { id: 'eta', label: `${eta.etaMinutes} min`, icon: 'time-outline', tone: 'live' },
    { id: 'walk', label: `${totalWalkMinutes} min caminando`, icon: 'walk-outline', tone: 'wayfinding' },
    { id: 'fare', label: fareLabel, icon: 'cash-outline', tone: 'neutral' },
    ...(journey.transferLabel
      ? [
          {
            id: 'transfer',
            label: journey.transferLabel,
            icon: 'swap-horizontal-outline',
            tone: 'warning',
          } satisfies TripMetaPill,
        ]
      : []),
    {
      id: 'confidence',
      label: confidenceLabel,
      icon: 'pulse-outline',
      tone: eta.confidence === 'alta' ? 'live' : eta.confidence === 'media' ? 'wayfinding' : 'warning',
    },
  ];

  return {
    id: journey.id,
    routeId: journey.routeId,
    routeName,
    routeCode: routeCodeLabel,
    fareLabel,
    operatorLabel: journey.operatorLabel,
    etaLabel: `${eta.etaMinutes} min`,
    etaMinutes: eta.etaMinutes,
    confidenceLabel,
    walkToBoardLabel,
    walkToDropLabel,
    totalWalkLabel: `${totalWalkMinutes} min caminando`,
    detailSummary: journey.transferLabel
      ? `Toma ${routeName} | ${journey.transferLabel} | ${fareLabel}`
      : `Toma ${routeName} | ${fareLabel} | ${eta.etaMinutes} min`,
    isBest,
    transferLabel: journey.transferLabel,
    transferCount: Math.max(0, journey.legs.length - 1),
    metaPills,
  };
}

export function buildPrimaryJourneySummary(
  option: TripOptionPresentation,
  destinationName: string,
): PrimaryJourneySummary {
  return {
    title: `Mejor opcion para ${destinationName}`,
    subtitle: option.transferLabel
      ? `Toma ${option.routeName}, ${option.transferLabel.toLocaleLowerCase('es-CR')} y llega en aproximadamente ${option.etaLabel}.`
      : `Toma ${option.routeName} y llega en aproximadamente ${option.etaLabel}.`,
    routeCode: option.routeCode,
    fareLabel: option.fareLabel,
    etaLabel: option.etaLabel,
    walkLabel: option.totalWalkLabel,
    destinationName,
  };
}

export function buildServiceStateSummary(params: {
  liveBuses: number;
  staleBuses?: number;
  activeAlerts: number;
  hasSelection: boolean;
  loadingRoutes: boolean;
}): ServiceStateSummary {
  const { activeAlerts, hasSelection, liveBuses, loadingRoutes, staleBuses = 0 } = params;

  if (loadingRoutes) {
    return {
      title: 'Ajustando opciones',
      detail: 'Estamos comparando rutas, tarifas y tiempo estimado.',
      tone: 'neutral',
      coverageLabel: 'Normal',
      liveLabel: `${liveBuses} en vivo`,
      actionLabel: 'Ver estado',
    };
  }

  if (hasSelection && activeAlerts > 0) {
    return {
      title: 'Alertas activas',
      detail: `${activeAlerts} recordatorio${activeAlerts === 1 ? '' : 's'} listo${activeAlerts === 1 ? '' : 's'} para tu viaje.`,
      tone: 'warning',
      coverageLabel: liveBuses > 0 ? 'Normal' : 'Cobertura reducida',
      liveLabel: `${liveBuses} en vivo`,
      actionLabel: 'Ver alertas',
    };
  }

  if (liveBuses === 0 && staleBuses > 0) {
    return {
      title: 'Sin senal fresca',
      detail: 'Hay unidades conocidas, pero ninguna ha reportado hace poco.',
      tone: 'warning',
      coverageLabel: 'Sin senal fresca',
      liveLabel: '0 en vivo',
      actionLabel: 'Ver estado',
    };
  }

  return {
    title: liveBuses > 0 ? 'Servicio ahora' : 'Cobertura reducida',
    detail:
      liveBuses > 0
        ? `${liveBuses} unidad${liveBuses === 1 ? '' : 'es'} reportando cerca de ti.`
        : 'Aun sin unidades transmitiendo en tiempo real.',
    tone: liveBuses > 0 ? 'live' : 'neutral',
    coverageLabel: liveBuses > 0 ? 'Normal' : 'Cobertura reducida',
    liveLabel: `${liveBuses} en vivo`,
    actionLabel: 'Ver estado',
  };
}

export function buildNearbyStopPresentation(params: {
  id: string;
  stopName: string;
  routeId: string;
  routeName: string;
  routeCode: string;
  distanceMeters: number;
}): NearbyStopPresentation {
  const distanceLabel =
    params.distanceMeters < 1000
      ? `${Math.max(40, Math.round(params.distanceMeters / 10) * 10)} m`
      : `${(params.distanceMeters / 1000).toFixed(1)} km`;

  return {
    id: params.id,
    stopName: params.stopName,
    routeId: params.routeId,
    routeName: params.routeName,
    routeCode: params.routeCode,
    distanceLabel,
    distanceMeters: params.distanceMeters,
    actionLabel: 'Ver ruta',
  };
}
