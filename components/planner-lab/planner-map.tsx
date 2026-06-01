"use dom";

import type { PlannerLabMapLine, PlannerLabMapMarker } from '@/components/planner-lab/types';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useEffect, useMemo, useRef } from 'react';

type PlannerMapProps = {
  accessToken: string;
  height?: number;
  markers: PlannerLabMapMarker[];
  lines: PlannerLabMapLine[];
  selectedJourneyLabel?: string | null;
  dom?: import('expo/dom').DOMProps;
};

function buildLineFeatureCollection(lines: PlannerLabMapLine[]) {
  return {
    type: 'FeatureCollection' as const,
    features: lines
      .filter((line) => line.coordinates.length >= 2)
      .map((line) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: line.coordinates,
        },
        properties: {
          id: line.id,
          label: line.label,
          kind: line.kind,
          color: line.color,
          width: line.width ?? (line.kind === 'ghost' ? 3 : line.kind === 'walk' ? 4 : 5),
          opacity: line.opacity ?? (line.kind === 'ghost' ? 0.26 : line.kind === 'walk' ? 0.95 : 0.94),
          casingWidth: (line.width ?? (line.kind === 'ghost' ? 3 : line.kind === 'walk' ? 4 : 5)) + 4,
          glowWidth: (line.width ?? (line.kind === 'ghost' ? 3 : line.kind === 'walk' ? 4 : 5)) + 9,
        },
      })),
  };
}

function buildPointFeatureCollection(markers: PlannerLabMapMarker[]) {
  return {
    type: 'FeatureCollection' as const,
    features: markers.map((marker) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: marker.coordinates,
      },
      properties: {
        id: marker.id,
        label: marker.label,
        shortLabel: marker.shortLabel,
        kind: marker.kind,
        color: marker.color,
      },
    })),
  };
}

function fitMapToData(map: any, markers: PlannerLabMapMarker[], lines: PlannerLabMapLine[]) {
  const bounds = new mapboxgl.LngLatBounds();
  let hasData = false;

  markers.forEach((marker) => {
    bounds.extend(marker.coordinates);
    hasData = true;
  });

  lines
    .filter((line) => line.kind !== 'ghost')
    .forEach((line) => {
      line.coordinates.forEach((coordinate) => {
        bounds.extend(coordinate);
        hasData = true;
      });
    });

  if (!hasData) {
    map.jumpTo({ center: [-83.9194, 9.8636], zoom: 11.8 });
    return;
  }

  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();
  if (northEast.lng === southWest.lng && northEast.lat === southWest.lat) {
    map.easeTo({ center: [northEast.lng, northEast.lat], zoom: 15.2, duration: 700 });
    return;
  }

  map.fitBounds(bounds, {
    padding: { top: 72, right: 72, bottom: 88, left: 72 },
    duration: 900,
    maxZoom: 15.6,
  });
}

