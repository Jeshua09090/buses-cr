import { ThemedText } from '@/components/themed-text';
import { passengerSpacing } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { FavoriteItem } from '@/lib/favorites';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type FavoriteGridProps = {
  favorites: FavoriteItem[];
  onPressFavorite: (favorite: FavoriteItem) => void;
  onLongPressFavorite: (favorite: FavoriteItem) => void;
  onPressManage: () => void;
};

export function FavoriteGrid({
  favorites,
  onPressFavorite,
  onLongPressFavorite,
  onPressManage,
}: FavoriteGridProps) {
  const ui = usePassengerUI();

  return (
    <View style={styles.wrap}>
      {favorites.map((favorite) => (
        <TouchableOpacity
          key={favorite.id}
          accessibilityRole="button"
          activeOpacity={0.84}
          onPress={() => onPressFavorite(favorite)}
          onLongPress={() => onLongPressFavorite(favorite)}
          delayLongPress={280}
          style={[styles.card, { backgroundColor: ui.surfaceBase, borderColor: ui.dividerSoft }]}>
          <View style={[styles.iconWrap, { backgroundColor: ui.interactiveAccent }]}>
            <Ionicons name={favorite.icon} size={16} color={ui.accentPrimary} />
          </View>
          <ThemedText style={[styles.title, { color: ui.textPrimary }]}>{favorite.title}</ThemedText>
          <Ionicons name="arrow-forward" size={14} color={ui.textSecondary} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.84}
        onPress={onPressManage}
        style={[styles.card, { backgroundColor: ui.surfaceStrong, borderColor: ui.outlineSoft }]}>
        <View style={[styles.iconWrap, { backgroundColor: ui.interactiveNeutral }]}>
          <Ionicons name="add-outline" size={16} color={ui.textPrimary} />
        </View>
        <ThemedText style={[styles.title, { color: ui.textPrimary }]}>Agregar lugar</ThemedText>
        <Ionicons name="arrow-forward" size={14} color={ui.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
  },
  card: {
    minWidth: '48%',
    flexGrow: 1,
    minHeight: 52,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
});
