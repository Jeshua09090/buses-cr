import { DepthBackground } from '@/components/home/DepthBackground';
import PlannerMap from '@/components/planner-lab/planner-map';
import PlannerNativeMap from '@/components/planner-lab/planner-native-map';
import type { PlannerLabMapLine, PlannerLabMapMarker } from '@/components/planner-lab/types';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { passengerSpacing } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import {
  evaluatePlannerGoldenCase,
  plannerGoldenCaseGroups,
  plannerGoldenCases,
  type PlannerGoldenCaseDirection,
  type PlannerGoldenCase,
} from '@/lib/planner-golden-cases';
import {
  buildJourneyDisplayAdvice,
  findInferiorSameRouteBoardingAlternatives,
} from '@/lib/planner-lab-quality';
import {
  computeJourneyContextPenaltyBreakdown,
  computeJourneyDisplayScore,
  filterIncoherentJourneysAfterWalking,
  getActualRouteStops,
  getRouteTrajectory,
  haversineMeters,
  type JourneyGeoMetrics,
  type PlannedJourney,
} from '@/lib/journey-planner';
import { findJourneys as findRaptorJourneys } from '@/lib/raptor';
import {
  formatRaptorLabDepartureDebug,
  resolveRaptorLabDepartureDate,
} from '@/lib/raptor/lab-validation-time';
import { rankRaptorJourneys } from '@/lib/raptor/journey-ranking';
import { getSnapshotRouteLegStopPath } from '@/lib/raptor/route-visualization';
import { buildLegTrajectoryPath } from '@/lib/raptor/visualization-path';
import { applyEndpointWalkingNetworkValidationToJourneys } from '@/lib/raptor/walking-access-validation';
import { formatRouteDisplayName } from '@/lib/route-display';
import {
  getWalkingRoute,
  type WalkingCoordinate,
  type WalkingRouteResult,
} from '@/lib/walking-network';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

const MAPBOX_PUBLIC_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
const IS_WEB_RUNTIME = Platform.OS === 'web';
const DEFAULT_ORIGIN_INPUT = '9.87829,-83.9389683';
const DEFAULT_SEARCH_PROXIMITY: [number, number] = [-83.919373, 9.864429];
const WALK_COLOR = '#FFD166';
const BUS_COLORS = ['#5B6CFF', '#25D3A6', '#F4A83A', '#86A7FF'] as const;
const LOCAL_DIRECT_PREFERENCE_DISTANCE_METERS = 5000;
const LOCAL_DIRECT_PREFERENCE_SCORE_TOLERANCE = 9;
const LOCAL_DIRECT_PREFERENCE_ETA_TOLERANCE_MIN = 8;
const LOCAL_DIRECT_PREFERENCE_WALK_TOLERANCE_METERS = 220;
const LOCAL_DIRECT_PREFERENCE_FARE_TOLERANCE = 200;
const LOCAL_TRANSFER_PREFERENCE_DISTANCE_METERS = 12000;
const LOCAL_TRANSFER_PREFERENCE_ETA_TOLERANCE_MIN = 8;
const LOCAL_TRANSFER_PREFERENCE_WALK_TOLERANCE_METERS = 260;
const LOCAL_TRANSFER_PREFERENCE_FARE_SAVINGS = 150;
const INTERURBAN_ROUTE_HINTS = ['SAN JOSE', 'TURRIALBA', 'ALAJUELA', 'HEREDIA', 'LIMON', 'PUNTARENAS'];
const NON_RECOMMENDED_SCORE_GAP = 12;
const DISCARDED_WALK_EXTRA_MINUTES = 12;
const DISCARDED_FINAL_WALK_METERS = 1400;
const DISCARDED_FINAL_WALK_EXTRA_METERS = 700;

type SearchSuggestion = {
  id: string;
  name: string;
  address: string;
  coordinates: [number, number];
  source?: 'local-landmark' | 'golden-origin' | 'golden-destination' | 'google' | 'mapbox';
};

type LocalSearchSuggestion = SearchSuggestion & {
  aliases?: string[];
};

const LOCAL_SEARCH_STOP_WORDS = new Set([
  'a',
  'al',
  'cartago',
  'costa',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'los',
  'para',
  'provincia',
  'rica',
  'y',
]);

const LOCAL_LANDMARK_SUGGESTIONS: LocalSearchSuggestion[] = [
  {
    id: 'landmark-cartago-centro',
    name: 'Cartago centro',
    address: 'Centro de Cartago',
    coordinates: [-83.919373, 9.864429],
    source: 'local-landmark',
    aliases: ['parque central cartago', 'ruinas de cartago', 'centro cartago'],
  },
  {
    id: 'landmark-terminal-cartago',
    name: 'Terminal Cartago',
    address: 'Terminal de buses de Cartago',
    coordinates: [-83.923164, 9.862138],
    source: 'local-landmark',
    aliases: ['terminal buses cartago', 'parqueo publico herradura'],
  },
  {
    id: 'landmark-tec-cartago',
    name: 'Tecnologico de Costa Rica (TEC)',
    address: 'Dulce Nombre, Cartago',
    coordinates: [-83.9124243, 9.8554619],
    source: 'local-landmark',
    aliases: ['tec cartago', 'instituto tecnologico de costa rica', 'tecnologico cartago'],
  },
  {
    id: 'landmark-basilica-angeles',
    name: 'Basilica de Nuestra Senora de los Angeles',
    address: 'Cartago centro',
    coordinates: [-83.912982, 9.8640911],
    source: 'local-landmark',
    aliases: ['basilica cartago', 'basilica los angeles', 'la negrita cartago'],
  },
  {
    id: 'landmark-paseo-metropoli',
    name: 'Paseo Metropoli',
    address: 'Taras, Cartago',
    coordinates: [-83.9426214, 9.867107],
    source: 'local-landmark',
    aliases: ['mall paseo metropoli', 'paseo metropoli cartago'],
  },
  {
    id: 'landmark-hospital-max-peralta',
    name: 'Hospital Max Peralta',
    address: 'Barrio Asis, Cartago',
    coordinates: [-83.9217538, 9.8618121],
    source: 'local-landmark',
    aliases: ['hospital cartago', 'hospital dr maximiliano peralta'],
  },
  {
    id: 'landmark-lankester',
    name: 'Jardin Botanico Lankester',
    address: 'Dulce Nombre / Paraiso, Cartago',
    coordinates: [-83.8902015, 9.8394544],
    source: 'local-landmark',
    aliases: ['lankester', 'botanico lankester', 'ucr lankester'],
  },
  {
    id: 'landmark-llanos-santa-lucia',
    name: 'Llanos de Santa Lucia',
    address: 'Contiguo Pali, Santa Lucia, Paraiso, Cartago',
    coordinates: [-83.88357049, 9.8433782],
    source: 'local-landmark',
    aliases: [
      'llanos santa lucia',
      'llanos de santa lucia paraiso',
      'santa lucia paraiso',
      'el pollote llanos',
    ],
  },
  {
    id: 'landmark-paraiso-centro',
    name: 'Paraiso centro',
    address: 'Paraiso, Cartago',
    coordinates: [-83.8664324, 9.8392523],
    source: 'local-landmark',
    aliases: ['paraiso cartago', 'centro de paraiso'],
  },
  {
    id: 'landmark-orosi-centro',
    name: 'Orosi centro',
    address: 'Orosi, Cartago',
    coordinates: [-83.8452418, 9.783408],
    source: 'local-landmark',
    aliases: ['orosi cartago', 'centro de orosi'],
  },
  {
    id: 'landmark-ruinas-ujarras',
    name: 'Ruinas de Ujarras',
    address: 'Ujarras, Paraiso',
    coordinates: [-83.8361986, 9.8278158],
    source: 'local-landmark',
    aliases: ['ujarras', 'ruinas ujarras cartago'],
  },
  {
    id: 'landmark-mirador-orosi',
    name: 'Mirador de Orosi',
    address: 'Paraiso / Orosi, Cartago',
    coordinates: [-83.8582366, 9.8186699],
    source: 'local-landmark',
    aliases: ['mirador orosi cartago'],
  },
  {
    id: 'landmark-rio-loro',
    name: 'Parque Ambiental Rio Loro',
    address: 'Rio Loro, Cartago',
    coordinates: [-83.9425011, 9.9075246],
    source: 'local-landmark',
    aliases: ['rio loro cartago', 'parque rio loro', 'ambiental rio loro'],
  },
  {
    id: 'landmark-sanatorio-duran',
    name: 'Sanatorio Duran',
    address: 'Tierra Blanca, Cartago',
    coordinates: [-83.885614, 9.936879],
    source: 'local-landmark',
    aliases: ['sanatorio carlos duran', 'sanatorio duran cartin', 'hospital sanatorio duran'],
  },
  {
    id: 'landmark-volcan-irazu',
    name: 'Parque Nacional Volcan Irazu',
    address: 'Oreamuno, Cartago',
    coordinates: [-83.84487054, 9.9778156],
    source: 'local-landmark',
    aliases: ['volcan irazu', 'irazu', 'sector volcan irazu'],
  },
  {
    id: 'landmark-tobosi',
    name: 'Tobosi',
    address: 'El Guarco, Cartago',
    coordinates: [-83.98419924, 9.84032959],
    source: 'local-landmark',
    aliases: ['tobosi el guarco'],
  },
  {
    id: 'landmark-parque-tejar',
    name: 'Parque de Tejar',
    address: 'El Tejar, El Guarco, Cartago',
    coordinates: [-83.9385643, 9.8439289],
    source: 'local-landmark',
    aliases: ['parque tejar', 'tejar centro', 'iglesia del tejar', 'restaurante las vegas tejar'],
  },
  {
    id: 'landmark-plaza-san-isidro-tejar',
    name: 'Plaza San Isidro, Tejar',
    address: 'San Isidro, El Guarco, Cartago',
    coordinates: [-83.9525036531641, 9.82938521411127],
    source: 'local-landmark',
    aliases: [
      'plaza san isidro tejar',
      'san isidro del guarco',
      'san isidro el guarco',
      'parada plaza san isidro',
    ],
  },
  {
    id: 'landmark-guadalupe-cartago',
    name: 'Guadalupe, Cartago',
    address: 'Guadalupe / Cartago norte',
    coordinates: [-83.9244086, 9.8660225],
    source: 'local-landmark',
    aliases: ['guadalupe cartago', 'guadalupe centro cartago', 'cartago guadalupe'],
  },
  {
    id: 'landmark-tablon',
    name: 'Tablon',
    address: 'El Guarco, Cartago',
    coordinates: [-83.99791, 9.84211],
    source: 'local-landmark',
    aliases: ['tablon el guarco', 'terminal tablon'],
  },
  {
    id: 'landmark-tierra-blanca',
    name: 'Tierra Blanca',
    address: 'Oreamuno, Cartago',
    coordinates: [-83.892355, 9.9161836],
    source: 'local-landmark',
    aliases: ['tierra blanca cartago'],
  },
  {
    id: 'landmark-llano-grande',
    name: 'Llano Grande',
    address: 'Cartago norte',
    coordinates: [-83.910782, 9.9412609],
    source: 'local-landmark',
    aliases: ['llano grande cartago'],
  },
  {
    id: 'landmark-parque-industrial',
    name: 'Parque Industrial Cartago',
    address: 'La Lima / Taras, Cartago',
    coordinates: [-83.948741, 9.8682919],
    source: 'local-landmark',
    aliases: ['zona franca cartago', 'parque industrial la lima'],
  },
  {
    id: 'landmark-pali-taras',
    name: 'Pali Taras',
    address: 'Taras / San Nicolas, Cartago',
    coordinates: [-83.934149, 9.8788492],
    source: 'local-landmark',
    aliases: ['pali', 'pali san nicolas', 'pali taras cartago', 'pali cerca de san nicolas'],
  },
  {
    id: 'landmark-restaurante-las-vegas',
    name: 'Restaurante Las Vegas',
    address: 'El Tejar, Cartago',
    coordinates: [-83.9385643, 9.8439289],
    source: 'local-landmark',
    aliases: ['las vegas tejar', 'restaurante las vegas taras', 'parque de tejar'],
  },
];

type JourneyStep = {
  id: string;
  kind: 'walk' | 'bus';
  title: string;
  detail: string;
  meters: number;
  color: string;
  minutes?: number | null;
  routeAvailable?: boolean | null;
};

type JourneyVisualization = {
  markers: PlannerLabMapMarker[];
  lines: PlannerLabMapLine[];
  steps: JourneyStep[];
  totalBusMeters: number;
  totalWalkMeters: number;
  totalWalkMinutes: number;
  finalWalkMeters: number | null;
  finalWalkMinutes: number | null;
  finalWalkRouteAvailable: boolean | null;
};

type JourneyDebugSnapshot = {
  baseScore: number;
  etaPenalty: number;
  contextPenalty: number;
  displayScore: number;
  reasons: { id: string; label: string; penalty: number }[];
  metrics: {
    firstLegDestinationDistanceMeters: number | null;
    finalStopDestinationDistanceMeters: number | null;
    firstLegProgressRatio: number | null;
    finalStopProgressRatio: number | null;
  } | null;
  geoMetrics: JourneyGeoMetrics | null;
};

type DevicePerfSummary = {
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  sourceCounts: Record<string, number>;
  modeCounts: Record<string, number>;
  slowest: {
    id: string;
    elapsedMs: number;
    source: string;
    topTitle: string;
  }[];
};

function formatFareLabel(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Sin tarifa';
  return `CRC ${Math.round(value).toLocaleString('es-CR')}`;
}

function formatMetersLabel(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatOptionalMetersLabel(meters?: number | null) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return 'Sin dato';
  return formatMetersLabel(meters);
}

function formatOptionalMinutesLabel(minutes?: number | null) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return 'Sin dato';
  return `${Math.round(minutes)} min`;
}

function formatScoreLabel(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Sin dato';
  return value.toFixed(1);
}

function formatSignedScoreLabel(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Sin ajuste';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}`;
}

function formatRatioLabel(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Sin dato';
  return `${Math.round(value * 100)}%`;
}

function formatQualityFlags(flags?: string[] | null) {
  if (!flags?.length) return 'Sin banderas';
  return flags.join(', ');
}

