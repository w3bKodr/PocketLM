import React, { useState } from 'react';
import { Button, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getServerUrl, setServerUrl, getSelectedModel, setSelectedModel } from '@/src/lib/config';
import { listModels, createChatCompletion, unloadModel } from '@/src/lib/llmApi';

export default function SettingsScreen() {
  const [url, setUrl] = useState(getServerUrl());
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(getSelectedModel());
  const [warming, setWarming] = useState<string | null>(null);
  const [ejecting, setEjecting] = useState<string | null>(null);

  async function refreshModels() {
    setLoading(true);
    try {
      const res = await listModels();
      const items = Array.isArray(res?.data) ? res.data : [];
      setModels(items);
    } catch (e) {
      // ignore for now
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refreshModels();
  }, []);

  function save() {
    setServerUrl(url.trim());
    // no navigation needed, feedback could be added
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.header}>Settings</ThemedText>

      <ThemedView style={styles.section}>
        <ThemedText style={styles.sectionLabel}>LLM Server URL</ThemedText>
        <TextInput value={url} onChangeText={setUrl} style={styles.input} placeholderTextColor="#ffffff" />
        <Button title="Save" onPress={save} />
      </ThemedView>

      <ThemedText type="subtitle" style={{ marginTop: 12, marginBottom: 8 }}>Select model</ThemedText>
      {loading && <ThemedText>Loading models...</ThemedText>}
      <ThemedView style={styles.section}>
        <FlatList
          data={models}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={async () => {
                // If already selected, do nothing
                if (selected === item.id) return;
                // Eject/unload all other models first
                setEjecting(item.id);
                try {
                  // refresh list from server to be safe
                  const res = await listModels();
                  const items = Array.isArray(res?.data) ? res.data : models;
                  const otherIds = items.map((m: any) => m.id).filter((id: string) => id && id !== item.id);
                  // attempt to unload all others in parallel (best-effort)
                  await Promise.allSettled(otherIds.map((id: string) => unloadModel(id)));
                } catch (e) {
                  console.warn('Failed to eject other models', e);
                } finally {
                  setEjecting(null);
                }

                // now mark selection and warm the chosen model
                setSelected(item.id);
                setSelectedModel(item.id);
                setWarming(item.id);
                try {
                  await createChatCompletion(item.id, [{ role: 'system', content: 'warm' }, { role: 'user', content: 'x' }]);
                } catch (e) {
                  console.warn('Model warm failed', e);
                } finally {
                  setWarming(null);
                }
              }}
              style={({ pressed }) => [
                { opacity: pressed ? 0.8 : 1 },
                styles.modelItem,
                selected === item.id ? styles.modelSelected : undefined,
              ]}
            >
              <ThemedText type="defaultSemiBold">{item.id}</ThemedText>
              {warming === item.id ? <ThemedText> (warming...)</ThemedText> : null}
            </Pressable>
          )}
        />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  header: { textAlign: 'center', alignSelf: 'center', marginBottom: 8 },
  section: { backgroundColor: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 8, marginBottom: 12 },
  sectionLabel: { marginBottom: 8, color: '#cfcfcf' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8, color: '#ffffff' },
  modelItem: { padding: 10, borderBottomWidth: 1, borderColor: '#2e3334' },
  // slightly teal/blue tint when selected to pair with theme tint color
  modelSelected: { backgroundColor: '#22343a', borderRadius: 6, borderWidth: 1, borderColor: '#2ea6bf' },
});
