import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ROUTE_DEFINITIONS } from '@/lib/routes';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const RECENT_ROUTES = [
  { 
    id: 'cartago_taras', 
    destination: 'Parada principal, Taras', 
    time: '26 min', 
    arrival: '12:47', 
    leavesIn: '3 min', 
    price: '₡350', 
    busLine: '300' 
  },
  { 
    id: 'cartago_paraiso', 
    destination: 'Basílica de Los Ángeles', 
    time: '15 min', 
    arrival: '13:05', 
    leavesIn: '8 min', 
    price: '₡350', 
    busLine: '304' 
  },
  {
    id: 'lumaca_sanjose',
    destination: 'Terminal Lumaca',
    time: '40 min',
    arrival: '13:32',
    leavesIn: '12 min',
    price: '₡950',
    busLine: 'Lumaca',
  },
];

const FAVORITES = [
  { id: '1', title: 'Casa', subtitle: 'Llanos de Santa Lucía, Paraíso', icon: 'home-outline' as const },
  { id: '2', title: 'Trabajo', subtitle: 'Parque Industrial Zeta, Cartago', icon: 'briefcase-outline' as const },
  { id: '3', title: 'UCR / TEC', subtitle: 'Campus Tecnológico Local, Cartago', icon: 'school-outline' as const },
];

