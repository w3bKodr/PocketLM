import NoModelsNotice from '@/components/no-models';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getSelectedModel, subscribeSelectedModel } from '@/src/lib/config';
import { createChatCompletion, listModels } from '@/src/lib/llmApi';
import { useLocalSearchParams, Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Animated, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
let ExpoClipboard: any = null;
try {
  // require dynamically to avoid web type errors
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ExpoClipboard = require('expo-clipboard');
} catch (e) {
  ExpoClipboard = null;
}

function MarkdownText({ children, style }: { children: string; style?: any }) {
  // handle fenced code blocks ```lang\n...\n```
  const fenceParts = children.split(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g);
  if (fenceParts.length > 1) {
    const nodes: any[] = [];
    // fenceParts comes in groups: [text, lang, code, text, lang, code, ...]
    for (let i = 0; i < fenceParts.length; i += 3) {
      const normal = fenceParts[i];
      if (normal) nodes.push(<Text key={`t-${i}`}>{renderInline(normal, style)}</Text>);
      const lang = fenceParts[i + 1] || '';
      const code = fenceParts[i + 2] || '';
      if (code) {
        const label = lang ? (lang.toLowerCase() === 'html' ? 'index.html' : lang.toUpperCase()) : 'CODE';
        nodes.push(
          <View key={`cwrap-${i}`} style={styles.codeContainer as any}>
            <View style={styles.codeHeader as any}>
              <Text style={styles.codeLabel as any}>{label}</Text>
              <CopyButton text={code} />
            </View>
            <Text key={`c-${i}`} style={[styles.codeBlock as any, style]} selectable>
              {code}
            </Text>
          </View>
        );
      }
    }
  return <>{nodes}</>;
  }

  return <>{renderBlocks(children, style)}</>;
}

function renderBlocks(md: string, style: any) {
  // Split into lines and parse headings, lists, and tables
  const lines = md.replace(/\r/g, '').split('\n');
  const nodes: any[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Split a markdown table row into parts but remove empty leading/trailing
    // parts only when the original line had leading/trailing pipes. This
    // avoids introducing an extra empty first/last column when the table
    // source uses leading/trailing `|` characters.
    const splitRow = (ln: string) => {
      const parts = ln.split('|').map((s) => s.trim());
      const t = ln.replace(/\s+$/g, '');
      if (t.startsWith('|') && parts.length > 0 && parts[0] === '') parts.shift();
      if ((t.endsWith('|') || ln.endsWith('|')) && parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
      return parts;
    };
    // Heading: allow any leading whitespace and optional space after hashes so variations like '##Heading' or
    // '   ## Heading' still render as headings
    const h = line.match(/^\s*(#{1,6})\s*(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = (h[2] || '').trim();
      nodes.push(
        <Text key={`h-${i}`} style={level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3}>
          {renderInline(text, style)}
        </Text>
      );
      i++;
      continue;
    }

    // Unordered list
    const li = line.match(/^\s*([-*+])\s+(.*)$/);
    if (li) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+])\s+(.*)$/);
        if (!m) break;
        items.push(m[2]);
        i++;
      }
      nodes.push(
        <View key={`ul-${i}`} style={{ marginVertical: 6 }}>
          {items.map((t, idx) => (
            <View key={`li-${idx}`} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ color: '#cfcfcf', marginRight: 8 }}>•</Text>
              <Text style={{ flex: 1 }}>{renderInline(t, style)}</Text>
            </View>
          ))}
        </View>
      );
      continue;
    }

    // Table: detect header row with '|' and separator line of dashes
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s\-\|:]+\|?\s*$/.test(lines[i + 1])) {
      // split header while stripping only leading/trailing empty cells
      const headerParts = splitRow(line);
      const columnCount = headerParts.length;
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const cols = splitRow(lines[i]);
        // pad rows to have same number of columns as header
        while (cols.length < columnCount) cols.push('');
        rows.push(cols);
        i++;
      }
      nodes.push(
        <View key={`table-${i}`} style={styles.table as any}>
          <View style={styles.tableRow as any}>
            {Array.from({ length: columnCount }).map((_, ci) => {
              const hcell = headerParts[ci] || '';
              const isLast = ci === columnCount - 1;
              return (
                <View key={`th-${ci}`} style={[styles.tableCell as any, styles.tableHeaderCell as any, isLast ? { borderRightWidth: 0 } : {}]}>
                  <Text style={[styles.tableCellText as any, styles.tableHeaderText as any]}>{renderInline(hcell, style)}</Text>
                </View>
              );
            })}
          </View>
          {rows.map((r, ri) => (
            <View key={`tr-${ri}`} style={styles.tableRow as any}>
              {Array.from({ length: columnCount }).map((_, ci) => {
                const c = r[ci] || '';
                const isLast = ci === columnCount - 1;
                return (
                  <View key={`td-${ri}-${ci}`} style={[styles.tableCell as any, isLast ? { borderRightWidth: 0 } : {}]}>
                    <Text style={styles.tableCellText as any}>{renderInline(c, style)}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      );
      continue;
    }

    // Paragraph
    if (line.trim() === '') {
      nodes.push(<Text key={`br-${i}`} style={{ height: 8 }} />);
      i++;
      continue;
    }

    nodes.push(<Text key={`p-${i}`} style={{ marginBottom: 6 }}>{renderInline(line, style)}</Text>);
    i++;
  }
  return nodes;
}

function renderInline(text: string, style: any) {
  // inline code `code`
  const parts = text.split(/(`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <Text key={i} style={[{ fontFamily: 'monospace', backgroundColor: '#2a2e30', color: '#ffffff', padding: 2 }, style]}>{part.slice(1, -1)}</Text>;
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <Text key={j} style={[{ fontWeight: '700' }, style]}>{p.slice(2, -2)}</Text>;
      }
      const itParts = p.split(/(\*[^*]+\*)/g).map((q, k) => {
        if (q.startsWith('*') && q.endsWith('*')) {
          return <Text key={k} style={[{ fontStyle: 'italic' }, style]}>{q.slice(1, -1)}</Text>;
        }
        return <Text key={k} style={style}>{q}</Text>;
      });
      return itParts;
    });
    return boldParts;
  });
  return parts;
}

type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

function TypingIndicator({ size = 8 }: { size?: number }) {
  const dot1 = React.useRef(new Animated.Value(0)).current;
  const dot2 = React.useRef(new Animated.Value(0)).current;
  const dot3 = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a1 = Animated.sequence([
      Animated.timing(dot1, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(dot1, { toValue: 0.3, duration: 600, useNativeDriver: true }),
    ]);
    const a2 = Animated.sequence([
      Animated.timing(dot2, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(dot2, { toValue: 0.3, duration: 600, useNativeDriver: true }),
    ]);
    const a3 = Animated.sequence([
      Animated.timing(dot3, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(dot3, { toValue: 0.3, duration: 600, useNativeDriver: true }),
    ]);
    const loop = Animated.loop(Animated.parallel([
      Animated.sequence([Animated.delay(0), a1]),
      Animated.sequence([Animated.delay(200), a2]),
      Animated.sequence([Animated.delay(400), a3]),
    ]));
    loop.start();
    return () => loop.stop();
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({ opacity: anim, width: size, height: size, borderRadius: size / 2, backgroundColor: '#cfcfcf', marginHorizontal: 4 });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 6 }}>
      <Animated.View style={dotStyle(dot1)} />
      <Animated.View style={dotStyle(dot2)} />
      <Animated.View style={dotStyle(dot3)} />
    </View>
  );
}

function CopyButton({ text }: { text: string }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const [copied, setCopied] = useState(false);

  async function doCopy() {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else if (ExpoClipboard) {
        if (typeof ExpoClipboard.setStringAsync === 'function') await ExpoClipboard.setStringAsync(text);
        else if (typeof ExpoClipboard.setString === 'function') await ExpoClipboard.setString(text);
      }
      setCopied(true);
      // animate
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 160, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setCopied(false), 900);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={doCopy} style={styles.copyButton as any}>
        {Platform.OS === 'web' ? (
          <svg id="Copy_24_small" width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ color: '#fff' }}>
            <g transform="matrix(1 0 0 1 12 12)">
              <path transform=" translate(-12, -12)" d="M 4 2 C 2.895 2 2 2.895 2 4 L 2 18 L 4 18 L 4 4 L 18 4 L 18 2 L 4 2 z M 8 6 C 6.895 6 6 6.895 6 8 L 6 20 C 6 21.105 6.895 22 8 22 L 20 22 C 21.105 22 22 21.105 22 20 L 22 8 C 22 6.895 21.105 6 20 6 L 8 6 z M 8 8 L 20 8 L 20 20 L 8 20 L 8 8 z" fill="currentColor" />
            </g>
          </svg>
        ) : (
          <Text style={styles.copyIcon as any}>{copied ? '✓' : '📋'}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const paramModel = (params.model as string) || null;
  const [model, setModel] = useState<string | null>(paramModel || getSelectedModel());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsMissing, setModelsMissing] = useState(false);
  const [checkingModels, setCheckingModels] = useState(true);
  // line-based sizing: start at 3 lines, grow/shrink by newlines up to 5 lines
  const MIN_LINES = 3;
  const MAX_LINES = 5;
  const LINE_HEIGHT = 18; // px per line (approx)
  const VERTICAL_PADDING = 8 + 8; // paddingTop + paddingBottom from styles
  const MIN_INPUT_HEIGHT = MIN_LINES * LINE_HEIGHT + VERTICAL_PADDING;
  const MAX_INPUT_HEIGHT = MAX_LINES * LINE_HEIGHT + VERTICAL_PADDING;
  const [inputHeight, setInputHeight] = useState<number>(MIN_INPUT_HEIGHT);
  const [inputScrollEnabled, setInputScrollEnabled] = useState(false);

  // Removed redundant system message that said which model is connected.
  // Messages are now preserved across model selection changes.

  useEffect(() => {
    const unsub = subscribeSelectedModel((m) => setModel(m));
    return unsub;
  }, []);

  useEffect(() => {
    let mounted = true;
    async function checkModels() {
      setCheckingModels(true);
      try {
        const res = await listModels();
        const items = Array.isArray(res?.data) ? res.data : [];
        if (mounted) setModelsMissing(items.length === 0);
      } catch (e) {
        if (mounted) setModelsMissing(true);
      } finally {
        if (mounted) setCheckingModels(false);
      }
    }
    checkModels();
    return () => {
      mounted = false;
    };
  }, []);

  async function send() {
    if (!input.trim()) return;
    const userMsg: Msg = { role: 'user', content: input };
    const next = [...messages, userMsg];
    setMessages(next);
  setInput('');
  // reset input height after send
  setInputHeight(MIN_INPUT_HEIGHT);
  setInputScrollEnabled(false);
    setSending(true);
    setError(null);
    try {
  if (!model) throw new Error('No model selected');
  const resp = await createChatCompletion(model, next.map((m) => ({ role: m.role, content: m.content })));
      // Expecting OpenAI-like response: { choices: [ { message: { role, content } } ] }
      const assistant = resp?.choices?.[0]?.message;
      if (assistant) {
        setMessages((m) => [...m, { role: assistant.role, content: assistant.content }]);
      } else if (resp?.error) {
        setError(JSON.stringify(resp.error));
      } else {
        setError('No assistant message in response');
      }
    } catch (err: any) {
  setError(String(err));
    } finally {
      setSending(false);
    }
  }
    // If we couldn't find any models (or couldn't reach the server) show a centered notice
    if (!checkingModels && modelsMissing) {
      return <NoModelsNotice onRetry={async () => {
        setCheckingModels(true);
        try {
          const res = await listModels();
          const items = Array.isArray(res?.data) ? res.data : [];
          setModelsMissing(items.length === 0);
        } catch (e) {
          setModelsMissing(true);
        } finally {
          setCheckingModels(false);
        }
      }} />;
    }

  // If no model is selected, show only the modal popup without the chat UI
  if (!checkingModels && !modelsMissing && !model) {
    return (
      <ThemedView style={styles.container as any}>
        <View style={styles.overlay as any} pointerEvents="box-none">
          <View style={styles.card as any}>
            <ThemedText type="title" style={{ textAlign: 'center', marginBottom: 8 }}>No model selected</ThemedText>
            <ThemedText style={{ textAlign: 'center', color: '#cfcfcf', marginBottom: 16 }}>
              You don't have a model selected. Open Settings to choose the LM server and model.
            </ThemedText>

            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <Link href="/(tabs)/settings" style={styles.link}>
                <Pressable style={styles.primaryButton as any}>
                  <ThemedText style={styles.primaryButtonText}>Open Settings</ThemedText>
                </Pressable>
              </Link>
            </View>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container as any}>
      {/* Premium Header */}
      <View style={styles.headerContainer as any}>
        <View>
          <ThemedText style={styles.headerTitle as any}>Chat</ThemedText>
          <ThemedText style={styles.headerModel as any}>
            {model ? `Connected to ${getModelDisplayName(model)}` : 'No model selected'}
          </ThemedText>
        </View>
      </View>

      {/* Messages Area */}
      <FlatList
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.msgRow as any, item.role === 'user' ? styles.userRow as any : styles.assistantRow as any]}>
            <View style={[styles.bubble as any, item.role === 'user' ? styles.userBubble as any : styles.assistantBubble as any]}>
              <MarkdownText style={item.role === 'user' ? { color: '#ffffff' } : { color: '#e8e9eb' }}>{item.content}</MarkdownText>
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingTop: 4 }}
      />

      {error && (
        <View style={styles.errorContainer as any}>
          <ThemedText style={styles.errorText as any}>{error}</ThemedText>
        </View>
      )}

      {sending && (
        <View style={[styles.msgRow as any, styles.assistantRow as any]}>
          <View style={[styles.bubble as any, styles.assistantBubble as any]}>
            <TypingIndicator />
          </View>
        </View>
      )}

      {/* Premium Floating Input */}
      <View style={styles.inputRow as any}>
        <View style={styles.inputWrapper as any}>
          <TextInput
            placeholder="Type your message..."
            placeholderTextColor="rgba(232, 233, 235, 0.4)"
            value={input}
            multiline
            onChangeText={(text) => {
              setInput(text);
              const newlineCount = text.length === 0 ? 0 : text.split('\n').length;
              const lines = Math.max(MIN_LINES, Math.min(MAX_LINES, Math.max(1, newlineCount)));
              const h = lines * LINE_HEIGHT + VERTICAL_PADDING;
              setInputHeight(h);
              setInputScrollEnabled(lines >= MAX_LINES);
            }}
            onKeyPress={Platform.OS === 'web' ? (e: any) => {
              const key = e?.nativeEvent?.key;
              const shift = e?.nativeEvent?.shiftKey;
              if (key === 'Enter' && !shift) {
                e.preventDefault?.();
                send();
              }
            } : undefined}
            style={[styles.input as any, { height: inputHeight }]}
            textAlignVertical="top"
            scrollEnabled={inputScrollEnabled}
            onContentSizeChange={(e) => {
              const contentH = e.nativeEvent.contentSize.height || 0;
              setInputScrollEnabled(contentH > MAX_INPUT_HEIGHT || inputScrollEnabled);
            }}
          />
          
          <Pressable style={({ pressed }) => [styles.sendButton as any, pressed && { opacity: 0.8 }]} onPress={send} disabled={sending || !model}>
            <ThemedText style={styles.sendIcon as any}>↑</ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );

  function getModelDisplayName(modelId: string) {
    const parts = modelId.split('/');
    return parts[parts.length - 1];
  }
}

const styles = StyleSheet.create({
  // ============ CONTAINER ============
  container: { 
    flex: 1, 
    backgroundColor: '#0a0e11',
    display: 'flex',
    flexDirection: 'column',
  },

  // ============ HEADER ============
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46, 166, 191, 0.08)',
    backgroundColor: 'rgba(10, 14, 17, 0.8)',
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },

  headerModel: {
    fontSize: 13,
    color: '#6db5d1',
    fontWeight: '500',
  },

  // ============ MESSAGE AREA ============
  msgRow: { 
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  
  userRow: { 
    alignItems: 'flex-end', 
  },
  
  assistantRow: { 
    alignItems: 'flex-start',
  },
  
  // ============ MESSAGE BUBBLES - Premium Design ============
  bubble: { 
    maxWidth: '85%', 
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    marginVertical: 6,
  },
  
  // User bubble - clean, elevated
  userBubble: { 
    backgroundColor: '#2ea6bf',
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  
  // Assistant bubble - subtle depth, soft border
  assistantBubble: { 
    backgroundColor: 'rgba(26, 35, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.1)',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  
  typingBubble: { 
    backgroundColor: 'rgba(26, 35, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.1)',
  },

  // ============ ERROR DISPLAY ============
  errorContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
  },

  errorText: {
    color: '#ff6b6b',
    fontSize: 12,
    lineHeight: 16,
  },
  
  // ============ INPUT AREA - Floating Pill Design ============
  inputRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    backgroundColor: '#0a0e11',
  },
  
  // Floating input container with premium elevation
  inputWrapper: { 
    flex: 1, 
    position: 'relative', 
    backgroundColor: 'rgba(26, 35, 42, 0.8)',
    borderRadius: 24, // pill-shaped
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.15)',
    overflow: 'hidden',
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  
  // Input field - clean, calm
  input: { 
    color: '#e8e9eb', 
    paddingLeft: 18,
    paddingRight: 90,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 40,
    maxHeight: 200,
    fontSize: 13,
    lineHeight: 18,
  },
  
  // ============ CODE BLOCKS - Premium Presentation ============
  codeContainer: { 
    marginVertical: 10, 
    backgroundColor: 'rgba(15, 19, 23, 0.6)',
    borderRadius: 12,
    borderWidth: 1, 
    borderColor: 'rgba(46, 166, 191, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  
  codeHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(20, 25, 30, 0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46, 166, 191, 0.1)',
  },
  
  codeLabel: { 
    color: '#6db5d1', 
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(46, 166, 191, 0.1)',
    borderWidth: 0.8,
    borderColor: 'rgba(46, 166, 191, 0.25)',
  },
  
  copyButton: { 
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(46, 166, 191, 0.1)',
  },
  
  copyIcon: { 
    color: '#6db5d1', 
    fontSize: 11,
    fontWeight: '600',
  },
  
  codeBlock: { 
    fontFamily: 'monospace', 
    backgroundColor: 'rgba(20, 25, 30, 0.7)',
    color: '#e8e9eb', 
    padding: 14,
    fontSize: 11,
    lineHeight: 15,
  },
  
  // ============ MARKDOWN TYPOGRAPHY - Refined Hierarchy ============
  h1: { 
    fontSize: 20, 
    fontWeight: '700', 
    marginBottom: 12,
    marginTop: 6,
    color: '#ffffff',
    lineHeight: 26,
  },
  
  h2: { 
    fontSize: 17, 
    fontWeight: '700', 
    marginBottom: 10,
    marginTop: 4,
    color: '#ffffff',
    lineHeight: 23,
  },
  
  h3: { 
    fontSize: 15, 
    fontWeight: '600', 
    marginBottom: 8,
    marginTop: 3,
    color: '#ffffff',
    lineHeight: 20,
  },
  
  // ============ TABLES ============
  table: { 
    borderWidth: 1, 
    borderColor: 'rgba(46, 166, 191, 0.1)', 
    borderRadius: 10, 
    overflow: 'hidden', 
    marginVertical: 10,
  },
  
  tableRow: { 
    flexDirection: 'row' 
  },
  
  tableCell: { 
    flex: 1, 
    padding: 11,
    borderRightWidth: 1, 
    borderRightColor: 'rgba(46, 166, 191, 0.08)',
    backgroundColor: 'rgba(26, 35, 42, 0.5)',
  },
  
  tableHeaderCell: { 
    backgroundColor: 'rgba(20, 25, 30, 0.8)',
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46, 166, 191, 0.12)',
  },
  
  tableCellText: { 
    color: '#e8e9eb',
    fontSize: 12,
    lineHeight: 16,
  },
  
  tableHeaderText: { 
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
  
  // ============ MODAL OVERLAY ============
  overlay: { 
    position: 'absolute', 
    left: 0, 
    right: 0, 
    top: 0, 
    bottom: 0, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20,
    backgroundColor: 'rgba(10, 14, 17, 0.6)',
  },
  
  card: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: 'rgba(26, 35, 42, 0.95)',
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.12)',
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  
  link: { 
    textDecorationLine: 'none' 
  },
  
  primaryButton: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: '#2ea6bf',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  
  primaryButtonText: {
    color: '#022022',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  
  // ============ MESSAGE BUBBLES - Premium Design ============
  bubble: { 
    maxWidth: '85%', 
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    marginVertical: 6,
  },
  
  // User bubble - clean, elevated
  userBubble: { 
    backgroundColor: '#2ea6bf',
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  
  // Assistant bubble - subtle depth, soft border
  assistantBubble: { 
    backgroundColor: 'rgba(26, 35, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.1)',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  
  typingBubble: { 
    backgroundColor: 'rgba(26, 35, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.1)',
  },
  
  // ============ INPUT AREA - Floating Pill Design ============
  inputRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    backgroundColor: '#0a0e11',
  },
  
  // Floating input container with premium elevation
  inputWrapper: { 
    flex: 1, 
    position: 'relative', 
    backgroundColor: 'rgba(26, 35, 42, 0.8)',
    borderRadius: 24, // pill-shaped
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.15)',
    overflow: 'hidden',
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  
  // Input field - clean, calm
  input: { 
    color: '#e8e9eb', 
    paddingLeft: 18,
    paddingRight: 90,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 40,
    maxHeight: 200,
    fontSize: 13,
    lineHeight: 18,
  },
  
  // Send button - minimal, premium
  sendButton: { 
    position: 'absolute', 
    right: 8, 
    top: '50%',
    marginTop: -18,
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: '#2ea6bf', 
    alignItems: 'center', 
    justifyContent: 'center', 
    zIndex: 2,
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  
  sendIcon: { 
    color: '#022022', 
    fontSize: 16,
    fontWeight: '700',
  },
  
  // ============ CODE BLOCKS - Premium Presentation ============
  codeContainer: { 
    marginVertical: 10, 
    backgroundColor: 'rgba(15, 19, 23, 0.6)',
    borderRadius: 12,
    borderWidth: 1, 
    borderColor: 'rgba(46, 166, 191, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  
  codeHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(20, 25, 30, 0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46, 166, 191, 0.1)',
  },
  
  codeLabel: { 
    color: '#6db5d1', 
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(46, 166, 191, 0.1)',
    borderWidth: 0.8,
    borderColor: 'rgba(46, 166, 191, 0.25)',
  },
  
  copyButton: { 
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(46, 166, 191, 0.1)',
  },
  
  copyIcon: { 
    color: '#6db5d1', 
    fontSize: 11,
    fontWeight: '600',
  },
  
  codeBlock: { 
    fontFamily: 'monospace', 
    backgroundColor: 'rgba(20, 25, 30, 0.7)',
    color: '#e8e9eb', 
    padding: 14,
    fontSize: 11,
    lineHeight: 15,
  },
  
  // ============ MARKDOWN TYPOGRAPHY - Refined Hierarchy ============
  h1: { 
    fontSize: 20, 
    fontWeight: '700', 
    marginBottom: 12,
    marginTop: 6,
    color: '#ffffff',
    lineHeight: 26,
  },
  
  h2: { 
    fontSize: 17, 
    fontWeight: '700', 
    marginBottom: 10,
    marginTop: 4,
    color: '#ffffff',
    lineHeight: 23,
  },
  
  h3: { 
    fontSize: 15, 
    fontWeight: '600', 
    marginBottom: 8,
    marginTop: 3,
    color: '#ffffff',
    lineHeight: 20,
  },
  
  // ============ TABLES ============
  table: { 
    borderWidth: 1, 
    borderColor: 'rgba(46, 166, 191, 0.1)', 
    borderRadius: 10, 
    overflow: 'hidden', 
    marginVertical: 10,
  },
  
  tableRow: { 
    flexDirection: 'row' 
  },
  
  tableCell: { 
    flex: 1, 
    padding: 11,
    borderRightWidth: 1, 
    borderRightColor: 'rgba(46, 166, 191, 0.08)',
    backgroundColor: 'rgba(26, 35, 42, 0.5)',
  },
  
  tableHeaderCell: { 
    backgroundColor: 'rgba(20, 25, 30, 0.8)',
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46, 166, 191, 0.12)',
  },
  
  tableCellText: { 
    color: '#e8e9eb',
    fontSize: 12,
    lineHeight: 16,
  },
  
  tableHeaderText: { 
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
  
  // ============ MODAL OVERLAY ============
  overlay: { 
    position: 'absolute', 
    left: 0, 
    right: 0, 
    top: 0, 
    bottom: 0, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20,
    backgroundColor: 'rgba(10, 14, 17, 0.6)',
  },
  
  card: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: 'rgba(26, 35, 42, 0.95)',
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(46, 166, 191, 0.12)',
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  
  link: { 
    textDecorationLine: 'none' 
  },
  
  primaryButton: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: '#2ea6bf',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2ea6bf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  
  primaryButtonText: {
    color: '#022022',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
