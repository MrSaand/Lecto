import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ScrollView,
  Share,
  Alert,
  useColorScheme,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useRecordings, Recording } from "@/contexts/RecordingsContext";
import Animated, { FadeIn, FadeInDown, FadeInRight } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { fetch } from "expo/fetch";
import { getApiUrl } from "@/lib/query-client";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

type Tab = "summary" | "transcript" | "chat";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let msgCounter = 0;
function genId() {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).substr(2,9)}`;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const SPEAKER_COLORS = [Colors.coral, Colors.mint, Colors.indigo, Colors.indigoLight, Colors.coralLight, Colors.mintLight];

function getSpeakerColor(speaker: string, allSpeakers: string[]) {
  const idx = allSpeakers.indexOf(speaker);
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

export default function DetailScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recordings, deleteRecording } = useRecordings();
  const recording = recordings.find((r) => r.id === id);

  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleDelete = () => {
    Alert.alert("Delete Recording", "This recording will be permanently deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteRecording(id);
          router.back();
        },
      },
    ]);
  };

  const handleShare = async () => {
    if (!recording) return;
    const summaryText = recording.summary.map((s, i) => `• ${s}`).join("\n");
    const actionText = recording.actionItems.map((a) => `[${a.speaker}] ${a.task}`).join("\n");
    const transcriptText = recording.transcript.map((t) => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join("\n\n");

    const content = `# ${recording.title}\n${formatDate(recording.date)} · ${formatTime(recording.duration)}\n\n## Summary\n${summaryText}\n\n## Action Items\n${actionText}\n\n## Transcript\n${transcriptText}`;

    try {
      await Share.share({ message: content, title: recording.title });
    } catch (e) {
      console.error("Share error:", e);
    }
  };

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || isStreaming || !recording) return;

    const userText = chatInput.trim();
    const currentMessages = [...chatMessages];
    setChatInput("");
    setIsStreaming(true);
    setShowTyping(true);

    const userMsg: ChatMessage = { id: genId(), role: "user", content: userText };
    setChatMessages((prev) => [...prev, userMsg]);

    const context = `Title: ${recording.title}\n\nSummary:\n${recording.summary.join("\n")}\n\nAction Items:\n${recording.actionItems.map((a) => `${a.speaker}: ${a.task}`).join("\n")}\n\nTranscript:\n${recording.transcript.map((t) => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join("\n")}`;

    const baseUrl = getApiUrl();
    let fullContent = "";
    let assistantAdded = false;

    try {
      const chatHistory = [
        ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userText },
      ];

      const response = await fetch(`${baseUrl}api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ messages: chatHistory, context }),
      });

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
              if (!assistantAdded) {
                setShowTyping(false);
                setChatMessages((prev) => [...prev, { id: genId(), role: "assistant", content: fullContent }]);
                assistantAdded = true;
              } else {
                setChatMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullContent };
                  return updated;
                });
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      setShowTyping(false);
      setChatMessages((prev) => [...prev, { id: genId(), role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }, [chatInput, chatMessages, isStreaming, recording]);

  if (!recording) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textTertiary} />
        <Text style={[styles.notFound, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>Recording not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.card }]}>
          <Text style={{ color: Colors.indigo, fontFamily: "DMSans_500Medium" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]} numberOfLines={1}>
            {recording.title}
          </Text>
          <Text style={[styles.headerSub, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>
            {formatDate(recording.date)} · {formatTime(recording.duration)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={handleShare} style={styles.headerBtn}>
            <Ionicons name="share-outline" size={22} color={Colors.indigo} />
          </Pressable>
          <Pressable onPress={handleDelete} style={styles.headerBtn}>
            <Feather name="trash-2" size={20} color={Colors.coral} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        {(["summary", "transcript", "chat"] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = { summary: "Summary", transcript: "Transcript", chat: "Chat" };
          const icons: Record<Tab, string> = { summary: "list", transcript: "document-text", chat: "chatbubbles" };
          const isActive = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                setActiveTab(tab);
                Haptics.selectionAsync();
              }}
              style={[styles.tab, isActive && { borderBottomColor: Colors.coral, borderBottomWidth: 2.5 }]}
            >
              <Ionicons
                name={icons[tab] as any}
                size={16}
                color={isActive ? Colors.coral : theme.textTertiary}
              />
              <Text style={[styles.tabLabel, { color: isActive ? Colors.coral : theme.textTertiary, fontFamily: isActive ? "DMSans_700Bold" : "DMSans_400Regular" }]}>
                {labels[tab]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === "summary" && (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 20 }]} showsVerticalScrollIndicator={false}>
          {recording.keyTopics.length > 0 && (
            <Animated.View entering={FadeInDown.delay(50)} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Key Topics</Text>
              <View style={styles.topicChips}>
                {recording.keyTopics.map((t, i) => (
                  <View key={i} style={[styles.topicChip, { backgroundColor: Colors.indigo + "16" }]}>
                    <Text style={[styles.topicChipText, { color: Colors.indigo, fontFamily: "DMSans_500Medium" }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {recording.speakers.length > 0 && (
            <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Speakers</Text>
              <View style={styles.speakerGrid}>
                {recording.speakers.map((speaker, i) => {
                  const color = getSpeakerColor(speaker, recording.speakers);
                  return (
                    <View key={i} style={[styles.speakerCard, { backgroundColor: color + "16", borderColor: color + "30" }]}>
                      <View style={[styles.speakerAvatar, { backgroundColor: color }]}>
                        <Text style={[styles.speakerInitial, { fontFamily: "DMSans_700Bold" }]}>
                          {speaker.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.speakerName, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>{speaker}</Text>
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(150)} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Summary</Text>
            <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {recording.summary.map((point, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.mint }]} />
                  <Text style={[styles.bulletText, { color: theme.text, fontFamily: "DMSans_400Regular" }]}>{point}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {recording.actionItems.length > 0 && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Action Items</Text>
              <View style={styles.actionList}>
                {recording.actionItems.map((item, i) => {
                  const color = getSpeakerColor(item.speaker, recording.speakers);
                  return (
                    <View key={i} style={[styles.actionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.actionIcon, { backgroundColor: color + "18" }]}>
                        <Ionicons name="checkmark-circle-outline" size={18} color={color} />
                      </View>
                      <View style={styles.actionContent}>
                        <Text style={[styles.actionSpeaker, { color, fontFamily: "DMSans_700Bold" }]}>{item.speaker}</Text>
                        <Text style={[styles.actionTask, { color: theme.text, fontFamily: "DMSans_400Regular" }]}>{item.task}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {activeTab === "transcript" && (
        <FlatList
          data={recording.transcript}
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 20 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const color = getSpeakerColor(item.speaker, recording.speakers);
            const isEven = index % 2 === 0;
            return (
              <Animated.View entering={FadeInRight.delay(index * 30).springify()} style={[styles.transcriptBlock, { backgroundColor: theme.card, borderLeftColor: color, borderColor: theme.border }]}>
                <View style={styles.transcriptHeader}>
                  <View style={[styles.transcriptSpeakerPill, { backgroundColor: color + "20" }]}>
                    <View style={[styles.speakerDot, { backgroundColor: color }]} />
                    <Text style={[styles.transcriptSpeaker, { color, fontFamily: "DMSans_700Bold" }]}>{item.speaker}</Text>
                  </View>
                  <Text style={[styles.transcriptTimestamp, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>{item.timestamp}</Text>
                </View>
                <Text style={[styles.transcriptText, { color: theme.text, fontFamily: "DMSans_400Regular" }]}>{item.text}</Text>
              </Animated.View>
            );
          }}
        />
      )}

      {activeTab === "chat" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
          <FlatList
            data={[...chatMessages].reverse()}
            keyExtractor={(item) => item.id}
            inverted={chatMessages.length > 0}
            contentContainerStyle={[styles.chatList, { paddingBottom: 12 }]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              showTyping ? (
                <View style={[styles.typingBubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.typingDot, { backgroundColor: Colors.indigo }]} />
                  <View style={[styles.typingDot, { backgroundColor: Colors.indigo, opacity: 0.6 }]} />
                  <View style={[styles.typingDot, { backgroundColor: Colors.indigo, opacity: 0.3 }]} />
                </View>
              ) : null
            }
            ListFooterComponent={
              chatMessages.length === 0 ? (
                <View style={styles.chatEmpty}>
                  <View style={[styles.chatEmptyIcon, { backgroundColor: Colors.indigo + "16" }]}>
                    <Ionicons name="chatbubbles-outline" size={32} color={Colors.indigo} />
                  </View>
                  <Text style={[styles.chatEmptyTitle, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>Ask about your recording</Text>
                  <Text style={[styles.chatEmptyText, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                    "What were the main action items?"{"\n"}"Summarize Speaker 2's points"{"\n"}"What decisions were made?"
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isUser = item.role === "user";
              return (
                <View style={[styles.chatBubbleRow, isUser ? styles.chatBubbleRight : styles.chatBubbleLeft]}>
                  {!isUser && (
                    <View style={[styles.aiAvatar, { backgroundColor: Colors.indigo }]}>
                      <Ionicons name="sparkles" size={12} color="#fff" />
                    </View>
                  )}
                  <View style={[styles.chatBubble, isUser ? styles.userBubble : [styles.aiBubble, { backgroundColor: theme.card, borderColor: theme.border }]]}>
                    <Text style={[styles.chatText, { color: isUser ? "#fff" : theme.text, fontFamily: "DMSans_400Regular" }]}>
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={[styles.chatInputRow, { borderTopColor: theme.border, paddingBottom: bottomPadding + 8, backgroundColor: theme.background }]}>
            <TextInput
              ref={inputRef}
              style={[styles.chatInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border, fontFamily: "DMSans_400Regular" }]}
              placeholder="Ask about this recording..."
              placeholderTextColor={theme.textTertiary}
              value={chatInput}
              onChangeText={setChatInput}
              multiline
              blurOnSubmit={false}
              maxLength={500}
            />
            <Pressable
              onPress={() => {
                sendChatMessage();
                inputRef.current?.focus();
              }}
              disabled={!chatInput.trim() || isStreaming}
              style={[styles.sendBtn, { backgroundColor: Colors.coral, opacity: !chatInput.trim() || isStreaming ? 0.4 : 1 }]}
            >
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  notFound: { fontSize: 16 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    gap: 4,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    textAlign: "center",
  },
  headerSub: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  tabLabel: {
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    letterSpacing: -0.3,
  },
  topicChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  topicChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  topicChipText: {
    fontSize: 12,
  },
  speakerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  speakerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  speakerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  speakerInitial: {
    color: "#fff",
    fontSize: 13,
  },
  speakerName: {
    fontSize: 13,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: {
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  actionList: {
    gap: 10,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actionContent: {
    flex: 1,
    gap: 3,
  },
  actionSpeaker: {
    fontSize: 12,
  },
  actionTask: {
    fontSize: 14,
    lineHeight: 20,
  },
  transcriptBlock: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 14,
    gap: 8,
  },
  transcriptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transcriptSpeakerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  speakerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  transcriptSpeaker: {
    fontSize: 12,
  },
  transcriptTimestamp: {
    fontSize: 11,
  },
  transcriptText: {
    fontSize: 14,
    lineHeight: 22,
  },
  chatList: {
    paddingHorizontal: 14,
    gap: 10,
    flexGrow: 1,
  },
  chatBubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 6,
  },
  chatBubbleLeft: {
    justifyContent: "flex-start",
  },
  chatBubbleRight: {
    justifyContent: "flex-end",
  },
  aiAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chatBubble: {
    maxWidth: "75%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: Colors.coral,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  chatText: {
    fontSize: 14,
    lineHeight: 20,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chatEmpty: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  chatEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chatEmptyTitle: {
    fontSize: 18,
  },
  chatEmptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 24,
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
