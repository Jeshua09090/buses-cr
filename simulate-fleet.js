// simulate-fleet.js — buses que siguen rutas reales de Supabase
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

const channel = supabase.channel('route_tracking:ruta_1', {
  config: { broadcast: { self: true } },
});

// Carga los puntos de una ruta desde Supabase
async function loadRoutePath(rutaId) {
  const { data, error } = await supabase
    .from('ruta_puntos')
    .select('lat, lng')
    .eq('ruta_id', rutaId)
    .order('orden', { ascending: true });

  if (error || !data?.length) return null;
  return data; // Array de { lat, lng }
}

// Carga N rutas aleatorias de la tabla rutas
async function loadRandomRoutes(count) {
  const { data, error } = await supabase
    .from('rutas')
    .select('id, nombre_ruta, operador, codigo_ctp')
    .limit(count * 3); // Traemos más de las que necesitamos por si alguna no tiene puntos

  if (error || !data?.length) {
    console.error('Error cargando rutas:', error?.message);
    process.exit(1);
  }

  // Barajar aleatoriamente y tomar las primeras `count`
  return data.sort(() => Math.random() - 0.5).slice(0, count);
}

async function startSimulation() {
  console.log('📦 Cargando rutas reales desde Supabase...');

  const NUM_BUSES = 8; // Menos buses pero con rutas reales
  const rutasData = await loadRandomRoutes(NUM_BUSES);

  console.log(`🗺️  Cargando trayectorias de ${rutasData.length} rutas...`);

  // Cargar los puntos de cada ruta
  const buses = [];
  for (const ruta of rutasData) {
    const path = await loadRoutePath(ruta.id);
    if (!path || path.length < 2) {
      console.warn(`⚠️  Ruta ${ruta.id} sin puntos, saltando...`);
      continue;
    }

    // Punto de inicio aleatorio dentro de la ruta (no siempre desde el inicio)
    const startIndex = Math.floor(Math.random() * (path.length * 0.5));

    buses.push({
      id: `bus_sim_${ruta.id}`,
      placa: `CR-${Math.floor(1000 + Math.random() * 9000)}`,
      routeId: String(ruta.id),
      routeName: ruta.nombre_ruta,
      operador: ruta.operador,
      path,
      currentStep: startIndex,
    });

    console.log(`✅ ${ruta.nombre_ruta} — ${path.length} puntos`);
  }

  if (buses.length === 0) {
    console.error('❌ Ningún bus pudo cargarse con trayectoria.');
    process.exit(1);
  }

  console.log(`\n🚀 Simulando ${buses.length} buses en rutas reales...`);

  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    console.log('✅ Conectado a Supabase Realtime\n');

    setInterval(() => {
      buses.forEach((bus) => {
        // Avanzar por la trayectoria real
        if (bus.currentStep >= bus.path.length) {
          bus.currentStep = 0; // Vuelve al inicio cuando llega al final
        }

        const current = bus.path[bus.currentStep];
        const next = bus.path[Math.min(bus.currentStep + 1, bus.path.length - 1)];

        // Calcular heading real basado en dirección de movimiento
        const dLat = next.lat - current.lat;
        const dLng = next.lng - current.lng;
        const heading = Math.atan2(dLng, dLat) * (180 / Math.PI);

        channel.send({
          type: 'broadcast',
          event: 'location_update',
          payload: {
            driver_id: bus.id,
            lat: current.lat,
            lng: current.lng,
            heading,
            speed: 40,
            timestamp: Date.now(),
            status: 'Activo',
            route: bus.routeName,
            routeId: bus.routeId,   // ← clave para cargar trayectoria en el mapa
            placa: bus.placa,
            operador: bus.operador,
          },
        }).catch(err => console.error('Broadcast error:', err));

        bus.currentStep += 3; // Avanza de 3 en 3 puntos para mayor velocidad visual
      });

      console.log(`📡 ${buses.length} buses transmitiendo posición`);
    }, 3000);
  });
}

startSimulation().catch(console.error);
