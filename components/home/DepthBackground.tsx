import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

type DepthBackgroundProps = {
  topColor: string;
  midColor: string;
  bottomColor: string;
  accentColor: string;
  variant?: 'hero' | 'content';
  showOrbs?: boolean;
};

export function DepthBackground({
  topColor,
  midColor,
  bottomColor,
  accentColor,
  variant = 'content',
  showOrbs = false,
}: DepthBackgroundProps) {
  const isHero = variant === 'hero';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[topColor, midColor, bottomColor]}
        locations={[0, 0.58, 1]}
        start={{ x: 0.06, y: 0.02 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={isHero ? [`${accentColor}18`, `${accentColor}08`, 'transparent'] : [`${accentColor}12`, 'transparent', 'transparent']}
        locations={[0, 0.38, 1]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={[styles.topAura, !isHero && styles.topAuraContent]}
      />

      {showOrbs ? (
        <>
          <View
            style={[
              styles.glowOrb,
              styles.rightOrb,
              {
                backgroundColor: `${accentColor}${isHero ? '12' : '0A'}`,
              },
            ]}
          />
          <View
            style={[
              styles.glowOrb,
              styles.leftOrb,
              { backgroundColor: isHero ? 'rgba(125, 211, 252, 0.06)' : 'rgba(125, 211, 252, 0.03)' },
            ]}
          />
        </>
      ) : null}

      <LinearGradient
        colors={['rgba(2, 6, 23, 0.22)', 'transparent']}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topVignette}
      />

      <LinearGradient
        colors={['transparent', 'rgba(2, 6, 23, 0.22)']}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bottomVignette}
      />

      {isHero ? <View style={styles.softSheen} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topAura: {
    position: 'absolute',
    top: -36,
    left: -50,
    right: -50,
    height: 310,
  },
  topAuraContent: {
    top: -20,
    height: 220,
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  rightOrb: {
    width: 250,
    height: 250,
    top: 160,
    right: -95,
  },
  leftOrb: {
    width: 200,
    height: 200,
    top: 320,
    left: -85,
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
  },
  bottomVignette: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
  },
  softSheen: {
    position: 'absolute',
    top: 110,
    left: -80,
    right: -80,
    height: 130,
    transform: [{ rotate: '-5deg' }],
    backgroundColor: 'rgba(255,255,255,0.012)',
  },
});
