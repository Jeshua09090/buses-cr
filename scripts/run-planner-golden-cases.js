#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const { config: loadEnv } = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
loadEnv({ path: path.join(projectRoot, '.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const rpcFunctions = ['buscar_viajes_0_1_transbordo_v3', 'buscar_viajes_0_1_transbordo_v2'];
const defaultTransferWalkMeters = 220;
const regionalTransferWalkMeters = 600;
const localTransferRetryDistanceMeters = 4000;
const ruralDestinationRetryDistanceMeters = 2500;
const ruralDestinationRadiusMeters = 1600;
const regionalTransferRetryDistanceMeters = 8000;
const regionalOriginRadiusMeters = 1000;
const regionalDestinationRadiusMeters = 4000;
const shortTripTightDistanceMeters = 1000;
const shortTripRadiusMeters = 250;
const walkingNetworkValidationLimit = 24;
const walkingNetworkRegionalValidationLimit = 48;
const walkingNetworkSoftLimitMeters = 2500;
const walkingNetworkHardLimitMeters = 5000;
const walkingNetworkDetourRatioLimit = 2.2;
const tejarCenterCoordinates = [-83.9385643, 9.8439289];
const cartagoUrbanEastCoordinate = [-83.9132, 9.8625];
const cartagoUrbanEastRetryDistanceMeters = 2200;
const irazuWestApproachCoordinate = [-83.88125895327642, 9.953845289007294];
const irazuWestApproachDistanceMeters = 3200;
const ctpPreviewStopIdOffset = 200000000;
const walkingRouteCache = new Map();
const strongInterurbanHints = ['SAN JOSE', 'TURRIALBA', 'ALAJUELA', 'HEREDIA', 'LIMON', 'PUNTARENAS'];
const cartagoEastRegionalHints = [
  'CACHI',
  'TUCURRIQUE',
  'OROSI',
  'RIO MACHO',
  'PALOMO',
  'LA ALEGRIA',
  'PURISIL',
  'PENAS BLANCAS',
  'LOAIZA',
  'PIEDRA AZUL',
  'SANATORIO',
  'VOLCAN IRAZU',
  'TIERRA BLANCA',
];
const mediumInterurbanHints = [
  'TRES RIOS',
  'ZAPOTE',
  'DESAMPARADOS',
  'ASERRI',
  'QUEPOS',
  'PARAISO',
  'BIRRISITO',
  'CERVANTES',
  'SANTIAGO',
  'OROSI',
  'RIO MACHO',
  'CACHI',
  'TUCURRIQUE',
  'SANATORIO',
  'PENAS BLANCAS',
  'PARQUE INDUSTRIAL',
];

function parseArgs(argv) {
  return argv.reduce(
    (options, arg) => {
      if (arg === '--strict') return { ...options, strict: true };
      if (arg === '--details') return { ...options, details: true };
      if (arg.startsWith('--case=')) return { ...options, caseId: arg.slice('--case='.length) };
      return options;
    },
    { strict: false, details: false, caseId: null },
  );
}

function loadGoldenCaseModule() {
  const sourcePath = path.join(projectRoot, 'lib', 'planner-golden-cases.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
  });
  const module = { exports: {} };
  const sandbox = {
    exports: module.exports,
    module,
    require(request) {
      throw new Error(`Unexpected runtime import in golden cases: ${request}`);
    },
  };

  vm.runInNewContext(compiled.outputText, sandbox, { filename: sourcePath });
  return module.exports;
}

function parseCoordinateQuery(value) {
  if (!value) return null;
  const parts = String(value)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));

  if (parts.length < 2) return null;
  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(from, to) {
  const [lngFrom, latFrom] = from;
  const [lngTo, latTo] = to;
  const deltaLat = toRadians(latTo - latFrom);
  const deltaLng = toRadians(lngTo - lngFrom);
  const latFromRad = toRadians(latFrom);
  const latToRad = toRadians(latTo);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latFromRad) * Math.cos(latToRad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isStatementTimeoutError(error) {
  if (!error) return false;
  if (error.code === '57014') return true;
  return /statement timeout|canceling statement due to statement timeout/i.test(
    [error.message, error.details, error.hint].filter(Boolean).join(' '),
  );
}

function canTryPlannerRpcFallback(error, rpcFunction) {
  if (rpcFunction !== 'buscar_viajes_0_1_transbordo_v3') return false;
  if (isStatementTimeoutError(error)) return true;
  return /buscar_viajes_0_1_transbordo_v3|Could not find the function|PGRST202/i.test(
    [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' '),
  );
}

function roundCoordinate(coordinate) {
  return `${coordinate[0].toFixed(5)},${coordinate[1].toFixed(5)}`;
}

function buildWalkingCacheKey(from, to) {
  return `${roundCoordinate(from)}>${roundCoordinate(to)}`;
}

function sanitizeRouteCoordinates(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((coordinate) => (
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      Number.isFinite(Number(coordinate[0])) &&
      Number.isFinite(Number(coordinate[1]))
    ))
    .map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])]);
}

