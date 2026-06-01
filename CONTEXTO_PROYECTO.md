# Buses CR — Contexto del Proyecto

Este documento describe detalladamente la arquitectura, el stack tecnológico y el estado actual del proyecto Buses CR para facilitar la migración y dar contexto a los agentes de IA.

---

## 1. Tech Stack Exacto

El proyecto es una aplicación móvil (React Native) construida sobre el ecosistema de Expo, enfocada en geolocalización en tiempo real y mapas de alto rendimiento.

*   **Framework Core:** Expo SDK 54, React Native 0.81.5, React 19.1.0.
*   **Enrutamiento:** Expo Router v6 (con `@react-navigation/bottom-tabs`).
*   **Mapas:** Mapbox GL para React Native (`@rnmapbox/maps` v10.2.10). Es crítico que se use este paquete y no react-native-maps por razones de rendimiento y personalización.
*   **Backend & Tiempo Real:** Supabase JS SDK v2.98.0. Usamos canales (RealtimeChannels) para el broadcast de la ubicación del chofer hacia los pasajeros.
*   **Geolocalización:** `expo-location` (v19) y `expo-task-manager` (v14) para rastreo de ubicación en primer y segundo plano.
*   **UI/UX Componentes:**
    *   `@gorhom/bottom-sheet` (v5.2.8) + `react-native-reanimated` (v4.1) + `react-native-gesture-handler` para los paneles deslizables (bottom sheets) que listan los buses y sus detalles.
    *   `expo-blur` (v15) para efectos de glassmorfismo en los headers flotantes.
    *   `@expo/vector-icons` (Ionicons) para la iconografía.
*   **Gestión de Estado y Almacenamiento Local:** React Context API (AuthContext) y `@react-native-async-storage/async-storage` (v2.2.0).
*   **Notificaciones:** `expo-notifications` (v0.32) preparado para alertas locales.
*   **Estilos:** Implementación nativa usando `StyleSheet` de React Native con soporte explícito para Dark Mode a través de un hook personalizado (`useThemeColor`).

---

## 2. Arquitectura y Roles

El sistema tiene una separación estricta entre dos roles (Chofer y Pasajero) con flujos operativos asimétricos:

### Rol: Chofer (Transmisor)
*   **Propósito:** Transmitir su ubicación GPS constantemente mientras realiza una ruta.
*   **Mecanismo:** La aplicación solicita permisos de ubicación en primer y *segundo plano* (background location). Cuando se inicia la transmisión, se crea un canal de Supabase (`route_tracking:[route_id]`).
*   **Background Task:** Se registra una tarea de `expo-task-manager` (`LOCATION_TASK_NAME`) que sigue emitiendo actualizaciones de GPS incluso si la aplicación se minimiza, requiriendo un *Foreground Service* (notificación persistente visible para el usuario indicando que se está transmitiendo).
*   **Simulación Integrada:** La UI del chofer permite iniciar un modo de simulación que transmite coordenadas falsas pre-programadas de la ruta a Taras (`DETAILED_ROUTE`), útil para pruebas sin movimiento físico.

### Rol: Pasajero (Receptor)
*   **Propósito:** Visualizar los buses en el mapa y conocer el tiempo estimado de llegada (ETA).
*   **Mecanismo:** La aplicación no transmite la ubicación del pasajero, pero sí se suscribe como "oyente" a los canales de Supabase correspondientes a las rutas de interés (ej. `route_tracking:ruta_1`).
*   **Flujo de Información:** Al recibir el evento de broadcast (`location_update`), el estado local se actualiza y los markers de Mapbox cambian de posición basándose en las coordenadas recibidas (`lat`, `lng`). Se ejecuta una rutina de limpieza (`cleanupInterval`) que elimina los buses del estado si no han transmitido actualizaciones en más de 30 segundos.

### Flujo de Autenticación
*   Actualmente es ligero. Se persiste el rol (Chofer/Pasajero) en `AsyncStorage`.
*   Existe un `AuthContext` que envuelve la aplicación y dicta a qué flujo de navegación debe ir el usuario tras la pantalla de bienvenida (`app/welcome.tsx`).

---

## 3. Estado Actual (Qué ya funciona)

El andamiaje principal está construido e integrado exitosamente. Lo que ya está implementado y funcional es:

