import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';

type AuthContextType = {
  userRole: string | null;
  isReady: boolean;
  session: Session | null;
  setRole: (role: 'passenger' | 'driver') => Promise<void>;
  clearRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  userRole: null,
  isReady: false,
  session: null,
  setRole: async () => {},
  clearRole: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function loadAuth() {
      try {
        // Load role
        const role = await AsyncStorage.getItem('userRole');
        setUserRole(role);
        
        // Load Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
      } catch (error) {
        console.error('Error loading auth state:', error);
      } finally {
        setIsReady(true);
      }
    }

    loadAuth();

    // Listen for Supabase auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const setRole = async (role: 'passenger' | 'driver') => {
    await AsyncStorage.setItem('userRole', role);
    setUserRole(role);
  };

  const clearRole = async () => {
    await AsyncStorage.removeItem('userRole');
    setUserRole(null);
    if (session) {
      await supabase.auth.signOut();
    }
  };

  return (
    <AuthContext.Provider value={{ userRole, isReady, session, setRole, clearRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
