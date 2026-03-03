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
  folderId: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

interface RecordingsContextValue {
  recordings: Recording[];
  folders: Folder[];
  addRecording: (recording: Recording) => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
  renameRecording: (id: string, title: string) => Promise<void>;
  moveRecording: (id: string, folderId: string | null) => Promise<void>;
  addFolder: (name: string, parentId: string | null) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFolder: (id: string, newParentId: string | null) => Promise<void>;
  isLoading: boolean;
}

const RecordingsContext = createContext<RecordingsContextValue | null>(null);
const RECORDINGS_KEY = "@lecto_recordings";
const FOLDERS_KEY = "@lecto_folders";

function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function getAllDescendantFolderIds(folderId: string, allFolders: Folder[]): string[] {
  const children = allFolders.filter((f) => f.parentId === folderId).map((f) => f.id);
  return children.reduce(
    (acc, childId) => [...acc, childId, ...getAllDescendantFolderIds(childId, allFolders)],
    [] as string[]
  );
}

export function RecordingsProvider({ children }: { children: ReactNode }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedRecs, storedFolders] = await Promise.all([
          AsyncStorage.getItem(RECORDINGS_KEY),
          AsyncStorage.getItem(FOLDERS_KEY),
        ]);
        if (storedRecs) {
          const parsed: Recording[] = JSON.parse(storedRecs);
          setRecordings(parsed.map((r) => ({ ...r, folderId: r.folderId ?? null })));
        }
        if (storedFolders) {
          setFolders(JSON.parse(storedFolders));
        }
      } catch (e) {
        console.error("Failed to load data", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const saveRecordings = async (updated: Recording[]) => {
    setRecordings(updated);
    await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(updated));
  };

  const saveFolders = async (updated: Folder[]) => {
    setFolders(updated);
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(updated));
  };

  const addRecording = async (recording: Recording) => {
    await saveRecordings([{ ...recording, folderId: recording.folderId ?? null }, ...recordings]);
  };

  const deleteRecording = async (id: string) => {
    await saveRecordings(recordings.filter((r) => r.id !== id));
  };

  const renameRecording = async (id: string, title: string) => {
    await saveRecordings(recordings.map((r) => (r.id === id ? { ...r, title } : r)));
  };

  const moveRecording = async (id: string, folderId: string | null) => {
    await saveRecordings(recordings.map((r) => (r.id === id ? { ...r, folderId } : r)));
  };

  const addFolder = async (name: string, parentId: string | null): Promise<Folder> => {
    const folder: Folder = { id: genId(), name, parentId, createdAt: new Date().toISOString() };
    await saveFolders([...folders, folder]);
    return folder;
  };

  const renameFolder = async (id: string, name: string) => {
    await saveFolders(folders.map((f) => (f.id === id ? { ...f, name } : f)));
  };

  const deleteFolder = async (id: string) => {
    const folder = folders.find((f) => f.id === id);
    const parentId = folder?.parentId ?? null;
    const descendants = getAllDescendantFolderIds(id, folders);
    const toRemove = new Set([id, ...descendants]);
    await saveRecordings(recordings.map((r) => (toRemove.has(r.folderId ?? "") ? { ...r, folderId: parentId } : r)));
    await saveFolders(folders.filter((f) => !toRemove.has(f.id)));
  };

  const moveFolder = async (id: string, newParentId: string | null) => {
    const descendants = getAllDescendantFolderIds(id, folders);
    if (newParentId && (newParentId === id || descendants.includes(newParentId))) return;
    await saveFolders(folders.map((f) => (f.id === id ? { ...f, parentId: newParentId } : f)));
  };

  const value = useMemo(
    () => ({
      recordings, folders, addRecording, deleteRecording, renameRecording,
      moveRecording, addFolder, renameFolder, deleteFolder, moveFolder, isLoading,
    }),
    [recordings, folders, isLoading]
  );

  return <RecordingsContext.Provider value={value}>{children}</RecordingsContext.Provider>;
}

export function useRecordings() {
  const ctx = useContext(RecordingsContext);
  if (!ctx) throw new Error("useRecordings must be used within RecordingsProvider");
  return ctx;
}