function formatTransferQualityLabel(value?: string | null) {
  switch (normalizeRouteHint(value ?? '')) {
    case 'SAME_STOP':
      return 'misma parada';
    case 'NEARBY_WALK':
    case 'WALK':
      return 'caminata corta';
    case 'HUB':
      return 'hub';
    default:
      return value ?? 'Directo o sin dato';
  }
}

function estimateWalkMinutes(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  return Math.max(1, Math.round(meters / 80));
}

function estimateJourneyWalkMinutes(journey: PlannedJourney) {
  const finalNetworkMinutes = journey.geoMetrics?.finalWalkNetworkMinutes;
  if (typeof finalNetworkMinutes === 'number' && Number.isFinite(finalNetworkMinutes)) {
    const nonFinalWalkMeters = Math.max(
      0,
      journey.totalWalkMeters - journey.destinationWalkMeters,
    );
    return estimateWalkMinutes(nonFinalWalkMeters) + finalNetworkMinutes;
  }

  return estimateWalkMinutes(journey.totalWalkMeters);
}

function formatWalkStepMinutes(step: JourneyStep) {
  const minutes =
    typeof step.minutes === 'number' && Number.isFinite(step.minutes)
      ? step.minutes
      : estimateWalkMinutes(step.meters);

  return `${minutes} min`;
}

function normalizeRouteHint(value?: string | null) {
  return (value ?? '').toLocaleUpperCase('es-CR');
}

function isReasonableDirectAlternative(params: {
  bestJourney: PlannedJourney;
  directJourney: PlannedJourney;
  bestScore: number;
  directScore: number;
  bestEtaMinutes: number | null;
  directEtaMinutes: number | null;
  tripDistanceMeters: number | null;
}) {
  const {
    bestEtaMinutes,
    bestJourney,
    bestScore,
    directEtaMinutes,
    directJourney,
    directScore,
    tripDistanceMeters,
  } = params;

  if (bestJourney.kind !== 'transfer' || directJourney.kind !== 'direct') {
    return false;
  }

  if (directScore > bestScore + LOCAL_DIRECT_PREFERENCE_SCORE_TOLERANCE) {
    return false;
  }

  if (
    typeof bestEtaMinutes === 'number' &&
    typeof directEtaMinutes === 'number' &&
    directEtaMinutes > bestEtaMinutes + LOCAL_DIRECT_PREFERENCE_ETA_TOLERANCE_MIN
  ) {
    return false;
  }

  if (
    directJourney.totalWalkMeters >
    bestJourney.totalWalkMeters + LOCAL_DIRECT_PREFERENCE_WALK_TOLERANCE_METERS
  ) {
    return false;
  }

  if (
    typeof bestJourney.totalFare === 'number' &&
    typeof directJourney.totalFare === 'number' &&
    directJourney.totalFare > bestJourney.totalFare + LOCAL_DIRECT_PREFERENCE_FARE_TOLERANCE
  ) {
    return false;
  }

  const directRouteText = normalizeRouteHint(
    directJourney.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );
  const bestRouteText = normalizeRouteHint(
    bestJourney.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );

  if (
    typeof tripDistanceMeters === 'number' &&
    tripDistanceMeters <= 9_000 &&
    directRouteText.includes('SAN JOSE') &&
    !bestRouteText.includes('SAN JOSE')
  ) {
    return false;
  }

  return true;
}

function isReasonableLocalTransferAlternative(params: {
  bestJourney: PlannedJourney;
  transferJourney: PlannedJourney;
  bestEtaMinutes: number | null;
  transferEtaMinutes: number | null;
  tripDistanceMeters: number | null;
}) {
  const { bestEtaMinutes, bestJourney, transferEtaMinutes, transferJourney, tripDistanceMeters } = params;

  if (bestJourney.kind !== 'direct' || transferJourney.kind !== 'transfer') {
    return false;
  }

  if (
    typeof tripDistanceMeters !== 'number' ||
    tripDistanceMeters > LOCAL_TRANSFER_PREFERENCE_DISTANCE_METERS
  ) {
    return false;
  }

  const bestRouteText = normalizeRouteHint(
    bestJourney.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );
  const transferRouteText = normalizeRouteHint(
    transferJourney.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );

  const bestLooksInterurban =
    INTERURBAN_ROUTE_HINTS.some((hint) => bestRouteText.includes(hint)) ||
    bestRouteText.includes('SAN JOSE-') ||
    bestRouteText.includes('SAN JOSE ');
  const transferLooksLocal = !INTERURBAN_ROUTE_HINTS.some((hint) => transferRouteText.includes(hint));

  if (!bestLooksInterurban || !transferLooksLocal) {
    return false;
  }

  if (
    typeof bestEtaMinutes === 'number' &&
    typeof transferEtaMinutes === 'number' &&
    transferEtaMinutes > bestEtaMinutes + LOCAL_TRANSFER_PREFERENCE_ETA_TOLERANCE_MIN
  ) {
    return false;
  }

  if (
    transferJourney.totalWalkMeters >
    bestJourney.totalWalkMeters + LOCAL_TRANSFER_PREFERENCE_WALK_TOLERANCE_METERS
  ) {
    return false;
  }

  const bestFare = typeof bestJourney.totalFare === 'number' ? bestJourney.totalFare : null;
  const transferFare = typeof transferJourney.totalFare === 'number' ? transferJourney.totalFare : null;
  const hasMeaningfulFareSavings =
    bestFare !== null &&
    transferFare !== null &&
    transferFare <= bestFare - LOCAL_TRANSFER_PREFERENCE_FARE_SAVINGS;

  const transferHasMuchBetterDrop =
    transferJourney.destinationWalkMeters + 80 < bestJourney.destinationWalkMeters;

  return hasMeaningfulFareSavings || transferHasMuchBetterDrop;
}

function pickPreferredJourney(params: {
  journeys: PlannedJourney[];
  displayScoreByJourneyId: Map<string, number>;
  tripDistanceMeters: number | null;
}) {
  const { displayScoreByJourneyId, journeys, tripDistanceMeters } = params;
  if (journeys.length === 0) return null;

  const ranked = [...journeys].sort((a, b) => {
    const aScore = displayScoreByJourneyId.get(a.id) ?? a.score;
    const bScore = displayScoreByJourneyId.get(b.id) ?? b.score;
    return aScore - bScore;
  });

  const scoredBest = ranked.reduce<PlannedJourney | null>((best, journey) => {
    const score = displayScoreByJourneyId.get(journey.id) ?? journey.score;

    if (!best) return journey;

    const bestScore = displayScoreByJourneyId.get(best.id) ?? best.score;
    return score < bestScore ? journey : best;
  }, null);

  if (!scoredBest) return null;

  const bestScore = displayScoreByJourneyId.get(scoredBest.id) ?? scoredBest.score;

  if (
    scoredBest.kind === 'transfer' &&
    tripDistanceMeters &&
    tripDistanceMeters <= LOCAL_DIRECT_PREFERENCE_DISTANCE_METERS
  ) {
    const directAlternative = ranked.find((journey) => {
      if (journey.kind !== 'direct') return false;

      const directScore = displayScoreByJourneyId.get(journey.id) ?? journey.score;
      return isReasonableDirectAlternative({
        bestJourney: scoredBest,
        directJourney: journey,
        bestScore,
        directScore,
        bestEtaMinutes: null,
        directEtaMinutes: null,
        tripDistanceMeters,
      });
    });

    return directAlternative ?? scoredBest;
  }

  if (scoredBest.kind === 'direct') {
    const transferAlternative = ranked.find((journey) => {
      if (journey.kind !== 'transfer') return false;

      return isReasonableLocalTransferAlternative({
        bestJourney: scoredBest,
        transferJourney: journey,
        bestEtaMinutes: null,
        transferEtaMinutes: null,
        tripDistanceMeters,
      });
    });

    return transferAlternative ?? scoredBest;
  }

  return scoredBest;
}

type AlternativeVisibility = {
  scoreDelta: number | null;
  isDiscarded: boolean;
  discardReason: 'score' | 'walk' | null;
};

function evaluateAlternativeVisibility(params: {
  journey: PlannedJourney;
  recommendedJourney: PlannedJourney | null;
  displayScore: number;
  recommendedScore: number | null;
}) {
  const { displayScore, journey, recommendedJourney, recommendedScore } = params;

  if (!recommendedJourney || journey.id === recommendedJourney.id || recommendedScore === null) {
    return {
      scoreDelta: recommendedScore === null ? null : displayScore - recommendedScore,
      isDiscarded: false,
      discardReason: null,
    } satisfies AlternativeVisibility;
  }

  const scoreDelta = displayScore - recommendedScore;
  const recommendedWalkMinutes = estimateJourneyWalkMinutes(recommendedJourney);
  const journeyWalkMinutes = estimateJourneyWalkMinutes(journey);
  const finalWalkExtraMeters = journey.destinationWalkMeters - recommendedJourney.destinationWalkMeters;
  const hasClearlyWorseWalk =
    journeyWalkMinutes >= recommendedWalkMinutes + DISCARDED_WALK_EXTRA_MINUTES ||
    (
      journey.destinationWalkMeters >= DISCARDED_FINAL_WALK_METERS &&
      finalWalkExtraMeters >= DISCARDED_FINAL_WALK_EXTRA_METERS
    );

  if (scoreDelta > NON_RECOMMENDED_SCORE_GAP) {
    return { scoreDelta, isDiscarded: true, discardReason: 'score' } satisfies AlternativeVisibility;
  }

  if (hasClearlyWorseWalk) {
    return { scoreDelta, isDiscarded: true, discardReason: 'walk' } satisfies AlternativeVisibility;
  }

  return { scoreDelta, isDiscarded: false, discardReason: null } satisfies AlternativeVisibility;
}

function formatCoordinateInput(coordinate: [number, number]) {
  return `${coordinate[1].toFixed(6)},${coordinate[0].toFixed(6)}`;
}

function parseCoordinateInput(value: string): [number, number] | null {
  const parts = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));

  if (parts.length < 2) return null;

  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function goldenCaseDestinationCoordinates(goldenCase: PlannerGoldenCase) {
  return goldenCase.destinationCoordinates ?? parseCoordinateInput(goldenCase.destinationQuery);
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1),
  );

  return sortedValues[index];
}

function buildJourneyTitle(journey: PlannedJourney) {
  const labels = journey.legs
    .map((leg) => leg.routeName?.trim() || leg.routeCode?.trim() || null)
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(labels.map((value) => formatRouteDisplayName(value)))).join(' luego ');
}

function buildJourneySubtitle(journey: PlannedJourney) {
  if (journey.kind === 'transfer') {
    return `${journey.boardStopName} -> ${journey.dropStopName} | ${journey.transferLabel ?? '1 transbordo'}`;
  }

  return `${journey.boardStopName} -> ${journey.dropStopName}`;
}

function computePathDistance(coordinates: [number, number][]) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineMeters(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

function buildStraightWalkingResult(
  from: WalkingCoordinate,
  to: WalkingCoordinate,
): WalkingRouteResult {
  const straightLineMeters = haversineMeters(from, to);

  return {
    provider: 'mapbox',
    status: 'unavailable',
    routeAvailable: false,
    straightLineMeters,
    networkDistanceMeters: null,
    networkDurationMinutes: null,
    detourRatio: null,
    coordinates: [from, to],
    failureReason: 'straight-line-fallback',
  };
}

async function resolveWalkingDisplayRoute(params: {
  cachedCoordinates?: [number, number][] | null;
  cachedDistanceMeters?: number | null;
  cachedDurationMinutes?: number | null;
  from: WalkingCoordinate;
  to: WalkingCoordinate;
}) {
  const { cachedCoordinates, cachedDistanceMeters, cachedDurationMinutes, from, to } = params;

  if (cachedCoordinates && cachedCoordinates.length >= 2) {
    const fallbackDistance = computePathDistance(cachedCoordinates);
    return {
      coordinates: cachedCoordinates,
      meters:
        typeof cachedDistanceMeters === 'number' && Number.isFinite(cachedDistanceMeters)
          ? cachedDistanceMeters
          : fallbackDistance,
      minutes: cachedDurationMinutes ?? estimateWalkMinutes(fallbackDistance),
      routeAvailable: true,
    };
  }

  const walkingRoute = await getWalkingRoute({ from, to });
  if (
    walkingRoute.status === 'ok' &&
    walkingRoute.coordinates.length >= 2 &&
    typeof walkingRoute.networkDistanceMeters === 'number'
  ) {
    return {
      coordinates: walkingRoute.coordinates,
      meters: walkingRoute.networkDistanceMeters,
      minutes: walkingRoute.networkDurationMinutes,
      routeAvailable: true,
    };
  }

  const straightRoute = buildStraightWalkingResult(from, to);
  return {
    coordinates: straightRoute.coordinates,
    meters: straightRoute.straightLineMeters,
    minutes: estimateWalkMinutes(straightRoute.straightLineMeters),
    routeAvailable: false,
  };
}

function stopCoordinateFromLeg(
  stop:
    | PlannedJourney['legs'][number]['boardStop']
    | PlannedJourney['legs'][number]['alightStop']
    | undefined,
): [number, number] | null {
  if (!stop) return null;
  if (!Number.isFinite(Number(stop.lng)) || !Number.isFinite(Number(stop.lat))) return null;
  return [Number(stop.lng), Number(stop.lat)];
}

function buildLegStopPath(params: {
  routeStops: Awaited<ReturnType<typeof getActualRouteStops>>;
  boardStopId?: number | null;
  alightStopId?: number | null;
  boardCoordinate: [number, number] | null;
  alightCoordinate: [number, number] | null;
}) {
  const { alightCoordinate, alightStopId, boardCoordinate, boardStopId, routeStops } = params;

  if (routeStops.length > 0 && boardStopId != null && alightStopId != null) {
    const boardIndex = routeStops.findIndex((stop) => stop.parada_id === boardStopId);
    const alightIndex = routeStops.findIndex((stop) => stop.parada_id === alightStopId);

    if (boardIndex >= 0 && alightIndex >= 0 && boardIndex !== alightIndex) {
      const sliced =
        boardIndex < alightIndex
          ? routeStops.slice(boardIndex, alightIndex + 1)
          : routeStops.slice(alightIndex, boardIndex + 1).reverse();

      const coordinates = sliced
        .filter((stop) => Number.isFinite(stop.lng) && Number.isFinite(stop.lat))
        .map((stop) => [stop.lng, stop.lat] as [number, number]);

      if (coordinates.length >= 2) return coordinates;
    }
  }

  if (boardCoordinate && alightCoordinate) return [boardCoordinate, alightCoordinate];
  return [];
}

function chooseBusDisplayPath(params: {
  trajectoryPath: [number, number][];
  stopPath: [number, number][];
}) {
  if (params.trajectoryPath.length >= 3) return params.trajectoryPath;
  if (params.stopPath.length >= 2) return params.stopPath;
  return params.trajectoryPath;
}

function formatGoldenCaseDirection(direction: PlannerGoldenCaseDirection) {
  switch (direction) {
    case 'ida':
      return 'Ida';
    case 'vuelta':
      return 'Regreso';
    case 'circular':
      return 'Anillo';
    default:
      return 'Local';
  }
}

function normalizeSearchText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es-CR');
}

