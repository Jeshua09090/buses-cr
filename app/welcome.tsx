import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export default function WelcomeScreen() {
  const { setRole } = useAuth();
  const router = useRouter();

  const handleChoice = async (role: 'passenger' | 'driver') => {
    if (role === 'passenger') {
      await setRole('passenger');
    } else {
      // Ask drivers to sign in before enabling live location tools.
      router.push('/driver-login');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="bus" size={80} color="#3b82f6" />
          <ThemedText type="title" style={styles.title}>Buses CR</ThemedText>
          <ThemedText style={styles.subtitle}>Tu app de transporte en Costa Rica</ThemedText>
        </View>

        <View style={styles.questionContainer}>
          <ThemedText style={styles.question}>¿Eres pasajero o chofer?</ThemedText>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.passengerButton]}
            onPress={() => handleChoice('passenger')}
            activeOpacity={0.8}
          >
            <Ionicons name="person" size={32} color="white" />
            <View style={styles.buttonTextContainer}>
              <ThemedText style={styles.buttonTitle}>Pasajero</ThemedText>
              <ThemedText style={styles.buttonDescription}>Busco buses y rutas</ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.driverButton]}
            onPress={() => handleChoice('driver')}
            activeOpacity={0.8}
          >
            <Ionicons name="car" size={32} color="white" />
            <View style={styles.buttonTextContainer}>
              <ThemedText style={styles.buttonTitle}>Chofer</ThemedText>
              <ThemedText style={styles.buttonDescription}>Manejo una unidad</ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    marginTop: 16,
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
    marginTop: 8,
    color: '#fff',
  },
  questionContainer: {
    marginBottom: 32,
    width: '100%',
  },
  question: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    color: '#fff',
  },
  buttonContainer: {
    width: '100%',
    gap: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    width: '100%',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  passengerButton: {
    backgroundColor: '#3b82f6',
  },
  driverButton: {
    backgroundColor: '#10b981',
  },
  buttonTextContainer: {
    marginLeft: 16,
  },
  buttonTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  buttonDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
});