async function fetchWalkingRoute(from, to) {
  const straightLineMeters = haversineMeters(from, to);
  if (!mapboxToken) {
    return {
      status: 'unavailable',
      straightLineMeters,
      networkDistanceMeters: null,
      networkDurationMinutes: null,
      detourRatio: null,
    };
  }

  const cacheKey = buildWalkingCacheKey(from, to);
  const cached = walkingRouteCache.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    const searchParams = new URLSearchParams({
      access_token: mapboxToken,
      alternatives: 'false',
      geometries: 'geojson',
      overview: 'full',
      steps: 'false',
    });
    const coordinates = `${from[0]},${from[1]};${to[0]},${to[1]}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?${searchParams.toString()}`;

    try {
      const response = await fetch(url);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || (payload.code && payload.code !== 'Ok')) {
        return {
          status: payload?.code === 'NoRoute' ? 'no_route' : 'unavailable',
          straightLineMeters,
          networkDistanceMeters: null,
          networkDurationMinutes: null,
          detourRatio: null,
        };
      }

      const route = payload.routes?.[0];
      const networkDistanceMeters = Number(route?.distance);
      const routeCoordinates = sanitizeRouteCoordinates(route?.geometry?.coordinates);
      if (!Number.isFinite(networkDistanceMeters) || routeCoordinates.length < 2) {
        return {
          status: 'no_route',
          straightLineMeters,
          networkDistanceMeters: null,
          networkDurationMinutes: null,
          detourRatio: null,
        };
      }

      return {
        status: 'ok',
        straightLineMeters,
        networkDistanceMeters,
        networkDurationMinutes: Number.isFinite(Number(route?.duration))
          ? Math.max(1, Math.round(Number(route.duration) / 60))
          : null,
        detourRatio: straightLineMeters > 0 ? networkDistanceMeters / straightLineMeters : null,
      };
    } catch {
      return {
        status: 'unavailable',
        straightLineMeters,
        networkDistanceMeters: null,
        networkDurationMinutes: null,
        detourRatio: null,
      };
    }
  })();

  walkingRouteCache.set(cacheKey, request);
  return request;
}

function computeWalkNetworkPenalty(walkingRoute) {
  if (walkingRoute.status === 'unavailable') return 0;
  if (walkingRoute.status === 'no_route') {
    if (walkingRoute.straightLineMeters < 350) return 220;
    return Math.round(1900 + walkingRoute.straightLineMeters * 0.45);
  }

  const networkDistanceMeters = walkingRoute.networkDistanceMeters ?? walkingRoute.straightLineMeters;
  const extraNetworkMeters = Math.max(0, networkDistanceMeters - walkingRoute.straightLineMeters);
  const detourRatio = walkingRoute.detourRatio ?? 1;
  let penalty = extraNetworkMeters * 0.65;

  if (detourRatio > walkingNetworkDetourRatioLimit && networkDistanceMeters >= 700) {
    penalty += Math.min(1800, (detourRatio - walkingNetworkDetourRatioLimit) * 360);
  }

  if (networkDistanceMeters > walkingNetworkSoftLimitMeters) {
    penalty += (networkDistanceMeters - walkingNetworkSoftLimitMeters) * 0.35;
  }

  if (networkDistanceMeters > walkingNetworkHardLimitMeters) {
    penalty += 1200;
  }

  return Math.max(0, Math.round(penalty));
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function resolvePlannerLocationContext(supabase, destination) {
  const { data, error } = await supabase.rpc('planner_resolve_location_context', {
    p_lat: destination[1],
    p_lng: destination[0],
  });

  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.hub_key) return null;

  const resolvedLat = Number(row.resolved_lat);
  const resolvedLng = Number(row.resolved_lng);
  if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLng)) return null;

  return {
    hubKey: String(row.hub_key),
    hubType: row.hub_type ? String(row.hub_type) : null,
    resolvedCoordinates: [resolvedLng, resolvedLat],
    radiusMeters: toFiniteNumber(row.radius_m, 600),
    plannerRadiusOverrideMeters: toFiniteNumber(row.planner_radius_override_m, null),
  };
}

function shouldUsePlannerLocationContextResolvedCoords(context, destination) {
  if (!context) return false;

  const snapDistanceMeters = haversineMeters(destination, context.resolvedCoordinates);
  if (snapDistanceMeters <= 80) return true;

  const hubType = normalizeText(context.hubType);
  if (hubType.includes('DISTRICT') || hubType.includes('DISTRITO')) {
    return false;
  }

  return snapDistanceMeters <= Math.min(350, Math.max(120, context.radiusMeters * 0.35));
}

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCtpPreviewStopId(stopId) {
  const parsed = Number(stopId);
  if (!Number.isFinite(parsed)) return stopId;

  const absoluteStopId = Math.abs(parsed);
  if (parsed < 0 && absoluteStopId > ctpPreviewStopIdOffset) {
    return -(absoluteStopId - ctpPreviewStopIdOffset);
  }

  return parsed;
}

function ctpPreviewStopSourceId(stopId) {
  return Math.abs(normalizeCtpPreviewStopId(stopId));
}

