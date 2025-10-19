import React, { useEffect, useState } from 'react';
import { Button, FlatList, StyleSheet, TextInput, View, Text, Pressable, Platform, Animated } from 'react-native';
let ExpoClipboard: any = null;
try {
  // require dynamically to avoid web type errors
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ExpoClipboard = require('expo-clipboard');
} catch (e) {
  ExpoClipboard = null;
}
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { createChatCompletion } from '@/src/lib/llmApi';
import { getSelectedModel, subscribeSelectedModel } from '@/src/lib/config';

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
    if (line.includes('|') && i + 1 < lines.length && /^\s*[:\-\|\s]+$/.test(lines[i + 1])) {
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
  // line-based sizing: start at 3 lines, grow/shrink by newlines up to 5 lines
  const MIN_LINES = 3;
  const MAX_LINES = 5;
  const LINE_HEIGHT = 18; // px per line (approx)
  const VERTICAL_PADDING = 8 + 8; // paddingTop + paddingBottom from styles
  const MIN_INPUT_HEIGHT = MIN_LINES * LINE_HEIGHT + VERTICAL_PADDING;
  const MAX_INPUT_HEIGHT = MAX_LINES * LINE_HEIGHT + VERTICAL_PADDING;
  const [inputHeight, setInputHeight] = useState<number>(MIN_INPUT_HEIGHT);
  const [inputScrollEnabled, setInputScrollEnabled] = useState(false);

  useEffect(() => {
    setMessages([{ role: 'system', content: `You are connected to model ${model ?? 'unknown'}` }]);
  }, [model]);

  useEffect(() => {
    const unsub = subscribeSelectedModel((m) => setModel(m));
    return unsub;
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

  

  return (
    <ThemedView style={styles.container as any}>
      <ThemedText type="title">Chat - {model ?? 'unknown'}</ThemedText>
      <FlatList
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.msgRow as any, item.role === 'user' ? styles.userRow as any : styles.assistantRow as any]}>
            <View style={[styles.bubble as any, item.role === 'user' ? styles.userBubble as any : styles.assistantBubble as any]}>
                <MarkdownText style={item.role === 'user' ? { color: '#ffffff' } : { color: '#ffffff' }}>{item.content}</MarkdownText>
              </View>
          </View>
        )}
      />

      {error && <ThemedText>{error}</ThemedText>}

      {sending && (
        <View style={[styles.msgRow as any, styles.assistantRow as any]}>
          <View style={[styles.bubble as any, styles.assistantBubble as any]}>
            <TypingIndicator />
          </View>
        </View>
      )}

  <View style={styles.inputRow as any}>
        <View style={styles.inputWrapper as any}>
          <TextInput
            placeholder="Type your message..."
            placeholderTextColor="#ffffff"
            value={input}
            multiline
            onChangeText={(text) => {
              setInput(text);
              // count explicit newline characters as lines
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
              // keep scroll enabled if content exceeds max height (handles wrapped text on some platforms)
              const contentH = e.nativeEvent.contentSize.height || 0;
              setInputScrollEnabled(contentH > MAX_INPUT_HEIGHT || inputScrollEnabled);
            }}
          />
          
          <Pressable style={styles.sendButton as any} onPress={send} disabled={sending}>
            {Platform.OS === 'web' ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="22" height="22" fill="currentColor" style={{ color: '#2a2e30' }}>
                <path d="M38.4 58.9v7.1c0 2.2 1.8 3.9 3.9 3.9L57.6 58v28.7c0 2.2 2.3 3.2 4.4 3.2h4c2.2 0 3.9-1.8 3.9-3.9V58l15.8 11.9c2.2 0 3.9-1.8 3.9-3.9v-7.1L64 32.2 38.4 58.9z" />
              </svg>
            ) : (
              <Text style={styles.sendIcon as any}>{'▶'}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  msgRow: { paddingVertical: 8 },
  userRow: { alignItems: 'flex-end', paddingRight: 8 },
  assistantRow: { alignItems: 'flex-start', paddingLeft: 8 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 999, marginVertical: 6 },
  // messenger-like blue for user's bubble
  userBubble: { backgroundColor: '#0084FF', alignSelf: 'flex-end', borderTopRightRadius: 4 },
  assistantBubble: { backgroundColor: 'transparent', alignSelf: 'flex-start' },
  typingBubble: { backgroundColor: 'transparent' },
  
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 18, paddingHorizontal: 8 },
  // slightly lighter/teal-tinged input background to stand out from overall page background
  inputWrapper: { flex: 1, position: 'relative', backgroundColor: '#263238', borderRadius: 20, padding: 0, maxWidth: '100%' },
  // slightly increased padding for better touch target and visual spacing
  input: { color: '#ffffff', paddingLeft: 16, paddingRight: 84, paddingTop: 10, paddingBottom: 10, minHeight: 36, maxHeight: 200 },
  sendButton: { position: 'absolute', right: 10, bottom: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: '#cfcfcf', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  sendIcon: { color: '#2a2e30', transform: [{ rotate: '270deg' }] },
  // darker surrounding box for code blocks
  codeContainer: { marginVertical: 8, backgroundColor: '#0f1112', borderRadius: 8, borderWidth: 1, borderColor: '#2e3334', padding: 8 },
  codeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  codeLabel: { color: '#fff', fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#3a3f40', backgroundColor: '#232728' },
  copyButton: { padding: 6, borderRadius: 6, backgroundColor: '#2e3334' },
  copyIcon: { color: '#fff', fontSize: 12 },
  codeBlock: { fontFamily: 'monospace', backgroundColor: '#2a2e30', color: '#ffffff', padding: 12, borderRadius: 6 },
  h1: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#fff' },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#fff' },
  h3: { fontSize: 15, fontWeight: '700', marginBottom: 6, color: '#fff' },
  table: { borderWidth: 1, borderColor: '#2e3334', borderRadius: 6, overflow: 'hidden', marginVertical: 8 },
  tableRow: { flexDirection: 'row' },
  tableCell: { flex: 1, padding: 8, borderRightWidth: 1, borderRightColor: '#5e696bff', backgroundColor: '#2a2e30' },
  tableHeaderCell: { backgroundColor: '#181818', fontWeight: '700' },
  tableCellText: { color: '#e6e6e6' },
  tableHeaderText: { color: '#fff' },
});