export default function TravelScreen() {
  const router = useRouter();

  const openRouteOnMap = (routeId: string) => {
    const route = ROUTE_DEFINITIONS.find((item) => item.id === routeId);
    router.push({
      pathname: '/(tabs)/explore',
      params: {
        routeId,
        routeName: route?.name ?? '',
      },
    });
  };
  
  // Adapted colors for light/dark mode based on the reference design
  const backgroundColor = useThemeColor({ light: '#ffffff', dark: '#0b0f19' }, 'background');
  const textColor = useThemeColor({ light: '#0f172a', dark: '#f8fafc' }, 'text');
  const textMuted = useThemeColor({ light: '#64748b', dark: '#94a3b8' }, 'text');
  
  // Borders and cards
  const borderColor = useThemeColor({ light: '#e2e8f0', dark: '#1e293b' }, 'background');
  const cardColor = useThemeColor({ light: '#ffffff', dark: '#151e2f' }, 'background');
  const inputBgColor = useThemeColor({ light: '#ffffff', dark: '#0b0f19' }, 'background');
  
  // Accents matching the image
  const primaryAccent = '#6366f1'; // Purple/Blue accent from the image
  const lightPurpleBg = useThemeColor({ light: '#f3f0ff', dark: 'rgba(99, 102, 241, 0.15)' }, 'background');
  const lightGreenBg = useThemeColor({ light: '#ecfdf5', dark: 'rgba(16, 185, 129, 0.15)' }, 'background');
  const greenText = useThemeColor({ light: '#10b981', dark: '#34d399' }, 'text');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: primaryAccent }]}>
              <Ionicons name="map-outline" size={20} color="#fff" />
            </View>
            <ThemedText style={[styles.logoText, { color: textColor }]}>CartagoBuses</ThemedText>
          </View>
          <TouchableOpacity style={[styles.menuButton, { borderColor }]}>
            <Ionicons name="menu" size={24} color={textColor} />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <ThemedText style={[styles.mainTitle, { color: textColor }]}>
            ¿A dónde{'\n'}quieres ir?
          </ThemedText>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { borderColor, backgroundColor: inputBgColor }]}>
          <ThemedText style={[styles.searchInputText, { color: textMuted }]}>
            Buscar destino...
          </ThemedText>
          <TouchableOpacity 
            style={[styles.searchButton, { backgroundColor: primaryAccent }]}
            activeOpacity={0.8}
            onPress={() => openRouteOnMap('cartago_taras')}
          >
            <Ionicons name="search" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Latest Routes (Horizontal) */}
        <View style={styles.sectionHeader}>
          <Ionicons name="time-outline" size={18} color={textMuted} style={styles.sectionIcon} />
          <ThemedText style={[styles.sectionTitle, { color: textColor }]}>Rutas Recientes</ThemedText>
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.routesScrollContainer}
          snapToInterval={width * 0.85 + 16}
          decelerationRate="fast"
        >
          {RECENT_ROUTES.map((route) => (
            <TouchableOpacity 
              key={route.id} 
              style={[styles.recentRouteCard, { borderColor, backgroundColor: cardColor }]}
              activeOpacity={0.9}
              onPress={() => openRouteOnMap(route.id)}
            >
              <ThemedText style={[styles.routeDestination, { color: textColor }]} numberOfLines={1}>
                {route.destination}
              </ThemedText>
              
              <ThemedText style={[styles.routeTimeInfo, { color: textMuted }]}>
                <ThemedText style={{fontWeight: '600', color: textColor}}>{route.time}</ThemedText> • Llega a las {route.arrival}
              </ThemedText>

              <View style={styles.badgesRow}>
                <View style={[styles.badge, { backgroundColor: lightPurpleBg }]}>
                  <Ionicons name="radio-outline" size={14} color={primaryAccent} style={{marginRight: 4}} />
                  <ThemedText style={[styles.badgeText, { color: primaryAccent }]}>
                    Sale en {route.leavesIn}
                  </ThemedText>
                </View>

                <View style={[styles.badge, { backgroundColor: lightGreenBg }]}>
                  <Ionicons name="cash-outline" size={14} color={greenText} style={{marginRight: 4}} />
                  <ThemedText style={[styles.badgeText, { color: greenText }]}>
                    {route.price}
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.transportSequence, { borderTopColor: borderColor }]}>
                <View style={[styles.sequenceBadge, { backgroundColor: lightPurpleBg }]}>
                  <Ionicons name="bus" size={14} color={primaryAccent} style={{marginRight: 6}} />
                  <ThemedText style={[styles.sequenceText, { color: primaryAccent }]}>
                    {route.busLine}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={textMuted} style={{marginHorizontal: 8}} />
                <View style={[styles.sequenceBadge, { backgroundColor: 'transparent' }]}>
                  <Ionicons name="walk" size={16} color={primaryAccent} style={{marginRight: 6}} />
                  <ThemedText style={[styles.sequenceText, { color: primaryAccent }]}>
                    Caminar
                  </ThemedText>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.paginationDots}>
          <View style={[styles.dot, { backgroundColor: primaryAccent }]} />
          <View style={[styles.dot, { backgroundColor: borderColor }]} />
          <View style={[styles.dot, { backgroundColor: borderColor }]} />
        </View>

        {/* Favorites */}
        <View style={styles.favoritesHeaderRow}>
          <ThemedText style={[styles.sectionTitleLarge, { color: textColor }]}>Favoritos</ThemedText>
          <TouchableOpacity style={[styles.addButton, { borderColor }]}>
            <ThemedText style={[styles.addButtonText, { color: textColor }]}>Agregar +</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.favoritesList}>
          {FAVORITES.map((fav) => (
            <TouchableOpacity 
              key={fav.id} 
              style={[styles.favoriteCard, { borderColor, backgroundColor: cardColor }]}
              activeOpacity={0.7}
            >
              <View style={styles.favIconContainer}>
                <Ionicons name={fav.icon} size={24} color={textMuted} />
              </View>
              
              <View style={styles.favInfo}>
                <ThemedText style={[styles.favTitle, { color: textColor }]}>{fav.title}</ThemedText>
                <ThemedText style={[styles.favSubtitle, { color: textMuted }]} numberOfLines={1}>
                  {fav.subtitle}
                </ThemedText>
              </View>
              
              <Ionicons name="chevron-forward" size={20} color={textMuted} />
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 120, // Extra padding for the absolute bottom tab bar
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  mainTitle: {
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
    letterSpacing: -1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    borderWidth: 1,
    borderRadius: 16,
    height: 60,
    paddingLeft: 20,
    paddingRight: 6,
    marginBottom: 32,
  },
  searchInputText: {
    flex: 1,
    fontSize: 16,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionIcon: {
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  routesScrollContainer: {
    paddingHorizontal: 24,
    gap: 16,
  },
  recentRouteCard: {
    width: width * 0.85,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  routeDestination: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  routeTimeInfo: {
    fontSize: 14,
    marginBottom: 16,
  },
  badgesRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  transportSequence: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 16,
  },
  sequenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  sequenceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 32,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  favoritesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitleLarge: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  favoritesList: {
    paddingHorizontal: 24,
    gap: 12,
  },
  favoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  favIconContainer: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  favInfo: {
    flex: 1,
  },
  favTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  favSubtitle: {
    fontSize: 13,
  },
});
