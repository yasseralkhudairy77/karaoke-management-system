import { formatReceipt58mm } from "./receipt.js?v=thermal-logo-canvas-5g";

const THERMAL_PAGE_WIDTH_MM = 58;
const THERMAL_HORIZONTAL_PADDING_MM = 2;
const THERMAL_CANVAS_WIDTH_PX = 384;
const THERMAL_CANVAS_PADDING_PX = 12;
const THERMAL_LOGO_WIDTH_PX = 220;
const THERMAL_FONT_SIZE_PX = 17;
const THERMAL_LINE_HEIGHT_PX = 22;
const THERMAL_LOGO_PATH = "assets/receipt/happy-song-logo-thermal-print.png";

export function printThermalReceipt(receiptData) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }

  const receiptText = stripReceiptTextHeader(formatReceipt58mm(receiptData));
  const frame = document.createElement("iframe");

  removeExistingThermalPrintFrame();

  frame.className = "thermal-print-frame";
  frame.setAttribute("title", "Cetak Thermal 58mm");

  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument || frameWindow?.document;

  if (!frameWindow || !frameDocument) {
    frame.remove();
    return false;
  }

  const printFrame = () => {
    frameWindow.focus();
    frameWindow.print();
  };

  renderThermalReceiptCanvas(receiptText).then((receiptCanvas) => {
    frameDocument.open();
    frameDocument.write(buildThermalPrintDocument(receiptCanvas));
    frameDocument.close();

    drawReceiptCanvasToFrame(frameDocument, receiptCanvas);

    waitForThermalCanvas(frameDocument).then(() => {
      window.setTimeout(printFrame, 100);
    });
  });

  window.setTimeout(() => {
    frame.remove();
  }, 120000);

  return true;
}

