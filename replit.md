# Lecto - AI Voice-to-Notes App

## Overview

Lecto is a professional AI-powered voice recording and note-taking mobile app built with React Native (Expo). It records audio, transcribes it using OpenAI Whisper, and generates smart summaries, transcripts with speaker labels, and an AI chat interface for each recording. The app targets students and professionals who want to capture meetings and lectures hands-free.

**Core features:**
- Audio recording with pause/resume/stop controls
- AI transcription via OpenAI Whisper (multi-language support)
- Per-recording tabs: Summary, Transcript, and AI Chat
- Searchable recording library with folder organization
- In-app purchases via RevenueCat (free tier: 2 recordings)
- Share/export recording notes

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (React Native / Expo)

- **Framework:** Expo SDK 54 with Expo Router v6 for file-based navigation
- **Navigation structure:**
  - `app/(tabs)/index.tsx` — Library screen (searchable list of all recordings + folder management)
  - `app/(tabs)/record.tsx` — Recording screen (record button, pause/resume/stop, processing state)
  - `app/detail/[id].tsx` — Detail screen with Summary / Transcript / Chat tabs
- **State management:**
  - `RecordingsContext` — Stores all recordings and folders in AsyncStorage (no remote DB for recordings)
  - `SettingsContext` — Stores user language preference in AsyncStorage
  - `SubscriptionContext` — Manages RevenueCat subscription state
  - `@tanstack/react-query` — Used for server API calls
- **Styling approach:** Manual StyleSheet with a fixed color palette (Deep Indigo, Coral, Mint). Dark/light mode via `useColorScheme`. Glassmorphism effects via `expo-blur`.
- **Fonts:** DM Sans (Regular, Medium, Bold) loaded via `@expo-google-fonts/dm-sans`
- **Audio recording:** `expo-av` for microphone capture; files saved locally via `expo-file-system`

### Backend (Express / Node.js)

- **Server:** Express 5 running at `server/index.ts`, served alongside the Expo app
- **Primary API route:** `POST /api/transcribe` — Accepts base64 audio, calls OpenAI Whisper, then GPT to produce structured JSON (title, summary bullets, action items, speaker-labeled transcript, key topics)
- **Chat API:** `POST /api/chat` (inside detail screen) — Sends recording transcript as context and streams AI responses back
- **Storage:** `server/storage.ts` uses in-memory storage (`MemStorage`) for user accounts; recordings live in AsyncStorage on-device only
- **Replit integrations:** Pre-built modules under `server/replit_integrations/` for audio, chat, image, and batch processing — these are scaffolding utilities, not all actively used in the main app flow

### Database

- **ORM:** Drizzle ORM with PostgreSQL dialect (`drizzle.config.ts`)
- **Schema location:** `shared/schema.ts` (users table) and `shared/models/chat.ts` (conversations + messages tables)
- **Current usage:** The `conversations` and `messages` tables are used by the Replit integrations chat module via `server/replit_integrations/chat/storage.ts`. The main recordings data is stored client-side in AsyncStorage, not in the database.
- **Migrations:** Output to `./migrations/` directory via `drizzle-kit push`

### Data Flow for a Recording

1. User taps Record → `expo-av` captures audio to a local `.m4a` file
2. User taps Stop → file is read via `expo-file-system`, converted to base64
3. Base64 audio is `POST`ed to `/api/transcribe` on the Express server
4. Server calls OpenAI Whisper for raw transcription, then GPT-4o to structure the output
5. Structured JSON (title, summary, transcript, action items, key topics) is returned
6. Client saves the full recording object to AsyncStorage via `RecordingsContext`

### Subscription / Paywall

- **Provider:** RevenueCat (`react-native-purchases`)
- **Free tier:** 2 recordings maximum (`FREE_RECORDING_LIMIT = 2`)
- **Packages:** Monthly and Yearly offered via `Paywall.tsx` modal
- **Entitlement ID:** `"premium"`
- **API key:** Loaded from `EXPO_PUBLIC_REVENUECAT_API_KEY` environment variable

### Environment / Deployment

- Designed to run on Replit; uses `REPLIT_DEV_DOMAIN` and `REPLIT_DOMAINS` env vars to configure CORS and Expo packager URLs
- `EXPO_PUBLIC_DOMAIN` env var is used by the client to construct API request URLs
- `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` are used server-side for OpenAI calls
- `DATABASE_URL` is required for Drizzle/PostgreSQL connection

## Migration Notes (Replit Environment)

- `tsx` was added as a dependency and installed to allow running TypeScript server files directly
- `server/routes.ts` was updated to initialize the OpenAI client lazily inside a `getOpenAI()` helper function instead of at module load time, so the server starts cleanly even before `AI_INTEGRATIONS_OPENAI_API_KEY` is set
- **Required secret:** `AI_INTEGRATIONS_OPENAI_API_KEY` must be set in Replit Secrets for transcription and chat features to work
- **Workflows:** "Start Backend" runs `npm run server:dev` on port 5000 (webview); "Start Frontend" runs `npm run expo:dev`

## External Dependencies

| Dependency | Purpose |
|---|---|
| **OpenAI API** (`openai` npm package) | Whisper transcription (`gpt-4o-mini-transcribe`) and GPT-4o for structuring notes and chat |
| **RevenueCat** (`react-native-purchases`) | In-app subscription management (monthly/yearly plans) |
| **PostgreSQL** | Stores chat conversations and messages (Drizzle ORM) |
| **AsyncStorage** (`@react-native-async-storage/async-storage`) | Client-side persistence for recordings, folders, and settings |
| **expo-av** | Microphone access and audio recording |
| **expo-file-system** | Reading recorded audio files for upload |
| **expo-blur** | Glassmorphism tab bar effect on iOS |
| **react-native-reanimated** | Animations (pulse rings, fade-in transitions) |
| **@tanstack/react-query** | Server state and API call management |
| **Drizzle ORM + drizzle-kit** | Database schema definition and migrations |
| **react-native-purchases** | RevenueCat SDK for subscription purchases |
| **p-limit + p-retry** | Batch processing with concurrency control and retries for AI calls |