function toNumericRouteId(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function routeTextLooksInterurban(value) {
  const routeText = normalizeText(value);
  return (
    strongInterurbanHints.some((hint) => routeText.includes(hint)) ||
    mediumInterurbanHints.some((hint) => routeText.includes(hint))
  );
}

function destinationLooksLikeIrazuWestApproach(destination) {
  return haversineMeters(destination, irazuWestApproachCoordinate) <= irazuWestApproachDistanceMeters;
}

function shouldDiscardIncoherentRow(row, destination) {
  const straightLineMeters = Number(row.straight_line_m);
  if (!Number.isFinite(straightLineMeters) || straightLineMeters > 12000) return false;

  const finalStopProgressRatio = Number(row.final_stop_progress_ratio ?? 0);
  const firstLegBacktrackMeters = Number(row.first_leg_backtrack_m ?? 0);
  const firstLegBacktracksBadly =
    firstLegBacktrackMeters >= Math.max(800, straightLineMeters * 0.25);

  if (row.tipo_viaje === 'transbordo' && firstLegBacktracksBadly && finalStopProgressRatio < 0.78) {
    return true;
  }

  const finalWalkNetworkMeters = Number(row.final_walk_network_m ?? row.destino_distancia_final_m);
  const routeText = normalizeText(
    [row.ruta_1_nombre, row.ruta_1_codigo, row.ruta_2_nombre, row.ruta_2_codigo].filter(Boolean).join(' '),
  );
  const routeLooksInterurban =
    routeText.includes('SAN JOSE') ||
    routeText.includes('TRES RIOS') ||
    routeText.includes('ZAPOTE');

  if (
    destination &&
    destinationLooksLikeIrazuWestApproach(destination) &&
    routeText.includes('LLANO GRANDE') &&
    finalWalkNetworkMeters >= 2500
  ) {
    return true;
  }

  if (
    row.tipo_viaje === 'transbordo' &&
    routeLooksInterurban &&
    straightLineMeters <= 6500 &&
    finalWalkNetworkMeters >= 1200 &&
    finalStopProgressRatio < 0.78
  ) {
    return true;
  }

  return (
    row.tipo_viaje !== 'transbordo' &&
    routeLooksInterurban &&
    finalWalkNetworkMeters >= 2500 &&
    finalStopProgressRatio < 0.7
  );
}

function filterIncoherentRows(rows, destination) {
  const filtered = rows.filter((row) => !shouldDiscardIncoherentRow(row, destination));
  return filtered.length > 0 ? filtered : rows;
}

function rowRouteText(row) {
  return normalizeText(
    [row.ruta_1_nombre, row.ruta_1_codigo, row.ruta_2_nombre, row.ruta_2_codigo].filter(Boolean).join(' '),
  );
}

function rowUsesOffTargetStrongInterurban(row, destinationText) {
  const routeText = rowRouteText(row);
  return strongInterurbanHints.some((hint) => routeText.includes(hint) && !destinationText.includes(hint));
}

function rowLooksLikeNationalFeederToCartagoEast(row) {
  if (row.tipo_viaje !== 'transbordo') return false;

  const firstLegRouteText = normalizeText(
    [row.ruta_1_nombre, row.ruta_1_codigo].filter(Boolean).join(' '),
  );
  const secondLegRouteText = normalizeText(
    [row.ruta_2_nombre, row.ruta_2_codigo].filter(Boolean).join(' '),
  );

  return (
    firstLegRouteText.includes('SAN JOSE') &&
    cartagoEastRegionalHints.some((hint) => secondLegRouteText.includes(hint)) &&
    !secondLegRouteText.includes('SAN JOSE')
  );
}

function rowLooksLikeOffTargetSanJoseTejar(row, destination) {
  if (!destination) return false;
  const routeText = rowRouteText(row);
  if (!routeText.includes('SAN JOSE-TEJAR')) return false;

  return haversineMeters(destination, tejarCenterCoordinates) > 3000;
}

function destinationLooksLikeCartagoUrbanEast(destination) {
  return haversineMeters(destination, cartagoUrbanEastCoordinate) <= cartagoUrbanEastRetryDistanceMeters;
}

function rowUsesStrongInterurbanHint(row) {
  const routeText = rowRouteText(row);
  return strongInterurbanHints.some((hint) => routeText.includes(hint));
}

function rowLooksLikeOffTargetLlanoGrandeForIrazu(row, destination) {
  if (!destination || !destinationLooksLikeIrazuWestApproach(destination)) return false;
  const routeText = rowRouteText(row);
  if (!routeText.includes('LLANO GRANDE')) return false;

  const finalWalkNetworkMeters = Number(row.final_walk_network_m ?? row.destino_distancia_final_m);
  return Number.isFinite(finalWalkNetworkMeters) && finalWalkNetworkMeters >= 2500;
}

function shouldProbeWiderCartagoUrbanLocalAttempt(params) {
  const { currentDestinationRadius, destination, nextAttempt, rows } = params;
  if (!nextAttempt?.destinationRadiusMeters) return false;
  if (nextAttempt.destinationRadiusMeters <= currentDestinationRadius) return false;
  if (!destinationLooksLikeCartagoUrbanEast(destination)) return false;

  const inspectedRows = rows.slice(0, Math.min(4, rows.length));
  if (inspectedRows.length === 0) return false;

  return inspectedRows.every((row) => rowUsesStrongInterurbanHint(row));
}

function shouldProbeWiderIrazuWestAttempt(params) {
  const { currentDestinationRadius, destination, nextAttempt, rows } = params;
  if (!nextAttempt?.destinationRadiusMeters) return false;
  if (nextAttempt.destinationRadiusMeters <= currentDestinationRadius) return false;
  if (!destinationLooksLikeIrazuWestApproach(destination)) return false;

  const inspectedRows = rows.slice(0, Math.min(6, rows.length));
  if (inspectedRows.length === 0) return false;

  return inspectedRows.every((row) => rowLooksLikeOffTargetLlanoGrandeForIrazu(row, destination));
}

function getWalkingNetworkValidationLimitForRows(rows, destination) {
  const maxStraightLineMeters = rows.reduce(
    (maxMeters, row) => Math.max(maxMeters, toFiniteNumber(row.straight_line_m, 0)),
    0,
  );

  if (
    (destination && destinationLooksLikeIrazuWestApproach(destination)) ||
    maxStraightLineMeters >= regionalTransferRetryDistanceMeters
  ) {
    return walkingNetworkRegionalValidationLimit;
  }

  return walkingNetworkValidationLimit;
}

function applyCartagoEastNationalFeederPenaltyToRows(rows) {
  if (rows.length === 0) return rows;

  const adjustedRows = rows.map((row) => {
    if (!rowLooksLikeNationalFeederToCartagoEast(row)) return row;

    const currentScore = toFiniteNumber(row.score);
    if (currentScore === null) return row;

    const penalty = 1250;
    return {
      ...row,
      score: currentScore + penalty,
      cartago_east_national_feeder_penalty: penalty,
    };
  });

  return adjustedRows.sort((a, b) => Number(a.score ?? 999999) - Number(b.score ?? 999999));
}

function applyOffTargetSanJoseTejarPenaltyToRows(rows, destination) {
  if (rows.length === 0 || !destination) return rows;

  const adjustedRows = rows.map((row) => {
    if (!rowLooksLikeOffTargetSanJoseTejar(row, destination)) return row;

    const currentScore = toFiniteNumber(row.score);
    if (currentScore === null) return row;

    const penalty = 1450;
    return {
      ...row,
      score: currentScore + penalty,
      off_target_san_jose_tejar_penalty: penalty,
    };
  });

  return adjustedRows.sort((a, b) => Number(a.score ?? 999999) - Number(b.score ?? 999999));
}

function applyShortLocalInterurbanPenaltyToRows(rows, goldenCase, destination) {
  const origin = goldenCase.originCoordinates ?? parseCoordinateQuery(goldenCase.originQuery);
  if (!origin || !destination || rows.length === 0) return rows;

  const straightLineMeters = haversineMeters(origin, destination);
  if (!Number.isFinite(straightLineMeters) || straightLineMeters >= shortTripTightDistanceMeters) {
    return rows;
  }

  const destinationText = normalizeText(
    [goldenCase.destinationLabel, goldenCase.destinationQuery, goldenCase.name].filter(Boolean).join(' '),
  );
  const hasLocalAlternative = rows.some((row) => !rowUsesOffTargetStrongInterurban(row, destinationText));
  if (!hasLocalAlternative) return rows;

  const adjustedRows = rows.map((row) => {
    if (!rowUsesOffTargetStrongInterurban(row, destinationText)) return row;

    const currentScore = toFiniteNumber(row.score);
    if (currentScore === null) return row;

    const penalty = 32;
    return {
      ...row,
      score: currentScore + penalty,
      short_local_interurban_penalty: penalty,
    };
  });

  return adjustedRows.sort((a, b) => Number(a.score ?? 999999) - Number(b.score ?? 999999));
}

function resolveDestination(goldenCase) {
  return goldenCase.destinationCoordinates ?? parseCoordinateQuery(goldenCase.destinationQuery);
}

function normalizeRouteCode(value) {
  return String(value ?? '').trim();
}

function rowToJourney(row) {
  const legs = [
    {
      routeName: row.ruta_1_nombre ?? null,
      routeCode: normalizeRouteCode(row.ruta_1_codigo) || null,
      boardStopName: row.subida_1_parada_nombre ?? null,
      alightStopName: row.bajada_1_parada_nombre ?? null,
    },
  ];

  if (row.ruta_2_id) {
    legs.push({
      routeName: row.ruta_2_nombre ?? null,
      routeCode: normalizeRouteCode(row.ruta_2_codigo) || null,
      boardStopName: row.subida_2_parada_nombre ?? null,
      alightStopName: row.bajada_2_parada_nombre ?? null,
    });
  }

  return { legs };
}

async function fetchPlannerRows(supabase, goldenCase, destination) {
  const destinationContext = await resolvePlannerLocationContext(supabase, destination);
  const effectiveDestination = shouldUsePlannerLocationContextResolvedCoords(
    destinationContext,
    destination,
  )
    ? destinationContext.resolvedCoordinates
    : destination;
  const straightLineMeters = haversineMeters(goldenCase.originCoordinates, effectiveDestination);
  const originRadiusMeters =
    straightLineMeters >= regionalTransferRetryDistanceMeters ? regionalOriginRadiusMeters : 600;
  const maxResults = straightLineMeters >= regionalTransferRetryDistanceMeters ? 48 : 8;
  const attempts = [];
  if (straightLineMeters < shortTripTightDistanceMeters) {
    attempts.push({
      originRadiusMeters: Math.min(originRadiusMeters, shortTripRadiusMeters),
      transferWalkMeters: 0,
      destinationRadiusMeters: shortTripRadiusMeters,
    });
  } else if (straightLineMeters >= regionalTransferRetryDistanceMeters) {
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: regionalTransferWalkMeters,
      destinationRadiusMeters: 600,
    });
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: regionalTransferWalkMeters,
      destinationRadiusMeters: regionalDestinationRadiusMeters,
    });
    attempts.push({
      originRadiusMeters: 600,
      transferWalkMeters: 0,
      destinationRadiusMeters: 600,
    });
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: defaultTransferWalkMeters,
      destinationRadiusMeters: regionalDestinationRadiusMeters,
    });
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: regionalTransferWalkMeters,
      destinationRadiusMeters: 600,
    });
  } else if (straightLineMeters >= localTransferRetryDistanceMeters) {
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: defaultTransferWalkMeters,
      destinationRadiusMeters: 600,
    });
    attempts.push({ originRadiusMeters, transferWalkMeters: regionalTransferWalkMeters, destinationRadiusMeters: 600 });
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: defaultTransferWalkMeters,
      destinationRadiusMeters: ruralDestinationRadiusMeters,
    });
  } else if (straightLineMeters >= ruralDestinationRetryDistanceMeters) {
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: defaultTransferWalkMeters,
      destinationRadiusMeters: 600,
    });
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: defaultTransferWalkMeters,
      destinationRadiusMeters: ruralDestinationRadiusMeters,
    });
  } else {
    attempts.push({
      originRadiusMeters,
      transferWalkMeters: defaultTransferWalkMeters,
      destinationRadiusMeters: 600,
    });
  }

  let lastError = null;
  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const attempt = attempts[attemptIndex];
    const args = {
      p_origen_lat: goldenCase.originCoordinates[1],
      p_origen_lng: goldenCase.originCoordinates[0],
      p_destino_lat: effectiveDestination[1],
      p_destino_lng: effectiveDestination[0],
      p_radio_origen_m: attempt.originRadiusMeters,
      p_radio_destino_m: Math.max(
        attempt.destinationRadiusMeters,
        destinationContext?.radiusMeters ?? 0,
        destinationContext?.plannerRadiusOverrideMeters ?? 0,
      ),
      p_max_caminar_transbordo_m: attempt.transferWalkMeters,
      p_max_resultados: maxResults,
      p_sentido: null,
      p_fecha_hora: new Date().toISOString(),
      p_es_feriado: false,
      p_espera_default_min: 12,
    };

    for (const rpcFunction of rpcFunctions) {
      const { data, error } = await supabase.rpc(rpcFunction, args);
      if (!error) {
        const rows = data ?? [];
        if (rows.length > 0 || attempt === attempts[attempts.length - 1]) {
          const nextAttempt = attempts[attemptIndex + 1];
          if (
            rows.length > 0 &&
            shouldProbeWiderCartagoUrbanLocalAttempt({
              rows,
              destination: effectiveDestination,
              currentDestinationRadius: Math.max(
                attempt.destinationRadiusMeters,
                destinationContext?.radiusMeters ?? 0,
                destinationContext?.plannerRadiusOverrideMeters ?? 0,
              ),
              nextAttempt,
            })
          ) {
            break;
          }
          if (
            rows.length > 0 &&
            shouldProbeWiderIrazuWestAttempt({
              rows,
              destination: effectiveDestination,
              currentDestinationRadius: Math.max(
                attempt.destinationRadiusMeters,
                destinationContext?.radiusMeters ?? 0,
                destinationContext?.plannerRadiusOverrideMeters ?? 0,
              ),
              nextAttempt,
            })
          ) {
            break;
          }
          return { rows, rpcFunction };
        }
        break;
      }

      lastError = error;
      if (!canTryPlannerRpcFallback(error, rpcFunction)) {
        break;
      }
    }
  }

  throw lastError ?? new Error('Planner RPC failed without an error payload.');
}

