import * as Print from "expo-print";
import * as FileSystem from "expo-file-system";
import { Platform, Share } from "react-native";
import { Recording } from "@/contexts/RecordingsContext";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const COLORS = {
  indigo: "#3F51B5",
  coral: "#FF7043",
  mint: "#4DB6AC",
  text: "#1A1A2E",
  textSecondary: "#666680",
  border: "#E8E8F0",
  bg: "#FAFAFE",
};

const SPEAKER_PALETTE = [
  COLORS.coral,
  COLORS.mint,
  COLORS.indigo,
  "#7E57C2",
  "#26A69A",
  "#EF5350",
];

function speakerColor(speaker: string, allSpeakers: string[]): string {
  const idx = allSpeakers.indexOf(speaker);
  return SPEAKER_PALETTE[idx % SPEAKER_PALETTE.length];
}

function escHtml(str: string | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRecordingHtml(rec: Recording, folderName?: string): string {
  const speakers =
    rec.speakers && rec.speakers.length > 0
      ? rec.speakers
      : Array.from(new Set(rec.transcript.map((t) => t.speaker)));

  const summaryHtml =
    rec.summary.length > 0
      ? rec.summary.map((s) => `<li>${escHtml(s)}</li>`).join("")
      : "<li>No summary available.</li>";

  const actionHtml =
    rec.actionItems.length > 0
      ? rec.actionItems
          .map((a) => {
            const col = speakerColor(a.speaker, speakers);
            return `<div class="action-item">
              <span class="speaker-badge" style="background:${col}20;color:${col}">${escHtml(a.speaker)}</span>
              <span class="action-text">${escHtml(a.task)}</span>
            </div>`;
          })
          .join("")
      : "<p class='empty'>No action items.</p>";

  const topicsHtml =
    rec.keyTopics && rec.keyTopics.length > 0
      ? rec.keyTopics
          .map((t) => `<span class="topic-tag">${escHtml(t)}</span>`)
          .join("")
      : "";

  const transcriptHtml =
    rec.transcript.length > 0
      ? rec.transcript
          .map((t) => {
            const col = speakerColor(t.speaker, speakers);
            return `<div class="transcript-line">
              <div class="transcript-meta">
                <span class="ts-speaker" style="color:${col}">${escHtml(t.speaker)}</span>
                <span class="ts-time">${escHtml(t.timestamp)}</span>
              </div>
              <p class="ts-text">${escHtml(t.text)}</p>
            </div>`;
          })
          .join("")
      : "<p class='empty'>No transcript available.</p>";

  const breadcrumb = folderName
    ? `<p class="folder-crumb">📁 ${escHtml(folderName)}</p>`
    : "";

  return `
    ${breadcrumb}
    <div class="recording-block">
      <h2 class="rec-title">${escHtml(rec.title)}</h2>
      <p class="rec-meta">${escHtml(formatDate(rec.date))} &nbsp;·&nbsp; ${escHtml(formatTime(rec.duration))}</p>
      ${topicsHtml ? `<div class="topics-row">${topicsHtml}</div>` : ""}

      <div class="section">
        <div class="section-header indigo">
          <span class="section-icon">✦</span> Summary
        </div>
        <ul class="summary-list">${summaryHtml}</ul>
      </div>

      <div class="section">
        <div class="section-header coral">
          <span class="section-icon">→</span> Action Items
        </div>
        <div class="actions-list">${actionHtml}</div>
      </div>

      <div class="section">
        <div class="section-header mint">
          <span class="section-icon">◈</span> Transcript
        </div>
        <div class="transcript-list">${transcriptHtml}</div>
      </div>
    </div>
  `;
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: ${COLORS.bg}; color: ${COLORS.text}; font-size: 14px; line-height: 1.6; padding: 0; }

  .page-header { background: ${COLORS.indigo}; padding: 32px 40px 24px; }
  .brand { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.7); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px; }
  .doc-title { font-size: 22px; font-weight: 700; color: #fff; line-height: 1.3; }

  .page-body { padding: 32px 40px; max-width: 800px; margin: 0 auto; }
  .divider { border: none; border-top: 2px solid ${COLORS.border}; margin: 36px 0; }

  .recording-block { margin-bottom: 48px; }
  .folder-crumb { font-size: 12px; color: ${COLORS.textSecondary}; margin-bottom: 10px; }
  .rec-title { font-size: 20px; font-weight: 700; color: ${COLORS.text}; margin-bottom: 4px; }
  .rec-meta { font-size: 13px; color: ${COLORS.textSecondary}; margin-bottom: 12px; }

  .topics-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
  .topic-tag { background: ${COLORS.indigo}14; color: ${COLORS.indigo}; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; border: 1px solid ${COLORS.indigo}30; }

  .section { margin-bottom: 28px; }
  .section-header { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; }
  .section-header.indigo { background: ${COLORS.indigo}12; color: ${COLORS.indigo}; }
  .section-header.coral { background: ${COLORS.coral}12; color: ${COLORS.coral}; }
  .section-header.mint { background: ${COLORS.mint}18; color: #2D9E96; }
  .section-icon { font-size: 14px; }

  .summary-list { padding-left: 20px; }
  .summary-list li { margin-bottom: 8px; color: ${COLORS.text}; font-size: 14px; }

  .action-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid ${COLORS.border}; }
  .action-item:last-child { border-bottom: none; }
  .speaker-badge { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; margin-top: 2px; white-space: nowrap; }
  .action-text { font-size: 14px; color: ${COLORS.text}; }

  .transcript-line { padding: 12px 0; border-bottom: 1px solid ${COLORS.border}; }
  .transcript-line:last-child { border-bottom: none; }
  .transcript-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .ts-speaker { font-size: 12px; font-weight: 700; }
  .ts-time { font-size: 11px; color: ${COLORS.textSecondary}; background: ${COLORS.border}; padding: 1px 7px; border-radius: 10px; }
  .ts-text { font-size: 14px; color: ${COLORS.text}; line-height: 1.6; }

  .empty { color: ${COLORS.textSecondary}; font-style: italic; font-size: 13px; }

  .page-footer { margin-top: 48px; padding: 20px 40px; border-top: 2px solid ${COLORS.border}; display: flex; justify-content: space-between; align-items: center; }
  .footer-brand { font-size: 12px; font-weight: 700; color: ${COLORS.indigo}; letter-spacing: 1px; }
  .footer-date { font-size: 11px; color: ${COLORS.textSecondary}; }
</style>
</head>
<body>
  <div class="page-header">
    <div class="brand">Lecto</div>
    <div class="doc-title">${escHtml(title)}</div>
  </div>
  <div class="page-body">
    ${body}
  </div>
  <div class="page-footer">
    <div class="footer-brand">LECTO</div>
    <div class="footer-date">Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
  </div>
</body>
</html>`;
}

async function generateAndShare(html: string, title: string): Promise<void> {
  // Web: use navigator.share if available, otherwise download the file
  if (Platform.OS === "web") {
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_");
    const blob = new Blob([html], { type: "text/html" });

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const file = new File([blob], `${safeTitle}.html`, { type: "text/html" });
        await navigator.share({ files: [file], title });
        return;
      } catch {
        // fall through to download
      }
    }

    // Fallback: download the HTML file
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // Native: generate PDF then open the system share sheet
  const { uri: fileUri } = await Print.printToFileAsync({ html, base64: false });

  if (Platform.OS === "android") {
    // Android requires a content:// URI to avoid FileUriExposedException
    const contentUri = await FileSystem.getContentUriAsync(fileUri);
    await Share.share({ url: contentUri, title, message: title });
  } else {
    // iOS: file:// URIs work directly with the share sheet
    await Share.share({ url: fileUri, title });
  }
}

export async function shareRecordingAsPdf(rec: Recording): Promise<void> {
  const html = wrapHtml(rec.title, buildRecordingHtml(rec));
  await generateAndShare(html, rec.title);
}

export async function shareFolderAsPdf(
  folderName: string,
  recordings: Recording[]
): Promise<void> {
  if (recordings.length === 0) return;

  const body = recordings
    .map((rec, i) => {
      const block = buildRecordingHtml(rec, folderName);
      return i < recordings.length - 1
        ? `${block}<hr class="divider"/>`
        : block;
    })
    .join("");

  const html = wrapHtml(`${folderName} — Notes`, body);
  await generateAndShare(html, folderName);
}
