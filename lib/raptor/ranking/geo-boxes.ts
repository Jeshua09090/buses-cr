import { haversineMeters } from '../geo';

export type GeoBox = {
  centerLng: number;
  centerLat: number;
  radiusMeters: number;
};

export const SANATORIO_DURAN_BOX: GeoBox = {
  centerLng: -83.880095,
  centerLat: 9.931869,
  radiusMeters: 1500,
};

export const PRUSIA_WEST_PIN_BOX: GeoBox = {
  centerLng: -83.88125895327642,
  centerLat: 9.953845289007294,
  radiusMeters: 900,
};

export const LA_CAMPINA_BOX: GeoBox = {
  centerLng: -83.9364834537593,
  centerLat: 9.83770228559147,
  radiusMeters: 900,
};

export const LANKESTER_BOX: GeoBox = {
  centerLng: -83.8902015,
  centerLat: 9.8394544,
  radiusMeters: 900,
};

export const LLANOS_SANTA_LUCIA_BOX: GeoBox = {
  centerLng: -83.8829415,
  centerLat: 9.8421571,
  radiusMeters: 900,
};

export const LLANO_GRANDE_SCHOOL_BOX: GeoBox = {
  centerLng: -83.906791,
  centerLat: 9.937464,
  radiusMeters: 350,
};

export const RIO_LORO_BOX: GeoBox = {
  centerLng: -83.9425011,
  centerLat: 9.9075246,
  radiusMeters: 1200,
};

export const OCHOMOGO_BOX: GeoBox = {
  centerLng: -83.93788146972656,
  centerLat: 9.887535095214844,
  radiusMeters: 700,
};

export const SAN_BLAS_BOX: GeoBox = {
  centerLng: -83.9106802132904,
  centerLat: 9.87732094323902,
  radiusMeters: 900,
};

export const GUADALUPE_BOX: GeoBox = {
  centerLng: -83.9244086,
  centerLat: 9.8660225,
  radiusMeters: 500,
};

export const LOS_MOLINOS_BOX: GeoBox = {
  centerLng: -83.93022614,
  centerLat: 9.85522867,
  radiusMeters: 800,
};

export const TEC_CARTAGO_BOX: GeoBox = {
  centerLng: -83.9124243,
  centerLat: 9.8554619,
  radiusMeters: 700,
};

export const BASILICA_CARTAGO_BOX: GeoBox = {
  centerLng: -83.9124,
  centerLat: 9.8642,
  radiusMeters: 550,
};

export const PALI_TARAS_BOX: GeoBox = {
  centerLng: -83.934149,
  centerLat: 9.8788492,
  radiusMeters: 600,
};

export const PASEO_METROPOLI_BOX: GeoBox = {
  centerLng: -83.9426214,
  centerLat: 9.867107,
  radiusMeters: 500,
};

export const QUIRCOT_BOX: GeoBox = {
  centerLng: -83.9308,
  centerLat: 9.886,
  radiusMeters: 800,
};

export const PEDREGAL_BOX: GeoBox = {
  centerLng: -83.9270248413086,
  centerLat: 9.877954483032227,
  radiusMeters: 500,
};

export const EL_CARMEN_QUIRCOT_BOX: GeoBox = {
  centerLng: -83.92220306396484,
  centerLat: 9.873766899108887,
  radiusMeters: 450,
};

export const EL_ALTO_BOX: GeoBox = {
  centerLng: -83.89291381835938,
  centerLat: 9.867877006530762,
  radiusMeters: 650,
};

export const SAN_ISIDRO_TEJAR_BOX: GeoBox = {
  centerLng: -83.9527,
  centerLat: 9.8297,
  radiusMeters: 1200,
};

export const TEJAR_EAST_BOX: GeoBox = {
  centerLng: -83.9355,
  centerLat: 9.844,
  radiusMeters: 500,
};

export const LOURDES_BOX: GeoBox = {
  centerLng: -83.9086919704042,
  centerLat: 9.82545597844213,
  radiusMeters: 700,
};

export const PARQUE_INDUSTRIAL_BOX: GeoBox = {
  centerLng: -83.9543747,
  centerLat: 9.85659988,
  radiusMeters: 900,
};

