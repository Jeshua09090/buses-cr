import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';

export const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];
    if (location) {
      // In a real app, you would fetch the active route and driver ID from secure storage 
      // (like SecureStore or AsyncStorage) since Context is not available here.
      // For now, we use the hardcoded route_1 for testing.
      const routeId = 'ruta_1'; 
      const channel = supabase.channel(`route_tracking:${routeId}`, {
        config: { broadcast: { self: true } }
      });
      
      const { latitude, longitude, heading, speed } = location.coords;
      console.log(`[Background Task] 📡 GPS Update: Lat ${latitude}, Lng ${longitude}`);
      
      await channel.send({
        type: 'broadcast',
        event: 'location_update',
        payload: {
          driver_id: 'driver_background', 
          lat: latitude,
          lng: longitude,
          heading: heading || 0,
          speed: speed || 0,
          timestamp: Date.now(),
          status: 'en_ruta_background'
        },
      }).catch(err => console.error("Error background broadcast:", err));

      // Cleanup channel to avoid memory leaks in background
      supabase.removeChannel(channel);
    }
  }
});
