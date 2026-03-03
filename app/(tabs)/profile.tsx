import { StyleSheet, View, SafeAreaView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/context/auth-context';

export default function ProfileScreen() {
  const backgroundColor = useThemeColor({ light: '#f8fafc', dark: '#0f172a' }, 'background');
  const cardColor = useThemeColor({ light: '#ffffff', dark: '#1e293b' }, 'background');
  const textColor = useThemeColor({ light: '#0f172a', dark: '#f8fafc' }, 'text');
  const textMuted = useThemeColor({ light: '#64748b', dark: '#94a3b8' }, 'text');
  const { clearRole } = useAuth();

  const handleLogout = async () => {
    await clearRole();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <View style={styles.header}>
        <ThemedText style={[styles.title, { color: textColor }]}>Perfil</ThemedText>
      </View>

      <View style={styles.content}>
        <View style={[styles.profileCard, { backgroundColor: cardColor }]}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={40} color="#94a3b8" />
          </View>
          <View style={styles.profileInfo}>
            <ThemedText style={[styles.name, { color: textColor }]}>Pasajero</ThemedText>
            <ThemedText style={[styles.email, { color: textMuted }]}>Viajero frecuente</ThemedText>
          </View>
        </View>

        <View style={styles.menuGroup}>
          <TouchableOpacity style={[styles.menuItem, { backgroundColor: cardColor }]} activeOpacity={0.7}>
            <Ionicons name="time-outline" size={24} color={textColor} />
            <ThemedText style={[styles.menuText, { color: textColor }]}>Historial de Viajes</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={textMuted} />
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.menuItem, { backgroundColor: cardColor }]} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={24} color={textColor} />
            <ThemedText style={[styles.menuText, { color: textColor }]}>Configuración</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={textMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.logoutButton, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]} 
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={24} color="#ef4444" />
          <ThemedText style={styles.logoutText}>Cerrar Sesión</ThemedText>
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
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
  },
  menuGroup: {
    gap: 12,
    marginBottom: 40,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