export const TIERRA_BLANCA_LA_PASTORA_BOX: GeoBox = {
  centerLng: -83.864618,
  centerLat: 9.9476,
  radiusMeters: 2200,
};

const TOBOSI_BOX: GeoBox = {
  centerLng: -83.945,
  centerLat: 9.84,
  radiusMeters: 1800,
};

export const OROSI_CENTRO_BOX: GeoBox = {
  centerLng: -83.853,
  centerLat: 9.797,
  radiusMeters: 2500,
};

export const PARAISO_CENTRO_BOX: GeoBox = {
  centerLng: -83.865581,
  centerLat: 9.838231,
  radiusMeters: 2500,
};

export const TAPANTI_BOX: GeoBox = {
  centerLng: -83.78541,
  centerLat: 9.76586,
  radiusMeters: 1800,
};

export const PENAS_BLANCAS_BOX: GeoBox = {
  centerLng: -83.78481747,
  centerLat: 9.82705109,
  radiusMeters: 1800,
};

export const SANTIAGO_BOX: GeoBox = {
  centerLng: -83.798834,
  centerLat: 9.869528,
  radiusMeters: 1800,
};

export const LA_ALEGRIA_BOX: GeoBox = {
  centerLng: -83.84751,
  centerLat: 9.81181333,
  radiusMeters: 1800,
};

export const CACHI_BOX: GeoBox = {
  centerLng: -83.80707509,
  centerLat: 9.82731855,
  radiusMeters: 1800,
};

export const LOAIZA_DEST_BOX: GeoBox = {
  centerLng: -83.82325817,
  centerLat: 9.81294327,
  radiusMeters: 900,
};

export const EL_HUMO_BOX: GeoBox = {
  centerLng: -83.71591776,
  centerLat: 9.80183743,
  radiusMeters: 900,
};

export const SAN_PEDRO_OUTWARD_BOX: GeoBox = {
  centerLng: -84.0537,
  centerLat: 9.9353,
  radiusMeters: 900,
};

export const TERRAMALL_BOX: GeoBox = {
  centerLng: -83.9844,
  centerLat: 9.9057,
  radiusMeters: 650,
};

export const CALDERON_GUARDIA_BOX: GeoBox = {
  centerLng: -84.0712,
  centerLat: 9.9366,
  radiusMeters: 600,
};

export const SJ_PARQUE_LA_PAZ_BOX: GeoBox = {
  centerLng: -84.079,
  centerLat: 9.913,
  radiusMeters: 700,
};

export const SJ_GUADALUPE_BOX: GeoBox = {
  centerLng: -84.056,
  centerLat: 9.948,
  radiusMeters: 700,
};

export const CARTAGO_LOCAL_DESTINATION_BOXES: readonly GeoBox[] = [
  SANATORIO_DURAN_BOX,
  TIERRA_BLANCA_LA_PASTORA_BOX,
  TOBOSI_BOX,
  LA_CAMPINA_BOX,
  LANKESTER_BOX,
  LLANOS_SANTA_LUCIA_BOX,
  LLANO_GRANDE_SCHOOL_BOX,
  QUIRCOT_BOX,
  PEDREGAL_BOX,
  EL_CARMEN_QUIRCOT_BOX,
  EL_ALTO_BOX,
  SAN_ISIDRO_TEJAR_BOX,
  BASILICA_CARTAGO_BOX,
  GUADALUPE_BOX,
  LOS_MOLINOS_BOX,
  TEJAR_EAST_BOX,
  LOURDES_BOX,
];

export function destinationInBox(destination: [number, number] | null, box: GeoBox): boolean {
  if (!destination) return false;

  const [lng, lat] = destination;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;

  return haversineMeters(
    { lat, lng },
    { lat: box.centerLat, lng: box.centerLng },
  ) <= box.radiusMeters;
}

export function destinationInAnyCartagoLocalBox(destination: [number, number] | null): boolean {
  return CARTAGO_LOCAL_DESTINATION_BOXES.some((box) => destinationInBox(destination, box));
}
