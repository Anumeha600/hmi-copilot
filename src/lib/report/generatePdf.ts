import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface ReportData {
  timestamp: number;
  deviceProfile: string;
  healthScore: number;
  temperature: number;
  vibration: number;
  current: number;
  rpm: number;
  failureProbability: number;
  remainingLifeHours: number;
  /** Display-ready RUL label ("4.8 hrs" / "> 24 hrs" / "Indeterminate") from the regression-based RUL engine (lib/rul.ts). */
  rulLabel: string;
  trendDescription: string;
  predictionConfidence: number;
  rootCause: string;
  recommendation: string;
  componentName: string;
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;

/** pdf-lib's StandardFonts use WinAnsi encoding, which can't draw em/en dashes,
 *  curly quotes, or ellipsis — the app's copy uses all three, so normalize first. */
function sanitizeForPdf(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/°/g, " deg")
    .replace(/↑/g, "Up")
    .replace(/↓/g, "Down")
    .replace(/→/g, "->");
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
): number {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  let y = startY;
  for (const l of lines) {
    page.drawText(l, { x, y, size, font, color });
    y -= size + 5;
  }
  return y;
}

/** Draws the activity-pulse mark as vectors — no external image asset needed. */
function drawLogoMark(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  const points: [number, number][] = [
    [x, y],
    [x + 9, y],
    [x + 14, y + 11],
    [x + 19, y - 11],
    [x + 24, y],
    [x + 34, y],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    page.drawLine({
      start: { x: points[i][0], y: points[i][1] },
      end: { x: points[i + 1][0], y: points[i + 1][1] },
      thickness: 2.2,
      color,
    });
  }
}

export async function generateReportPdf(rawData: ReportData): Promise<Uint8Array> {
  const data: ReportData = {
    ...rawData,
    deviceProfile: sanitizeForPdf(rawData.deviceProfile),
    rootCause: sanitizeForPdf(rawData.rootCause),
    recommendation: sanitizeForPdf(rawData.recommendation),
    componentName: sanitizeForPdf(rawData.componentName),
    trendDescription: sanitizeForPdf(rawData.trendDescription),
    rulLabel: sanitizeForPdf(rawData.rulLabel),
  };

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(0.027, 0.067, 0.122);
  const cyan = rgb(0.133, 0.827, 0.933);
  const white = rgb(1, 1, 1);
  const subtleWhite = rgb(0.7, 0.75, 0.82);
  const slate = rgb(0.42, 0.45, 0.51);
  const dark = rgb(0.09, 0.09, 0.11);
  const ruleColor = rgb(0.85, 0.85, 0.85);

  // Header band
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 92, width: PAGE_WIDTH, height: 92, color: navy });
  drawLogoMark(page, 50, PAGE_HEIGHT - 52, cyan);
  page.drawText("HMI Copilot", { x: 96, y: PAGE_HEIGHT - 50, size: 18, font: fontBold, color: white });
  page.drawText("Adaptive Industrial HMI - Engineering Report", {
    x: 96,
    y: PAGE_HEIGHT - 66,
    size: 9,
    font: fontRegular,
    color: subtleWhite,
  });

  let y = PAGE_HEIGHT - 122;
  const left = 50;
  const right = PAGE_WIDTH - 50;

  const dateStr = sanitizeForPdf(new Date(data.timestamp).toLocaleString());
  page.drawText(`Generated: ${dateStr}`, { x: left, y, size: 10, font: fontRegular, color: slate });
  y -= 16;
  page.drawText(`Device Profile: ${data.deviceProfile}`, { x: left, y, size: 10, font: fontRegular, color: slate });
  y -= 34;

  const sectionHeader = (label: string) => {
    page.drawText(label, { x: left, y, size: 12, font: fontBold, color: dark });
    y -= 8;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: ruleColor });
    y -= 20;
  };

  const row = (label: string, value: string) => {
    page.drawText(label, { x: left, y, size: 10, font: fontRegular, color: slate });
    page.drawText(value, { x: left + 220, y, size: 10, font: fontBold, color: dark });
    y -= 18;
  };

  sectionHeader("MACHINE TELEMETRY");
  row("Health Score", `${data.healthScore}%`);
  row("Temperature", `${data.temperature.toFixed(1)} deg C`);
  row("Vibration", `${data.vibration.toFixed(2)} mm/s`);
  row("Current", `${data.current.toFixed(2)} A`);
  row("RPM", `${Math.round(data.rpm)}`);

  y -= 14;
  sectionHeader(`COMPONENT DIAGNOSIS - ${data.componentName.toUpperCase()}`);
  row("Model-Estimated Failure Probability", `${data.failureProbability}%`);
  row("Remaining Useful Life", data.rulLabel);
  row("Trend Direction", data.trendDescription);
  row("Prediction Confidence", `${data.predictionConfidence}%`);

  y -= 14;
  page.drawText("ROOT CAUSE", { x: left, y, size: 12, font: fontBold, color: dark });
  y -= 18;
  y = drawWrappedText(page, data.rootCause, left, y, right - left, 10, fontRegular, dark);

  y -= 16;
  page.drawText("MAINTENANCE RECOMMENDATION", { x: left, y, size: 12, font: fontBold, color: dark });
  y -= 18;
  y = drawWrappedText(page, data.recommendation, left, y, right - left, 10, fontRegular, dark);

  page.drawText("Generated locally by HMI Copilot. Regression is local; no cloud diagnosis was performed.", {
    x: left,
    y: 40,
    size: 8,
    font: fontRegular,
    color: slate,
  });

  return doc.save();
}

export function formatReportFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `HMI_Copilot_Report_${y}${m}${d}_${hh}${mm}.pdf`;
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
