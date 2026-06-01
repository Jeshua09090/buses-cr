type PlaceSuggestion = {
  id: string;
  name: string;
  address: string;
  coordinates: [number, number];
};

type GooglePrediction = {
  description?: string;
  place_id?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
};

type GooglePlaceDetails = {
  result?: {
    name?: string;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  };
  status?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function parseProximity(value: string | null) {
  if (!value) return null;
  const [lng, lat] = value.split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lat, lng };
}

async function fetchPlaceDetails(placeId: string, key: string): Promise<PlaceSuggestion | null> {
  const searchParams = new URLSearchParams({
    place_id: placeId,
    fields: 'name,formatted_address,geometry',
    language: 'es',
    key,
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${searchParams.toString()}`,
  );
  const payload = (await response.json().catch(() => null)) as GooglePlaceDetails | null;
  const location = payload?.result?.geometry?.location;

  if (
    !response.ok ||
    payload?.status !== 'OK' ||
    !location ||
    !Number.isFinite(location.lng) ||
    !Number.isFinite(location.lat)
  ) {
    return null;
  }

  const lng = Number(location.lng);
  const lat = Number(location.lat);

  return {
    id: `google-${placeId}`,
    name: payload.result?.name ?? payload.result?.formatted_address ?? 'Lugar',
    address: payload.result?.formatted_address ?? '',
    coordinates: [lng, lat],
  };
}

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const proximity = parseProximity(url.searchParams.get('proximity'));
  const key = process.env.GOOGLE_PLACES_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;

  if (!query || query.length < 2) {
    return jsonResponse({ suggestions: [] });
  }

  if (!key) {
    return jsonResponse({ suggestions: [], error: 'missing-google-places-key' }, { status: 503 });
  }

  const searchParams = new URLSearchParams({
    input: query,
    key,
    components: 'country:cr',
    language: 'es',
    radius: '50000',
  });

  if (proximity) {
    searchParams.set('location', `${proximity.lat},${proximity.lng}`);
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${searchParams.toString()}`,
    );
    const payload = (await response.json().catch(() => null)) as {
      predictions?: GooglePrediction[];
      status?: string;
      error_message?: string;
    } | null;

    if (!response.ok || !payload || (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS')) {
      return jsonResponse(
        {
          suggestions: [],
          error: payload?.status ?? `google-http-${response.status}`,
        },
        { status: 502 },
      );
    }

    const placeIds = (payload.predictions ?? [])
      .map((prediction) => prediction.place_id)
      .filter((placeId): placeId is string => Boolean(placeId))
      .slice(0, 6);

    const suggestions = (await Promise.all(placeIds.map((placeId) => fetchPlaceDetails(placeId, key))))
      .filter((suggestion): suggestion is PlaceSuggestion => Boolean(suggestion));

    return jsonResponse({ suggestions, provider: 'google', status: payload.status });
  } catch {
    return jsonResponse({ suggestions: [], error: 'google-places-request-failed' }, { status: 502 });
  }
}
