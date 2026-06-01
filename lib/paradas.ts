import { supabase } from '@/lib/supabase';

type RawParada = {
  parada_id?: number | null;
  id?: number | null;
  nombre?: string | null;
  lat?: number | null;
  lng?: number | null;
  tiene_techo?: boolean | null;
  accesible?: boolean | null;
};

export type Parada = {
  parada_id: number;
  nombre: string | null;
  lat: number;
  lng: number;
  tiene_techo: boolean | null;
  accesible: boolean | null;
};

const CTP_PREVIEW_ENV = process.env.EXPO_PUBLIC_ENABLE_CTP_PREVIEW;
const CTP_PREVIEW_ENABLED = CTP_PREVIEW_ENV === '1' || (__DEV__ && CTP_PREVIEW_ENV !== '0');
const CTP_ROUTE_STOP_PREVIEW_ROUTE_IDS = new Set<number>([
  4190,
  4191,
  4226,
  4227,
  4290,
  4291,
  4330,
  4331,
  4332,
  4333,
  4334,
  4335,
  4336,
  4337,
  4400,
  4401,
  4402,
  4403,
  4404,
  4405,
  4406,
  4407,
  4408,
  4409,
  4410,
  4411,
  4412,
  4413,
  4414,
  4415,
  4416,
  4417,
  4418,
  4419,
  4420,
  4421,
  4422,
  4423,
  4424,
  4425,
  4426,
  4430,
  4431,
  4432,
  4433,
  4434,
  4435,
  4436,
  4689,
  4719,
  93001,
  93002,
  93003,
  93004,
  93005,
  93006,
]);

function mapRawParadas(rows: RawParada[]): Parada[] {
  return rows
    .filter(
      (item) =>
        Number.isFinite(Number(item?.parada_id ?? item?.id)) &&
        Number.isFinite(Number(item?.lat)) &&
        Number.isFinite(Number(item?.lng)),
    )
    .map((item) => ({
      parada_id: Number(item.parada_id ?? item.id),
      nombre: item.nombre ?? null,
      lat: Number(item.lat),
      lng: Number(item.lng),
      tiene_techo: item.tiene_techo ?? null,
      accesible: item.accesible ?? null,
    }));
}

export function isCtpPreviewEnabled() {
  return CTP_PREVIEW_ENABLED;
}

export function isCtpPreviewRouteStopRouteId(rutaId: number) {
  return CTP_ROUTE_STOP_PREVIEW_ROUTE_IDS.has(rutaId);
}

async function getParadasPorRutaPreview(rutaId: number): Promise<Parada[]> {
  const { data, error } = await supabase.rpc('ctp_preview_route_stops', {
    p_ruta_id: rutaId,
  });

  if (error) {
    if (__DEV__) {
      console.warn('Error cargando preview CTP de paradas:', error);
    }
    return [];
  }

  return mapRawParadas((data ?? []) as RawParada[]);
}

export async function getParadasPorRuta(rutaId: number): Promise<Parada[]> {
  if (CTP_PREVIEW_ENABLED && CTP_ROUTE_STOP_PREVIEW_ROUTE_IDS.has(rutaId)) {
    const previewStops = await getParadasPorRutaPreview(rutaId);
    if (previewStops.length > 0) {
      return previewStops;
    }
  }

  const { data, error } = await supabase.rpc('paradas_por_ruta', {
    p_ruta_id: rutaId,
    radio_metros: 50,
  });

  if (error) {
    console.error('Error cargando paradas:', error);
    return [];
  }

  return mapRawParadas((data ?? []) as RawParada[]);
}
