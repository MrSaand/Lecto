import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
  Platform,
  Alert,
  ScrollView,
  AppState,
  AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useRecordings } from "@/contexts/RecordingsContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useSubscription, FREE_RECORDING_LIMIT } from "@/contexts/SubscriptionContext";
import Paywall from "@/components/Paywall";
import { getApiUrl } from "@/lib/query-client";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAudioRecorder, setAudioModeAsync, AudioModule, IOSOutputFormat, AudioQuality, type RecordingOptions } from "expo-audio";
import { router } from "expo-router";

const PENDING_KEY = "@lecto_pending_lecture";
const ACTION_ITEMS_KEY = "@lecto_want_action_items";
const TRANSCRIBE_CHUNK_TIMEOUT_MS = 4 * 60 * 1000;  // 4 min per chunk
const ANALYZE_TIMEOUT_MS = 3 * 60 * 1000;            // 3 min for GPT-4o analysis
const CHUNK_INTERVAL_MS = 90 * 60 * 1000;            // auto-chunk every 90 minutes
const MAX_DURATION_S = 6 * 60 * 60;                  // hard stop at 6 hours

// Speech-optimized recording: 32 kbps, 16 kHz, mono — 4× smaller than HIGH_QUALITY
// Whisper resamples to 16 kHz internally anyway; accuracy is identical
const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: "audio/webm", bitsPerSecond: 32000 },
};

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

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
      opacity.value = 0.5;
      opacity.value = withRepeat(withTiming(0, { duration: 1200 }), -1, true);
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
  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const { addRecording, recordings } = useRecordings();
  const { language } = useSettings();
  const { isSubscribed } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);

  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [wantActionItems, setWantActionItems] = useState(true);
  const [processingEtaSecs, setProcessingEtaSecs] = useState(-1);

  // Web recording refs
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const etaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chunked recording refs
  const nativeChunksRef = useRef<string[]>([]);   // URIs of completed chunks
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isChunkingRef = useRef(false);             // prevent overlapping auto-chunks

  const buttonScale = useSharedValue(1);

  const stopChunkInterval = () => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
  };

  const startTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_DURATION_S) {
        stopTimer();
        stopChunkInterval();
        stopAndProcess();
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startEtaCountdown = (etaSecs: number) => {
    setProcessingEtaSecs(etaSecs);
    let remaining = etaSecs;
    if (etaTimerRef.current) clearInterval(etaTimerRef.current);
    etaTimerRef.current = setInterval(() => {
      remaining -= 1;
      setProcessingEtaSecs(Math.max(0, remaining));
    }, 1000);
  };

  const stopEtaCountdown = () => {
    if (etaTimerRef.current) {
      clearInterval(etaTimerRef.current);
      etaTimerRef.current = null;
    }
    setProcessingEtaSecs(-1);
  };

  const toggleActionItems = () => {
    setWantActionItems(prev => {
      const next = !prev;
      AsyncStorage.setItem(ACTION_ITEMS_KEY, String(next));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return next;
    });
  };

  useEffect(() => () => { stopTimer(); stopChunkInterval(); stopEtaCountdown(); }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    AsyncStorage.getItem(ACTION_ITEMS_KEY).then(val => {
      if (val !== null) setWantActionItems(val === "true");
    });
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    async function setupAudioMode() {
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: true,
          playsInSilentMode: true,
        });
      } catch (e) {
        console.warn("Audio mode setup failed:", e);
      }
    }
    setupAudioMode();
  }, []);

  // Track background entry time so we can restore the elapsed timer on foreground
  const recordStateRef = useRef<RecordState>("idle");
  recordStateRef.current = recordState;
  const backgroundAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", async (next: AppStateStatus) => {
      const state = recordStateRef.current;
      if (next === "background" || next === "inactive") {
        if (state === "recording") {
          backgroundAtRef.current = Date.now();
          stopTimer();
        }
      } else if (next === "active") {
        if (state === "recording") {
          if (backgroundAtRef.current !== null) {
            const secondsInBackground = Math.round((Date.now() - backgroundAtRef.current) / 1000);
            elapsedRef.current += secondsInBackground;
            setElapsed(elapsedRef.current);
            backgroundAtRef.current = null;
          }
          startTimer();
          try { await activateKeepAwakeAsync(); } catch {}
        }
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Web recording via MediaRecorder ───────────────────────────────────────
  const startWebRecording = async () => {
    try {
      const stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });

      // Pick the best supported MIME type that OpenAI Whisper accepts
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const MR = (window as any).MediaRecorder;
      const mimeType = preferredTypes.find((t) => MR.isTypeSupported(t)) || "";

      const mediaRecorder = mimeType ? new MR(stream, { mimeType }) : new MR(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e: any) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.start(250); // collect every 250ms for more reliable chunks
      elapsedRef.current = 0;
      setElapsed(0);
      setRecordState("recording");
      startTimer();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      Alert.alert("Permission Required", "Microphone access is needed to record audio.");
    }
  };

  const pauseWebRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setRecordState("paused");
      stopTimer();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const resumeWebRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setRecordState("recording");
      startTimer();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const stopWebRecording = (): Promise<{ base64: string; filename: string }> => {
    return new Promise((resolve, reject) => {
      const mr = mediaRecorderRef.current;
      if (!mr) return reject(new Error("No recorder"));

      // Request final chunk before stopping
      if (mr.state === "recording" || mr.state === "paused") {
        try { mr.requestData(); } catch {}
      }

      mr.onstop = async () => {
        try {
          mr.stream.getTracks().forEach((t: any) => t.stop());

          const mimeType = mr.mimeType || "audio/webm";
          const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";

          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          if (blob.size === 0) return reject(new Error("Recording is empty — please record again"));

          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(",")[1];
            resolve({ base64, filename: `recording.${ext}` });
          };
          reader.onerror = () => reject(new Error("Failed to read audio"));
          reader.readAsDataURL(blob);
        } catch (e) {
          reject(e);
        }
      };
      mr.stop();
    });
  };

  // ─── Pending lecture recovery ───────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;
    AsyncStorage.getItem(PENDING_KEY).then(async (val) => {
      if (!val) return;
      try {
        const pending = JSON.parse(val);
        // Support both new { uris: [] } and legacy { uri: "" } formats
        const urisToCheck: string[] = pending.uris ?? (pending.uri ? [pending.uri] : []);
        if (urisToCheck.length === 0) {
          await AsyncStorage.removeItem(PENDING_KEY);
          return;
        }
        const info = await FileSystem.getInfoAsync(urisToCheck[0]);
        if (!info.exists) {
          await AsyncStorage.removeItem(PENDING_KEY);
          return;
        }
        Alert.alert(
          "Unfinished Lecture",
          "A previous lecture was interrupted before it could be saved. Would you like to finish processing it?",
          [
            {
              text: "Discard",
              style: "destructive",
              onPress: async () => {
                await AsyncStorage.removeItem(PENDING_KEY);
                for (const u of urisToCheck) {
                  try { await FileSystem.deleteAsync(u, { idempotent: true }); } catch {}
                }
              },
            },
            { text: "Finish", onPress: () => retryPendingLecture(pending) },
          ],
          { cancelable: false }
        );
      } catch {
        await AsyncStorage.removeItem(PENDING_KEY);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transcribe a single chunk, return raw transcript text
  const transcribeChunk = async (
    uri: string,
    index: number,
    total: number,
    lang: string,
    baseUrl: string
  ): Promise<string> => {
    setStatusMsg(`Transcribing part ${index + 1} of ${total}...`);
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    const filename = uri.split("/").pop() || "recording.m4a";
    let resp: Response;
    try {
      resp = await fetchWithTimeout(
        `${baseUrl}api/transcribe-chunk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64, filename, language: lang }),
        },
        TRANSCRIBE_CHUNK_TIMEOUT_MS
      );
    } catch (e: any) {
      if (e?.name === "AbortError") throw new Error(`Part ${index + 1} timed out. Please retry.`);
      throw new Error("Could not reach the server. Check your connection.");
    }
    if (!resp.ok) {
      let msg = "Transcription failed";
      try { msg = (await resp.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    const data = await resp.json();
    return data.rawTranscript || "";
  };

  // Analyze combined transcript text → structured notes
  const analyzeTranscript = async (rawTranscript: string, lang: string, baseUrl: string, includeActionItems = true) => {
    setStatusMsg("Generating notes...");
    let resp: Response;
    try {
      resp = await fetchWithTimeout(
        `${baseUrl}api/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawTranscript, language: lang, includeActionItems }),
        },
        ANALYZE_TIMEOUT_MS
      );
    } catch (e: any) {
      if (e?.name === "AbortError") throw new Error("Analysis timed out. Please retry.");
      throw new Error("Could not reach the server. Check your connection.");
    }
    if (!resp.ok) {
      let msg = "Analysis failed";
      try { msg = (await resp.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return resp.json();
  };

  const retryPendingLecture = async (pending: {
    uris?: string[];
    uri?: string;          // legacy single-file format
    duration: number;
    date: string;
    language: string;
  }) => {
    try {
      setRecordState("processing");
      setStatusMsg("Resuming previous lecture...");
      await activateKeepAwakeAsync();

      const etaSecs = Math.max(30, Math.ceil(pending.duration / 15)) + 25;
      startEtaCountdown(etaSecs);

      const uris = pending.uris ?? (pending.uri ? [pending.uri] : []);
      const baseUrl = getApiUrl();

      const transcripts: string[] = [];
      for (let i = 0; i < uris.length; i++) {
        const t = await transcribeChunk(uris[i], i, uris.length, pending.language, baseUrl);
        transcripts.push(t);
      }
      const rawTranscript = transcripts.join("\n\n");
      const data = await analyzeTranscript(rawTranscript, pending.language, baseUrl, true);

      const newRecording = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: data.title || "Untitled Lecture",
        date: pending.date,
        duration: pending.duration,
        summary: data.summary || [],
        actionItems: data.actionItems || [],
        speakers: data.speakers || ["Speaker 1"],
        transcript: data.transcript || [],
        rawTranscript,
        keyTopics: data.keyTopics || [],
        folderId: null,
      };

      await addRecording(newRecording);
      await AsyncStorage.removeItem(PENDING_KEY);
      for (const u of uris) {
        try { await FileSystem.deleteAsync(u, { idempotent: true }); } catch {}
      }
      setRecordState("idle");
      setStatusMsg("");
      router.push({ pathname: "/detail/[id]", params: { id: newRecording.id } });
    } catch (e: any) {
      setRecordState("idle");
      setStatusMsg("");
      Alert.alert("Error", "Could not finish the lecture: " + (e?.message || String(e)));
    } finally {
      stopEtaCountdown();
      await deactivateKeepAwake();
    }
  };

  // ─── Native recording via expo-audio ───────────────────────────────────────

  // Called automatically every CHUNK_INTERVAL_MS to save current chunk and seamlessly restart
  const autoChunkNative = async () => {
    if (isChunkingRef.current) return;
    isChunkingRef.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) nativeChunksRef.current.push(uri);
      // Seamlessly start the next chunk
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      console.warn("Auto-chunk failed:", e);
    } finally {
      isChunkingRef.current = false;
    }
  };

  const startNativeRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      
      if (!permission.granted) {
        Alert.alert(
          "Microphone Access Required",
          "Please enable microphone access for Lecto in your device Settings to record lectures.",
          [{ text: "OK" }]
        );
        return;
      }

      // Re-apply audio mode right before recording to ensure it's active on iOS
      await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: true,
        playsInSilentMode: true,
      });

      // Reset chunk state for fresh recording
      nativeChunksRef.current = [];
      isChunkingRef.current = false;
      stopChunkInterval();

      // Prepare and start the background-safe recording
      await recorder.prepareToRecordAsync();
      recorder.record();
      
      elapsedRef.current = 0;
      setElapsed(0);
      setRecordState("recording");
      startTimer();

      // Start auto-chunking every 90 minutes
      chunkIntervalRef.current = setInterval(autoChunkNative, CHUNK_INTERVAL_MS);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      setRecordState("idle");
      Alert.alert("Error", "Could not start recording: " + (e?.message || String(e)));
    }
  };

  const pauseNativeRecording = async () => {
    try {
      recorder.pause();
      stopChunkInterval();
      setRecordState("paused");
      stopTimer();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      Alert.alert("Error", "Could not pause recording: " + (e?.message || String(e)));
    }
  };

  const resumeNativeRecording = async () => {
    try {
      recorder.record();
      setRecordState("recording");
      startTimer();
      // Resume chunk interval from remaining time (restart interval for simplicity)
      stopChunkInterval();
      chunkIntervalRef.current = setInterval(autoChunkNative, CHUNK_INTERVAL_MS);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      Alert.alert("Error", "Could not resume recording: " + (e?.message || String(e)));
    }
  };