function buildThermalPrintDocument(receiptImage) {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cetak Thermal 58mm</title>
    <style>
      @page {
        size: ${THERMAL_PAGE_WIDTH_MM}mm auto;
        margin: 0;
      }

      html,
      body {
        width: ${THERMAL_PAGE_WIDTH_MM}mm;
        margin: 0;
        padding: 0;
        height: auto;
        background: #ffffff;
        color: #000000;
      }

      body {
        box-sizing: border-box;
        display: block;
        overflow: visible;
        text-align: left;
        vertical-align: top;
      }

      canvas {
        display: block;
        width: ${THERMAL_PAGE_WIDTH_MM}mm;
        height: auto;
        margin: 0;
        padding: 0;
      }

      @media print {
        html,
        body {
          width: ${THERMAL_PAGE_WIDTH_MM}mm;
          height: auto;
        }
      }
    </style>
  </head>
  <body>
    <canvas id="receiptCanvas" width="${receiptImage.width}" height="${receiptImage.height}"></canvas>
  </body>
</html>`;
}

async function renderThermalReceiptCanvas(receiptText) {
  const logo = await loadThermalLogoImage();
  const receiptLines = String(receiptText).split("\n");
  const logoHeight = logo
    ? Math.round((logo.height / logo.width) * THERMAL_LOGO_WIDTH_PX)
    : 0;
  const brandTextHeight = THERMAL_LINE_HEIGHT_PX + 8;
  const textHeight = receiptLines.length * THERMAL_LINE_HEIGHT_PX;
  const canvasHeight = Math.ceil(
    THERMAL_CANVAS_PADDING_PX +
    logoHeight +
    (logo ? 8 : 0) +
    brandTextHeight +
    8 +
    textHeight +
    24
  );
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  canvas.width = THERMAL_CANVAS_WIDTH_PX;
  canvas.height = canvasHeight;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  let y = THERMAL_CANVAS_PADDING_PX;

  if (logo) {
    const logoX = Math.round((THERMAL_CANVAS_WIDTH_PX - THERMAL_LOGO_WIDTH_PX) / 2);
    context.drawImage(logo, logoX, y, THERMAL_LOGO_WIDTH_PX, logoHeight);
    y += logoHeight + 8;
  } else {
    y = drawFallbackThermalLogo(context, y);
  }

  context.fillStyle = "#000000";
  context.font = "900 18px 'Courier New', monospace";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText("HAPPY SONG KARAOKE", Math.round(THERMAL_CANVAS_WIDTH_PX / 2), y);
  y += brandTextHeight + 8;

  context.font = `700 ${THERMAL_FONT_SIZE_PX}px 'Courier New', monospace`;
  context.textAlign = "left";

  receiptLines.forEach((line) => {
    context.fillText(line, THERMAL_CANVAS_PADDING_PX, y);
    y += THERMAL_LINE_HEIGHT_PX;
  });

  return canvas;
}

function drawReceiptCanvasToFrame(frameDocument, receiptCanvas) {
  const targetCanvas = frameDocument.getElementById?.("receiptCanvas");
  const targetContext = targetCanvas?.getContext?.("2d", { alpha: false });

  if (!targetCanvas || !targetContext) {
    return;
  }

  targetContext.fillStyle = "#ffffff";
  targetContext.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.drawImage(receiptCanvas, 0, 0);
  targetCanvas.dataset.ready = "true";
}

function drawFallbackThermalLogo(context, y) {
  const logoBoxWidth = 220;
  const logoBoxHeight = 92;
  const x = Math.round((THERMAL_CANVAS_WIDTH_PX - logoBoxWidth) / 2);
  const centerX = Math.round(THERMAL_CANVAS_WIDTH_PX / 2);

  context.save();
  context.strokeStyle = "#000000";
  context.fillStyle = "#000000";
  context.lineWidth = 5;
  context.beginPath();
  context.ellipse(centerX, y + 46, 105, 42, 0, 0, Math.PI * 2);
  context.stroke();

  context.font = "900 58px 'Times New Roman', serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("HS", centerX - 16, y + 47);

  context.lineWidth = 4;
  context.strokeRect(x + 174, y + 22, 24, 34);
  context.beginPath();
  context.moveTo(x + 186, y + 56);
  context.lineTo(x + 186, y + 76);
  context.stroke();
  context.beginPath();
  context.moveTo(x + 178, y + 76);
  context.lineTo(x + 194, y + 76);
  context.stroke();
  context.restore();

  return y + logoBoxHeight + 8;
}

async function loadThermalLogoImage() {
  const logoSource = await getThermalLogoSource();

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      resolve(null);
    };
    image.src = logoSource;
  });
}

function getThermalLogoUrl() {
  try {
    return new URL(THERMAL_LOGO_PATH, window.location.href).href;
  } catch (_error) {
    return THERMAL_LOGO_PATH;
  }
}

async function getThermalLogoSource() {
  const logoUrl = getThermalLogoUrl();

  if (typeof fetch !== "function" || typeof FileReader === "undefined") {
    return logoUrl;
  }

  try {
    const response = await fetch(logoUrl, { cache: "force-cache" });

    if (!response.ok) {
      return logoUrl;
    }

    const blob = await response.blob();

    return await readBlobAsDataUrl(blob);
  } catch (_error) {
    return logoUrl;
  }
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      resolve(String(reader.result || ""));
    });
    reader.addEventListener("error", () => {
      reject(reader.error || new Error("Logo thermal gagal dibaca."));
    });
    reader.readAsDataURL(blob);
  });
}

function stripReceiptTextHeader(receiptText) {
  const lines = String(receiptText).split("\n");

  if (
    lines.length >= 4 &&
    /^#+$/.test(lines[0] || "") &&
    /^#+$/.test(lines[3] || "")
  ) {
    return lines.slice(4).join("\n").replace(/^\n+/, "");
  }

  return String(receiptText);
}

function waitForThermalCanvas(frameDocument) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const checkReady = () => {
      const canvas = frameDocument.getElementById?.("receiptCanvas");

      if (canvas?.dataset?.ready === "true" || Date.now() - startedAt > 1500) {
        resolve();
        return;
      }

      window.setTimeout(checkReady, 50);
    };

    checkReady();
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function removeExistingThermalPrintFrame() {
  document.querySelectorAll(".thermal-print-frame").forEach((frame) => {
    frame.remove();
  });
}
