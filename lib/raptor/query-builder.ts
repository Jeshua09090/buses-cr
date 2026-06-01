import { Query, RangeQuery } from 'minotor';

export function buildJourneyQuery(params: {
  fromStopId: number;
  toStopId: number;
  departureMinutes: number;
  maxTransfers: number;
  minTransferMinutes?: number;
  maxInitialWaitingMinutes?: number;
}) {
  const builder = new Query.Builder()
    .from(params.fromStopId)
    .to(params.toStopId)
    .departureTime(params.departureMinutes)
    .maxTransfers(params.maxTransfers)
    .minTransferTime(params.minTransferMinutes ?? 3)
    .transportModes(new Set(['BUS']));

  if (params.maxInitialWaitingMinutes != null) {
    builder.maxInitialWaitingTime(params.maxInitialWaitingMinutes);
  }

  return builder.build();
}

export function buildJourneyRangeQuery(params: {
  fromStopId: number;
  toStopId: number;
  departureMinutes: number;
  lastDepartureMinutes: number;
  maxTransfers: number;
  minTransferMinutes?: number;
  maxInitialWaitingMinutes?: number;
}) {
  const builder = new RangeQuery.Builder()
    .from(params.fromStopId)
    .to(params.toStopId)
    .departureTime(params.departureMinutes)
    .lastDepartureTime(params.lastDepartureMinutes)
    .maxTransfers(params.maxTransfers)
    .minTransferTime(params.minTransferMinutes ?? 3)
    .transportModes(new Set(['BUS']))
    .rangeOptions({ optimizeBeyondLatestDeparture: false });

  if (params.maxInitialWaitingMinutes != null) {
    builder.maxInitialWaitingTime(params.maxInitialWaitingMinutes);
  }

  return builder.build();
}
