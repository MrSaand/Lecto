import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface TranscriptLine {
  speaker: string;
  timestamp: string;
  text: string;
}

export interface ActionItem {
  speaker: string;
  task: string;
}

export interface Recording {
  id: string;
  title: string;
  date: string;
  duration: number;
  summary: string[];
  actionItems: ActionItem[];
  speakers: string[];
  transcript: TranscriptLine[];
  rawTranscript: string;
  keyTopics: string[];
}

interface RecordingsContextValue {
  recordings: Recording[];
  addRecording: (recording: Recording) => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
  isLoading: boolean;
}

const RecordingsContext = createContext<RecordingsContextValue | null>(null);
const STORAGE_KEY = "@lecto_recordings";

export function RecordingsProvider({ children }: { children: ReactNode }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setRecordings(JSON.parse(stored));
        }
      } catch (e) {
        console.error("Failed to load recordings", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const save = async (updated: Recording[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addRecording = async (recording: Recording) => {
    const updated = [recording, ...recordings];
    setRecordings(updated);
    await save(updated);
  };

  const deleteRecording = async (id: string) => {
    const updated = recordings.filter((r) => r.id !== id);
    setRecordings(updated);
    await save(updated);
  };

  const value = useMemo(
    () => ({ recordings, addRecording, deleteRecording, isLoading }),
    [recordings, isLoading]
  );

  return (
    <RecordingsContext.Provider value={value}>
      {children}
    </RecordingsContext.Provider>
  );
}

export function useRecordings() {
  const ctx = useContext(RecordingsContext);
  if (!ctx) throw new Error("useRecordings must be used within RecordingsProvider");
  return ctx;
}