async function resolvePlannerServiceGroupCandidates(supabase, goldenCase, destination) {
  const [originLng, originLat] = goldenCase.originCoordinates;
  const [destinationLng, destinationLat] = destination;
  const { data, error } = await supabase.rpc('planner_resolve_service_group_candidates', {
    p_origin_lat: originLat,
    p_origin_lng: originLng,
    p_destination_lat: destinationLat,
    p_destination_lng: destinationLng,
  });

  if (error) {
    return [];
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const groupKey = row.group_key?.trim();
      const groupName = row.group_name?.trim();
      const memberLabel = row.member_label?.trim();
      const effectivePriority = toFiniteNumber(row.effective_priority);
      if (!groupKey || !groupName || !memberLabel || effectivePriority === null) return null;

      const memberPriority = toFiniteNumber(row.member_priority, 100);
      const directnessRank = toFiniteNumber(row.directness_rank, 100);
      return {
        groupKey,
        groupName,
        memberLabel,
        productRouteId: toNumericRouteId(row.product_route_id),
        previewRouteId: toNumericRouteId(row.preview_route_id),
        memberPriority,
        directnessRank,
        effectivePriority,
      };
    })
    .filter(Boolean);
}

async function applyPlannerServiceGroupBiasToRows(supabase, rows, goldenCase, destination) {
  if (rows.length === 0) return rows;

  const candidates = await resolvePlannerServiceGroupCandidates(supabase, goldenCase, destination);
  if (candidates.length === 0) return rows;

  const bestByRouteId = new Map();
  candidates.forEach((candidate) => {
    [candidate.productRouteId, candidate.previewRouteId]
      .filter((routeId) => Number.isFinite(routeId))
      .forEach((routeId) => {
        const existing = bestByRouteId.get(routeId);
        if (!existing || candidate.effectivePriority < existing.effectivePriority) {
          bestByRouteId.set(routeId, candidate);
        }
      });
  });

  if (bestByRouteId.size === 0) return rows;

  const straightLineMeters = haversineMeters(goldenCase.originCoordinates, destination);
  const adjustedRows = rows.map((row) => {
    const routeIds = [toNumericRouteId(row.ruta_1_id), toNumericRouteId(row.ruta_2_id)];
    const matchingCandidates = routeIds
      .map((routeId) => (routeId === null ? null : bestByRouteId.get(routeId)))
      .filter(Boolean)
      .sort((a, b) => a.effectivePriority - b.effectivePriority);
    const bestCandidate = matchingCandidates[0];
    if (!bestCandidate) return row;

    const candidateRouteIds = [bestCandidate.productRouteId, bestCandidate.previewRouteId].filter((routeId) =>
      Number.isFinite(routeId),
    );
    const matchedLegIndex = routeIds.findIndex((routeId) => routeId !== null && candidateRouteIds.includes(routeId));
    const firstLegDestinationDistanceMeters = toFiniteNumber(row.first_leg_destination_distance_m);
    const finalStopDestinationDistanceMeters = toFiniteNumber(
      row.final_stop_destination_distance_m ?? row.destino_distancia_final_m,
    );
    const transferProgressGainMeters =
      firstLegDestinationDistanceMeters !== null && finalStopDestinationDistanceMeters !== null
        ? firstLegDestinationDistanceMeters - finalStopDestinationDistanceMeters
        : null;
    const firstLegAlreadyNearDestination =
      firstLegDestinationDistanceMeters !== null &&
      firstLegDestinationDistanceMeters <= Math.min(320, straightLineMeters * 0.22);
    const cleanupTransferGainIsTiny =
      transferProgressGainMeters !== null &&
      transferProgressGainMeters <= Math.max(140, straightLineMeters * 0.1);
    const firstLegLooksInterurban = routeTextLooksInterurban(row.ruta_1_nombre ?? row.ruta_1_codigo);

    let biasMultiplier = 1;
    if (row.tipo_viaje === 'transbordo' && matchedLegIndex > 0) {
      biasMultiplier = 0.4;
      if (firstLegLooksInterurban && (firstLegAlreadyNearDestination || cleanupTransferGainIsTiny)) {
        biasMultiplier = 0;
      }
    }

    const baseBoost = Math.max(6, Math.round((180 - Math.min(bestCandidate.effectivePriority, 160)) / 4));
    const directnessBoost = Math.max(0, 12 - Math.round(Math.min(bestCandidate.directnessRank, 60) / 6));
    const totalBoost = Math.round((baseBoost + directnessBoost) * biasMultiplier);
    const currentScore = toFiniteNumber(row.score);
    const isFallbackCandidate = bestCandidate.directnessRank >= 55 || bestCandidate.effectivePriority >= 170;
    const fallbackPenalty = isFallbackCandidate
      ? row.tipo_viaje === 'transbordo' && matchedLegIndex > 0
        ? 720
        : 360
      : 0;

    if ((totalBoost <= 0 && fallbackPenalty <= 0) || currentScore === null) return row;

    return {
      ...row,
      score: Math.max(0, currentScore - totalBoost + fallbackPenalty),
      service_group_bias: totalBoost,
      service_group_fallback_penalty: fallbackPenalty,
    };
  });

  return adjustedRows.sort((a, b) => Number(a.score ?? 999999) - Number(b.score ?? 999999));
}

