import { DepthBackground } from '@/components/home/DepthBackground';
import { ThemedText } from '@/components/themed-text';
import { uiPalette } from '@/constants/ui-tokens';
import { useFavorites } from '@/hooks/use-favorites';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FAVORITE_ICON_OPTIONS, FavoriteIconName } from '@/lib/favorites';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
const DEFAULT_LOCATION = '9.8636,-83.9194';

type SearchResult = {
  place_id: string;
  main_text: string;
  secondary_text: string;
};

type PlaceDraft = {
  placeId: string | null;
  name: string;
  address: string;
  coordinates: [number, number] | null;
};

function toSingleParam(value?: string | string[]): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export default function FavoriteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ favoriteId?: string | string[] }>();
  const favoriteId = toSingleParam(params.favoriteId);
  const { favorites, updateFavorite, removeFavorite, isLoading } = useFavorites();

  const [draftTitle, setDraftTitle] = useState('');
  const [draftIcon, setDraftIcon] = useState<FavoriteIconName>('location-outline');
  const [draftPlace, setDraftPlace] = useState<PlaceDraft>({
    placeId: null,
    name: '',
    address: '',
    coordinates: null,
  });
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const initializedFavoriteIdRef = useRef<string | null>(null);

  const favorite = useMemo(
    () => favorites.find((item) => item.id === favoriteId) ?? null,
    [favoriteId, favorites],
  );

  useEffect(() => {
    if (!favorite) return;
    if (initializedFavoriteIdRef.current === favorite.id) return;

    initializedFavoriteIdRef.current = favorite.id;
    setDraftTitle(favorite.title);
    setDraftIcon(favorite.icon);
    setDraftPlace({
      placeId: favorite.placeId,
      name: favorite.name,
      address: favorite.address,
      coordinates: favorite.coordinates,
    });
  }, [favorite]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const backgroundColor = useThemeColor({ light: '#F8FAFC', dark: uiPalette.bgDark }, 'background');
  const textColor = useThemeColor({ light: '#0F172A', dark: uiPalette.textOnDark }, 'text');
  const textMuted = useThemeColor({ light: '#475569', dark: uiPalette.textMutedOnDark }, 'text');
  const borderColor = useThemeColor({ light: '#D8E0EE', dark: 'rgba(159,176,202,0.14)' }, 'background');
  const cardColor = useThemeColor({ light: 'rgba(255,255,255,0.94)', dark: 'rgba(11,21,35,0.78)' }, 'background');
  const softSurface = useThemeColor({ light: 'rgba(255,255,255,0.78)', dark: 'rgba(255,255,255,0.04)' }, 'background');
  const inputBgColor = useThemeColor({ light: 'rgba(255,255,255,0.9)', dark: 'rgba(7,14,29,0.55)' }, 'background');
  const softPrimaryBg = useThemeColor({ light: '#EEF2FF', dark: `${uiPalette.primary}1A` }, 'background');
  const softDangerBg = useThemeColor({ light: '#FEF2F2', dark: 'rgba(248,113,113,0.15)' }, 'background');
  const bgGradientTop = useThemeColor({ light: '#F4F7FD', dark: '#040914' }, 'background');
  const bgGradientMid = useThemeColor({ light: '#E7EEFF', dark: '#06101C' }, 'background');
  const bgGradientBottom = useThemeColor({ light: '#FFFFFF', dark: '#02050D' }, 'background');

  const primaryAccent = uiPalette.primary;
  const dangerAccent = '#F87171';

  const searchPlaces = (text: string) => {
    setSearchQuery(text);
    setErrorText(null);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (text.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const locationBias = draftPlace.coordinates
          ? `${draftPlace.coordinates[1]},${draftPlace.coordinates[0]}`
          : DEFAULT_LOCATION;
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          text,
        )}&key=${GOOGLE_PLACES_KEY}&components=country:cr&language=es&radius=50000&location=${locationBias}`;
        const response = await fetch(url);
        const json = await response.json();

        if (!json.predictions) {
          setSearchResults([]);
          setErrorText('No encontramos resultados con ese texto.');
          return;
        }

        setSearchResults(
          json.predictions.map((prediction: any) => ({
            place_id: prediction.place_id,
            main_text: prediction.structured_formatting?.main_text || prediction.description,
            secondary_text: prediction.structured_formatting?.secondary_text || '',
          })),
        );
      } catch {
        setSearchResults([]);
        setErrorText('No pudimos buscar lugares. Intenta de nuevo.');
      } finally {
        setIsSearching(false);
      }
    }, 260);
  };

  const resolvePlaceDetails = async (
    placeId: string,
  ): Promise<{ placeId: string; name: string; address: string; coordinates: [number, number] } | null> => {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry&key=${GOOGLE_PLACES_KEY}`;
      const response = await fetch(url);
      const json = await response.json();
      const location = json.result?.geometry?.location;
      if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
        return null;
      }

      return {
        placeId,
        name: json.result?.name ?? 'Destino',
        address: json.result?.formatted_address ?? '',
        coordinates: [location.lng, location.lat],
      };
    } catch {
      return null;
    }
  };

  const beginLocationSelection = () => {
    setIsPickingLocation(true);
    setSearchQuery('');
    setSearchResults([]);
    setSaveFeedback(null);
    setErrorText(null);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 70);
  };

  const selectLocation = async (result: SearchResult) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setErrorText(null);
    setIsSearching(true);

    try {
      const details = await resolvePlaceDetails(result.place_id);
      if (!details) {
        setErrorText('No pudimos resolver la ubicación. Prueba otro resultado.');
        return;
      }

      setDraftPlace({
        placeId: details.placeId,
        name: details.name || result.main_text,
        address: details.address || result.secondary_text,
        coordinates: details.coordinates,
      });
      setSaveFeedback('Destino actualizado. Guarda para aplicar el cambio.');
      setIsPickingLocation(false);
      setSearchQuery('');
      setSearchResults([]);
      Keyboard.dismiss();
    } finally {
      setIsSearching(false);
    }
  };

  const saveChanges = async () => {
    if (!favorite) return;
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setErrorText('El nombre del favorito no puede quedar vacío.');
      return;
    }

    await updateFavorite(favorite.id, {
      title: nextTitle,
      icon: draftIcon,
      placeId: draftPlace.placeId,
      name: draftPlace.name || nextTitle,
      address: draftPlace.address,
      coordinates: draftPlace.coordinates,
    });
    router.back();
  };

  const deleteFavorite = async () => {
    if (!favorite) return;
    await removeFavorite(favorite.id);
    router.back();
  };

  if (!favoriteId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <ThemedText style={[styles.invalidText, { color: textColor }]}>
          No recibimos el favorito a editar.
        </ThemedText>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.invalidButton, { backgroundColor: softPrimaryBg }]}>
          <ThemedText style={[styles.invalidButtonText, { color: primaryAccent }]}>Volver</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isLoading && !favorite) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <ThemedText style={[styles.invalidText, { color: textColor }]}>Cargando favorito...</ThemedText>
      </SafeAreaView>
    );
  }

  if (!isLoading && !favorite) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <ThemedText style={[styles.invalidText, { color: textColor }]}>
          No encontramos este favorito para editar.
        </ThemedText>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.invalidButton, { backgroundColor: softPrimaryBg }]}>
          <ThemedText style={[styles.invalidButtonText, { color: primaryAccent }]}>Volver</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <DepthBackground
        topColor={bgGradientTop}
        midColor={bgGradientMid}
        bottomColor={bgGradientBottom}
        accentColor={primaryAccent}
      />

      <Animated.View entering={FadeInDown.duration(240)} style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: softSurface }]}>
          <Ionicons name="arrow-back" size={18} color={textColor} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerTitle, { color: textColor }]}>Editar favorito</ThemedText>
        <View style={styles.headerSpacer} />
      </Animated.View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <Animated.View
          entering={FadeInDown.duration(260).delay(40)}
          style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <ThemedText style={[styles.sectionLabel, { color: textMuted }]}>Nombre</ThemedText>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="Nombre del favorito"
            placeholderTextColor={textMuted}
            style={[
              styles.nameInput,
              {
                color: textColor,
                backgroundColor: inputBgColor,
                borderColor,
              },
            ]}
            maxLength={30}
          />

          <View style={styles.iconGrid}>
            {FAVORITE_ICON_OPTIONS.map((iconName) => {
              const selected = iconName === draftIcon;
              return (
                <TouchableOpacity
                  key={iconName}
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={() => setDraftIcon(iconName)}
                  style={[
                    styles.iconOption,
                    {
                      backgroundColor: selected ? softPrimaryBg : softSurface,
                      borderColor: selected ? primaryAccent : borderColor,
                    },
                  ]}>
                  <Ionicons name={iconName} size={16} color={selected ? primaryAccent : textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(260).delay(90)}
          style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <View style={styles.locationHeader}>
            <ThemedText style={[styles.sectionLabel, { color: textMuted }]}>Ubicación</ThemedText>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={beginLocationSelection}
              style={[styles.inlineAction, { backgroundColor: softPrimaryBg }]}>
              <Ionicons name="create-outline" size={12} color={primaryAccent} />
              <ThemedText style={[styles.inlineActionText, { color: primaryAccent }]}>Editar</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={[styles.locationRow, { backgroundColor: inputBgColor, borderColor }]}>
            <Ionicons name="location-outline" size={16} color={primaryAccent} />
            <View style={styles.locationCopy}>
              <ThemedText style={[styles.locationName, { color: textColor }]} numberOfLines={1}>
                {draftPlace.name || 'Sin ubicación seleccionada'}
              </ThemedText>
              {draftPlace.address ? (
                <ThemedText style={[styles.locationAddress, { color: textMuted }]} numberOfLines={2}>
                  {draftPlace.address}
                </ThemedText>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {isPickingLocation ? (
          <Animated.View
            entering={FadeInDown.duration(220)}
            style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
            <ThemedText style={[styles.sectionLabel, { color: textMuted }]}>
              Buscar nueva ubicación
            </ThemedText>
            <View style={[styles.searchShell, { backgroundColor: inputBgColor, borderColor }]}>
              <Ionicons name="search-outline" size={18} color={textMuted} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={searchPlaces}
                placeholder="Ej: Basilica de Los Ángeles"
                placeholderTextColor={textMuted}
                style={[styles.searchInput, { color: textColor }]}
                returnKeyType="search"
              />
            </View>

            {isSearching ? (
              <ThemedText style={[styles.helperText, { color: textMuted }]}>Buscando resultados...</ThemedText>
            ) : null}

            {searchResults.length > 0 ? (
              <View style={[styles.searchResults, { borderColor }]}>
                {searchResults.map((result, index) => (
                  <TouchableOpacity
                    key={result.place_id}
                    accessibilityRole="button"
                    onPress={() => selectLocation(result)}
                    style={[
                      styles.searchResultRow,
                      {
                        borderBottomColor: index === searchResults.length - 1 ? 'transparent' : borderColor,
                      },
                    ]}>
                    <Ionicons name="location-outline" size={16} color={textMuted} />
                    <View style={styles.searchResultCopy}>
                      <ThemedText style={[styles.searchResultTitle, { color: textColor }]} numberOfLines={1}>
                        {result.main_text}
                      </ThemedText>
                      {result.secondary_text ? (
                        <ThemedText style={[styles.searchResultSubtitle, { color: textMuted }]} numberOfLines={1}>
                          {result.secondary_text}
                        </ThemedText>
                      ) : null}
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {saveFeedback ? (
          <Animated.View entering={FadeIn.duration(180)} style={[styles.feedbackBanner, { backgroundColor: softPrimaryBg }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color={primaryAccent} />
            <ThemedText style={[styles.feedbackText, { color: primaryAccent }]}>{saveFeedback}</ThemedText>
          </Animated.View>
        ) : null}

        {errorText ? (
          <Animated.View entering={FadeIn.duration(180)} style={[styles.errorBanner, { backgroundColor: softDangerBg }]}>
            <Ionicons name="alert-circle-outline" size={14} color={dangerAccent} />
            <ThemedText style={[styles.errorText, { color: dangerAccent }]}>{errorText}</ThemedText>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: borderColor, backgroundColor }]}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.86}
          disabled={!favorite || isLoading}
          onPress={deleteFavorite}
          style={[styles.secondaryButton, { borderColor: dangerAccent, backgroundColor: softDangerBg }]}>
          <Ionicons name="trash-outline" size={14} color={dangerAccent} />
          <ThemedText style={[styles.secondaryButtonText, { color: dangerAccent }]}>Eliminar</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.86}
          disabled={!favorite || isLoading}
          onPress={saveChanges}
          style={[styles.primaryButton, { backgroundColor: primaryAccent }]}>
          <Ionicons name="checkmark-outline" size={14} color="#FFFFFF" />
          <ThemedText style={styles.primaryButtonText}>Guardar</ThemedText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerSpacer: {
    width: 34,
    height: 34,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 118,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  nameInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconOption: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineAction: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineActionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  locationRow: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
  },
  locationCopy: {
    flex: 1,
  },
  locationName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  locationAddress: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  searchShell: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    paddingVertical: 0,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  searchResults: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  searchResultRow: {
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchResultCopy: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  searchResultSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  feedbackBanner: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  errorBanner: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1.2,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  invalidText: {
    marginTop: 28,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  invalidButton: {
    marginTop: 14,
    marginHorizontal: 24,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invalidButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
});