function getLocalSearchTokens(value: string) {
  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length >= 2 && !LOCAL_SEARCH_STOP_WORDS.has(token));
}

function localSearchSuggestionTexts(suggestion: LocalSearchSuggestion) {
  return [suggestion.name, suggestion.address, ...(suggestion.aliases ?? [])].map((value) =>
    normalizeSearchText(value),
  );
}

function buildLocalSearchCatalog() {
  const catalog = new Map<string, LocalSearchSuggestion>();

  LOCAL_LANDMARK_SUGGESTIONS.forEach((suggestion) => {
    catalog.set(suggestion.id, suggestion);
  });

  plannerGoldenCases.forEach((goldenCase) => {
    catalog.set(`origin-${goldenCase.id}`, {
      id: `local-origin-${goldenCase.id}`,
      name: goldenCase.originLabel,
      address: `Origen caso oro: ${goldenCase.name}`,
      coordinates: goldenCase.originCoordinates,
      source: 'golden-origin',
    });

    if (goldenCase.destinationCoordinates) {
      catalog.set(`destination-${goldenCase.id}`, {
        id: `local-destination-${goldenCase.id}`,
        name: goldenCase.destinationLabel ?? goldenCase.destinationQuery,
        address: `Destino caso oro: ${goldenCase.name}`,
        coordinates: goldenCase.destinationCoordinates,
        source: 'golden-destination',
      });
    }
  });

  return [...catalog.values()];
}

const LOCAL_SEARCH_CATALOG = buildLocalSearchCatalog();

function getLocalSearchSuggestions(query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = getLocalSearchTokens(query);
  if (normalizedQuery.length < 2) return [];

  return LOCAL_SEARCH_CATALOG
    .map((suggestion) => {
      const normalizedName = normalizeSearchText(suggestion.name);
      const normalizedAddress = normalizeSearchText(suggestion.address);
      const searchableTexts = localSearchSuggestionTexts(suggestion);
      const exactName = normalizedName === normalizedQuery;
      const startsName = normalizedName.startsWith(normalizedQuery);
      const containsName = normalizedName.includes(normalizedQuery);
      const containsAddress = normalizedAddress.includes(normalizedQuery);
      const matchesNameTokens =
        queryTokens.length > 0 && queryTokens.every((token) => normalizedName.includes(token));
      const matchesAnyTokens =
        queryTokens.length > 0 &&
        queryTokens.every((token) => searchableTexts.some((text) => text.includes(token)));

      if (
        !exactName &&
        !startsName &&
        !containsName &&
        !containsAddress &&
        !matchesNameTokens &&
        !matchesAnyTokens
      ) {
        return null;
      }

      const rank = exactName
        ? 0
        : startsName
          ? 1
          : containsName
            ? 2
            : matchesNameTokens
              ? 3
              : containsAddress
                ? 4
                : 5;
      return { rank, suggestion };
    })
    .filter(
      (value): value is { rank: number; suggestion: SearchSuggestion } => Boolean(value),
    )
    .sort((a, b) => a.rank - b.rank || a.suggestion.name.localeCompare(b.suggestion.name, 'es-CR'))
    .map((value) => value.suggestion)
    .slice(0, 6);
}

function buildSearchSuggestionKey(suggestion: SearchSuggestion) {
  return `${normalizeSearchText(suggestion.name)}:${suggestion.coordinates
    .map((coordinate) => coordinate.toFixed(5))
    .join(',')}`;
}

