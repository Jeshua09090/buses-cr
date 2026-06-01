export type PlannerLabMapMarker = {
  id: string;
  label: string;
  shortLabel: string;
  kind: 'origin' | 'destination' | 'board' | 'alight' | 'transfer';
  coordinates: [number, number];
  color: string;
};

export type PlannerLabMapLine = {
  id: string;
  label: string;
  kind: 'walk' | 'bus' | 'ghost';
  coordinates: [number, number][];
  color: string;
  width?: number;
  opacity?: number;
};