*   **Navegación Base (Bottom Tabs):** En el flujo del pasajero (`app/(tabs)/_layout.tsx`), tenemos tres pestañas con diseño premium translúcido oscuro:
    1.  **Viajar (`index.tsx`):** Pantalla principal tipo hub con barra de búsqueda grande, chips de favoritos y lista de sugerencias de rutas.
    2.  **Mapa (`explore.tsx`):** Pantalla inmersiva full-screen con el mapa.
    3.  **Perfil (`profile.tsx`):** Pantalla de perfil con placeholders y opción de cerrar sesión/cambiar de rol.
*   **Mapa Inmersivo (Mapbox):** Renderizado en pantalla completa en `explore.tsx`, ocultando brújula y logo nativos para un aspecto limpio. Dibuja polilíneas para las rutas (RouteDefinition) y Markers dinámicos para los buses en movimiento.
*   **Gestión de Flota Simulada (Script):** Existe un script en NodeJS en la raíz (`simulate-fleet.js`) que, mediante el backend de Supabase, inyecta coordenadas de 15 buses simulados ("flotilla fantasma") moviéndose aleatoriamente alrededor de Cartago. Permite probar la recepción masiva de marcadores en el app del pasajero.
*   **Metadata de Rutas (`lib/routes.ts`):** Estructuras definidas para múltiples rutas (Cartago-Taras, Cartago-Paraíso, Lumaca-SJ) incluyendo el path (polilínea) y paradas clave (stops).
*   **Bottom Sheet Dinámico:** El pasajero cuenta con un panel inferior interactivo (`@gorhom/bottom-sheet`) en el mapa que lista en tiempo real los buses activos recibidos por Supabase.

---

## 4. Base de Datos y Tiempo Real (Supabase)

La característica central de la aplicación depende intensamente de las funciones Realtime de Supabase:

*   **Mecanismo:** No estamos haciendo guardado constante de la latitud/longitud en tablas (ej. un `INSERT`/`UPDATE` por segundo) debido al alto costo de I/O. En su lugar, utilizamos **Supabase Realtime Broadcast**.
*   **Estructura del Canal:** Los canales se nombran con el patrón `route_tracking:[route_id]`.
*   **Payload de Broadcast:** Cuando un chofer envía un dato (o el simulador lo hace), envía un evento JSON llamado `location_update` que contiene: `driver_id`, `lat`, `lng`, `heading`, `speed`, `timestamp`, `status`, y opcionalmente `route` o `placa`.
*   **Tablas SQL y RLS:** La base de datos SQL se utilizará para persistir entidades de dominio lentas:
    *   `drivers` (Perfil del chofer)
    *   `routes` (Definición de rutas si se hace dinámica)
    *   `trip_history`
    *   Todavía no están profundamente modeladas, ya que el enfoque inicial ha sido el subsistema de memoria en tiempo real (Broadcast). Es mandatorio el uso de **Row Level Security (RLS)** cuando se implementen las tablas para asegurar la data.

---

## 5. Reglas de UI/UX (Estricto)

La aplicación tiene directrices de diseño específicas que deben respetarse en cualquier código generado:

1.  **Dark Mode First:** El tema principal es oscuro, tendiendo a colores estilo Slate/Navy (`#0b0f19`, `#1e293b`). Siempre utilizar `useThemeColor` o referenciar las variables existentes para mantener la cohesión.
2.  **Translucidez (Glassmorphism):** Los componentes de UI que se superponen al mapa (como el Header superior de búsqueda y el Bottom Tab Bar) deben utilizar componentes `<BlurView tint="dark">` de `expo-blur`. **No usar fondos sólidos opacos sobre el mapa** a menos que sea el Bottom Sheet.
3.  **UI Flotante sobre Mapbox:** Absolutamente todos los componentes de control (botones de menú, buscar, centrar) deben estar posicionados con `position: absolute` flotando por encima del componente `<Mapbox.MapView style={StyleSheet.absoluteFillObject} />`.
4.  **Markers sin Sombras Horneadas:** Los iconos de los buses en el mapa se renderizan utilizando `<Mapbox.PointAnnotation>` con vistas personalizadas (View + Ionicons). No se deben utilizar imágenes PNG pre-generadas con sombras para los buses, el sombreado debe manejarse por estilos nativos (`elevation`, `shadowColor`).
5.  **Clean Map:** El mapa de Mapbox debe inicializarse siempre con `compassEnabled={false}`, `logoEnabled={false}`, y `scaleBarEnabled={false}` para mantener la inmersión, además de un `pitch` inicial angular para efecto de perspectiva 3D (ej. `pitch={45}`).
6.  **Bordes Suaves:** En todas las tarjetas y paneles, usar radios de borde grandes (ej. `borderRadius: 16` o `20`).