function getFinalStopId(row) {
  const value = row.ruta_2_id ? row.bajada_2_parada_id : row.bajada_1_parada_id;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFinalRouteId(row) {
  const parsed = Number(row.ruta_2_id ?? row.ruta_1_id);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinateKey(routeId, stopId) {
  return `${routeId}:${stopId}`;
}

function fallbackCoordinateKey(stopId) {
  return `stop:${stopId}`;
}

function getStopCoordinate(coordinatesById, routeId, stopId) {
  if (!Number.isFinite(stopId)) return null;
  const lookupStopIds = Array.from(new Set([stopId, normalizeCtpPreviewStopId(stopId)]));
  if (Number.isFinite(routeId)) {
    for (const lookupStopId of lookupStopIds) {
      const routeSpecificCoordinate = coordinatesById.get(coordinateKey(routeId, lookupStopId));
      if (routeSpecificCoordinate) return routeSpecificCoordinate;
    }
  }

  for (const lookupStopId of lookupStopIds) {
    const fallbackCoordinate = coordinatesById.get(fallbackCoordinateKey(lookupStopId));
    if (fallbackCoordinate) return fallbackCoordinate;
  }

  return null;
}

async function fetchStopCoordinatesById(supabase, stopIds, routeIds = []) {
  const uniqueStopIds = Array.from(new Set(stopIds.filter((stopId) => Number.isFinite(stopId))));
  if (uniqueStopIds.length === 0) return new Map();

  const coordinatesById = new Map();
  const runtimeIds = uniqueStopIds.filter((stopId) => stopId > 0);
  const previewIds = uniqueStopIds
    .filter((stopId) => stopId < 0)
    .map(ctpPreviewStopSourceId);

  if (runtimeIds.length > 0) {
    const { data } = await supabase
      .from('paradas')
      .select('id,lat,lng')
      .in('id', runtimeIds);

    (data ?? []).forEach((row) => {
      const id = Number(row.id);
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      coordinatesById.set(fallbackCoordinateKey(id), [lng, lat]);
    });
  }

  if (previewIds.length > 0) {
    const uniqueRouteIds = Array.from(new Set(routeIds.filter((routeId) => Number.isFinite(routeId))));
    await Promise.all(
      uniqueRouteIds.map(async (routeId) => {
        const { data } = await supabase.rpc('ctp_preview_route_stops', {
          p_ruta_id: routeId,
        });

        (data ?? []).forEach((row) => {
          const id = Number(row.parada_id ?? row.id);
          const lat = Number(row.lat);
          const lng = Number(row.lng);
          if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
          coordinatesById.set(coordinateKey(routeId, id), [lng, lat]);
          coordinatesById.set(fallbackCoordinateKey(id), [lng, lat]);
        });
      }),
    );
  }

  return coordinatesById;
}

async function applyWalkingValidationToRows(supabase, rows, destination) {
  if (!mapboxToken || rows.length === 0) return rows;

  const validationLimit = getWalkingNetworkValidationLimitForRows(rows, destination);
  const candidates = rows.slice(0, validationLimit);
  const stopIds = candidates.map(getFinalStopId).filter((stopId) => stopId !== null);
  const routeIds = candidates
    .map((row) => Number(row.ruta_2_id ?? row.ruta_1_id))
    .filter((routeId) => Number.isFinite(routeId));
  const stopCoordinatesById = await fetchStopCoordinatesById(supabase, stopIds, routeIds);

  const adjustedRows = await Promise.all(
    rows.map(async (row, index) => {
      if (index >= validationLimit) return row;

      const finalStopId = getFinalStopId(row);
      const finalRouteId = getFinalRouteId(row);
      const finalStopCoordinate = finalStopId
        ? getStopCoordinate(stopCoordinatesById, finalRouteId, finalStopId)
        : null;
      if (!finalStopCoordinate) return row;

      const walkingRoute = await fetchWalkingRoute(finalStopCoordinate, destination);
      const penalty = computeWalkNetworkPenalty(walkingRoute);
      if (penalty <= 0 && walkingRoute.status !== 'ok') return row;

      const networkDistanceMeters =
        walkingRoute.status === 'ok' && walkingRoute.networkDistanceMeters !== null
          ? Math.round(walkingRoute.networkDistanceMeters)
          : null;
      const currentScore = Number(row.score);
      const currentFinalWalk = Number(row.destino_distancia_final_m);
      const currentTotalWalk = Number(row.caminata_total_m);

      return {
        ...row,
        score: Number.isFinite(currentScore) ? currentScore + penalty : row.score,
        destino_distancia_final_m: networkDistanceMeters ?? row.destino_distancia_final_m,
        caminata_total_m:
          networkDistanceMeters !== null &&
          Number.isFinite(currentTotalWalk) &&
          Number.isFinite(currentFinalWalk)
            ? Math.max(0, currentTotalWalk - currentFinalWalk + networkDistanceMeters)
            : row.caminata_total_m,
        walk_network_penalty: penalty,
        final_walk_network_m: networkDistanceMeters,
        final_walk_network_min: walkingRoute.networkDurationMinutes,
        walk_detour_ratio: walkingRoute.detourRatio,
        walk_route_available: walkingRoute.status === 'ok',
      };
    }),
  );

  return adjustedRows.sort((a, b) => Number(a.score ?? 999999) - Number(b.score ?? 999999));
}

function statusIcon(status) {
  switch (status) {
    case 'pass':
      return 'PASS';
    case 'acceptable':
      return 'OK';
    case 'empty':
      return 'EMPTY';
    case 'forbidden':
      return 'BLOCK';
    default:
      return 'CHECK';
  }
}

function formatMetric(value, suffix = '') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'sin dato';
  return `${Math.round(parsed)}${suffix}`;
}

function formatRatio(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'sin dato';
  return parsed.toFixed(2);
}

function formatRowTitle(row) {
  return [
    `${row.ruta_1_nombre ?? row.ruta_1_codigo} (#${row.ruta_1_id ?? '?'})`,
    row.ruta_2_id ? `${row.ruta_2_nombre ?? row.ruta_2_codigo} (#${row.ruta_2_id})` : null,
  ]
    .filter(Boolean)
    .join(' luego ');
}

function formatRowDetails(row, index) {
  const finalStop = row.ruta_2_id ? row.bajada_2_parada_nombre : row.bajada_1_parada_nombre;
  return [
    `  ${index + 1}. ${formatRowTitle(row)}`,
    `score=${formatMetric(row.score)}`,
    `total_walk=${formatMetric(row.caminata_total_m, 'm')}`,
    `final_walk=${formatMetric(row.destino_distancia_final_m, 'm')}`,
    `network=${formatMetric(row.final_walk_network_m, 'm')}`,
    `detour=${formatRatio(row.walk_detour_ratio)}`,
    `walk_penalty=${formatMetric(row.walk_network_penalty)}`,
    `final_progress=${formatRatio(row.final_stop_progress_ratio)}`,
    `first_backtrack=${formatMetric(row.first_leg_backtrack_m, 'm')}`,
    `service_bias=${formatMetric(row.service_group_bias)}`,
    `fallback_penalty=${formatMetric(row.service_group_fallback_penalty)}`,
    `short_interurban_penalty=${formatMetric(row.short_local_interurban_penalty)}`,
    `cartago_east_feeder_penalty=${formatMetric(row.cartago_east_national_feeder_penalty)}`,
    `san_jose_tejar_penalty=${formatMetric(row.off_target_san_jose_tejar_penalty)}`,
    `bajada="${finalStop ?? 'sin dato'}"`,
  ].join(' | ');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.');
  }

  const { evaluatePlannerGoldenCase, plannerGoldenCases } = loadGoldenCaseModule();
  const selectedCases = plannerGoldenCases.filter((goldenCase) =>
    options.caseId ? goldenCase.id === options.caseId : true,
  );

  if (selectedCases.length === 0) {
    throw new Error(`No golden cases matched ${options.caseId}.`);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const summary = {
    pass: 0,
    acceptable: 0,
    unexpected: 0,
    forbidden: 0,
    empty: 0,
    skipped: 0,
    error: 0,
  };
  let rpcFunctionUsed = null;

  console.log(`Planner golden cases (${selectedCases.length})`);

  for (const goldenCase of selectedCases) {
    const destination = resolveDestination(goldenCase);
    if (!destination) {
      summary.skipped += 1;
      console.log(`SKIP  ${goldenCase.id} | necesita coordenadas fijas para correr local`);
      continue;
    }

    try {
      const { rows, rpcFunction } = await fetchPlannerRows(supabase, goldenCase, destination);
      const serviceBiasedRows = await applyPlannerServiceGroupBiasToRows(supabase, rows, goldenCase, destination);
      const validatedRows = await applyWalkingValidationToRows(supabase, serviceBiasedRows, destination);
      const locallyAdjustedRows = applyShortLocalInterurbanPenaltyToRows(validatedRows, goldenCase, destination);
      const feederAdjustedRows = applyCartagoEastNationalFeederPenaltyToRows(locallyAdjustedRows);
      const tejarAdjustedRows = applyOffTargetSanJoseTejarPenaltyToRows(feederAdjustedRows, destination);
      const coherentRows = filterIncoherentRows(tejarAdjustedRows, destination);
      rpcFunctionUsed = rpcFunctionUsed ?? rpcFunction;
      const journeys = coherentRows.map(rowToJourney);
      const evaluation = evaluatePlannerGoldenCase(goldenCase, journeys);
      summary[evaluation.status] += 1;

      const top = evaluation.topTitles.length > 0 ? evaluation.topTitles.join(' | ') : 'sin resultados';
      const rule = evaluation.matchingRule ? ` regla="${evaluation.matchingRule}"` : '';
      const boardStop = evaluation.boardStopTitle ? ` subida="${evaluation.boardStopTitle}"` : '';
      const finalStop = evaluation.finalStopTitle ? ` bajada="${evaluation.finalStopTitle}"` : '';
      console.log(
        `${statusIcon(evaluation.status).padEnd(5)} ${goldenCase.id} | ${top}${rule}${boardStop}${finalStop}`,
      );

      if (options.details) {
        coherentRows.slice(0, 6).forEach((row, index) => {
          console.log(formatRowDetails(row, index));
        });
      }
    } catch (error) {
      summary.error += 1;
      console.log(`ERROR ${goldenCase.id} | ${error.message}`);
    }
  }

  console.log('');
  if (rpcFunctionUsed) console.log(`RPC: ${rpcFunctionUsed}`);
  console.log(
    `Resumen: pass=${summary.pass}, acceptable=${summary.acceptable}, unexpected=${summary.unexpected}, forbidden=${summary.forbidden}, empty=${summary.empty}, skipped=${summary.skipped}, error=${summary.error}`,
  );

  const failing = summary.unexpected + summary.forbidden + summary.empty + summary.error;
  if (options.strict && failing > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
