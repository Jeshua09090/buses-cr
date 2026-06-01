const EARTH_RADIUS_METERS = 6_371_000;
const ENDPOINT_REPLACE_THRESHOLD_METERS = 80;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineMeters(from: [number, number], to: [number, number]) {
  const deltaLat = toRadians(to[1] - from[1]);
  const deltaLng = toRadians(to[0] - from[0]);
  const lat1 = toRadians(from[1]);
  const lat2 = toRadians(to[1]);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function findNearestCoordinateIndex(
  coordinates: [number, number][],
  target: [number, number],
) {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  coordinates.forEach((coordinate, index) => {
    const distance = haversineMeters(coordinate, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return { index: bestIndex, distanceMeters: bestDistance };
}

function alignEndpoint(params: {
  path: [number, number][];
  coordinate: [number, number];
  atStart: boolean;
}) {
  const endpointIndex = params.atStart ? 0 : params.path.length - 1;
  const distance = haversineMeters(params.coordinate, params.path[endpointIndex]);

  if (distance <= ENDPOINT_REPLACE_THRESHOLD_METERS) {
    params.path[endpointIndex] = params.coordinate;
    return;
  }

  if (params.atStart) {
    params.path.unshift(params.coordinate);
  } else {
    params.path.push(params.coordinate);
  }
}

export function buildLegTrajectoryPath(params: {
  trajectorySegments: [number, number][][];
  boardCoordinate: [number, number] | null;
  alightCoordinate: [number, number] | null;
}) {
  const { alightCoordinate, boardCoordinate, trajectorySegments } = params;
  if (!boardCoordinate || !alightCoordinate) return [];

  let bestPath: [number, number][] = [];
  let bestScore = Number.POSITIVE_INFINITY;

  trajectorySegments.forEach((segment) => {
    if (segment.length < 2) return;

    const boardMatch = findNearestCoordinateIndex(segment, boardCoordinate);
    const alightMatch = findNearestCoordinateIndex(segment, alightCoordinate);

    if (boardMatch.index < 0 || alightMatch.index < 0) return;

    const startIndex = Math.min(boardMatch.index, alightMatch.index);
    const endIndex = Math.max(boardMatch.index, alightMatch.index);
    const span = endIndex - startIndex;
    if (span < 1) return;

    const sliced = segment.slice(startIndex, endIndex + 1);
    if (sliced.length < 2) return;

    const boardFirst = boardMatch.index <= alightMatch.index;
    const orientedPath = boardFirst ? sliced : [...sliced].reverse();
    const score =
      boardMatch.distanceMeters + alightMatch.distanceMeters + Math.max(0, 5 - span) * 25;

    if (score < bestScore) {
      const normalizedPath = [...orientedPath];

      alignEndpoint({ path: normalizedPath, coordinate: boardCoordinate, atStart: true });
      alignEndpoint({ path: normalizedPath, coordinate: alightCoordinate, atStart: false });

      bestPath = normalizedPath;
      bestScore = score;
    }
  });

  return bestPath;
}
