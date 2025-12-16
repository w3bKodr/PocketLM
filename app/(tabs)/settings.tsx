import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getSelectedModel, getServerUrl, setSelectedModel, setServerUrl } from '@/src/lib/config';
import { createChatCompletion, listModels, unloadModel } from '@/src/lib/llmApi';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View, Animated, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface LoadingState {
  [key: string]: boolean;
}

export default function SettingsScreen() {
  const [url, setUrl] = useState(getServerUrl());
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(getSelectedModel());
  const [warming, setWarming] = useState<string | null>(null);
  const [ejecting, setEjecting] = useState<string | null>(null);
  const [urlFocused, setUrlFocused] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

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
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    // refresh model list after saving server URL so the UI reflects the new server
    refreshModels();
  }

  const getModelDisplayName = (modelId: string) => {
    // Extract just the model name, not the full path
    const parts = modelId.split('/');
    return parts[parts.length - 1];
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with gradient accent */}
        <View style={styles.headerContainer}>
        <ThemedText style={styles.header}>Settings</ThemedText>
        <View style={styles.headerAccent} />
      </View>

      {/* Server URL Section */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconBg}>
            <MaterialCommunityIcons name="cog-outline" size={18} color="#2ea6bf" />
          </View>
          <View style={styles.sectionTitleContainer}>
            <ThemedText style={styles.sectionTitle}>Server Configuration</ThemedText>
            <ThemedText style={styles.sectionSubtitle}>LLM Server URL</ThemedText>
          </View>
        </View>

        <View style={styles.inputCard}>
          <View style={[styles.inputContainer, urlFocused && styles.inputContainerFocused]}>
            <ThemedText style={styles.inputPrefix}>→</ThemedText>
            <TextInput
              value={url}
              onChangeText={setUrl}
              onFocus={() => setUrlFocused(true)}
              onBlur={() => setUrlFocused(false)}
              style={styles.input}
              placeholderTextColor="#5a6c70"
              placeholder="http://localhost:8000"
            />
          </View>

          <Pressable
            onPress={save}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              savedSuccess && styles.saveButtonSuccess,
            ]}
          >
            <ThemedText style={styles.saveButtonText}>
              {savedSuccess ? '✓ Saved' : 'Save'}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Model Selection Section */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconBg}>
            <MaterialCommunityIcons name="robot-outline" size={18} color="#2ea6bf" />
          </View>
          <View style={styles.sectionTitleContainer}>
            <ThemedText style={styles.sectionTitle}>Model Selection</ThemedText>
            <ThemedText style={styles.sectionSubtitle}>
              {loading ? 'Loading models...' : `${models.length} available`}
            </ThemedText>
          </View>
        </View>

        <View style={styles.modelsCard}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ThemedText style={styles.loadingText}>Loading models...</ThemedText>
            </View>
          ) : models.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>No models found</ThemedText>
              <ThemedText style={styles.emptySubtext}>Check your server URL and connection</ThemedText>
            </View>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={models}
              keyExtractor={(i) => i.id}
              renderItem={({ item, index }) => (
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
                    styles.modelItem,
                    pressed && styles.modelItemPressed,
                    selected === item.id && styles.modelItemSelected,
                    index !== models.length - 1 && styles.modelItemBorder,
                  ]}
                >
                  <View style={styles.modelItemContent}>
                    <View style={styles.modelNameContainer}>
                      <View style={[styles.modelIndicator, selected === item.id && styles.modelIndicatorActive]} />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.modelName}>
                          {getModelDisplayName(item.id)}
                        </ThemedText>
                        <ThemedText style={styles.modelId}>{item.id}</ThemedText>
                      </View>
                    </View>
                    <View style={styles.modelStatus}>
                      {warming === item.id ? (
                        <View style={styles.warmingBadge}>
                          <ThemedText style={styles.warmingText}>warming...</ThemedText>
                        </View>
                      ) : selected === item.id ? (
                        <View style={styles.selectedBadge}>
                          <ThemedText style={styles.selectedText}>✓ Selected</ThemedText>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </View>

      {/* Footer accent */}
      <View style={styles.footerAccent} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e11',
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  
  // Header - Refined and minimal
  headerContainer: {
    marginBottom: 40,
  },
  header: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'left',
    color: '#ffffff',
    letterSpacing: 0,
    lineHeight: 34,
  },
  headerAccent: {
    display: 'none',
  },

  // Section Container - Subtle depth without visual noise
  sectionContainer: {
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 35, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46, 166, 191, 0.06)',
  },

  sectionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(46, 166, 191, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  sectionIcon: {
    fontSize: 18,
    lineHeight: 40, // match container height to vertically center the emoji
    height: 40,
    textAlign: 'center',
    transform: [{ translateY: 1.5 }],
  },

  sectionTitleContainer: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 3,
    lineHeight: 20,
  },

  sectionSubtitle: {
    fontSize: 13,
    color: '#6db5d1',
    fontWeight: '400',
    lineHeight: 18,
  },

  // Input Card - Clean and refined
  inputCard: {
    padding: 18,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 35, 42, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.15)',
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 1,
  },

  inputContainerFocused: {
    borderColor: 'rgba(46, 166, 191, 0.4)',
    backgroundColor: 'rgba(26, 35, 42, 1)',
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  inputPrefix: {
    color: 'rgba(46, 166, 191, 0.6)',
    marginRight: 10,
    fontSize: 13,
    fontWeight: '500',
  },

  input: {
    flex: 1,
    color: '#e8e9eb',
    fontSize: 13,
    paddingVertical: 14,
    paddingHorizontal: 0,
    lineHeight: 18,
  },

  saveButton: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: '#2ea6bf',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },

  saveButtonPressed: {
    opacity: 0.92,
  },

  saveButtonSuccess: {
    backgroundColor: '#1ba098',
  },

  saveButtonText: {
    color: '#022022',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.3,
    lineHeight: 16,
  },

  // Models Card - Light and spacious
  modelsCard: {
    paddingVertical: 2,
  },

  loadingContainer: {
    paddingVertical: 28,
    alignItems: 'center',
  },

  loadingText: {
    color: '#6b7a7e',
    fontSize: 13,
    lineHeight: 18,
  },

  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
  },

  emptyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    lineHeight: 18,
  },

  emptySubtext: {
    color: '#6b7a7e',
    fontSize: 12,
    lineHeight: 16,
  },

  modelItem: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: 'transparent',
  },

  modelItemPressed: {
    backgroundColor: 'rgba(46, 166, 191, 0.08)',
  },

  modelItemSelected: {
    backgroundColor: 'rgba(46, 166, 191, 0.12)',
  },

  modelItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46, 166, 191, 0.04)',
  },

  modelItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  modelNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  modelIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(46, 166, 191, 0.2)',
    marginRight: 12,
  },

  modelIndicatorActive: {
    backgroundColor: '#2ea6bf',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 2,
  },

  modelName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 4,
    lineHeight: 16,
  },

  modelId: {
    fontSize: 11,
    color: '#6b7a7e',
    fontWeight: '400',
    lineHeight: 14,
  },

  modelStatus: {
    marginLeft: 10,
  },

  warmingBadge: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    backgroundColor: 'rgba(46, 166, 191, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(46, 166, 191, 0.3)',
  },

  warmingText: {
    fontSize: 10,
    color: '#6db5d1',
    fontWeight: '500',
    lineHeight: 13,
  },

  selectedBadge: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    backgroundColor: 'rgba(27, 160, 152, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(27, 160, 152, 0.3)',
  },

  selectedText: {
    fontSize: 10,
    color: '#6db5c7',
    fontWeight: '500',
    lineHeight: 13,
  },

  // Footer - Removed for cleaner appearance
  footerAccent: {
    display: 'none',
  },
});
