import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import express from "express";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const audioBodyParser = express.json({ limit: "50mb" });

export async function registerRoutes(app: Express): Promise<Server> {

  app.post("/api/transcribe", audioBodyParser, async (req, res) => {
    try {
      const { audio, filename = "recording.m4a" } = req.body;
      if (!audio) {
        return res.status(400).json({ error: "Audio data required" });
      }

      const audioBuffer = Buffer.from(audio, "base64");
      const ext = filename.split(".").pop()?.toLowerCase() || "m4a";
      const mimeMap: Record<string, string> = {
        m4a: "audio/m4a",
        mp4: "audio/mp4",
        webm: "audio/webm",
        wav: "audio/wav",
        mp3: "audio/mpeg",
        caf: "audio/x-caf",
      };
      const mimeType = mimeMap[ext] || "audio/m4a";

      const file = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType });

      const transcriptionResponse = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
      });

      const rawTranscript = transcriptionResponse.text;

      const systemPrompt = `You are an expert meeting and lecture notes assistant. Analyze the provided transcript and return a JSON object with the following structure:
{
  "title": "A concise, descriptive title (max 60 chars)",
  "summary": ["bullet point 1", "bullet point 2", ...],
  "actionItems": [
    { "speaker": "Speaker 1", "task": "action item description" },
    ...
  ],
  "speakers": ["Speaker 1", "Speaker 2", ...],
  "transcript": [
    { "speaker": "Speaker 1", "timestamp": "0:00", "text": "what they said" },
    ...
  ],
  "keyTopics": ["topic1", "topic2", ...]
}

For the transcript, assign speaker labels based on changes in speaking style, topic, or apparent role. If it seems like one person speaking, use "Speaker 1". If there are questions and answers, use "Speaker 1" and "Speaker 2". Distribute timestamps evenly across the transcript.
For action items, extract concrete next steps with the most likely responsible speaker.
Return ONLY valid JSON, no markdown.`;

      const analysisResponse = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Transcript:\n${rawTranscript}` },
        ],
        max_completion_tokens: 4096,
      });

      const content = analysisResponse.choices[0]?.message?.content || "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {
          title: "Recording",
          summary: ["Could not parse summary"],
          actionItems: [],
          speakers: ["Speaker 1"],
          transcript: [{ speaker: "Speaker 1", timestamp: "0:00", text: rawTranscript }],
          keyTopics: [],
        };
      }

      res.json({
        rawTranscript,
        ...parsed,
      });
    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message || "Transcription failed" });
    }
  });

  app.post("/api/chat", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const { messages, context } = req.body;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const systemMessage = context
        ? `You are an AI assistant helping a user understand their recording. Here is the transcript/notes context:\n\n${context}\n\nAnswer questions specifically about this content. Be helpful, concise, and accurate.`
        : "You are a helpful AI assistant.";

      const stream = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemMessage },
          ...messages,
        ],
        stream: true,
        max_completion_tokens: 2048,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      console.error("Chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: error.message || "Chat failed" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
