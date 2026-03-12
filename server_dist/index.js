var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "node:http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer as Buffer2 } from "node:buffer";
import express from "express";

// server/promo-codes.ts
var PROMO_CODES = {
  LAUNCH30: { durationDays: 30, description: "Launch promo \u2014 30 days free" },
  FRIEND7: { durationDays: 7, description: "Friend invite \u2014 7 days free" },
  BETA365: { durationDays: 365, description: "Beta tester \u2014 1 year free" },
  UCSD: { durationDays: 90, description: "UCSD \u2014 3 months free" },
  TSAO: { durationDays: -1, description: "Lifetime Pro access" }
};

// server/routes.ts
function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set.");
  return new GoogleGenerativeAI(apiKey);
}
async function geminiGenerateContent(prompt, systemInstruction) {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    ...systemInstruction ? { systemInstruction } : {}
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
async function geminiTranscribeAudio(audioBase64, mimeType, language) {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const langHint = language !== "en" ? ` The audio is in ${LANGUAGE_NAMES[language] || language}.` : "";
  const result = await model.generateContent([
    {
      inlineData: {
        data: audioBase64,
        mimeType
      }
    },
    `Please transcribe this audio recording accurately and completely. Output only the transcription text with no commentary, labels, or formatting.${langHint}`
  ]);
  return result.response.text();
}
var LANGUAGE_NAMES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  hi: "Hindi",
  ar: "Arabic",
  ru: "Russian"
};
function cleanJson(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}
function buildAnalysisPrompt(rawTranscript, langName, includeActionItems) {
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

TRANSCRIPT RULES \u2014 paraphrase each speaker turn, do NOT copy verbatim and do NOT summarize:
- One entry per distinct speaker turn or topic shift
- Each "text" is 1\u20132 sentences paraphrasing what was said, in conversational language
- Show the back-and-forth rhythm if multiple speakers; single lecturer = one entry per topic shift (~1\u20132 min)
- Timestamps reflect when each turn occurred
- Single lecturer = "Speaker 1"
- Must read like a conversation, clearly different from the summary bullets

KEY TOPICS: At most 5 of the most important topics.
${!includeActionItems ? "ACTION ITEMS: Return an empty array [] for actionItems." : "ACTION ITEMS: Extract concrete next steps with the most likely responsible speaker."}
Return ONLY valid JSON with no markdown fences.

Transcript:
${rawTranscript}`;
}
async function registerRoutes(app2) {
  app2.post("/api/transcribe", async (req, res) => {
    try {
      const { audio, filename = "recording.m4a", language = "en", includeActionItems = true } = req.body;
      if (!audio) return res.status(400).json({ error: "Audio data required" });
      const langName = LANGUAGE_NAMES[language] || "English";
      const ext = filename.split(".").pop()?.toLowerCase() || "m4a";
      const mimeMap = {
        m4a: "audio/mp4",
        mp4: "audio/mp4",
        webm: "audio/webm",
        wav: "audio/wav",
        mp3: "audio/mpeg",
        caf: "audio/mp4",
        ogg: "audio/ogg"
      };
      const mimeType = mimeMap[ext] || "audio/mp4";
      const rawTranscript = await geminiTranscribeAudio(audio, mimeType, language);
      const analysisPrompt = buildAnalysisPrompt(rawTranscript, langName, includeActionItems);
      const content = await geminiGenerateContent(analysisPrompt, "You are an expert meeting and lecture notes assistant. Return only valid JSON.");
      let parsed = {};
      try {
        parsed = JSON.parse(cleanJson(content));
      } catch {
        parsed = {
          title: "Recording",
          summary: [rawTranscript.slice(0, 200)],
          actionItems: [],
          speakers: ["Speaker 1"],
          transcript: [{ speaker: "Speaker 1", timestamp: "0:00", text: rawTranscript }],
          keyTopics: []
        };
      }
      res.json({ rawTranscript, ...parsed });
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message || "Transcription failed" });
    }
  });
  app2.post("/api/transcribe-chunk", async (req, res) => {
    try {
      const { audio, filename = "recording.m4a", language = "en" } = req.body;
      if (!audio) return res.status(400).json({ error: "Audio data required" });
      const ext = filename.split(".").pop()?.toLowerCase() || "m4a";
      const mimeMap = {
        m4a: "audio/mp4",
        mp4: "audio/mp4",
        webm: "audio/webm",
        wav: "audio/wav",
        mp3: "audio/mpeg",
        caf: "audio/mp4",
        ogg: "audio/ogg"
      };
      const mimeType = mimeMap[ext] || "audio/mp4";
      const rawTranscript = await geminiTranscribeAudio(audio, mimeType, language);
      res.json({ rawTranscript });
    } catch (error) {
      console.error("Chunk transcription error:", error);
      res.status(500).json({ error: error.message || "Transcription failed" });
    }
  });
  app2.post("/api/analyze", express.json({ limit: "2mb" }), async (req, res) => {
    try {
      const { rawTranscript, language = "en", includeActionItems = true } = req.body;
      if (!rawTranscript) return res.status(400).json({ error: "rawTranscript is required" });
      const langName = LANGUAGE_NAMES[language] || "English";
      const analysisPrompt = buildAnalysisPrompt(rawTranscript, langName, includeActionItems);
      const content = await geminiGenerateContent(analysisPrompt, "You are an expert meeting and lecture notes assistant. Return only valid JSON.");
      let parsed = {};
      try {
        parsed = JSON.parse(cleanJson(content));
      } catch {
        parsed = {
          title: "Lecture",
          summary: [rawTranscript.slice(0, 200)],
          actionItems: [],
          speakers: ["Speaker 1"],
          transcript: [{ speaker: "Speaker 1", timestamp: "0:00", text: rawTranscript }],
          keyTopics: []
        };
      }
      res.json(parsed);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: error.message || "Analysis failed" });
    }
  });
  app2.post("/api/chat", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const { messages, context, language = "en" } = req.body;
      const langName = LANGUAGE_NAMES[language] || "English";
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      const systemInstruction = context ? `You are an AI assistant helping a user understand their lecture. You MUST respond in ${langName} only.

Lecture context:
${context}

Answer questions specifically about this content. Be helpful, concise, and accurate. Always respond in ${langName}.

FORMATTING RULES:
- Use plain text only. No markdown whatsoever.
- Never use hashtags, asterisks, underscores, or backticks.
- For bullets use a dash: -
- For numbered lists use: 1. 2. 3.
- Write math in plain language (e.g. "half" not "1/2").
- Keep responses conversational and easy to read aloud.` : `You are a helpful AI assistant. Always respond in ${langName}. Use plain text only \u2014 no markdown, no asterisks, no hashtags, no special formatting symbols.`;
      const genAI = getGemini();
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction
      });
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));
      const lastMessage = messages[messages.length - 1];
      const chat = model.startChat({ history });
      const streamResult = await chat.sendMessageStream(lastMessage?.content || "");
      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) {
          res.write(`data: ${JSON.stringify({ content: text })}

`);
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message })}

`);
        res.end();
      } else {
        res.status(500).json({ error: error.message || "Chat failed" });
      }
    }
  });
  app2.post("/api/pdf", async (req, res) => {
    try {
      let formatDur2 = function(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
      }, sectionHeader2 = function(label, color, bg) {
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
              margin: [12, 8, 12, 8]
            }]]
          },
          layout: "noBorders",
          margin: [0, 0, 0, 10]
        };
      }, recBlock2 = function(rec, folder) {
        const blocks = [];
        if (folder) {
          blocks.push({ text: `Folder: ${folder}`, fontSize: 9, color: MUTED, margin: [0, 0, 0, 6] });
        }
        blocks.push({ text: rec.title, fontSize: 20, bold: true, color: TEXT, margin: [0, 0, 0, 3] });
        const dateStr = new Date(rec.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        blocks.push({ text: `${dateStr}  \xB7  ${formatDur2(rec.duration)}`, fontSize: 11, color: MUTED, margin: [0, 0, 0, 12] });
        if (rec.keyTopics && rec.keyTopics.length > 0) {
          blocks.push({ text: rec.keyTopics.join("  \xB7  "), fontSize: 10, color: INDIGO, margin: [0, 0, 0, 16] });
        }
        blocks.push(sectionHeader2("+  SUMMARY", INDIGO, "#EEF0FB"));
        if (rec.summary && rec.summary.length > 0) {
          blocks.push({ ul: rec.summary, fontSize: 12, color: TEXT, margin: [4, 0, 0, 16] });
        } else {
          blocks.push({ text: "No summary available.", italics: true, color: MUTED, fontSize: 11, margin: [4, 0, 0, 16] });
        }
        blocks.push(sectionHeader2(">  ACTION ITEMS", CORAL, "#FFF0EC"));
        if (rec.actionItems && rec.actionItems.length > 0) {
          const rows = rec.actionItems.map((a) => [
            { text: a.speaker, fontSize: 10, bold: true, color: CORAL, margin: [0, 3, 8, 3] },
            { text: a.task, fontSize: 11, color: TEXT, margin: [0, 3, 0, 3] }
          ]);
          blocks.push({
            table: { widths: ["auto", "*"], body: rows },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 16]
          });
        } else {
          blocks.push({ text: "No action items.", italics: true, color: MUTED, fontSize: 11, margin: [4, 0, 0, 16] });
        }
        blocks.push(sectionHeader2("*  TRANSCRIPT", MINT, "#E8F7F6"));
        if (rec.transcript && rec.transcript.length > 0) {
          const tRows = rec.transcript.map((t) => [
            {
              stack: [
                { text: t.speaker, fontSize: 10, bold: true, color: INDIGO },
                { text: t.timestamp, fontSize: 9, color: MUTED, margin: [0, 2, 0, 0] }
              ],
              margin: [0, 4, 10, 4]
            },
            { text: t.text, fontSize: 11, color: TEXT, margin: [0, 4, 0, 4] }
          ]);
          blocks.push({
            table: { widths: [70, "*"], body: tRows },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 4]
          });
        } else {
          blocks.push({ text: "No transcript available.", italics: true, color: MUTED, fontSize: 11, margin: [4, 0, 0, 4] });
        }
        return blocks;
      };
      var formatDur = formatDur2, sectionHeader = sectionHeader2, recBlock = recBlock2;
      const { recording, folderName, recordings } = req.body;
      const pdfmake = __require("pdfmake");
      pdfmake.fonts = {
        Helvetica: {
          normal: "Helvetica",
          bold: "Helvetica-Bold",
          italics: "Helvetica-Oblique",
          bolditalics: "Helvetica-BoldOblique"
        }
      };
      const INDIGO = "#3F51B5";
      const CORAL = "#FF7043";
      const MINT = "#2D9E96";
      const TEXT = "#1A1A2E";
      const MUTED = "#666680";
      const GENERATED = (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const allRecordings = recordings || (recording ? [recording] : []);
      const docTitle = recording ? recording.title : folderName || "Lecto Notes";
      const contentBlocks = [];
      allRecordings.forEach((rec, i) => {
        contentBlocks.push(...recBlock2(rec, recordings ? folderName : void 0));
        if (i < allRecordings.length - 1) {
          contentBlocks.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: "#E8E8F0" }], margin: [0, 28, 0, 28] });
        }
      });
      const docDefinition = {
        defaultStyle: { font: "Helvetica" },
        pageMargins: [50, 76, 50, 58],
        header: (currentPage, pageCount, pageSize) => [
          { canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: 65, color: INDIGO }] },
          {
            absolutePosition: { x: 50, y: 14 },
            stack: [
              { text: "LECTO", fontSize: 8, bold: true, color: "white", characterSpacing: 3 },
              { text: docTitle, fontSize: 14, bold: true, color: "#ffffff", margin: [0, 5, 0, 0] }
            ]
          }
        ],
        footer: (currentPage, pageCount, pageSize) => [
          { canvas: [{ type: "line", x1: 50, y1: 0, x2: pageSize.width - 50, y2: 0, lineWidth: 1, lineColor: "#E8E8F0" }] },
          {
            columns: [
              { text: "LECTO", fontSize: 10, bold: true, color: INDIGO, characterSpacing: 1 },
              { text: `Generated ${GENERATED}`, fontSize: 9, color: MUTED, alignment: "right" }
            ],
            margin: [50, 8, 50, 0]
          }
        ],
        content: contentBlocks
      };
      const pdfDoc = pdfmake.createPdf(docDefinition);
      const buffer = await pdfDoc.getBuffer();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(docTitle)}.pdf"`);
      res.send(Buffer2.from(buffer));
    } catch (error) {
      console.error("PDF error:", error);
      res.status(500).json({ error: error.message || "PDF generation failed" });
    }
  });
  app2.post("/api/promo/redeem", (req, res) => {
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
      message: `Code applied! You now have ${daysText} of Lecto Pro.`
    });
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
var app = express2();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express2.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express2.urlencoded({ extended: false, limit: "50mb" }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express2.static(path.resolve(process.cwd(), "assets")));
  app2.use(express2.static(path.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
