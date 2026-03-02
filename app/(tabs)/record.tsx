import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useRecordings } from "@/contexts/RecordingsContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import * as FileSystem from "expo-file-system";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  interpolate,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { router } from "expo-router";

type RecordState = "idle" | "recording" | "paused" | "processing";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function PulseRing({ active }: { active: boolean }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(withTiming(1.8, { duration: 1200 }), -1, true);
      opacity.value = withRepeat(withTiming(0, { duration: 1200 }), -1, true);
      opacity.value = 0.5;
    } else {
      scale.value = withSpring(1);
      opacity.value = withTiming(0);
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.pulseRing, style]} />;
}

export default function RecordScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { addRecording } = useRecordings();

  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  const buttonScale = useSharedValue(1);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const requestPermission = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    return status === "granted";
  };

  const startRecording = async () => {
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert("Permission Required", "Microphone access is needed to record audio.");
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      elapsedRef.current = 0;
      setElapsed(0);
      setRecordState("recording");
      startTimer();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.error("Start recording error:", e);
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const pauseRecording = async () => {
    try {
      await recordingRef.current?.pauseAsync();
      setRecordState("paused");
      stopTimer();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      console.error("Pause error:", e);
    }
  };

  const resumeRecording = async () => {
    try {
      await recordingRef.current?.startAsync();
      setRecordState("recording");
      startTimer();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      console.error("Resume error:", e);
    }
  };

  const stopAndProcess = async () => {
    if (!recordingRef.current) return;

    try {
      setRecordState("processing");
      stopTimer();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error("No recording URI");

      setStatusMsg("Uploading audio...");
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const filename = uri.split("/").pop() || "recording.m4a";
      setStatusMsg("Transcribing with AI...");

      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, filename }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Transcription failed");
      }

      setStatusMsg("Generating summary...");
      const data = await response.json();

      const newRecording = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: data.title || "Untitled Recording",
        date: new Date().toISOString(),
        duration: elapsedRef.current,
        summary: data.summary || [],
        actionItems: data.actionItems || [],
        speakers: data.speakers || ["Speaker 1"],
        transcript: data.transcript || [],
        rawTranscript: data.rawTranscript || "",
        keyTopics: data.keyTopics || [],
      };

      await addRecording(newRecording);
      setRecordState("idle");
      setElapsed(0);
      elapsedRef.current = 0;
      setStatusMsg("");

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: "/detail/[id]", params: { id: newRecording.id } });
    } catch (e: any) {
      console.error("Stop error:", e);
      setRecordState("idle");
      setStatusMsg("");
      Alert.alert("Error", e.message || "Could not process recording.");
    }
  };

  const handleRecordPress = () => {
    buttonScale.value = withSpring(0.92, {}, () => {
      buttonScale.value = withSpring(1);
    });
    if (recordState === "idle") startRecording();
    else if (recordState === "recording") pauseRecording();
    else if (recordState === "paused") resumeRecording();
  };

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const isActive = recordState === "recording";
  const isPaused = recordState === "paused";
  const isProcessing = recordState === "processing";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 84 : insets.bottom + 70;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPadding + 20, paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(500)}>
          <Text style={[styles.header, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
            {isProcessing ? "Processing..." : isActive ? "Recording" : isPaused ? "Paused" : "New Recording"}
          </Text>
          <Text style={[styles.subheader, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
            {isProcessing
              ? statusMsg
              : isActive
              ? "Speak clearly — Lecto is capturing every word"
              : isPaused
              ? "Tap to resume recording"
              : "Tap the button below to start recording"}
          </Text>
        </Animated.View>

        <View style={styles.timerSection}>
          <Text style={[styles.timer, { color: isActive ? Colors.coral : isPaused ? Colors.indigo : theme.textTertiary, fontFamily: "DMSans_700Bold" }]}>
            {formatTime(elapsed)}
          </Text>
          {isActive && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={[styles.liveText, { fontFamily: "DMSans_700Bold" }]}>LIVE</Text>
            </Animated.View>
          )}
        </View>

        <View style={styles.buttonArea}>
          <View style={styles.pulseContainer}>
            <PulseRing active={isActive} />
            <Animated.View style={buttonStyle}>
              <Pressable
                onPress={handleRecordPress}
                disabled={isProcessing}
                style={[
                  styles.recordButton,
                  {
                    backgroundColor: isActive ? Colors.coral : isPaused ? Colors.indigo : Colors.coral,
                    opacity: isProcessing ? 0.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={isActive ? "pause" : isPaused ? "play" : "mic"}
                  size={36}
                  color="#fff"
                />
              </Pressable>
            </Animated.View>
          </View>

          {(isActive || isPaused) && !isProcessing && (
            <Animated.View entering={FadeIn.delay(100)} style={styles.controls}>
              <Pressable
                onPress={stopAndProcess}
                style={[styles.stopButton, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <Ionicons name="stop" size={22} color={theme.text} />
                <Text style={[styles.stopLabel, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>
                  Stop & Process
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {isProcessing && (
            <Animated.View entering={FadeIn} style={styles.processingInfo}>
              <View style={[styles.processingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="sparkles" size={18} color={Colors.mint} />
                <Text style={[styles.processingText, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                  {statusMsg}
                </Text>
              </View>
            </Animated.View>
          )}
        </View>

        {recordState === "idle" && (
          <Animated.View entering={FadeIn.delay(300)} style={styles.featureList}>
            {[
              { icon: "people-outline", text: "Speaker identification & attribution", color: Colors.coral },
              { icon: "document-text-outline", text: "AI-generated summary & action items", color: Colors.mint },
              { icon: "chatbubbles-outline", text: "Chat with your recording using AI", color: Colors.indigo },
              { icon: "share-outline", text: "One-tap share as PDF or text", color: Colors.indigoLight },
            ].map((f, i) => (
              <View key={i} style={[styles.featureRow, { borderBottomColor: theme.border }]}>
                <View style={[styles.featureIconWrap, { backgroundColor: f.color + "18" }]}>
                  <Ionicons name={f.icon as any} size={18} color={f.color} />
                </View>
                <Text style={[styles.featureText, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                  {f.text}
                </Text>
              </View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 28,
  },
  header: {
    fontSize: 28,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subheader: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  timerSection: {
    alignItems: "center",
    gap: 12,
  },
  timer: {
    fontSize: 56,
    letterSpacing: 2,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.coral + "22",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.coral,
  },
  liveText: {
    fontSize: 11,
    color: Colors.coral,
    letterSpacing: 1.5,
  },
  buttonArea: {
    alignItems: "center",
    gap: 28,
    width: "100%",
  },
  pulseContainer: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.coral,
  },
  recordButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.coral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  controls: {
    width: "100%",
    alignItems: "center",
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 50,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stopLabel: {
    fontSize: 15,
  },
  processingInfo: {
    width: "100%",
  },
  processingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  processingText: {
    fontSize: 14,
    flex: 1,
  },
  featureList: {
    width: "100%",
    gap: 0,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
