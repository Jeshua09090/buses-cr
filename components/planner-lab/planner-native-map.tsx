import type { PlannerLabMapLine, PlannerLabMapMarker } from '@/components/planner-lab/types';
import { ThemedText } from '@/components/themed-text';
import Mapbox from '@rnmapbox/maps';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type PlannerNativeMapProps = {
  accessToken: string;
  height?: number;
  markers: PlannerLabMapMarker[];
  lines: PlannerLabMapLine[];
  selectedJourneyLabel?: string | null;
};

const DEFAULT_CENTER: [number, number] = [-83.9194, 9.8636];

function getLineFeature(line: PlannerLabMapLine) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: line.coordinates,
    },
  };
}

function getBounds(markers: PlannerLabMapMarker[], lines: PlannerLabMapLine[]) {
  const coordinates: [number, number][] = [];

  markers.forEach((marker) => coordinates.push(marker.coordinates));
  lines
    .filter((line) => line.kind !== 'ghost')
    .forEach((line) => {
      line.coordinates.forEach((coordinate) => coordinates.push(coordinate));
    });

  if (coordinates.length === 0) return null;

  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];

  coordinates.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return {
    isSinglePoint: minLng === maxLng && minLat === maxLat,
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number],
    ne: [maxLng, maxLat] as [number, number],
    sw: [minLng, minLat] as [number, number],
  };
}

export default function PlannerNativeMap({
  accessToken,
  height = 500,
  lines,
  markers,
  selectedJourneyLabel,
}: PlannerNativeMapProps) {
  const [isMapboxReady, setIsMapboxReady] = useState(false);
  const bounds = useMemo(() => getBounds(markers, lines), [lines, markers]);

  useEffect(() => {
    if (!accessToken) {
      setIsMapboxReady(false);
      return;
    }

    Mapbox.setAccessToken(accessToken);
    setIsMapboxReady(true);
  }, [accessToken]);

  if (!accessToken) {
    return (
      <View style={[styles.emptyState, { height, minHeight: height }]}>
        <ThemedText style={styles.emptyTitle}>Mapa no disponible</ThemedText>
        <ThemedText style={styles.emptyText}>
          Configura EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN para activar el mapa del laboratorio.
        </ThemedText>
      </View>
    );
  }

  if (!isMapboxReady) {
    return <View style={[styles.shell, { height, minHeight: height }]} />;
  }

  return (
    <View style={[styles.shell, { height, minHeight: height }]}>
      <Mapbox.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={Mapbox.StyleURL.Dark}
        compassEnabled={false}
        logoEnabled={false}
        scaleBarEnabled={false}
        attributionEnabled={false}>
        <Mapbox.Camera
          key={`${bounds?.ne.join(',') ?? 'default'}-${bounds?.sw.join(',') ?? 'default'}`}
          centerCoordinate={!bounds ? DEFAULT_CENTER : bounds.isSinglePoint ? bounds.center : undefined}
          zoomLevel={!bounds ? 11.8 : bounds.isSinglePoint ? 15.2 : undefined}
          bounds={bounds && !bounds.isSinglePoint ? { ne: bounds.ne, sw: bounds.sw } : undefined}
          padding={{ paddingTop: 72, paddingRight: 72, paddingBottom: 88, paddingLeft: 72 }}
          animationDuration={700}
          animationMode="easeTo"
        />

        {lines
          .filter((line) => line.coordinates.length >= 2)
          .map((line) => {
            const width = line.width ?? (line.kind === 'ghost' ? 3 : line.kind === 'walk' ? 4 : 5);
            const opacity = line.opacity ?? (line.kind === 'ghost' ? 0.26 : line.kind === 'walk' ? 0.95 : 0.94);
            const dash = line.kind === 'walk' ? [1.25, 1.15] : undefined;

            if (line.kind === 'bus') {
              return (
                <Mapbox.ShapeSource key={line.id} id={`planner-line-${line.id}`} shape={getLineFeature(line) as never}>
                  <Mapbox.LineLayer
                    id={`planner-line-${line.id}-glow`}
                    style={{
                      lineColor: line.color,
                      lineWidth: width + 9,
                      lineOpacity: 0.16,
                      lineBlur: 2.2,
                      lineJoin: 'round',
                      lineCap: 'round',
                    }}
                  />
                  <Mapbox.LineLayer
                    id={`planner-line-${line.id}-casing`}
                    style={{
                      lineColor: 'rgba(4, 8, 14, 0.92)',
                      lineWidth: width + 4,
                      lineOpacity: 0.78,
                      lineJoin: 'round',
                      lineCap: 'round',
                    }}
                  />
                  <Mapbox.LineLayer
                    id={`planner-line-${line.id}`}
                    style={{
                      lineColor: line.color,
                      lineWidth: width,
                      lineOpacity: opacity,
                      lineJoin: 'round',
                      lineCap: 'round',
                    }}
                  />
                </Mapbox.ShapeSource>
              );
            }

            if (line.kind === 'walk') {
              return (
                <Mapbox.ShapeSource key={line.id} id={`planner-line-${line.id}`} shape={getLineFeature(line) as never}>
                  <Mapbox.LineLayer
                    id={`planner-line-${line.id}-casing`}
                    style={{
                      lineColor: 'rgba(5, 8, 13, 0.96)',
                      lineWidth: width + 4,
                      lineOpacity: 0.9,
                      lineDasharray: dash,
                      lineJoin: 'round',
                      lineCap: 'round',
                    }}
                  />
                  <Mapbox.LineLayer
                    id={`planner-line-${line.id}`}
                    style={{
                      lineColor: line.color,
                      lineWidth: width,
                      lineOpacity: opacity,
                      lineDasharray: dash,
                      lineJoin: 'round',
                      lineCap: 'round',
                    }}
                  />
                </Mapbox.ShapeSource>
              );
            }

            return (
              <Mapbox.ShapeSource key={line.id} id={`planner-line-${line.id}`} shape={getLineFeature(line) as never}>
                <Mapbox.LineLayer
                  id={`planner-line-${line.id}`}
                  style={{
                    lineColor: line.color,
                    lineWidth: width,
                    lineOpacity: opacity,
                    lineJoin: 'round',
                    lineCap: 'round',
                  }}
                />
              </Mapbox.ShapeSource>
            );
          })}

        {markers.map((marker) => (
          <Mapbox.PointAnnotation key={marker.id} id={`planner-marker-${marker.id}`} coordinate={marker.coordinates}>
            <View style={styles.markerWrap}>
              <View style={[styles.marker, { backgroundColor: marker.color }]}>
                <ThemedText style={styles.markerText}>{marker.shortLabel}</ThemedText>
              </View>
            </View>
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>

      {selectedJourneyLabel ? (
        <View style={styles.labelBadge} pointerEvents="none">
          <ThemedText style={styles.labelText} numberOfLines={2}>
            {selectedJourneyLabel}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(8, 12, 18, 0.95)',
  },
  emptyState: {
    width: '100%',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(184, 198, 219, 0.12)',
    backgroundColor: 'rgba(9, 12, 18, 0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyTitle: {
    color: '#F5F8FC',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: '#D9E2EE',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelBadge: {
    position: 'absolute',
    left: 18,
    top: 18,
    maxWidth: '72%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(9, 14, 20, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(180, 194, 214, 0.12)',
  },
  labelText: {
    color: '#F5F8FC',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  markerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F8FBFF',
  },
  markerText: {
    color: '#F8FBFF',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
  },
});