export default function PlannerMap({
  accessToken,
  height = 500,
  lines,
  markers,
  selectedJourneyLabel,
}: PlannerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const popupRef = useRef<any>(null);
  const latestMarkersRef = useRef<PlannerLabMapMarker[]>(markers);
  const latestLinesRef = useRef<PlannerLabMapLine[]>(lines);
  const latestLineDataRef = useRef(buildLineFeatureCollection(lines));
  const latestPointDataRef = useRef(buildPointFeatureCollection(markers));

  const lineData = useMemo(() => buildLineFeatureCollection(lines), [lines]);
  const pointData = useMemo(() => buildPointFeatureCollection(markers), [markers]);

  useEffect(() => {
    latestMarkersRef.current = markers;
    latestLinesRef.current = lines;
    latestLineDataRef.current = lineData;
    latestPointDataRef.current = pointData;
  }, [lineData, lines, markers, pointData]);

  useEffect(() => {
    if (!containerRef.current || !accessToken) return;

    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-83.9194, 9.8636],
      zoom: 11.8,
      dragRotate: false,
      pitchWithRotate: false,
    });

    map.on('error', (event: any) => {
      console.warn('Planner Lab Mapbox error', event?.error?.message ?? event?.message ?? event);
    });

    map.addControl(
      new mapboxgl.NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      'top-right',
    );

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnMove: true,
      offset: 18,
      className: 'planner-lab-popup',
    });

    popupRef.current = popup;

    map.on('load', () => {
      map.addSource('planner-lines', {
        type: 'geojson',
        data: latestLineDataRef.current,
      });

      map.addLayer({
        id: 'planner-line-ghost',
        type: 'line',
        source: 'planner-lines',
        filter: ['==', ['get', 'kind'], 'ghost'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      });

      map.addLayer({
        id: 'planner-line-bus-glow',
        type: 'line',
        source: 'planner-lines',
        filter: ['==', ['get', 'kind'], 'bus'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'glowWidth'],
          'line-opacity': 0.16,
          'line-blur': 2.2,
        },
      });

      map.addLayer({
        id: 'planner-line-bus-casing',
        type: 'line',
        source: 'planner-lines',
        filter: ['==', ['get', 'kind'], 'bus'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': 'rgba(4, 8, 14, 0.92)',
          'line-width': ['get', 'casingWidth'],
          'line-opacity': 0.78,
        },
      });

      map.addLayer({
        id: 'planner-line-bus',
        type: 'line',
        source: 'planner-lines',
        filter: ['==', ['get', 'kind'], 'bus'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      });

      map.addLayer({
        id: 'planner-line-walk-casing',
        type: 'line',
        source: 'planner-lines',
        filter: ['==', ['get', 'kind'], 'walk'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': 'rgba(5, 8, 13, 0.96)',
          'line-width': ['get', 'casingWidth'],
          'line-opacity': 0.9,
          'line-dasharray': [1.25, 1.15],
        },
      });

      map.addLayer({
        id: 'planner-line-walk',
        type: 'line',
        source: 'planner-lines',
        filter: ['==', ['get', 'kind'], 'walk'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
          'line-dasharray': [1.25, 1.15],
        },
      });

      map.addSource('planner-points', {
        type: 'geojson',
        data: latestPointDataRef.current,
      });

      map.addLayer({
        id: 'planner-point-circles',
        type: 'circle',
        source: 'planner-points',
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#F8FBFF',
        },
      });

      map.addLayer({
        id: 'planner-point-labels',
        type: 'symbol',
        source: 'planner-points',
        layout: {
          'text-field': ['get', 'shortLabel'],
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, -1.7],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#F8FBFF',
          'text-halo-color': 'rgba(8, 12, 18, 0.86)',
          'text-halo-width': 1.2,
        },
      });

      map.on('mouseenter', 'planner-point-circles', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'planner-point-circles', () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('click', 'planner-point-circles', (event: any) => {
        const feature = event.features?.[0];
        const coordinates = feature?.geometry?.coordinates;
        const label = feature?.properties?.label;
        if (!Array.isArray(coordinates) || typeof label !== 'string') return;

        popup
          .setLngLat([Number(coordinates[0]), Number(coordinates[1])])
          .setHTML(
            `<div style="padding: 6px 8px; color: #E7EEF8; font: 600 12px/1.5 Inter, system-ui; background: rgba(10,14,20,0.94); border-radius: 12px;">${label}</div>`,
          )
          .addTo(map);
      });

      fitMapToData(map, latestMarkersRef.current, latestLinesRef.current);

      window.requestAnimationFrame(() => {
        map.resize();
        fitMapToData(map, latestMarkersRef.current, latestLinesRef.current);
      });
    });

    mapRef.current = map;

    return () => {
      popup.remove();
      map.remove();
      popupRef.current = null;
      mapRef.current = null;
    };
  }, [accessToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const lineSource = map.getSource('planner-lines') as any;
    if (lineSource) {
      lineSource.setData(lineData as any);
    }

    const pointSource = map.getSource('planner-points') as any;
    if (pointSource) {
      pointSource.setData(pointData as any);
    }

    fitMapToData(map, markers, lines);
  }, [lineData, lines, markers, pointData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const frame = window.requestAnimationFrame(() => {
      map.resize();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [lines.length, markers.length, selectedJourneyLabel]);

  if (!accessToken) {
    return (
      <div
        style={{
          width: '100%',
          height,
          minHeight: height,
          borderRadius: 28,
          background: 'linear-gradient(180deg, rgba(16,20,30,0.96), rgba(9,12,18,0.98))',
          border: '1px solid rgba(184, 198, 219, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#D9E2EE',
          padding: 24,
          textAlign: 'center',
          boxSizing: 'border-box',
        }}>
        Configura EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN para activar el mapa del laboratorio.
      </div>
    );
  }

  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #080c12;
        }
        .mapboxgl-canvas {
          outline: none;
        }
      `}</style>
      <div
        style={{
          width: '100%',
          height,
          minHeight: height,
          position: 'relative',
          borderRadius: 28,
          overflow: 'hidden',
          background: 'rgba(8, 12, 18, 0.95)',
          boxShadow: '0 20px 48px rgba(2, 6, 23, 0.34)',
        }}>
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        />
        {selectedJourneyLabel ? (
          <div
            style={{
              position: 'absolute',
              left: 18,
              top: 18,
              maxWidth: 'min(72%, 520px)',
              padding: '10px 14px',
              borderRadius: 18,
              background: 'rgba(9, 14, 20, 0.82)',
              border: '1px solid rgba(180, 194, 214, 0.12)',
              color: '#F5F8FC',
              font: '700 13px/1.35 Inter, system-ui',
              backdropFilter: 'blur(18px)',
            }}>
            {selectedJourneyLabel}
          </div>
        ) : null}
      </div>
    </>
  );
}