const stopNativeRecording = async (): Promise<{ base64: string; filename: string; uri: string }> => {
  if (!recorder) throw new Error("No recording in progress");

  await recorder.stop();
  const uri = recorder.uri; // This is the path to the lecture file
  
  if (!uri) throw new Error("Recording URI is unavailable");

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const filename = uri.split("/").pop() || "recording.m4a";
  
  return { base64, filename, uri };
};

  // ─── Unified actions ────────────────────────────────────────────────────────
  const startRecording = () =>
    Platform.OS === "web" ? startWebRecording() : startNativeRecording();

  const pauseRecording = () =>
    Platform.OS === "web" ? pauseWebRecording() : pauseNativeRecording();

  const resumeRecording = () =>
    Platform.OS === "web" ? resumeWebRecording() : resumeNativeRecording();

  const stopAndProcess = async () => {
    try {
      setRecordState("processing");
      stopTimer();
      stopChunkInterval();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await activateKeepAwakeAsync();

      const recordedAt = new Date().toISOString();
      const recordedDuration = elapsedRef.current;
      const baseUrl = getApiUrl();
      const includeAI = wantActionItems;

      const etaSecs = Math.max(30, Math.ceil(recordedDuration / 15)) + 25;
      startEtaCountdown(etaSecs);

      if (Platform.OS === "web") {
        // Web: single-shot (no chunking)
        setStatusMsg("Stopping lecture...");
        const result = await stopWebRecording();
        setStatusMsg("Transcribing with AI...");
        let resp: Response;
        try {
          resp = await fetchWithTimeout(
            `${baseUrl}api/transcribe`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: result.base64, filename: result.filename, language: language.code, includeActionItems: includeAI }),
            },
            TRANSCRIBE_CHUNK_TIMEOUT_MS
          );
        } catch (e: any) {
          if (e?.name === "AbortError") throw new Error("Processing timed out. Please try again.");
          throw new Error("Could not reach the server. Please check your connection.");
        }
        if (!resp.ok) {
          let msg = "Transcription failed";
          try { msg = (await resp.json()).error || msg; } catch {}
          throw new Error(msg);
        }
        const data = await resp.json();
        const newRecording = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: data.title || "Untitled Lecture",
          date: recordedAt,
          duration: recordedDuration,
          summary: data.summary || [],
          actionItems: data.actionItems || [],
          speakers: data.speakers || ["Speaker 1"],
          transcript: data.transcript || [],
          rawTranscript: data.rawTranscript || "",
          keyTopics: data.keyTopics || [],
          folderId: null,
        };
        await addRecording(newRecording);
        setRecordState("idle");
        setElapsed(0);
        elapsedRef.current = 0;
        setStatusMsg("");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push({ pathname: "/detail/[id]", params: { id: newRecording.id } });
        return;
      }

      // ── Native: chunked flow ───────────────────────────────────────────────
      setStatusMsg("Saving lecture...");
      const finalResult = await stopNativeRecording();
      const allUris = [...nativeChunksRef.current, finalResult.uri];

      // Persist all chunk URIs so we can recover if the app is killed mid-processing
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({
        uris: allUris,
        duration: recordedDuration,
        date: recordedAt,
        language: language.code,
      }));

      // Transcribe each chunk sequentially
      const transcripts: string[] = [];
      for (let i = 0; i < allUris.length; i++) {
        const t = await transcribeChunk(allUris[i], i, allUris.length, language.code, baseUrl);
        transcripts.push(t);
      }
      const rawTranscript = transcripts.join("\n\n");

      // Run one GPT-4o analysis pass on the full combined transcript
      const data = await analyzeTranscript(rawTranscript, language.code, baseUrl, includeAI);

      const newRecording = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: data.title || "Untitled Lecture",
        date: recordedAt,
        duration: recordedDuration,
        summary: data.summary || [],
        actionItems: data.actionItems || [],
        speakers: data.speakers || ["Speaker 1"],
        transcript: data.transcript || [],
        rawTranscript,
        keyTopics: data.keyTopics || [],
        folderId: null,
      };

      await addRecording(newRecording);
      await AsyncStorage.removeItem(PENDING_KEY);
      for (const u of allUris) {
        try { await FileSystem.deleteAsync(u, { idempotent: true }); } catch {}
      }
      nativeChunksRef.current = [];
      setRecordState("idle");
      setElapsed(0);
      elapsedRef.current = 0;
      setStatusMsg("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: "/detail/[id]", params: { id: newRecording.id } });
    } catch (e: any) {
      console.error("Stop error:", e?.message || String(e));
      setRecordState("idle");
      setElapsed(0);
      elapsedRef.current = 0;
      setStatusMsg("");
      Alert.alert("Error", e?.message || "Could not process lecture. Please try again.");
    } finally {
      stopEtaCountdown();
      await deactivateKeepAwake();
    }
  };

  const handleRecordPress = () => {
    buttonScale.value = withSpring(0.92, {}, () => {
      buttonScale.value = withSpring(1);
    });
    if (recordState === "idle") {
      if (!isSubscribed && recordings.length >= FREE_RECORDING_LIMIT) {
        setShowPaywall(true);
        return;
      }
      startRecording();
    } else if (recordState === "recording") {
      pauseRecording();
    } else if (recordState === "paused") {
      resumeRecording();
    }
  };

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const isActive = recordState === "recording";
  const isPaused = recordState === "paused";
  const isProcessing = recordState === "processing";
  const isIdle = recordState === "idle";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 84 : insets.bottom + 70;

  const buttonColor = isActive ? Colors.coral : isPaused ? Colors.indigo : Colors.coral;
  const iconName = isActive ? "pause" : isPaused ? "play" : "mic";
  const timerColor = isActive ? Colors.coral : isPaused ? Colors.indigo : theme.textTertiary;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPadding + 20, paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)} style={styles.headingBlock}>
          <Text style={[styles.header, { color: theme.text, fontFamily: "DMSans_700Bold" }]}>
            {isProcessing ? "Processing..." : isActive ? "Lecturing" : isPaused ? "Paused" : "New Lecture"}
          </Text>
          <Text style={[styles.subheader, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
            {isProcessing
              ? statusMsg
              : isActive
              ? "Speak clearly — Lecto is capturing every word"
              : isPaused
              ? "Tap to resume or stop when finished"
              : "Tap the button below to start a new lecture"}
          </Text>
        </Animated.View>

        {/* Timer — always same height */}
        <View style={styles.timerSection}>
          <Text style={[styles.timer, { color: timerColor, fontFamily: "DMSans_700Bold" }]}>
            {formatTime(elapsed)}
          </Text>
          <View style={styles.liveSlot}>
            {isActive && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={[styles.liveText, { fontFamily: "DMSans_700Bold" }]}>LIVE</Text>
              </Animated.View>
            )}
            {isPaused && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.liveIndicator, { backgroundColor: Colors.indigo + "22" }]}>
                <Ionicons name="pause" size={10} color={Colors.indigo} />
                <Text style={[styles.liveText, { fontFamily: "DMSans_700Bold", color: Colors.indigo }]}>PAUSED</Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Button area — fixed height so nothing shifts */}
        <View style={styles.buttonArea}>
          <View style={styles.pulseContainer}>
            <PulseRing active={isActive} />
            <Animated.View style={buttonAnimStyle}>
              <Pressable
                onPress={handleRecordPress}
                disabled={isProcessing}
                style={[
                  styles.recordButton,
                  {
                    backgroundColor: buttonColor,
                    opacity: isProcessing ? 0.5 : 1,
                    // Only show glow when actively recording
                    shadowColor: isActive ? Colors.coral : "transparent",
                    shadowOffset: { width: 0, height: isActive ? 8 : 0 },
                    shadowOpacity: isActive ? 0.4 : 0,
                    shadowRadius: isActive ? 20 : 0,
                    elevation: isActive ? 10 : 0,
                  },
                ]}
              >
                <Ionicons name={iconName as any} size={36} color="#fff" />
              </Pressable>
            </Animated.View>
          </View>

          {/* Stop button — always present but invisible when not needed */}
          <View style={styles.stopSlot}>
            {(isActive || isPaused) && !isProcessing && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
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
              <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.processingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="sparkles" size={18} color={Colors.mint} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.processingText, { color: theme.textSecondary, fontFamily: "DMSans_400Regular" }]}>
                    {statusMsg}
                  </Text>
                  {processingEtaSecs > 0 && (
                    <Text style={[styles.processingEta, { color: theme.textTertiary, fontFamily: "DMSans_400Regular" }]}>
                      {processingEtaSecs >= 60
                        ? `~${Math.ceil(processingEtaSecs / 60)} min remaining`
                        : `~${processingEtaSecs} sec remaining`}
                    </Text>
                  )}
                  {processingEtaSecs === 0 && (
                    <Text style={[styles.processingEta, { color: Colors.mint, fontFamily: "DMSans_500Medium" }]}>
                      Almost done...
                    </Text>
                  )}
                </View>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Action items toggle — shown when not processing */}
        {!isProcessing && (
          <Animated.View entering={FadeIn.delay(100)} exiting={FadeOut} style={[styles.toggleRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.toggleLeft}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.mint} />
              <Text style={[styles.toggleLabel, { color: theme.text, fontFamily: "DMSans_500Medium" }]}>
                Action Items
              </Text>
            </View>
            <Pressable onPress={toggleActionItems} style={[styles.togglePill, { backgroundColor: wantActionItems ? Colors.mint : theme.border }]}>
              <View style={[styles.toggleThumb, { transform: [{ translateX: wantActionItems ? 18 : 2 }] }]} />
            </Pressable>
          </Animated.View>
        )}

        {/* Feature list — only in idle state */}
        {isIdle && (
          <Animated.View entering={FadeIn.delay(200)} style={styles.featureList}>
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

      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        fromLimit
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 24,
  },
  headingBlock: {
    alignItems: "center",
    width: "100%",
    minHeight: 80,
    justifyContent: "center",
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
    gap: 10,
  },
  timer: {
    fontSize: 56,
    letterSpacing: 2,
  },
  // Fixed height slot so LIVE/PAUSED badge doesn't cause layout shift
  liveSlot: {
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.coral + "22",
    paddingHorizontal: 12,
    paddingVertical: 5,
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
    width: "100%",
    gap: 24,
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
  },
  // Fixed height slot — stop button appears inside without shifting layout
  stopSlot: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 50,
    borderWidth: 1.5,
  },
  stopLabel: {
    fontSize: 15,
  },
  processingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    width: "100%",
  },
  processingText: {
    fontSize: 14,
  },
  processingEta: {
    fontSize: 12,
    marginTop: 3,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    width: "100%",
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toggleLabel: {
    fontSize: 15,
  },
  togglePill: {
    width: 42,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  featureList: {
    width: "100%",
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
