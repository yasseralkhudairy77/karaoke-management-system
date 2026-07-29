import { formatReceipt58mm } from "./receipt.js?v=thermal-logo-canvas-5g";

const THERMAL_PAGE_WIDTH_MM = 58;
const THERMAL_HORIZONTAL_PADDING_MM = 2;
const THERMAL_CANVAS_WIDTH_PX = 384;
const THERMAL_CANVAS_PADDING_PX = 12;
const THERMAL_LOGO_WIDTH_PX = 220;
const THERMAL_FONT_SIZE_PX = 17;
const THERMAL_LINE_HEIGHT_PX = 22;
const THERMAL_LOGO_DATA_URL = "data:image/png;base64,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";

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

async function loadThermalLogoImage() {
  return loadImageSource(THERMAL_LOGO_DATA_URL);
}

function loadImageSource(source) {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      resolve(null);
    };
    image.src = source;
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
