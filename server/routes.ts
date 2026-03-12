import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";
import express from "express";
import { PROMO_CODES } from "./promo-codes";

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set.");
  return new GoogleGenerativeAI(apiKey);
}

async function geminiGenerateContent(prompt: string, systemInstruction?: string): Promise<string> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    ...(systemInstruction ? { systemInstruction } : {}),
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function geminiTranscribeAudio(audioBase64: string, mimeType: string, language: string): Promise<string> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const langHint = language !== "en" ? ` The audio is in ${LANGUAGE_NAMES[language] || language}.` : "";
  const result = await model.generateContent([
    {
      inlineData: {
        data: audioBase64,
        mimeType,
      },
    },
    `Please transcribe this audio recording accurately and completely. Output only the transcription text with no commentary, labels, or formatting.${langHint}`,
  ]);
  return result.response.text();
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", ja: "Japanese", ko: "Korean", zh: "Chinese (Simplified)",
  hi: "Hindi", ar: "Arabic", ru: "Russian",
};

function cleanJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function buildAnalysisPrompt(rawTranscript: string, langName: string, includeActionItems: boolean): string {
  return `You are an expert meeting and lecture notes assistant.
CRITICAL: You MUST write ALL output text in ${langName}. Every field must be in ${langName}.

Analyze the transcript below and return a JSON object with EXACTLY this structure:
{
  "title": "A concise, descriptive title in ${langName} (max 60 chars)",
  "summary": ["bullet point in ${langName}", ...],
  "actionItems": [{ "speaker": "Speaker label", "task": "action item" }, ...],
  "speakers": ["Speaker 1", ...],
  "transcript": [{ "speaker": "Speaker 1", "timestamp": "0:00", "text": "paraphrased turn" }, ...],
  "keyTopics": ["topic", ...]
}

TRANSCRIPT RULES — paraphrase each speaker turn, do NOT copy verbatim and do NOT summarize:
- One entry per distinct speaker turn or topic shift
- Each "text" is 1–2 sentences paraphrasing what was said, in conversational language
- Show the back-and-forth rhythm if multiple speakers; single lecturer = one entry per topic shift (~1–2 min)
- Timestamps reflect when each turn occurred
- Single lecturer = "Speaker 1"
- Must read like a conversation, clearly different from the summary bullets

KEY TOPICS: At most 5 of the most important topics.
${!includeActionItems ? "ACTION ITEMS: Return an empty array [] for actionItems." : "ACTION ITEMS: Extract concrete next steps with the most likely responsible speaker."}
Return ONLY valid JSON with no markdown fences.

Transcript:
${rawTranscript}`;
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audio, filename = "recording.m4a", language = "en", includeActionItems = true } = req.body;
      if (!audio) return res.status(400).json({ error: "Audio data required" });

      const langName = LANGUAGE_NAMES[language] || "English";
      const ext = filename.split(".").pop()?.toLowerCase() || "m4a";
      const mimeMap: Record<string, string> = {
        m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm",
        wav: "audio/wav", mp3: "audio/mpeg", caf: "audio/mp4", ogg: "audio/ogg",
      };
      const mimeType = mimeMap[ext] || "audio/mp4";

      const rawTranscript = await geminiTranscribeAudio(audio, mimeType, language);

      const analysisPrompt = buildAnalysisPrompt(rawTranscript, langName, includeActionItems);
      const content = await geminiGenerateContent(analysisPrompt, "You are an expert meeting and lecture notes assistant. Return only valid JSON.");

      let parsed: any = {};
      try { parsed = JSON.parse(cleanJson(content)); } catch {
        parsed = {
          title: "Recording", summary: [rawTranscript.slice(0, 200)],
          actionItems: [], speakers: ["Speaker 1"],
          transcript: [{ speaker: "Speaker 1", timestamp: "0:00", text: rawTranscript }], keyTopics: [],
        };
      }
      res.json({ rawTranscript, ...parsed });
    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message || "Transcription failed" });
    }
  });

  // Transcribe a single audio chunk → returns only rawTranscript
  app.post("/api/transcribe-chunk", async (req, res) => {
    try {
      const { audio, filename = "recording.m4a", language = "en" } = req.body;
      if (!audio) return res.status(400).json({ error: "Audio data required" });

      const ext = filename.split(".").pop()?.toLowerCase() || "m4a";
      const mimeMap: Record<string, string> = {
        m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm",
        wav: "audio/wav", mp3: "audio/mpeg", caf: "audio/mp4", ogg: "audio/ogg",
      };
      const mimeType = mimeMap[ext] || "audio/mp4";

      const rawTranscript = await geminiTranscribeAudio(audio, mimeType, language);
      res.json({ rawTranscript });
    } catch (error: any) {
      console.error("Chunk transcription error:", error);
      res.status(500).json({ error: error.message || "Transcription failed" });
    }
  });

  // Analyze a combined raw transcript → returns structured notes
  app.post("/api/analyze", express.json({ limit: "2mb" }), async (req, res) => {
    try {
      const { rawTranscript, language = "en", includeActionItems = true } = req.body;
      if (!rawTranscript) return res.status(400).json({ error: "rawTranscript is required" });

      const langName = LANGUAGE_NAMES[language] || "English";
      const analysisPrompt = buildAnalysisPrompt(rawTranscript, langName, includeActionItems);
      const content = await geminiGenerateContent(analysisPrompt, "You are an expert meeting and lecture notes assistant. Return only valid JSON.");

      let parsed: any = {};
      try { parsed = JSON.parse(cleanJson(content)); } catch {
        parsed = {
          title: "Lecture", summary: [rawTranscript.slice(0, 200)],
          actionItems: [], speakers: ["Speaker 1"],
          transcript: [{ speaker: "Speaker 1", timestamp: "0:00", text: rawTranscript }], keyTopics: [],
        };
      }
      res.json(parsed);
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: error.message || "Analysis failed" });
    }
  });

  app.post("/api/chat", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const { messages, context, language = "en" } = req.body;
      const langName = LANGUAGE_NAMES[language] || "English";

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const systemInstruction = context
        ? `You are an AI assistant helping a user understand their lecture. You MUST respond in ${langName} only.\n\nLecture context:\n${context}\n\nAnswer questions specifically about this content. Be helpful, concise, and accurate. Always respond in ${langName}.\n\nFORMATTING RULES:\n- Use plain text only. No markdown whatsoever.\n- Never use hashtags, asterisks, underscores, or backticks.\n- For bullets use a dash: -\n- For numbered lists use: 1. 2. 3.\n- Write math in plain language (e.g. "half" not "1/2").\n- Keep responses conversational and easy to read aloud.`
        : `You are a helpful AI assistant. Always respond in ${langName}. Use plain text only — no markdown, no asterisks, no hashtags, no special formatting symbols.`;

      const genAI = getGemini();
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction,
      });

      const history = messages.slice(0, -1).map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const lastMessage = messages[messages.length - 1];

      const chat = model.startChat({ history });
      const streamResult = await chat.sendMessageStream(lastMessage?.content || "");

      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) {
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
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

  app.post("/api/pdf", async (req, res) => {
    try {
      const { recording, folderName, recordings } = req.body;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfmake = require("pdfmake");

      pdfmake.fonts = {
        Helvetica: {
          normal: "Helvetica",
          bold: "Helvetica-Bold",
          italics: "Helvetica-Oblique",
          bolditalics: "Helvetica-BoldOblique",
        },
      };

      const INDIGO = "#3F51B5";
      const CORAL = "#FF7043";
      const MINT = "#2D9E96";
      const TEXT = "#1A1A2E";
      const MUTED = "#666680";
      const GENERATED = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

      function formatDur(s: number) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
      }

      function sectionHeader(label: string, color: string, bg: string): any {
        return {
          table: {
            widths: ["*"],
            body: [[{
              text: label,
              fontSize: 9,
              bold: true,
              color,
              fillColor: bg,
              border: [false, false, false, false],
              margin: [12, 8, 12, 8],
            }]],
          },
          layout: "noBorders",
          margin: [0, 0, 0, 10],
        };
      }

      function recBlock(rec: any, folder?: string): any[] {
        const blocks: any[] = [];

        if (folder) {
          blocks.push({ text: `Folder: ${folder}`, fontSize: 9, color: MUTED, margin: [0, 0, 0, 6] });
        }

        blocks.push({ text: rec.title, fontSize: 20, bold: true, color: TEXT, margin: [0, 0, 0, 3] });

        const dateStr = new Date(rec.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        blocks.push({ text: `${dateStr}  ·  ${formatDur(rec.duration)}`, fontSize: 11, color: MUTED, margin: [0, 0, 0, 12] });

        if (rec.keyTopics && rec.keyTopics.length > 0) {
          blocks.push({ text: rec.keyTopics.join("  ·  "), fontSize: 10, color: INDIGO, margin: [0, 0, 0, 16] });
        }

        // Summary
        blocks.push(sectionHeader("+  SUMMARY", INDIGO, "#EEF0FB"));
        if (rec.summary && rec.summary.length > 0) {
          blocks.push({ ul: rec.summary, fontSize: 12, color: TEXT, margin: [4, 0, 0, 16] });
        } else {
          blocks.push({ text: "No summary available.", italics: true, color: MUTED, fontSize: 11, margin: [4, 0, 0, 16] });
        }

        // Action Items
        blocks.push(sectionHeader(">  ACTION ITEMS", CORAL, "#FFF0EC"));
        if (rec.actionItems && rec.actionItems.length > 0) {
          const rows = rec.actionItems.map((a: any) => [
            { text: a.speaker, fontSize: 10, bold: true, color: CORAL, margin: [0, 3, 8, 3] },
            { text: a.task, fontSize: 11, color: TEXT, margin: [0, 3, 0, 3] },
          ]);
          blocks.push({
            table: { widths: ["auto", "*"], body: rows },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 16],
          });
        } else {
          blocks.push({ text: "No action items.", italics: true, color: MUTED, fontSize: 11, margin: [4, 0, 0, 16] });
        }

        // Transcript
        blocks.push(sectionHeader("*  TRANSCRIPT", MINT, "#E8F7F6"));
        if (rec.transcript && rec.transcript.length > 0) {
          const tRows = rec.transcript.map((t: any) => [
            {
              stack: [
                { text: t.speaker, fontSize: 10, bold: true, color: INDIGO },
                { text: t.timestamp, fontSize: 9, color: MUTED, margin: [0, 2, 0, 0] },
              ],
              margin: [0, 4, 10, 4],
            },
            { text: t.text, fontSize: 11, color: TEXT, margin: [0, 4, 0, 4] },
          ]);
          blocks.push({
            table: { widths: [70, "*"], body: tRows },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 4],
          });
        } else {
          blocks.push({ text: "No transcript available.", italics: true, color: MUTED, fontSize: 11, margin: [4, 0, 0, 4] });
        }

        return blocks;
      }

      const allRecordings: any[] = recordings || (recording ? [recording] : []);
      const docTitle = recording ? recording.title : (folderName || "Lecto Notes");

      const contentBlocks: any[] = [];
      allRecordings.forEach((rec: any, i: number) => {
        contentBlocks.push(...recBlock(rec, recordings ? folderName : undefined));
        if (i < allRecordings.length - 1) {
          contentBlocks.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: "#E8E8F0" }], margin: [0, 28, 0, 28] });
        }
      });

      const docDefinition = {
        defaultStyle: { font: "Helvetica" },
        pageMargins: [50, 76, 50, 58],
        header: (currentPage: number, pageCount: number, pageSize: { width: number; height: number }) => [
          { canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: 65, color: INDIGO }] },
          {
            absolutePosition: { x: 50, y: 14 },
            stack: [
              { text: "LECTO", fontSize: 8, bold: true, color: "white", characterSpacing: 3 },
              { text: docTitle, fontSize: 14, bold: true, color: "#ffffff", margin: [0, 5, 0, 0] },
            ],
          },
        ],
        footer: (currentPage: number, pageCount: number, pageSize: { width: number; height: number }) => [
          { canvas: [{ type: "line", x1: 50, y1: 0, x2: pageSize.width - 50, y2: 0, lineWidth: 1, lineColor: "#E8E8F0" }] },
          {
            columns: [
              { text: "LECTO", fontSize: 10, bold: true, color: INDIGO, characterSpacing: 1 },
              { text: `Generated ${GENERATED}`, fontSize: 9, color: MUTED, alignment: "right" },
            ],
            margin: [50, 8, 50, 0],
          },
        ],
        content: contentBlocks,
      };

      const pdfDoc = pdfmake.createPdf(docDefinition);
      const buffer = await pdfDoc.getBuffer();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(docTitle)}.pdf"`);
      res.send(Buffer.from(buffer));
    } catch (error: any) {
      console.error("PDF error:", error);
      res.status(500).json({ error: error.message || "PDF generation failed" });
    }
  });

  app.post("/api/promo/redeem", (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ valid: false, message: "Please enter a code." });
    }
    const normalized = code.trim().toUpperCase();
    const promo = PROMO_CODES[normalized];
    if (!promo) {
      return res.status(200).json({ valid: false, message: "That code doesn't exist. Please check it and try again." });
    }
    const daysText = promo.durationDays === -1 ? "lifetime" : `${promo.durationDays} day${promo.durationDays === 1 ? "" : "s"}`;
    return res.status(200).json({
      valid: true,
      durationDays: promo.durationDays,
      message: `Code applied! You now have ${daysText} of Lecto Pro.`,
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
