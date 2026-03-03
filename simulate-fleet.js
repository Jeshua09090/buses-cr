const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const channel = supabase.channel('route_tracking:ruta_1', {
  config: { broadcast: { self: true } },
});

channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    console.log('✅ Connected to Supabase Realtime.');
    startSimulation();
  }
});

// Cartago, Costa Rica Center
const CENTER_LAT = 9.8658;
const CENTER_LNG = -83.9155;
const RADIUS_DEG = 0.02; // Roughly ~2km

function getRandomOffset() {
  return (Math.random() - 0.5) * 2 * RADIUS_DEG;
}

const routes = [
  'Cartago - Taras',
  'Cartago - Paraíso',
  'Cartago - Tejar',
  'Cartago - Agua Caliente',
  'Cartago - Llano Grande'
];

const buses = Array.from({ length: 15 }).map((_, index) => {
  return {
    id: `bus_sim_${index + 1}`,
    placa: `CB-${Math.floor(1000 + Math.random() * 9000)}`,
    route: routes[index % routes.length],
    lat: CENTER_LAT + getRandomOffset(),
    lng: CENTER_LNG + getRandomOffset(),
    // Keep a target to move towards so movement looks natural instead of jittery
    targetLat: CENTER_LAT + getRandomOffset(),
    targetLng: CENTER_LNG + getRandomOffset(),
  };
});

function moveBuses() {
  buses.forEach((bus) => {
    // Calculate distance to target
    const dLat = bus.targetLat - bus.lat;
    const dLng = bus.targetLng - bus.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);

    // If close to target, pick a new random target
    if (dist < 0.001) {
      bus.targetLat = CENTER_LAT + getRandomOffset();
      bus.targetLng = CENTER_LNG + getRandomOffset();
    }

    // Move slightly towards the target
    const speed = 0.0002; // Approx ~20 meters per tick
    bus.lat += (dLat / dist) * speed;
    bus.lng += (dLng / dist) * speed;

    // Broadcast update
    channel.send({
      type: 'broadcast',
      event: 'location_update',
      payload: {
        driver_id: bus.id,
        lat: bus.lat,
        lng: bus.lng,
        heading: Math.atan2(dLng, dLat) * (180 / Math.PI),
        speed: 30, // Fake speed 30km/h
        timestamp: Date.now(),
        status: 'Activo',
        route: bus.route,
        placa: bus.placa
      },
    }).catch(err => console.error("Broadcast error:", err));
  });

  console.log(`📡 Broadcasted positions for ${buses.length} buses.`);
}

function startSimulation() {
  console.log('🚀 Starting bus fleet simulation...');
  // Initial broadcast
  moveBuses();
  // Update every 3 seconds
  setInterval(moveBuses, 3000);
}
