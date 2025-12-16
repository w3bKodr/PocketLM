import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export default function NoModelsNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <ThemedView style={styles.overlay}>
      <View style={styles.card}>
        <ThemedText type="title" style={styles.title}>No models available</ThemedText>
        <ThemedText style={styles.message}>
          We couldn't find any models running on the LM Studio API. Please ensure the LM Studio API server is running and the server address is correct.
        </ThemedText>

        <View style={styles.actions}>
          <Link href="/(tabs)/settings" style={styles.link}>
            <Pressable style={styles.primaryButton}>
              <ThemedText style={styles.primaryButtonText}>Open Settings</ThemedText>
            </Pressable>
          </Link>

          <Pressable onPress={onRetry} style={styles.secondaryButton}>
            <ThemedText>Retry</ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 760,
    backgroundColor: '#101214',
    padding: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  title: { textAlign: 'center', marginBottom: 8 },
  message: { textAlign: 'center', color: '#cfcfcf', marginBottom: 16 },
  actions: { flexDirection: 'row', justifyContent: 'center' },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#2ea6bf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    marginLeft: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  link: { textDecorationLine: 'none' },
  primaryButtonText: {
    color: '#022022',
    fontWeight: '700',
  },
});