function mergeSearchSuggestions(
  localSuggestions: SearchSuggestion[],
  providerSuggestions: SearchSuggestion[],
) {
  const seen = new Set<string>();
  return [...localSuggestions, ...providerSuggestions].filter((suggestion) => {
    const key = buildSearchSuggestionKey(suggestion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldResolveDestinationFromCurrentQuery(params: {
  origin: [number, number] | null;
  query: string;
  selectedDestination: SearchSuggestion | null;
}) {
  const trimmedQuery = params.query.trim();
  if (!params.selectedDestination) return true;
  if (!trimmedQuery) return false;
  if (parseCoordinateInput(trimmedQuery)) return true;

  const normalizedQuery = normalizeSearchText(trimmedQuery);
  const normalizedSelectedName = normalizeSearchText(params.selectedDestination.name);
  const normalizedSelectedAddress = normalizeSearchText(params.selectedDestination.address);
  const queryStillMatchesSelection =
    normalizedQuery === normalizedSelectedName || normalizedQuery === normalizedSelectedAddress;

  if (!queryStillMatchesSelection) return true;

  const bestLocalSuggestion = getLocalSearchSuggestions(trimmedQuery)[0];
  if (!bestLocalSuggestion || bestLocalSuggestion.id === params.selectedDestination.id) {
    return false;
  }

  if (buildSearchSuggestionKey(bestLocalSuggestion) === buildSearchSuggestionKey(params.selectedDestination)) {
    return false;
  }

  if (params.origin) {
    const selectedDistance = haversineMeters(
      params.origin,
      params.selectedDestination.coordinates,
    );
    const localDistance = haversineMeters(params.origin, bestLocalSuggestion.coordinates);
    if (localDistance + 250 < selectedDistance) return true;
  }

  return (
    normalizedQuery === normalizedSelectedName &&
    normalizeSearchText(bestLocalSuggestion.name) !== normalizedSelectedName
  );
}

function queryMatchesSelectedSuggestion(query: string, suggestion: SearchSuggestion | null) {
  if (!suggestion) return false;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  return (
    normalizedQuery === normalizeSearchText(suggestion.name) ||
    normalizedQuery === normalizeSearchText(suggestion.address)
  );
}

function getSearchSuggestionSourceMeta(suggestion: SearchSuggestion) {
  switch (suggestion.source) {
    case 'local-landmark':
      return { label: 'Local', icon: 'pin-outline' as const, tone: 'accent' as const };
    case 'golden-origin':
      return { label: 'Caso oro', icon: 'navigate-outline' as const, tone: 'live' as const };
    case 'golden-destination':
      return { label: 'Caso oro', icon: 'flag-outline' as const, tone: 'live' as const };
    case 'google':
      return { label: 'Google', icon: 'search-outline' as const, tone: 'neutral' as const };
    case 'mapbox':
      return { label: 'Mapbox', icon: 'map-outline' as const, tone: 'neutral' as const };
    default:
      return null;
  }
}

async function fetchGooglePlaceSuggestions(params: {
  query: string;
  proximity?: [number, number] | null;
}) {
  const searchParams = new URLSearchParams({
    q: params.query,
  });

  if (params.proximity) {
    searchParams.set('proximity', `${params.proximity[0]},${params.proximity[1]}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5500);

  try {
    const response = await fetch(`/api/places?${searchParams.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = await response.json().catch(() => null);
    const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];

    return suggestions
      .map((suggestion: any) => {
        const coordinates = Array.isArray(suggestion?.coordinates)
          ? [Number(suggestion.coordinates[0]), Number(suggestion.coordinates[1])]
          : null;

        if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
          return null;
        }

        return {
          id: String(suggestion?.id ?? `google-${coordinates[0]}-${coordinates[1]}`),
          name: String(suggestion?.name ?? params.query),
          address: String(suggestion?.address ?? ''),
          coordinates: coordinates as [number, number],
          source: 'google',
        } satisfies SearchSuggestion;
      })
      .filter((value: SearchSuggestion | null): value is SearchSuggestion => Boolean(value));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchMapboxSuggestions(params: {
  query: string;
  proximity?: [number, number] | null;
}) {
  const localSuggestions = getLocalSearchSuggestions(params.query);
  const googleSuggestions = await fetchGooglePlaceSuggestions(params);
  if (!MAPBOX_PUBLIC_TOKEN) return mergeSearchSuggestions(localSuggestions, googleSuggestions);

  const searchParams = new URLSearchParams({
    q: params.query,
    access_token: MAPBOX_PUBLIC_TOKEN,
    country: 'cr',
    language: 'es',
    limit: '6',
    types: 'poi,address,street,place,locality,neighborhood',
    auto_complete: 'true',
  });

  if (params.proximity) {
    searchParams.set('proximity', `${params.proximity[0]},${params.proximity[1]}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5500);

  let response: Response;
  try {
    response = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${searchParams.toString()}`, {
      signal: controller.signal,
    });
  } catch {
    return mergeSearchSuggestions(localSuggestions, googleSuggestions);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) return mergeSearchSuggestions(localSuggestions, googleSuggestions);

  const payload = await response.json();
  const features = Array.isArray(payload?.features) ? payload.features : [];

  const mapboxSuggestions = features
    .map((feature: any) => {
      const coordinates = Array.isArray(feature?.geometry?.coordinates)
        ? [Number(feature.geometry.coordinates[0]), Number(feature.geometry.coordinates[1])]
        : null;

      if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
        return null;
      }

      const name =
        feature?.properties?.name_preferred ??
        feature?.properties?.name ??
        feature?.text ??
        feature?.place_name?.split(',')[0] ??
        params.query;
      const address =
        feature?.properties?.full_address ??
        feature?.properties?.place_formatted ??
        feature?.properties?.address ??
        feature?.place_name ??
        '';
      const id =
        feature?.properties?.mapbox_id ??
        feature?.id ??
        `${name}-${coordinates[0].toFixed(5)}-${coordinates[1].toFixed(5)}`;

      return {
        id: String(id),
        name: String(name),
        address: String(address),
        coordinates: coordinates as [number, number],
        source: 'mapbox',
      } satisfies SearchSuggestion;
    })
    .filter((value: SearchSuggestion | null): value is SearchSuggestion => Boolean(value));

  return mergeSearchSuggestions(
    mergeSearchSuggestions(localSuggestions, googleSuggestions),
    mapboxSuggestions,
  );
}

async function buildJourneyVisualization(params: {
  destination: SearchSuggestion;
  journey: PlannedJourney;
  origin: [number, number];
}) {
  const { destination, journey, origin } = params;
  const markers: PlannerLabMapMarker[] = [
    {
      id: 'origin',
      label: 'Origen',
      shortLabel: 'O',
      kind: 'origin',
      coordinates: origin,
      color: '#FFFFFF',
    },
    {
      id: 'destination',
      label: destination.name,
      shortLabel: 'D',
      kind: 'destination',
      coordinates: destination.coordinates,
      color: '#FF86B7',
    },
  ];
  const lines: PlannerLabMapLine[] = [];
  const steps: JourneyStep[] = [];
  let totalBusMeters = 0;

  const firstBoardCoordinate = stopCoordinateFromLeg(journey.legs[0]?.boardStop);
  if (firstBoardCoordinate) {
    const walkToBoard = await resolveWalkingDisplayRoute({
      from: origin,
      to: firstBoardCoordinate,
    });
    if (walkToBoard.meters > 8) {
      lines.push({
        id: 'walk-origin',
        label: 'Camino al primer bus',
        kind: 'walk',
        coordinates: walkToBoard.coordinates,
        color: WALK_COLOR,
        width: 4,
      });
      steps.push({
        id: 'walk-origin',
        kind: 'walk',
        title: 'Camina al primer bus',
        detail: journey.legs[0]?.boardStopName ?? 'Parada de salida',
        meters: walkToBoard.meters,
        minutes: walkToBoard.minutes,
        routeAvailable: walkToBoard.routeAvailable,
        color: WALK_COLOR,
      });
    }
  }

  for (const [index, leg] of journey.legs.entries()) {
    const color = BUS_COLORS[index % BUS_COLORS.length];
    const routeStops = await getActualRouteStops(leg.routeId);
    const trajectorySegments = await getRouteTrajectory(leg.routeId);
    const boardCoordinate = stopCoordinateFromLeg(leg.boardStop);
    const alightCoordinate = stopCoordinateFromLeg(leg.alightStop);

    trajectorySegments.forEach((segment, segmentIndex) => {
      if (segment.length < 2) return;
      lines.push({
        id: `ghost-${leg.routeId}-${segmentIndex}`,
        label: `${formatRouteDisplayName(leg.routeName ?? leg.routeCode)} completo`,
        kind: 'ghost',
        coordinates: segment,
        color,
        width: 3,
        opacity: 0.24,
      });
    });

    const trajectoryPath = buildLegTrajectoryPath({
      trajectorySegments,
      boardCoordinate,
      alightCoordinate,
    });
    const snapshotStopPath = await getSnapshotRouteLegStopPath({
      routeId: leg.routeId,
      boardStopId: leg.boardStopId ?? null,
      alightStopId: leg.alightStopId ?? null,
      boardCoordinate,
      alightCoordinate,
    });
    const remoteStopPath = buildLegStopPath({
      routeStops,
      boardStopId: leg.boardStopId,
      alightStopId: leg.alightStopId,
      boardCoordinate,
      alightCoordinate,
    });
    const stopPath = snapshotStopPath.length >= 2 ? snapshotStopPath : remoteStopPath;
    const segmentPath = chooseBusDisplayPath({ trajectoryPath, stopPath });

    if (segmentPath.length >= 2) {
      const segmentDistance = computePathDistance(segmentPath);
      totalBusMeters += segmentDistance;
      lines.push({
        id: `bus-${index + 1}`,
        label: formatRouteDisplayName(leg.routeName ?? leg.routeCode),
        kind: 'bus',
        coordinates: segmentPath,
        color,
        width: 5,
      });
      steps.push({
        id: `bus-${index + 1}`,
        kind: 'bus',
        title: formatRouteDisplayName(leg.routeName ?? leg.routeCode),
        detail: `${leg.boardStopName ?? 'Subida'} -> ${leg.alightStopName ?? 'Bajada'}`,
        meters: segmentDistance,
        color,
      });
    }

    if (boardCoordinate) {
      markers.push({
        id: `board-${index + 1}`,
        label: leg.boardStopName ?? `Subida ${index + 1}`,
        shortLabel: `S${index + 1}`,
        kind: 'board',
        coordinates: boardCoordinate,
        color,
      });
    }

    if (alightCoordinate) {
      markers.push({
        id: `alight-${index + 1}`,
        label: leg.alightStopName ?? `Bajada ${index + 1}`,
        shortLabel: index === journey.legs.length - 1 ? 'B' : `B${index + 1}`,
        kind: index === journey.legs.length - 1 ? 'alight' : 'transfer',
        coordinates: alightCoordinate,
        color,
      });
    }

    if (index < journey.legs.length - 1) {
      const nextBoardCoordinate = stopCoordinateFromLeg(journey.legs[index + 1]?.boardStop);
      if (alightCoordinate && nextBoardCoordinate) {
        const transferWalk = await resolveWalkingDisplayRoute({
          from: alightCoordinate,
          to: nextBoardCoordinate,
        });
        if (transferWalk.meters > 8) {
          lines.push({
            id: `walk-transfer-${index + 1}`,
            label: `Camino de transbordo ${index + 1}`,
            kind: 'walk',
            coordinates: transferWalk.coordinates,
            color: WALK_COLOR,
            width: 4,
          });
          steps.push({
            id: `walk-transfer-${index + 1}`,
            kind: 'walk',
            title: `Camina al transbordo ${index + 1}`,
            detail: journey.legs[index + 1]?.boardStopName ?? 'Parada de cambio',
            meters: transferWalk.meters,
            minutes: transferWalk.minutes,
            routeAvailable: transferWalk.routeAvailable,
            color: WALK_COLOR,
          });
        } else {
          steps.push({
            id: `same-stop-transfer-${index + 1}`,
            kind: 'walk',
            title: 'Transbordo en la misma parada',
            detail: journey.legs[index + 1]?.boardStopName ?? 'Parada de cambio',
            meters: 0,
            minutes: 0,
            routeAvailable: true,
            color: WALK_COLOR,
          });
        }
      }
    }
  }

  const finalAlightCoordinate = stopCoordinateFromLeg(
    journey.legs[journey.legs.length - 1]?.alightStop,
  );
  if (finalAlightCoordinate) {
    const walkToDestination = await resolveWalkingDisplayRoute({
      from: finalAlightCoordinate,
      to: destination.coordinates,
      cachedCoordinates: journey.geoMetrics?.finalWalkRouteCoordinates,
      cachedDistanceMeters: journey.geoMetrics?.finalWalkNetworkMeters,
      cachedDurationMinutes: journey.geoMetrics?.finalWalkNetworkMinutes,
    });
    if (walkToDestination.meters > 8) {
      lines.push({
        id: 'walk-destination',
        label: 'Camino final',
        kind: 'walk',
        coordinates: walkToDestination.coordinates,
        color: WALK_COLOR,
        width: 4,
      });
      steps.push({
        id: 'walk-destination',
        kind: 'walk',
        title: 'Camina al destino',
        detail: destination.name,
        meters: walkToDestination.meters,
        minutes: walkToDestination.minutes,
        routeAvailable: walkToDestination.routeAvailable,
        color: WALK_COLOR,
      });
    }
  }

  const walkSteps = steps.filter((step) => step.kind === 'walk');
  const finalWalkStep = walkSteps.find((step) => step.id === 'walk-destination') ?? null;
  const totalWalkMeters = walkSteps.reduce((total, step) => total + step.meters, 0);
  const totalWalkMinutes = walkSteps.reduce((total, step) => {
    const minutes =
      typeof step.minutes === 'number' && Number.isFinite(step.minutes)
        ? step.minutes
        : estimateWalkMinutes(step.meters);
    return total + minutes;
  }, 0);

  return {
    markers,
    lines,
    steps,
    totalBusMeters,
    totalWalkMeters,
    totalWalkMinutes,
    finalWalkMeters: finalWalkStep?.meters ?? null,
    finalWalkMinutes: finalWalkStep?.minutes ?? null,
    finalWalkRouteAvailable: finalWalkStep?.routeAvailable ?? null,
  } satisfies JourneyVisualization;
}

export default function PlannerLabScreen() {
  const params = useLocalSearchParams<{
    departure?: string;
    destination?: string;
    origin?: string;
    runDevicePerf?: string;
  }>();
  const ui = usePassengerUI();
  const [originInput, setOriginInput] = useState(params.origin ?? DEFAULT_ORIGIN_INPUT);
  const [selectedOrigin, setSelectedOrigin] = useState<SearchSuggestion | null>(null);
  const [originResults, setOriginResults] = useState<SearchSuggestion[]>([]);
  const [originSearching, setOriginSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState(params.destination ?? '');
  const [selectedDestination, setSelectedDestination] = useState<SearchSuggestion | null>(null);
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [locating, setLocating] = useState(false);
  const [journeyPlans, setJourneyPlans] = useState<PlannedJourney[]>([]);
  const [plannerRuntimeSource, setPlannerRuntimeSource] = useState<'raptor' | 'legacy' | null>(
    null,
  );
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [manualJourneyFocus, setManualJourneyFocus] = useState(false);
  const [showDiscardedAlternatives, setShowDiscardedAlternatives] = useState(false);
  const [selectedGoldenCaseId, setSelectedGoldenCaseId] = useState<string | null>(null);
  const [selectedVisualization, setSelectedVisualization] = useState<JourneyVisualization | null>(
    null,
  );
  const [loadingVisualization, setLoadingVisualization] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plannerRuntimeDebug, setPlannerRuntimeDebug] = useState<string | null>(null);
  const [devicePerfRunning, setDevicePerfRunning] = useState(false);
  const [devicePerfSummary, setDevicePerfSummary] = useState<DevicePerfSummary | null>(null);
  const autoDevicePerfStarted = useRef(false);

  const labDepartureDate = useMemo(
    () => resolveRaptorLabDepartureDate(params.departure),
    [params.departure],
  );
  const parsedOrigin = useMemo(() => parseCoordinateInput(originInput), [originInput]);
  const activeOrigin = selectedOrigin?.coordinates ?? parsedOrigin;
  const tripDistanceMeters = useMemo(() => {
    if (!activeOrigin || !selectedDestination) return null;
    return haversineMeters(activeOrigin, selectedDestination.coordinates);
  }, [activeOrigin, selectedDestination]);
  const raptorRanking = useMemo(
    () =>
      plannerRuntimeSource === 'raptor'
        ? rankRaptorJourneys({
            journeys: journeyPlans,
            origin: activeOrigin,
            destination: selectedDestination?.coordinates ?? null,
            destinationName: selectedDestination?.name ?? null,
          })
        : null,
    [activeOrigin, journeyPlans, plannerRuntimeSource, selectedDestination],
  );
  const journeyDebugById = useMemo(
    () => {
      const destination = selectedDestination?.coordinates ?? null;
      const destinationName = selectedDestination?.name ?? null;

      if (raptorRanking) {
        return new Map(
          [...raptorRanking.debugById.entries()].map(([journeyId, debug]) => {
            const journey = journeyPlans.find((candidate) => candidate.id === journeyId);
            const breakdown = journey
              ? computeJourneyContextPenaltyBreakdown({
                  journey,
                  origin: activeOrigin,
                  destination,
                  destinationName,
                })
              : null;

            return [
              journeyId,
              {
                baseScore: debug.baseScore,
                etaPenalty: debug.etaPenalty,
                contextPenalty: debug.totalContextPenalty,
                displayScore: debug.displayScore,
                reasons: debug.reasons,
                metrics: breakdown?.metrics
                  ? {
                      firstLegDestinationDistanceMeters:
                        breakdown.metrics.firstLegDestinationDistanceMeters,
                      finalStopDestinationDistanceMeters:
                        breakdown.metrics.finalStopDestinationDistanceMeters,
                      firstLegProgressRatio: breakdown.metrics.firstLegProgressRatio,
                      finalStopProgressRatio: breakdown.metrics.finalStopProgressRatio,
                    }
                  : null,
                geoMetrics: journey?.geoMetrics ?? null,
              } satisfies JourneyDebugSnapshot,
            ] as const;
          }),
        );
      }

      return new Map(
        journeyPlans.map((journey) => {
          const etaPenalty = 0;
          const breakdown = computeJourneyContextPenaltyBreakdown({
            journey,
            origin: activeOrigin,
            destination,
            destinationName,
          });
          const displayScore = computeJourneyDisplayScore({
            journey,
            etaWaitMinutes: etaPenalty,
            origin: activeOrigin,
            destination,
            destinationName,
          });

          return [
            journey.id,
            {
              baseScore: journey.score,
              etaPenalty,
              contextPenalty: breakdown.totalPenalty,
              displayScore,
              reasons: breakdown.reasons,
              metrics: breakdown.metrics
                ? {
                    firstLegDestinationDistanceMeters:
                      breakdown.metrics.firstLegDestinationDistanceMeters,
                    finalStopDestinationDistanceMeters:
                      breakdown.metrics.finalStopDestinationDistanceMeters,
                    firstLegProgressRatio: breakdown.metrics.firstLegProgressRatio,
                    finalStopProgressRatio: breakdown.metrics.finalStopProgressRatio,
                  }
                : null,
              geoMetrics: journey.geoMetrics ?? null,
            } satisfies JourneyDebugSnapshot,
          ] as const;
        }),
      );
    },
    [activeOrigin, journeyPlans, raptorRanking, selectedDestination],
  );
  const displayScoreByJourneyId = useMemo(
    () =>
      new Map(
        [...journeyDebugById.entries()].map(([journeyId, debug]) => [journeyId, debug.displayScore] as const),
      ),
    [journeyDebugById],
  );
  const rankedJourneyPlans = useMemo(
    () => {
      if (raptorRanking) {
        return raptorRanking.ranked;
      }

      return [...journeyPlans].sort((a, b) => {
        const aScore = displayScoreByJourneyId.get(a.id) ?? a.score;
        const bScore = displayScoreByJourneyId.get(b.id) ?? b.score;
        return aScore - bScore;
      });
    },
    [displayScoreByJourneyId, journeyPlans, raptorRanking],
  );
  const preferredJourney = useMemo(
    () =>
      pickPreferredJourney({
        journeys: rankedJourneyPlans,
        displayScoreByJourneyId,
        tripDistanceMeters,
      }),
    [displayScoreByJourneyId, rankedJourneyPlans, tripDistanceMeters],
  );
  const recommendedJourney = preferredJourney ?? rankedJourneyPlans[0] ?? null;
  const selectedJourney = useMemo(
    () => {
      if (!manualJourneyFocus) return recommendedJourney;
      return rankedJourneyPlans.find((journey) => journey.id === selectedJourneyId) ?? recommendedJourney;
    },
    [manualJourneyFocus, rankedJourneyPlans, recommendedJourney, selectedJourneyId],
  );
  const recommendedJourneyScore = recommendedJourney
    ? displayScoreByJourneyId.get(recommendedJourney.id) ?? recommendedJourney.score
    : null;
  const alternativeVisibilityByJourneyId = useMemo(
    () => {
      const inferiorSameRouteBoardings = findInferiorSameRouteBoardingAlternatives({
        journeys: rankedJourneyPlans.map((journey) => ({
          id: journey.id,
          routeName:
            journey.routeName ??
            journey.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' luego '),
          dropStopName: journey.dropStopName,
          originWalkMeters: journey.originWalkMeters,
          destinationWalkMeters: journey.destinationWalkMeters,
          totalWalkMeters: journey.totalWalkMeters,
        })),
        displayScoreByJourneyId,
      });

      return new Map<string, AlternativeVisibility>(
        rankedJourneyPlans.map((journey) => {
          const displayScore = displayScoreByJourneyId.get(journey.id) ?? journey.score;
          const visibility = evaluateAlternativeVisibility({
            journey,
            recommendedJourney,
            displayScore,
            recommendedScore: recommendedJourneyScore,
          });

          if (
            recommendedJourney?.id !== journey.id &&
            inferiorSameRouteBoardings.has(journey.id)
          ) {
            const discardedVisibility: AlternativeVisibility = {
              ...visibility,
              scoreDelta: visibility.scoreDelta ?? 0,
              isDiscarded: true,
              discardReason: 'walk',
            };
            return [
              journey.id,
              discardedVisibility,
            ] as const;
          }

          return [
            journey.id,
            visibility,
          ] as const;
        }),
      );
    },
    [displayScoreByJourneyId, rankedJourneyPlans, recommendedJourney, recommendedJourneyScore],
  );
  const visibleJourneyPlans = useMemo(
    () =>
      showDiscardedAlternatives
        ? rankedJourneyPlans
        : rankedJourneyPlans.filter((journey) => {
            return !alternativeVisibilityByJourneyId.get(journey.id)?.isDiscarded;
          }),
    [alternativeVisibilityByJourneyId, rankedJourneyPlans, showDiscardedAlternatives],
  );
  const hiddenDiscardedAlternativeCount = useMemo(
    () =>
      rankedJourneyPlans.filter((journey) => {
        return alternativeVisibilityByJourneyId.get(journey.id)?.isDiscarded;
      }).length,
    [alternativeVisibilityByJourneyId, rankedJourneyPlans],
  );
  const selectedJourneyDebug = useMemo(
    () => (selectedJourney ? journeyDebugById.get(selectedJourney.id) ?? null : null),
    [journeyDebugById, selectedJourney],
  );
  const selectedGoldenCase = useMemo(
    () => plannerGoldenCases.find((goldenCase) => goldenCase.id === selectedGoldenCaseId) ?? null,
    [selectedGoldenCaseId],
  );
  const selectedGoldenCaseEvaluation = useMemo(
    () =>
      selectedGoldenCase
        ? evaluatePlannerGoldenCase(selectedGoldenCase, rankedJourneyPlans)
        : null,
    [rankedJourneyPlans, selectedGoldenCase],
  );

  useEffect(() => {
    setShowDiscardedAlternatives(false);
  }, [journeyPlans]);

  useEffect(() => {
    let isCancelled = false;

    const trimmedQuery = originInput.trim();
    const matchesSelectedOrigin =
      selectedOrigin &&
      (trimmedQuery === selectedOrigin.name || trimmedQuery === selectedOrigin.address);

    if (
      !MAPBOX_PUBLIC_TOKEN ||
      trimmedQuery.length < 2 ||
      parseCoordinateInput(trimmedQuery) ||
      matchesSelectedOrigin
    ) {
      setOriginResults([]);
      setOriginSearching(false);
      return () => {
        isCancelled = true;
      };
    }

    setOriginSearching(true);
    const timeoutId = setTimeout(() => {
      fetchMapboxSuggestions({
        query: trimmedQuery,
        proximity: selectedDestination?.coordinates ?? DEFAULT_SEARCH_PROXIMITY,
      })
        .then((results) => {
          if (!isCancelled) setOriginResults(results);
        })
        .catch(() => {
          if (!isCancelled) setOriginResults([]);
        })
        .finally(() => {
          if (!isCancelled) setOriginSearching(false);
        });
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [originInput, selectedDestination, selectedOrigin]);

  useEffect(() => {
    let isCancelled = false;

    const trimmedQuery = searchQuery.trim();
    const matchesSelectedDestination = queryMatchesSelectedSuggestion(trimmedQuery, selectedDestination);
    if (
      !MAPBOX_PUBLIC_TOKEN ||
      trimmedQuery.length < 2 ||
      parseCoordinateInput(trimmedQuery) ||
      matchesSelectedDestination
    ) {
      setSearchResults([]);
      setSearching(false);
      return () => {
        isCancelled = true;
      };
    }

    setSearching(true);
    const timeoutId = setTimeout(() => {
      fetchMapboxSuggestions({
        query: trimmedQuery,
        proximity: activeOrigin,
      })
        .then((results) => {
          if (!isCancelled) setSearchResults(results);
        })
        .catch(() => {
          if (!isCancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!isCancelled) setSearching(false);
        });
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeOrigin, searchQuery, selectedDestination]);

  useEffect(() => {
    let isCancelled = false;

    if (!selectedJourney || !activeOrigin || !selectedDestination) {
      setSelectedVisualization(null);
      return () => {
        isCancelled = true;
      };
    }

    setLoadingVisualization(true);
    buildJourneyVisualization({
      journey: selectedJourney,
      origin: activeOrigin,
      destination: selectedDestination,
    })
      .then((visualization) => {
        if (!isCancelled) setSelectedVisualization(visualization);
      })
      .catch(() => {
        if (!isCancelled) setSelectedVisualization(null);
      })
      .finally(() => {
        if (!isCancelled) setLoadingVisualization(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeOrigin, selectedDestination, selectedJourney]);

  const handleOriginInputChange = (value: string) => {
    setOriginInput(value);
    setErrorMessage(null);
    setSelectedGoldenCaseId(null);
    setManualJourneyFocus(false);

    if (
      selectedOrigin &&
      value.trim().length > 0 &&
      value.trim() !== selectedOrigin.name &&
      value.trim() !== selectedOrigin.address &&
      value.trim() !== formatCoordinateInput(selectedOrigin.coordinates)
    ) {
      setSelectedOrigin(null);
    }
  };

  const selectOriginSuggestion = (origin: SearchSuggestion) => {
    setSelectedOrigin(origin);
    setOriginInput(origin.name);
    setOriginResults([]);
    setErrorMessage(null);
    setSelectedGoldenCaseId(null);
    setManualJourneyFocus(false);
  };

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
    setErrorMessage(null);
    setSelectedGoldenCaseId(null);
    setManualJourneyFocus(false);

    if (
      selectedDestination &&
      value.trim().length > 0 &&
      value.trim() !== selectedDestination.name &&
      value.trim() !== selectedDestination.address
    ) {
      setSelectedDestination(null);
    }
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setErrorMessage(null);
    setSelectedGoldenCaseId(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setErrorMessage('No pudimos obtener tu ubicacion. Puedes pegarla manualmente como lat,lng.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setOriginInput(
        formatCoordinateInput([
          currentPosition.coords.longitude,
          currentPosition.coords.latitude,
        ]),
      );
      setSelectedOrigin(null);
      setOriginResults([]);
    } catch {
      setErrorMessage('Fallamos leyendo tu ubicacion actual. Puedes seguir con coordenadas manuales.');
    } finally {
      setLocating(false);
    }
  };

  const resolveOriginFromQuery = async () => {
    if (selectedOrigin) return selectedOrigin;

    const trimmedQuery = originInput.trim();
    if (!trimmedQuery) return null;

    const manualCoordinates = parseCoordinateInput(trimmedQuery);
    if (manualCoordinates) {
      return {
        id: `origin-manual-${trimmedQuery}`,
        name: 'Origen manual',
        address: trimmedQuery,
        coordinates: manualCoordinates,
      } satisfies SearchSuggestion;
    }

    const suggestions = await fetchMapboxSuggestions({
      query: trimmedQuery,
      proximity: selectedDestination?.coordinates ?? DEFAULT_SEARCH_PROXIMITY,
    });

    return suggestions[0] ?? null;
  };

  const resolveDestinationFromQuery = async (
    queryOverride?: string,
    proximityOverride?: [number, number] | null,
  ) => {
    const trimmedQuery = (queryOverride ?? searchQuery).trim();
    if (!trimmedQuery) return null;

    const manualCoordinates = parseCoordinateInput(trimmedQuery);
    if (manualCoordinates) {
      return {
        id: `manual-${trimmedQuery}`,
        name: 'Destino manual',
        address: trimmedQuery,
        coordinates: manualCoordinates,
      } satisfies SearchSuggestion;
    }

    const suggestions = await fetchMapboxSuggestions({
      query: trimmedQuery,
      proximity: proximityOverride ?? activeOrigin,
    });

    return suggestions[0] ?? null;
  };

  const handleRunDevicePerfCheck = useCallback(async () => {
    if (devicePerfRunning) return;

    setDevicePerfRunning(true);
    setDevicePerfSummary(null);
    setErrorMessage(null);

    try {
      const selectedCases = plannerGoldenCases
        .map((goldenCase) => ({
          goldenCase,
          destination: goldenCaseDestinationCoordinates(goldenCase),
        }))
        .filter(
          (
            entry,
          ): entry is { goldenCase: PlannerGoldenCase; destination: [number, number] } =>
            entry.destination != null,
        )
        .slice(0, 50);

      const sourceCounts: Record<string, number> = {};
      const modeCounts: Record<string, number> = {};
      const results: DevicePerfSummary['slowest'] = [];

      for (const { destination, goldenCase } of selectedCases) {
        const startedAt = nowMs();
        const planningResult = await findRaptorJourneys({
          origin: { lng: goldenCase.originCoordinates[0], lat: goldenCase.originCoordinates[1] },
          destination: { lng: destination[0], lat: destination[1] },
          departureDate: labDepartureDate,
        });
        const ranking = rankRaptorJourneys({
          journeys: planningResult.journeys,
          origin: goldenCase.originCoordinates,
          destination,
          destinationName: goldenCase.destinationLabel ?? goldenCase.destinationQuery,
        });
        const elapsedMs = nowMs() - startedAt;
        const mode = planningResult.diagnostics?.runtimeDecision?.mode ?? 'unknown';

        sourceCounts[planningResult.source] = (sourceCounts[planningResult.source] ?? 0) + 1;
        modeCounts[mode] = (modeCounts[mode] ?? 0) + 1;
        results.push({
          id: goldenCase.id,
          elapsedMs,
          source: planningResult.source,
          topTitle: ranking.ranked[0] ? buildJourneyTitle(ranking.ranked[0]) : 'Sin journeys',
        });
      }

      const sortedTimes = results.map((result) => result.elapsedMs).sort((a, b) => a - b);
      const slowest = [...results].sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 5);

      setDevicePerfSummary({
        count: results.length,
        p50Ms: percentile(sortedTimes, 50),
        p95Ms: percentile(sortedTimes, 95),
        p99Ms: percentile(sortedTimes, 99),
        maxMs: sortedTimes[sortedTimes.length - 1] ?? 0,
        sourceCounts,
        modeCounts,
        slowest,
      });
    } catch {
      setErrorMessage('No pudimos completar la medicion p95 en este dispositivo.');
    } finally {
      setDevicePerfRunning(false);
    }
  }, [devicePerfRunning, labDepartureDate]);

  useEffect(() => {
    const shouldAutoRun =
      params.runDevicePerf === '1' || process.env.EXPO_PUBLIC_RAPTOR_AUTO_DEVICE_PERF === '1';
    if (!__DEV__ || autoDevicePerfStarted.current || !shouldAutoRun) return;

    autoDevicePerfStarted.current = true;
    void handleRunDevicePerfCheck();
  }, [handleRunDevicePerfCheck, params.runDevicePerf]);

  const loadPlansForDestination = async (
    destination: SearchSuggestion,
    originOverride?: [number, number] | null,
  ) => {
    const effectiveOrigin = originOverride ?? activeOrigin;
    if (!effectiveOrigin) {
      setPlannerRuntimeDebug(null);
      setPlannerRuntimeSource(null);
      setErrorMessage('Elige un origen de la lista o pegalo como "lat,lng".');
      return;
    }

    setPlanning(true);
    setErrorMessage(null);
    setPlannerRuntimeDebug(null);
    setPlannerRuntimeSource(null);
    setSelectedDestination(destination);
    setSearchResults([]);

    try {
      const planningResult = await findRaptorJourneys({
        origin: { lat: effectiveOrigin[1], lng: effectiveOrigin[0] },
        destination: { lat: destination.coordinates[1], lng: destination.coordinates[0] },
        departureDate: labDepartureDate,
      });
      const walkValidatedPlans = await applyEndpointWalkingNetworkValidationToJourneys({
        journeys: planningResult.journeys,
        origin: effectiveOrigin,
        destination: destination.coordinates,
      });
      const plans = filterIncoherentJourneysAfterWalking({
        journeys: walkValidatedPlans,
        origin: effectiveOrigin,
        destination: destination.coordinates,
      });
      if (__DEV__) {
        const diagnostics = planningResult.diagnostics;
        const runtimeDecision = diagnostics?.runtimeDecision;
        const details = [
          planningResult.source.toUpperCase(),
          runtimeDecision?.mode ? `mode=${runtimeDecision.mode}` : null,
          runtimeDecision?.rolloutPercent != null
            ? `rollout=${runtimeDecision.rolloutPercent}%`
            : null,
          runtimeDecision?.rolloutBucket != null
            ? `bucket=${runtimeDecision.rolloutBucket.toFixed(2)}`
            : null,
          diagnostics?.runtimeLatencyMs != null
            ? `latency=${diagnostics.runtimeLatencyMs}ms`
            : null,
          diagnostics?.fallbackReason ? `fallback=${diagnostics.fallbackReason}` : null,
          diagnostics?.snapshotVersion,
          `Salida ${formatRaptorLabDepartureDebug(labDepartureDate)}`,
        ].filter(Boolean);
        setPlannerRuntimeDebug(details.join(' / '));
      }

      setJourneyPlans(plans);
      setPlannerRuntimeSource(planningResult.source);
      setSelectedJourneyId(null);
      setManualJourneyFocus(false);

      if (plans.length === 0) {
        setErrorMessage('No encontramos itinerarios para ese punto con el planner actual.');
      }
    } catch {
      setJourneyPlans([]);
      setPlannerRuntimeSource(null);
      setSelectedJourneyId(null);
      setManualJourneyFocus(false);
      setPlannerRuntimeDebug(null);
      setErrorMessage('No pudimos ejecutar el planner en este momento.');
    } finally {
      setPlanning(false);
    }
  };

  const handleRunPlanner = async () => {
    if (!searchQuery.trim()) {
      setErrorMessage('Escribe un destino o pega coordenadas para probar el algoritmo.');
      return;
    }

    setPlanning(true);
    setErrorMessage(null);
    setSelectedGoldenCaseId(null);

    try {
      const origin = await resolveOriginFromQuery();
      if (!origin) {
        setJourneyPlans([]);
        setSelectedJourneyId(null);
        setManualJourneyFocus(false);
        setPlannerRuntimeDebug(null);
        setErrorMessage('No pudimos resolver ese origen. Elige una sugerencia o pega coordenadas.');
        return;
      }

      const destination = shouldResolveDestinationFromCurrentQuery({
        query: searchQuery,
        selectedDestination,
        origin: origin.coordinates,
      })
        ? await resolveDestinationFromQuery(searchQuery, origin.coordinates)
        : selectedDestination;
      if (!destination) {
        setJourneyPlans([]);
        setSelectedJourneyId(null);
        setManualJourneyFocus(false);
        setPlannerRuntimeDebug(null);
        setErrorMessage('No pudimos resolver ese destino. Prueba con otro nombre o con coordenadas.');
        return;
      }

      setSelectedOrigin(origin);
      setOriginInput(origin.name === 'Origen manual' ? origin.address : origin.name);
      setSearchQuery(destination.name);
      await loadPlansForDestination(destination, origin.coordinates);
    } catch {
      setJourneyPlans([]);
      setSelectedJourneyId(null);
      setManualJourneyFocus(false);
      setPlannerRuntimeDebug(null);
      setErrorMessage('Fallamos resolviendo el destino en el laboratorio.');
    } finally {
      setPlanning(false);
    }
  };

  const handleRunGoldenCase = async (goldenCase: PlannerGoldenCase) => {
    const origin = goldenCase.originCoordinates;
    const fixedDestination = goldenCase.destinationCoordinates
      ? ({
          id: `golden-${goldenCase.id}`,
          name: goldenCase.destinationLabel ?? goldenCase.destinationQuery,
          address: goldenCase.destinationQuery,
          coordinates: goldenCase.destinationCoordinates,
        } satisfies SearchSuggestion)
      : null;

    setSelectedGoldenCaseId(goldenCase.id);
    setOriginInput(formatCoordinateInput(origin));
    setSelectedOrigin(null);
    setOriginResults([]);
    setSearchQuery(goldenCase.destinationLabel ?? goldenCase.destinationQuery);
    setSelectedDestination(null);
    setSearchResults([]);
    setPlanning(true);
    setErrorMessage(null);

    try {
      const destination =
        fixedDestination ?? (await resolveDestinationFromQuery(goldenCase.destinationQuery, origin));
      if (!destination) {
        setJourneyPlans([]);
        setSelectedJourneyId(null);
        setManualJourneyFocus(false);
        setPlannerRuntimeDebug(null);
        setErrorMessage('No pudimos resolver el destino de este caso oro.');
        return;
      }

      setSearchQuery(destination.name);
      await loadPlansForDestination(destination, origin);
    } catch {
      setJourneyPlans([]);
      setSelectedJourneyId(null);
      setManualJourneyFocus(false);
      setPlannerRuntimeDebug(null);
      setErrorMessage('Fallamos ejecutando este caso oro.');
    } finally {
      setPlanning(false);
    }
  };

  const selectedJourneyTitle = selectedJourney ? buildJourneyTitle(selectedJourney) : null;
  const focusedRawWalkMeters = selectedJourney?.totalWalkMeters ?? null;
  const focusedWalkMeters = selectedVisualization?.totalWalkMeters ?? selectedJourney?.totalWalkMeters ?? null;
  const focusedWalkMinutes =
    selectedVisualization?.totalWalkMinutes ??
    (selectedJourney ? estimateJourneyWalkMinutes(selectedJourney) : null);
  const focusedNetworkWalkDeltaMeters =
    typeof focusedWalkMeters === 'number' && typeof focusedRawWalkMeters === 'number'
      ? focusedWalkMeters - focusedRawWalkMeters
      : null;
  const focusedFinalWalkMeters =
    selectedJourneyDebug?.geoMetrics?.finalWalkNetworkMeters ?? selectedVisualization?.finalWalkMeters ?? null;
  const focusedFinalWalkMinutes =
    selectedJourneyDebug?.geoMetrics?.finalWalkNetworkMinutes ?? selectedVisualization?.finalWalkMinutes ?? null;
  const focusedFinalWalkRouteAvailable =
    selectedJourneyDebug?.geoMetrics?.walkRouteAvailable ??
    selectedVisualization?.finalWalkRouteAvailable ??
    null;

  const summaryPills = selectedJourney
    ? [
        {
          id: 'fare',
          label: formatFareLabel(selectedJourney.totalFare),
          icon: 'cash-outline' as const,
          tone: 'accent' as const,
        },
        {
          id: 'walk',
          label:
            typeof focusedWalkMinutes === 'number'
              ? `${Math.round(focusedWalkMinutes)} min caminando`
              : `${estimateJourneyWalkMinutes(selectedJourney)} min caminando`,
          icon: 'walk-outline' as const,
          tone: 'warning' as const,
        },
        {
          id: 'bus',
          label: selectedVisualization
            ? `${formatMetersLabel(selectedVisualization.totalBusMeters)} en bus`
            : 'Calculando bus',
          icon: 'bus-outline' as const,
          tone: 'live' as const,
        },
      ]
    : [];
  const focusedRouteText = selectedJourney
    ? selectedJourney.legs
        .map((leg) => leg.routeName ?? leg.routeCode ?? '')
        .filter(Boolean)
        .join(' luego ')
    : null;
  const journeyDisplayAdvice = selectedJourney
    ? buildJourneyDisplayAdvice({
        destinationName: selectedDestination?.name ?? null,
        networkWalkDeltaMeters: focusedNetworkWalkDeltaMeters,
        routeName: focusedRouteText,
        totalBusMeters: selectedVisualization?.totalBusMeters ?? null,
        totalWalkMeters: focusedWalkMeters,
        tripDistanceMeters,
      })
    : [];

  return (
    <View style={[styles.container, { backgroundColor: ui.backgroundColor }]}>
      <Stack.Screen options={{ title: 'Planner Lab' }} />
      <DepthBackground
        topColor={ui.gradientTop}
        midColor={ui.gradientMid}
        bottomColor={ui.gradientBottom}
        accentColor={ui.accentPrimary}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}>
        <ScreenHero
          title="Planner lab"
          subtitle="Pagina sencilla para probar el algoritmo, comparar rutas y ver en el mapa cuanto caminamos y cuanto viajamos en bus."
        />

        <GlassPanel variant="raised">
          <View style={styles.panelHeader}>
            <View style={styles.flexOne}>
              <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>
                Controles
              </ThemedText>
              <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
                Usa un origen editable y un destino por nombre o coordenadas. Esto es laboratorio, asi que priorizamos trazabilidad sobre polish.
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={handleUseCurrentLocation}
              style={[
                styles.secondaryButton,
                {
                  backgroundColor: ui.interactiveNeutral,
                  borderColor: ui.dividerSoft,
                  opacity: locating ? 0.7 : 1,
                },
              ]}>
              {locating ? (
                <ActivityIndicator size="small" color={ui.textPrimary} />
              ) : (
                <>
                  <Ionicons name="locate-outline" size={16} color={ui.textPrimary} />
                  <ThemedText style={[styles.secondaryButtonText, { color: ui.textPrimary }]}>
                    Mi ubicacion
                  </ThemedText>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.fieldLabel, { color: ui.textSecondary }]}>Origen</ThemedText>
            <TextInput
              value={originInput}
              onChangeText={handleOriginInputChange}
              placeholder="Busca salida o pega lat,lng"
              placeholderTextColor={ui.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.textInput,
                {
                  color: ui.textPrimary,
                  backgroundColor: ui.surfaceBase,
                  borderColor: ui.outlineSoft,
                },
              ]}
            />
            {selectedOrigin ? (
              <View
                style={[
                  styles.selectionBadge,
                  {
                    backgroundColor: ui.interactiveNeutral,
                    borderColor: ui.dividerSoft,
                  },
                ]}>
                <Ionicons name="navigate-circle-outline" size={14} color={ui.textSecondary} />
                <ThemedText style={[styles.selectionBadgeText, { color: ui.textSecondary }]}>
                  {selectedOrigin.address || formatCoordinateInput(selectedOrigin.coordinates)}
                </ThemedText>
              </View>
            ) : null}
          </View>

          {originSearching ? (
            <View style={styles.searchStateRow}>
              <ActivityIndicator size="small" color={ui.accentPrimary} />
              <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
                Buscando origen...
              </ThemedText>
            </View>
          ) : null}

          {originResults.length > 0 ? (
            <View style={styles.searchResults}>
              {originResults.map((result) => {
                const sourceMeta = getSearchSuggestionSourceMeta(result);

                return (
                  <Pressable
                    key={`origin-${result.id}`}
                    accessibilityRole="button"
                    onPress={() => selectOriginSuggestion(result)}
                    style={[
                      styles.searchResultRow,
                      {
                        backgroundColor: ui.interactiveNeutral,
                        borderColor: ui.dividerSoft,
                      },
                    ]}>
                    <View style={styles.flexOne}>
                      <View style={styles.searchResultTitleRow}>
                        <ThemedText
                          style={[styles.searchResultTitle, { color: ui.textPrimary }]}
                          numberOfLines={1}>
                          {result.name}
                        </ThemedText>
                        {sourceMeta ? (
                          <StatusPill
                            label={sourceMeta.label}
                            icon={sourceMeta.icon}
                            tone={sourceMeta.tone}
                            style={styles.searchResultSourcePill}
                          />
                        ) : null}
                      </View>
                      <ThemedText style={[styles.searchResultSubtitle, { color: ui.textSecondary }]}>
                        {result.address || formatCoordinateInput(result.coordinates)}
                      </ThemedText>
                    </View>
                    <Ionicons name="navigate-outline" size={16} color={ui.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.fieldLabel, { color: ui.textSecondary }]}>Destino</ThemedText>
            <TextInput
              value={searchQuery}
              onChangeText={handleSearchQueryChange}
              placeholder="Busca un lugar o pega lat,lng"
              placeholderTextColor={ui.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.textInput,
                {
                  color: ui.textPrimary,
                  backgroundColor: ui.surfaceBase,
                  borderColor: ui.outlineSoft,
                },
              ]}
            />
          </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={handleRunPlanner}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: ui.accentPrimary,
                  opacity: planning ? 0.7 : 1,
                },
              ]}>
              {planning ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
                  <ThemedText style={styles.primaryButtonText}>Correr algoritmo</ThemedText>
                </>
              )}
            </Pressable>

            {selectedDestination ? (
              <View
                style={[
                  styles.selectionBadge,
                  {
                    backgroundColor: ui.interactiveNeutral,
                    borderColor: ui.dividerSoft,
                  },
                ]}>
                <Ionicons name="flag-outline" size={14} color={ui.textSecondary} />
                <ThemedText style={[styles.selectionBadgeText, { color: ui.textSecondary }]}>
                  {selectedDestination.name}
                </ThemedText>
              </View>
            ) : null}
          </View>

          {searching ? (
            <View style={styles.searchStateRow}>
              <ActivityIndicator size="small" color={ui.accentPrimary} />
              <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
                Buscando coincidencias...
              </ThemedText>
            </View>
          ) : null}

          {searchResults.length > 0 ? (
            <View style={styles.searchResults}>
              {searchResults.map((result) => {
                const sourceMeta = getSearchSuggestionSourceMeta(result);

                return (
                  <Pressable
                    key={result.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setSearchQuery(result.name);
                      void loadPlansForDestination(result);
                    }}
                    style={[
                      styles.searchResultRow,
                      {
                        backgroundColor: ui.interactiveNeutral,
                        borderColor: ui.dividerSoft,
                      },
                    ]}>
                    <View style={styles.flexOne}>
                      <View style={styles.searchResultTitleRow}>
                        <ThemedText
                          style={[styles.searchResultTitle, { color: ui.textPrimary }]}
                          numberOfLines={1}>
                          {result.name}
                        </ThemedText>
                        {sourceMeta ? (
                          <StatusPill
                            label={sourceMeta.label}
                            icon={sourceMeta.icon}
                            tone={sourceMeta.tone}
                            style={styles.searchResultSourcePill}
                          />
                        ) : null}
                      </View>
                      <ThemedText style={[styles.searchResultSubtitle, { color: ui.textSecondary }]}>
                        {result.address || formatCoordinateInput(result.coordinates)}
                      </ThemedText>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={ui.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {errorMessage ? (
            <View
              style={[
                styles.feedbackBanner,
                { backgroundColor: ui.dangerSubtle, borderColor: `${ui.accentDanger}22` },
              ]}>
              <Ionicons name="warning-outline" size={16} color={ui.accentDanger} />
              <ThemedText style={[styles.feedbackText, { color: ui.textPrimary }]}>
                {errorMessage}
              </ThemedText>
            </View>
          ) : null}
        </GlassPanel>

        <GlassPanel variant="panel">
          <View style={styles.panelHeader}>
            <View style={styles.flexOne}>
              <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>
                Casos oro
              </ThemedText>
              <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
                Corre viajes reales repetibles para medir si el algoritmo esta ganando con la opcion correcta.
              </ThemedText>
            </View>
          </View>

          {__DEV__ ? (
            <View
              style={[
                styles.devicePerfPanel,
                { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
              ]}>
              <View style={styles.alternativeToolbar}>
                <View style={styles.flexOne}>
                  <ThemedText style={[styles.goldenCaseGroupTitle, { color: ui.textPrimary }]}>
                    P95 en este dispositivo
                  </ThemedText>
                  <ThemedText style={[styles.goldenCaseGroupCopy, { color: ui.textSecondary }]}>
                    Corre 50 casos por el runtime real del app. Usalo con RAPTOR force-on para validar canary.
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={devicePerfRunning}
                  onPress={() => void handleRunDevicePerfCheck()}
                  style={[
                    styles.secondaryButton,
                    {
                      backgroundColor: ui.interactiveAccent,
                      borderColor: `${ui.accentPrimary}44`,
                      opacity: devicePerfRunning ? 0.65 : 1,
                    },
                  ]}>
                  {devicePerfRunning ? (
                    <ActivityIndicator size="small" color={ui.textPrimary} />
                  ) : (
                    <Ionicons name="speedometer-outline" size={16} color={ui.textPrimary} />
                  )}
                  <ThemedText style={[styles.secondaryButtonText, { color: ui.textPrimary }]}>
                    {devicePerfRunning ? 'Midiendo' : 'Medir p95'}
                  </ThemedText>
                </Pressable>
              </View>

              {devicePerfSummary ? (
                <View style={styles.debugSection}>
                  <View style={styles.alternativeMetrics}>
                    <StatusPill
                      label={`p50 ${Math.round(devicePerfSummary.p50Ms)}ms`}
                      icon="analytics-outline"
                      tone="neutral"
                    />
                    <StatusPill
                      label={`p95 ${Math.round(devicePerfSummary.p95Ms)}ms`}
                      icon="pulse-outline"
                      tone={devicePerfSummary.p95Ms < 5000 ? 'live' : 'warning'}
                    />
                    <StatusPill
                      label={`p99 ${Math.round(devicePerfSummary.p99Ms)}ms`}
                      icon="timer-outline"
                      tone="neutral"
                    />
                    <StatusPill
                      label={`${devicePerfSummary.count} casos`}
                      icon="list-outline"
                      tone="accent"
                    />
                  </View>
                  <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
                    Source: {JSON.stringify(devicePerfSummary.sourceCounts)} / Mode:{' '}
                    {JSON.stringify(devicePerfSummary.modeCounts)}
                  </ThemedText>
                  <View style={styles.debugReasonList}>
                    {devicePerfSummary.slowest.map((result) => (
                      <View
                        key={result.id}
                        style={[
                          styles.debugReasonRow,
                          { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                        ]}>
                        <ThemedText style={[styles.stepMeters, { color: ui.textPrimary }]}>
                          {result.id}: {Math.round(result.elapsedMs)}ms ({result.source})
                        </ThemedText>
                        <ThemedText style={[styles.stepDetail, { color: ui.textSecondary }]}>
                          {result.topTitle}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.goldenCaseList}>
            {plannerGoldenCaseGroups.map((group) => (
              <View key={group.id} style={styles.goldenCaseGroup}>
                <View style={styles.goldenCaseGroupHeader}>
                  <ThemedText style={[styles.goldenCaseGroupTitle, { color: ui.textPrimary }]}>
                    {group.label}
                  </ThemedText>
                  <ThemedText style={[styles.goldenCaseGroupCopy, { color: ui.textSecondary }]}>
                    {group.cases.length} caso{group.cases.length === 1 ? '' : 's'}
                  </ThemedText>
                </View>

                {group.cases.map((goldenCase) => {
                  const active = selectedGoldenCaseId === goldenCase.id;
                  return (
                    <Pressable
                      key={goldenCase.id}
                      accessibilityRole="button"
                      onPress={() => void handleRunGoldenCase(goldenCase)}
                      style={[
                        styles.goldenCaseButton,
                        {
                          backgroundColor: active ? ui.interactiveAccent : ui.interactiveNeutral,
                          borderColor: active ? `${ui.accentPrimary}44` : ui.dividerSoft,
                          opacity: planning ? 0.72 : 1,
                        },
                      ]}>
                      <View style={styles.goldenCaseMetaRow}>
                        <ThemedText style={[styles.goldenCaseTitle, { color: ui.textPrimary }]}>
                          {goldenCase.name}
                        </ThemedText>
                        <StatusPill
                          label={formatGoldenCaseDirection(goldenCase.direction)}
                          icon={
                            goldenCase.direction === 'vuelta'
                              ? 'return-up-back-outline'
                              : goldenCase.direction === 'ida'
                                ? 'arrow-forward-outline'
                                : 'repeat-outline'
                          }
                          tone="neutral"
                        />
                      </View>
                      <ThemedText style={[styles.goldenCaseCopy, { color: ui.textSecondary }]}>
                        {goldenCase.notes ?? goldenCase.destinationQuery}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {selectedGoldenCase && selectedGoldenCaseEvaluation ? (
            <View style={styles.debugSection}>
              <View style={styles.alternativeMetrics}>
                <StatusPill
                  label={
                    selectedGoldenCaseEvaluation.status === 'pass'
                      ? 'Pasa'
                      : selectedGoldenCaseEvaluation.status === 'acceptable'
                        ? 'Aceptable'
                        : selectedGoldenCaseEvaluation.status === 'forbidden'
                          ? 'Prohibido'
                          : selectedGoldenCaseEvaluation.status === 'empty'
                            ? 'Sin resultados'
                            : 'Raro'
                  }
                  icon={
                    selectedGoldenCaseEvaluation.status === 'pass'
                      ? 'checkmark-circle-outline'
                      : selectedGoldenCaseEvaluation.status === 'forbidden'
                        ? 'close-circle-outline'
                        : 'help-circle-outline'
                  }
                  tone={
                    selectedGoldenCaseEvaluation.status === 'pass'
                      ? 'live'
                      : selectedGoldenCaseEvaluation.status === 'acceptable'
                        ? 'accent'
                        : selectedGoldenCaseEvaluation.status === 'forbidden'
                          ? 'danger'
                          : 'warning'
                  }
                />
                {selectedGoldenCaseEvaluation.winnerTitle ? (
                  <StatusPill
                    label={`Ganador: ${selectedGoldenCaseEvaluation.winnerTitle}`}
                    icon="trophy-outline"
                    tone="neutral"
                  />
                ) : null}
                {selectedGoldenCaseEvaluation.boardStopTitle ? (
                  <StatusPill
                    label={`Subida: ${selectedGoldenCaseEvaluation.boardStopTitle}`}
                    icon="walk-outline"
                    tone="neutral"
                  />
                ) : null}
                {selectedGoldenCaseEvaluation.finalStopTitle ? (
                  <StatusPill
                    label={`Bajada: ${selectedGoldenCaseEvaluation.finalStopTitle}`}
                    icon="flag-outline"
                    tone="neutral"
                  />
                ) : null}
              </View>

              <View
                style={[
                  styles.feedbackBanner,
                  {
                    backgroundColor: ui.interactiveNeutral,
                    borderColor: ui.dividerSoft,
                  },
                ]}>
                <Ionicons name="analytics-outline" size={16} color={ui.textSecondary} />
                <ThemedText style={[styles.feedbackText, { color: ui.textSecondary }]}>
                  {selectedGoldenCaseEvaluation.status === 'pass'
                    ? `Este caso oro paso. El ganador coincide con lo esperado: ${selectedGoldenCaseEvaluation.matchingRule ?? selectedGoldenCaseEvaluation.winnerTitle}.`
                    : selectedGoldenCaseEvaluation.status === 'acceptable'
                      ? `El ganador es aceptable pero no ideal. Coincide con: ${selectedGoldenCaseEvaluation.matchingRule ?? selectedGoldenCaseEvaluation.winnerTitle}.`
                      : selectedGoldenCaseEvaluation.status === 'forbidden'
                        ? `El algoritmo esta fallando este caso. Gano una opcion que nunca deberia quedar arriba: ${selectedGoldenCaseEvaluation.matchingRule ?? selectedGoldenCaseEvaluation.winnerTitle}.`
                        : selectedGoldenCaseEvaluation.status === 'empty'
                          ? 'Este caso oro no devolvio resultados con el planner actual.'
                          : selectedGoldenCaseEvaluation.matchingRule === 'Subida inicial inesperada'
                            ? `La ruta ganadora es razonable, pero sube en una parada incorrecta: ${selectedGoldenCaseEvaluation.boardStopTitle ?? 'sin subida'}.`
                            : selectedGoldenCaseEvaluation.matchingRule === 'Bajada final inesperada'
                              ? `La ruta ganadora es razonable, pero baja en una parada incorrecta: ${selectedGoldenCaseEvaluation.finalStopTitle ?? 'sin bajada'}.`
                              : `El ganador no coincide con lo esperado ni con las alternativas aceptables. Ganador actual: ${selectedGoldenCaseEvaluation.winnerTitle ?? 'sin ganador'}.`}
                </ThemedText>
              </View>

              {selectedGoldenCaseEvaluation.topTitles.length > 0 ? (
                <View style={styles.debugReasonList}>
                  {selectedGoldenCaseEvaluation.topTitles.map((title, index) => (
                    <View
                      key={`${selectedGoldenCase.id}-${index}-${title}`}
                      style={[
                        styles.debugReasonRow,
                        { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                      ]}>
                      <ThemedText style={[styles.stepTitle, { color: ui.textPrimary }]}>
                        Top {index + 1}
                      </ThemedText>
                      <ThemedText style={[styles.stepDetail, { color: ui.textSecondary }]}>
                        {title}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </GlassPanel>

        <GlassPanel variant="hero">
          <View style={styles.panelHeader}>
            <View style={styles.flexOne}>
              <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>
                Visualizacion
              </ThemedText>
              <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
                Linea solida = bus. Linea punteada = caminar. La traza tenue muestra la ruta completa para entender si el ranking nos esta mandando por un corredor raro.
              </ThemedText>
            </View>
          </View>

          <View style={styles.mapShell}>
            {IS_WEB_RUNTIME ? (
              <PlannerMap
                accessToken={MAPBOX_PUBLIC_TOKEN}
                height={500}
                lines={selectedVisualization?.lines ?? []}
                markers={selectedVisualization?.markers ?? []}
                selectedJourneyLabel={selectedJourneyTitle}
                dom={{
                  scrollEnabled: false,
                  style: {
                    width: '100%',
                    height: 500,
                  },
                }}
              />
            ) : (
              <PlannerNativeMap
                accessToken={MAPBOX_PUBLIC_TOKEN}
                height={500}
                lines={selectedVisualization?.lines ?? []}
                markers={selectedVisualization?.markers ?? []}
                selectedJourneyLabel={selectedJourneyTitle}
              />
            )}
          </View>

          {selectedJourney ? (
            <View style={styles.metricsRow}>
              {summaryPills.map((pill) => (
                <StatusPill
                  key={pill.id}
                  label={pill.label}
                  icon={pill.icon}
                  tone={pill.tone}
                />
              ))}
            </View>
          ) : (
            <View
              style={[
                styles.feedbackBanner,
                { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
              ]}>
              <Ionicons name="map-outline" size={16} color={ui.textSecondary} />
              <ThemedText style={[styles.feedbackText, { color: ui.textSecondary }]}>
                Ejecuta una consulta para ver el viaje en mapa y el desglose de caminar vs bus.
              </ThemedText>
            </View>
          )}

          {journeyDisplayAdvice.length > 0 ? (
            <View style={styles.debugReasonList}>
              {journeyDisplayAdvice.map((advice) => (
                <View
                  key={advice.id}
                  style={[
                    styles.feedbackBanner,
                    { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                  ]}>
                  <Ionicons
                    name={advice.icon}
                    size={16}
                    color={advice.tone === 'warning' ? ui.accentWarning : ui.textSecondary}
                  />
                  <ThemedText style={[styles.feedbackText, { color: ui.textSecondary }]}>
                    {advice.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </GlassPanel>

        {selectedJourney ? (
          <GlassPanel variant="panel">
            <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>
              Viaje enfocado
            </ThemedText>
            <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
              {buildJourneySubtitle(selectedJourney)} | Score planner: {selectedJourney.score.toFixed(1)}
            </ThemedText>

            <View style={styles.metricsGrid}>
              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                ]}>
                <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                  Caminata total
                </ThemedText>
                <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                  {typeof focusedWalkMeters === 'number'
                    ? formatMetersLabel(focusedWalkMeters)
                    : formatMetersLabel(selectedJourney.totalWalkMeters)}
                </ThemedText>
                <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                  {typeof focusedWalkMinutes === 'number'
                    ? `${Math.round(focusedWalkMinutes)} min segun mapa`
                    : `${estimateJourneyWalkMinutes(selectedJourney)} min aprox`}
                </ThemedText>
              </View>

              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                ]}>
                <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                  Distancia en bus
                </ThemedText>
                <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                  {selectedVisualization ? formatMetersLabel(selectedVisualization.totalBusMeters) : '...'}
                </ThemedText>
                <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                  {selectedJourney.kind === 'transfer' ? '2 tramos o mas' : '1 tramo'}
                </ThemedText>
              </View>

              <View
                style={[
                  styles.metricCard,
                  { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                ]}>
                <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                  Tarifa
                </ThemedText>
                <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                  {formatFareLabel(selectedJourney.totalFare)}
                </ThemedText>
                <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                  {selectedJourney.transferLabel ?? 'Directo'}
                </ThemedText>
              </View>
            </View>

            {selectedJourneyDebug ? (
              <View style={styles.debugSection}>
                <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                  Debug del ranking
                </ThemedText>

                <View style={styles.alternativeMetrics}>
                  {selectedJourneyDebug.geoMetrics ? (
                    <StatusPill
                      label={`Base ${formatScoreLabel(selectedJourneyDebug.geoMetrics.baseScore)}`}
                      icon="speedometer-outline"
                      tone="neutral"
                    />
                  ) : null}
                  {selectedJourneyDebug.geoMetrics ? (
                    <StatusPill
                      label={`Geo ${formatSignedScoreLabel(selectedJourneyDebug.geoMetrics.scoreAdjustment)}`}
                      icon="map-outline"
                      tone={
                        (selectedJourneyDebug.geoMetrics.scoreAdjustment ?? 0) > 0
                          ? 'warning'
                          : 'neutral'
                      }
                    />
                  ) : null}
                  <StatusPill
                    label={`Planner ${selectedJourneyDebug.baseScore.toFixed(1)}`}
                    icon="analytics-outline"
                    tone="neutral"
                  />
                  {selectedJourneyDebug.geoMetrics ? (
                    <StatusPill
                      label={`Conf ${formatRatioLabel(selectedJourneyDebug.geoMetrics.confidenceScore)}`}
                      icon="shield-checkmark-outline"
                      tone={
                        (selectedJourneyDebug.geoMetrics.confidenceScore ?? 1) < 0.75
                          ? 'warning'
                          : 'live'
                      }
                    />
                  ) : null}
                  <StatusPill
                    label={`Contexto +${selectedJourneyDebug.contextPenalty.toFixed(1)}`}
                    icon="warning-outline"
                    tone={selectedJourneyDebug.contextPenalty > 0 ? 'warning' : 'neutral'}
                  />
                  <StatusPill
                    label={`Final ${selectedJourneyDebug.displayScore.toFixed(1)}`}
                    icon="pulse-outline"
                    tone="live"
                  />
                  <StatusPill
                    label={`${formatMetersLabel(selectedJourney.destinationWalkMeters)} final`}
                    icon="navigate-outline"
                    tone={
                      selectedJourneyDebug.geoMetrics?.walkRouteAvailable === false
                        ? 'warning'
                        : 'neutral'
                    }
                  />
                  {selectedJourneyDebug.geoMetrics?.finalWalkNetworkMeters !== null &&
                  selectedJourneyDebug.geoMetrics?.finalWalkNetworkMeters !== undefined ? (
                    <StatusPill
                      label={`Red ${formatMetersLabel(selectedJourneyDebug.geoMetrics.finalWalkNetworkMeters)}`}
                      icon="walk-outline"
                      tone={
                        (selectedJourneyDebug.geoMetrics.walkNetworkPenalty ?? 0) > 0
                          ? 'warning'
                          : 'live'
                      }
                    />
                  ) : null}
                  {(selectedJourneyDebug.geoMetrics?.finalWalkBacktrackPenalty ?? 0) > 0 ? (
                    <StatusPill
                      label={`Devuelve +${formatScoreLabel(selectedJourneyDebug.geoMetrics?.finalWalkBacktrackPenalty)}`}
                      icon="return-down-back-outline"
                      tone="warning"
                    />
                  ) : null}
                </View>

                <View style={styles.metricsGrid}>
                  <View
                    style={[
                      styles.metricCard,
                      { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                    ]}>
                    <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                      Tramo 1 deja
                    </ThemedText>
                    <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                      {selectedJourneyDebug.metrics?.firstLegDestinationDistanceMeters !== null &&
                      selectedJourneyDebug.metrics?.firstLegDestinationDistanceMeters !== undefined
                        ? formatMetersLabel(selectedJourneyDebug.metrics.firstLegDestinationDistanceMeters)
                        : 'Sin dato'}
                    </ThemedText>
                    <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                      Distancia al destino despues del primer bus
                    </ThemedText>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                    ]}>
                    <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                      Ultima parada deja
                    </ThemedText>
                    <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                      {selectedJourneyDebug.metrics?.finalStopDestinationDistanceMeters !== null &&
                      selectedJourneyDebug.metrics?.finalStopDestinationDistanceMeters !== undefined
                        ? formatMetersLabel(selectedJourneyDebug.metrics.finalStopDestinationDistanceMeters)
                        : 'Sin dato'}
                    </ThemedText>
                    <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                      Distancia al destino desde la bajada final
                    </ThemedText>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                    ]}>
                    <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                      Avance final
                    </ThemedText>
                    <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                      {formatRatioLabel(
                        selectedJourneyDebug.geoMetrics?.finalStopProgressRatio ??
                          selectedJourneyDebug.metrics?.finalStopProgressRatio,
                      )}
                    </ThemedText>
                    <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                      Bajada final: {formatOptionalMetersLabel(selectedJourneyDebug.geoMetrics?.finalWalkMeters)}
                    </ThemedText>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                    ]}>
                    <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                      Caminata real
                    </ThemedText>
                    <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                      {formatOptionalMetersLabel(focusedFinalWalkMeters)}
                    </ThemedText>
                    <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                      {selectedJourneyDebug.geoMetrics?.finalWalkStartsAgainstBus
                        ? 'Arranca devolviendose desde la bajada'
                        : focusedFinalWalkRouteAvailable === false
                          ? 'Sin ruta de red; usando linea directa'
                          : `${formatOptionalMinutesLabel(focusedFinalWalkMinutes)} / segun traza del mapa`}
                    </ThemedText>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                    ]}>
                    <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                      Ganancia 2do bus
                    </ThemedText>
                    <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                      {formatOptionalMetersLabel(selectedJourneyDebug.geoMetrics?.transferGainMeters)}
                    </ThemedText>
                    <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                      {formatTransferQualityLabel(selectedJourneyDebug.geoMetrics?.transferQualityLabel)}
                    </ThemedText>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                    ]}>
                    <ThemedText style={[styles.metricLabel, { color: ui.textSecondary }]}>
                      Shape vs parada
                    </ThemedText>
                    <ThemedText style={[styles.metricValue, { color: ui.textPrimary }]}>
                      {formatOptionalMetersLabel(
                        selectedJourneyDebug.geoMetrics?.maxShapeStopDistanceMeters,
                      )}
                    </ThemedText>
                    <ThemedText style={[styles.metricNote, { color: ui.textSecondary }]}>
                      Maxima separacion ruta-parada
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.debugReasonList}>
                  {selectedJourneyDebug.geoMetrics?.qualityFlags.length ? (
                    <View
                      style={[
                        styles.feedbackBanner,
                        { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                      ]}>
                      <Ionicons name="flag-outline" size={16} color={ui.textSecondary} />
                      <ThemedText style={[styles.feedbackText, { color: ui.textSecondary }]}>
                        Banderas geo: {formatQualityFlags(selectedJourneyDebug.geoMetrics.qualityFlags)}
                      </ThemedText>
                    </View>
                  ) : null}
                  {selectedJourneyDebug.reasons.length === 0 ? (
                    <View
                      style={[
                        styles.feedbackBanner,
                        { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                      ]}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={ui.textSecondary} />
                      <ThemedText style={[styles.feedbackText, { color: ui.textSecondary }]}>
                        Esta opcion no recibio castigos contextuales fuertes.
                      </ThemedText>
                    </View>
                  ) : (
                    selectedJourneyDebug.reasons.map((reason) => (
                      <View
                        key={reason.id}
                        style={[
                          styles.debugReasonRow,
                          { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                        ]}>
                        <View style={styles.flexOne}>
                          <ThemedText style={[styles.stepTitle, { color: ui.textPrimary }]}>
                            +{reason.penalty.toFixed(1)} contexto
                          </ThemedText>
                          <ThemedText style={[styles.stepDetail, { color: ui.textSecondary }]}>
                            {reason.label}
                          </ThemedText>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            ) : null}

            <View style={styles.stepList}>
              {loadingVisualization ? (
                <View style={styles.searchStateRow}>
                  <ActivityIndicator size="small" color={ui.accentPrimary} />
                  <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
                    Armando el mapa del viaje...
                  </ThemedText>
                </View>
              ) : (
                selectedVisualization?.steps.map((step) => (
                  <View
                    key={step.id}
                    style={[
                      styles.stepRow,
                      { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                    ]}>
                    <View style={[styles.stepDot, { backgroundColor: step.color }]} />
                    <View style={styles.flexOne}>
                      <ThemedText style={[styles.stepTitle, { color: ui.textPrimary }]}>
                        {step.title}
                      </ThemedText>
                      <ThemedText style={[styles.stepDetail, { color: ui.textSecondary }]}>
                        {step.detail}
                      </ThemedText>
                    </View>
                    <View style={styles.stepMeta}>
                      <ThemedText style={[styles.stepMeters, { color: ui.textPrimary }]}>
                        {formatMetersLabel(step.meters)}
                      </ThemedText>
                      <ThemedText style={[styles.stepNote, { color: ui.textSecondary }]}>
                        {step.kind === 'walk' ? formatWalkStepMinutes(step) : 'bus'}
                      </ThemedText>
                    </View>
                  </View>
                ))
              )}
            </View>
          </GlassPanel>
        ) : null}

        <GlassPanel variant="panel">
          <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>
            Alternativas del planner
          </ThemedText>
          <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
            Toca una opcion para enfocarla en el mapa. El costo final es un puntaje de ranking: menor gana; las rutas descartadas por costo o caminata quedan ocultas por defecto.
          </ThemedText>
          {__DEV__ && plannerRuntimeDebug ? (
            <ThemedText style={[styles.sectionCopy, { color: ui.textSecondary }]}>
              Runtime: {plannerRuntimeDebug}
            </ThemedText>
          ) : null}
          {hiddenDiscardedAlternativeCount > 0 ? (
            <View style={styles.alternativeToolbar}>
              <ThemedText style={[styles.sectionCopy, styles.flexOne, { color: ui.textSecondary }]}>
                {showDiscardedAlternatives
                  ? `Mostrando ${hiddenDiscardedAlternativeCount} candidata(s) descartadas para depuracion.`
                  : `Ocultando ${hiddenDiscardedAlternativeCount} candidata(s) descartadas por caminata o costo.`}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setShowDiscardedAlternatives((value) => !value);
                }}
                style={[
                  styles.secondaryButton,
                  { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                ]}>
                <Ionicons
                  name={showDiscardedAlternatives ? 'eye-off-outline' : 'bug-outline'}
                  size={16}
                  color={ui.textPrimary}
                />
                <ThemedText style={[styles.secondaryButtonText, { color: ui.textPrimary }]}>
                  {showDiscardedAlternatives ? 'Ocultar descartadas' : 'Ver descartadas'}
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.alternativeList}>
            {journeyPlans.length === 0 && !planning ? (
              <View
                style={[
                  styles.feedbackBanner,
                  { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft },
                ]}>
                <Ionicons name="list-outline" size={16} color={ui.textSecondary} />
                <ThemedText style={[styles.feedbackText, { color: ui.textSecondary }]}>
                  Aqui van a aparecer las opciones del algoritmo.
                </ThemedText>
              </View>
            ) : null}

            {visibleJourneyPlans.map((journey) => {
              const focused = selectedJourney?.id === journey.id;
              const recommended = recommendedJourney?.id === journey.id;
              const journeyDebug = journeyDebugById.get(journey.id) ?? null;
              const displayScore = journeyDebug?.displayScore ?? displayScoreByJourneyId.get(journey.id) ?? journey.score;
              const alternativeVisibility =
                alternativeVisibilityByJourneyId.get(journey.id) ??
                evaluateAlternativeVisibility({
                  journey,
                  recommendedJourney,
                  displayScore,
                  recommendedScore: recommendedJourneyScore,
                });
              const scoreDelta = alternativeVisibility.scoreDelta;
              const isDiscarded = alternativeVisibility.isDiscarded;
              const focusedVisualization = focused ? selectedVisualization : null;
              const journeyWalkMinutes = focusedVisualization
                ? Math.round(focusedVisualization.totalWalkMinutes)
                : estimateJourneyWalkMinutes(journey);

              return (
                <Pressable
                  key={journey.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedJourneyId(journey.id);
                    setManualJourneyFocus(true);
                  }}
                  style={[
                    styles.alternativeCard,
                    isDiscarded ? styles.discardedAlternativeCard : null,
                    {
                      backgroundColor: focused ? ui.interactiveAccent : ui.interactiveNeutral,
                      borderColor: focused ? `${ui.accentPrimary}44` : ui.dividerSoft,
                    },
                  ]}>
                  <View style={styles.alternativeHeader}>
                    <View style={styles.flexOne}>
                      <ThemedText style={[styles.alternativeTitle, { color: ui.textPrimary }]}>
                        {buildJourneyTitle(journey)}
                      </ThemedText>
                      <ThemedText style={[styles.alternativeSubtitle, { color: ui.textSecondary }]}>
                        {buildJourneySubtitle(journey)}
                      </ThemedText>
                    </View>
                    {recommended ? <StatusPill label="Recomendada" icon="sparkles-outline" tone="live" /> : null}
                    {focused && !recommended ? <StatusPill label="En foco" icon="eye-outline" tone="accent" /> : null}
                    {isDiscarded ? (
                      <StatusPill
                        label={alternativeVisibility.discardReason === 'walk' ? 'Caminata excesiva' : 'Descartada'}
                        icon="warning-outline"
                        tone="warning"
                      />
                    ) : null}
                    {!recommended && !isDiscarded ? (
                      <StatusPill label="Alternativa cercana" icon="git-compare-outline" tone="neutral" />
                    ) : null}
                  </View>

                  <View style={styles.alternativeMetrics}>
                    <StatusPill
                      label={`${journeyWalkMinutes} min caminando`}
                      icon="walk-outline"
                      tone="warning"
                    />
                    <StatusPill
                      label={formatFareLabel(journey.totalFare)}
                      icon="cash-outline"
                      tone="neutral"
                    />
                    <StatusPill
                      label={`Costo ${displayScore.toFixed(1)}`}
                      icon="pulse-outline"
                      tone="live"
                    />
                    {!recommended && scoreDelta !== null && scoreDelta > 0.05 ? (
                      <StatusPill
                        label={`+${scoreDelta.toFixed(1)} vs recomendada`}
                        icon="trending-up-outline"
                        tone={isDiscarded ? 'warning' : 'neutral'}
                      />
                    ) : null}
                    <StatusPill
                      label={`Base ${journey.score.toFixed(1)}`}
                      icon="analytics-outline"
                      tone="neutral"
                    />
                    {journey.geoMetrics ? (
                      <StatusPill
                        label={`Geo ${formatSignedScoreLabel(journey.geoMetrics.scoreAdjustment)}`}
                        icon="map-outline"
                        tone={(journey.geoMetrics.scoreAdjustment ?? 0) > 0 ? 'warning' : 'neutral'}
                      />
                    ) : null}
                    <StatusPill
                      label={`+${(journeyDebug?.contextPenalty ?? 0).toFixed(1)} contexto`}
                      icon="warning-outline"
                      tone={(journeyDebug?.contextPenalty ?? 0) > 0 ? 'warning' : 'neutral'}
                    />
                    <StatusPill
                      label={`${formatMetersLabel(journey.destinationWalkMeters)} final`}
                      icon="navigate-outline"
                      tone={journey.geoMetrics?.walkRouteAvailable === false ? 'warning' : 'neutral'}
                    />
                  {journey.geoMetrics?.finalWalkNetworkMeters !== null &&
                    journey.geoMetrics?.finalWalkNetworkMeters !== undefined ? (
                      <StatusPill
                        label={`Red ${formatMetersLabel(journey.geoMetrics.finalWalkNetworkMeters)}`}
                        icon="walk-outline"
                        tone={(journey.geoMetrics.walkNetworkPenalty ?? 0) > 0 ? 'warning' : 'live'}
                      />
                    ) : null}
                    {(journey.geoMetrics?.finalWalkBacktrackPenalty ?? 0) > 0 ? (
                      <StatusPill
                        label="Se devuelve"
                        icon="return-down-back-outline"
                        tone="warning"
                      />
                    ) : null}
                  </View>

                  {journeyDebug?.reasons[0] ? (
                    <ThemedText style={[styles.alternativeDebugText, { color: ui.textSecondary }]}>
                      Ajuste aplicado: {journeyDebug.reasons[0].label}
                    </ThemedText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </GlassPanel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: passengerSpacing.lg,
    paddingTop: passengerSpacing.sm,
    paddingBottom: passengerSpacing.xxl,
    gap: passengerSpacing.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: passengerSpacing.sm,
  },
  flexOne: { flex: 1 },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  sectionCopy: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  fieldGroup: { gap: 8 },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  textInput: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
    alignItems: 'center',
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  selectionBadge: {
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    maxWidth: 220,
  },
  searchStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchResults: { gap: passengerSpacing.xs },
  devicePerfPanel: {
    borderRadius: 20,
    borderWidth: 1,
    padding: passengerSpacing.sm,
    gap: passengerSpacing.sm,
  },
  goldenCaseList: {
    gap: passengerSpacing.xs,
  },
  goldenCaseGroup: {
    gap: passengerSpacing.xs,
  },
  goldenCaseGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: passengerSpacing.sm,
  },
  goldenCaseGroupTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  goldenCaseGroupCopy: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  goldenCaseButton: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  goldenCaseMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: passengerSpacing.sm,
  },
  goldenCaseTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    flex: 1,
  },
  goldenCaseCopy: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  searchResultRow: {
    minHeight: 60,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.sm,
  },
  searchResultTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.xs,
  },
  searchResultTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  searchResultSourcePill: {
    minHeight: 26,
    paddingHorizontal: 8,
  },
  searchResultSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  feedbackBanner: {
    minHeight: 46,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.sm,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  mapShell: {
    width: '100%',
    minHeight: 500,
    overflow: 'hidden',
    borderRadius: 28,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
  },
  debugSection: {
    gap: passengerSpacing.sm,
  },
  debugReasonList: {
    gap: passengerSpacing.xs,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 170,
    borderRadius: 18,
    borderWidth: 1,
    padding: passengerSpacing.sm,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  metricNote: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  stepList: { gap: passengerSpacing.xs },
  stepRow: {
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.sm,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  stepDetail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  stepMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  stepMeters: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  stepNote: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  debugReasonRow: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  alternativeToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: passengerSpacing.xs,
  },
  alternativeList: { gap: passengerSpacing.xs },
  alternativeCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: passengerSpacing.sm,
    gap: passengerSpacing.sm,
  },
  discardedAlternativeCard: {
    opacity: 0.72,
  },
  alternativeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: passengerSpacing.sm,
  },
  alternativeTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  alternativeSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  alternativeMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
  },
  alternativeDebugText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
});
