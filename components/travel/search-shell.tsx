import { passengerRadii } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

type SearchShellProps = {
  query: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
  isSearching: boolean;
  textColor: string;
  textMuted: string;
};

export function SearchShell({
  query,
  onChangeText,
  onClear,
  isSearching,
  textColor,
  textMuted,
}: SearchShellProps) {
  const ui = usePassengerUI();

  return (
    <View style={[styles.searchShell, { backgroundColor: ui.surfaceBase, borderColor: ui.outlineSoft }]}>
      <Ionicons name="search-outline" size={20} color={textMuted} />
      <TextInput
        style={[styles.searchInput, { color: textColor }]}
        placeholder="Busca un lugar, parada o destino"
        placeholderTextColor={textMuted}
        value={query}
        onChangeText={onChangeText}
        returnKeyType="search"
      />
      {isSearching ? (
        <View style={[styles.searchAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
          <Ionicons name="hourglass-outline" size={15} color={textMuted} />
        </View>
      ) : query.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onClear}
          style={[styles.searchAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
          <Ionicons name="close" size={15} color={textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchShell: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: passengerRadii.control,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    paddingVertical: 0,
  },
  searchAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
