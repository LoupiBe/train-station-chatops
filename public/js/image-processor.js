/**
 * public/js/image-processor.js
 * Modular Client-Side Canvas Engine for Kiosk Advertisements (1280x200 WebP)
 * Supports 1-click framing presets, opacity detection, text banner generation, and slug sanitization.
 */

/**
 * Creates or wraps a Canvas element of specified dimensions.
 * @param {number} width 
 * @param {number} height 
 * @returns {HTMLCanvasElement}
 */
export function createCanvas(width = 1280, height = 200) {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return {
    width,
    height,
    getContext: () => null,
  };
}

/**
 * Adapts an image into a 1280x200 Canvas without clipping (Letterbox/Contain),
 * with Cover-scaled blurred background over opaque #1a202c base with 40px overflow margins
 * or transparent margins.
 * @param {HTMLImageElement|ImageBitmap|object} img 
 * @param {object} [options={}]
 * @param {boolean} [options.blurBackground=true]
 * @param {HTMLCanvasElement} [options.canvas]
 * @returns {HTMLCanvasElement}
 */
export function fitWithMargins(img, { blurBackground = true, canvas: customCanvas } = {}) {
  const canvas = customCanvas || createCanvas(1280, 200);
  const ctx = canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx || !img) return canvas;

  const imgW = img.naturalWidth || img.width || 1280;
  const imgH = img.naturalHeight || img.height || 200;
  if (imgW <= 0 || imgH <= 0) return canvas;

  if (blurBackground) {
    // 1. Dark opaque base (#1a202c) to guarantee 100% alpha even if blur bleeds
    ctx.fillStyle = "#1a202c";
    ctx.fillRect(0, 0, 1280, 200);

    // 2. Blurred background using Cover scaling with 40px overflow margins (1360x280)
    // Preserves native aspect ratio to prevent 7x horizontal stretching on portrait images
    ctx.save();
    ctx.filter = "blur(20px) brightness(0.7)";
    const coverScale = Math.max(1360 / imgW, 280 / imgH);
    const bgW = imgW * coverScale;
    const bgH = imgH * coverScale;
    const bgX = (1280 - bgW) / 2;
    const bgY = (200 - bgH) / 2;
    ctx.drawImage(img, bgX, bgY, bgW, bgH);
    ctx.restore();
  } else {
    ctx.clearRect(0, 0, 1280, 200);
  }

  // 3. Draw foreground image centered (Contain)
  const scale = Math.min(1280 / imgW, 200 / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = (1280 - drawW) / 2;
  const drawY = (200 - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  return canvas;
}

/**
 * Fills the 1280x200 Canvas completely (Cover) cropping excess
 * based on vertical anchor ('top', 'center', 'bottom').
 * @param {HTMLImageElement|ImageBitmap|object} img 
 * @param {'top'|'center'|'bottom'} [anchor='center']
 * @param {object} [options={}]
 * @param {HTMLCanvasElement} [options.canvas]
 * @returns {HTMLCanvasElement}
 */
export function cropFill(img, anchor = "center", { canvas: customCanvas } = {}) {
  const canvas = customCanvas || createCanvas(1280, 200);
  const ctx = canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx || !img) return canvas;

  const imgW = img.naturalWidth || img.width || 1280;
  const imgH = img.naturalHeight || img.height || 200;
  if (imgW <= 0 || imgH <= 0) return canvas;

  const scale = Math.max(1280 / imgW, 200 / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = (1280 - drawW) / 2;

  let drawY = 0;
  if (anchor === "top") {
    drawY = 0;
  } else if (anchor === "bottom") {
    drawY = 200 - drawH;
  } else {
    drawY = (200 - drawH) / 2;
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  return canvas;
}

/**
 * Evaluates whether an image/canvas has an opaque background (Tag F) or transparent background.
 * Samples pixels with 4x4 stride and 2x weighting on the relative bottom band (y >= height * 0.7).
 * Returns true if >= 98% of sampled pixels have alpha >= 240.
 * @param {CanvasRenderingContext2D} ctx 
 * @param {number} [width] 
 * @param {number} [height] 
 * @returns {boolean}
 */
export function isImageOpaque(ctx, width, height) {
  if (!ctx || typeof ctx.getImageData !== "function") return false;
  const w = width || ctx.canvas?.width || 1280;
  const h = height || ctx.canvas?.height || 200;
  if (w <= 0 || h <= 0) return false;

  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    let totalSampled = 0;
    let opaqueCount = 0;

    const stepX = 4;
    const stepY = 4;
    const bottomThreshold = h * 0.7;

    for (let y = 0; y < h; y += stepY) {
      const isBottomBand = y >= bottomThreshold;
      const weight = isBottomBand ? 2 : 1;
      for (let x = 0; x < w; x += stepX) {
        const idx = (y * w + x) * 4;
        if (idx + 3 < data.length) {
          totalSampled += weight;
          if (data[idx + 3] >= 240) {
            opaqueCount += weight;
          }
        }
      }
    }

    return totalSampled > 0 ? (opaqueCount / totalSampled) >= 0.98 : false;
  } catch {
    return false;
  }
}

/**
 * Preloads a local Web Font asynchronously before Canvas rendering.
 * Protected with a timeout to avoid freezing on slow connections.
 * @param {string} [fontSpec='700 48px "Quicksand"']
 * @param {number} [timeoutMs=1500]
 * @returns {Promise<void>}
 */
export async function ensureFontLoaded(fontSpec = '700 48px "Quicksand"', timeoutMs = 1500) {
  if (typeof document !== "undefined" && document.fonts && typeof document.fonts.load === "function") {
    try {
      const loadPromise = (async () => {
        await document.fonts.load(fontSpec);
        if (document.fonts.ready) {
          await document.fonts.ready;
        }
      })();
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, timeoutMs));
      await Promise.race([loadPromise, timeoutPromise]);
    } catch (e) {
      console.warn("Avertissement : chargement de police différé ou indisponible", e);
    }
  }
}

/**
 * Sanitizes a user-entered slug to strict lowercase alphanumeric with dashes/underscores.
 * Strips diacritics and removes leading/trailing dashes.
 * @param {string} input 
 * @returns {string}
 */
export function sanitizeSlug(input) {
  if (!input || typeof input !== "string") return "";
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Builds normalized ad filename adhering to timetable kiosk naming conventions:
 * [duration]-[date]-[F]-[slug].webp
 * @param {object} options
 * @param {number|string} [options.duration=15]
 * @param {string|null} [options.expiryDate=null] Formatted as YYYYMMDD or YYYY-MM-DD
 * @param {boolean} [options.isOpaque=false]
 * @param {string} [options.slug="affiche"]
 * @returns {string}
 */
export function buildAdFilename({ duration = 15, expiryDate = null, isOpaque = false, slug = "affiche" } = {}) {
  const parsedDur = parseInt(duration, 10);
  const dur = !isNaN(parsedDur) && parsedDur > 0 ? parsedDur : 15;
  const cleanSlug = sanitizeSlug(slug) || "affiche";
  let datePart = "";
  if (expiryDate) {
    const match = String(expiryDate).match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (match) {
      datePart = `-${match[1]}${match[2]}${match[3]}`;
    }
  }
  const fPart = isOpaque ? "-F" : "";
  return `${dur}${datePart}${fPart}-${cleanSlug}.webp`;
}

/**
 * Dynamically scales and wraps text into lines fitting within maxWidth and maxHeight.
 * Supports forced word-breaking for long words/URLs exceeding maxWidth.
 * @param {CanvasRenderingContext2D} ctx 
 * @param {string} text 
 * @param {number} [maxWidth=1160] 
 * @param {number} [maxHeight=160] 
 * @param {number} [maxFontSize=72] 
 * @param {number} [minFontSize=24] 
 * @param {string} [fontFamily='Quicksand'] 
 * @returns {{ fontSize: number, lines: string[], lineHeight: number, totalHeight: number }}
 */
export function fitTextToBox(
  ctx,
  text,
  maxWidth = 1160,
  maxHeight = 160,
  maxFontSize = 72,
  minFontSize = 24,
  fontFamily = "Quicksand"
) {
  const cleanText = (text || "").trim();
  if (!cleanText || !ctx) {
    const finalLineHeight = Math.round(minFontSize * 1.25);
    return { fontSize: minFontSize, lines: [], lineHeight: finalLineHeight, totalHeight: 0 };
  }

  // Preserve intentional line breaks by paragraphs
  const rawParagraphs = cleanText.split(/\r?\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (rawParagraphs.length === 0) {
    const finalLineHeight = Math.round(minFontSize * 1.25);
    return { fontSize: minFontSize, lines: [], lineHeight: finalLineHeight, totalHeight: 0 };
  }

  for (let size = maxFontSize; size >= minFontSize; size -= 2) {
    ctx.font = `700 ${size}px ${fontFamily}`;
    const lineHeight = Math.round(size * 1.25);
    const lines = [];

    for (const paragraph of rawParagraphs) {
      const rawWords = paragraph.split(/\s+/);
      let currentLine = "";

      for (const word of rawWords) {
        const wordWidth = ctx.measureText(word).width;
        if (wordWidth > maxWidth) {
          // Forced word-breaking: split word into chunks that fit maxWidth
          let remaining = word;
          while (remaining.length > 0) {
            let sliceLen = remaining.length;
            while (sliceLen > 1 && ctx.measureText(remaining.slice(0, sliceLen)).width > maxWidth) {
              sliceLen--;
            }
            const chunk = remaining.slice(0, sliceLen);
            remaining = remaining.slice(sliceLen);
            if (currentLine) {
              lines.push(currentLine);
              currentLine = "";
            }
            if (remaining.length > 0) {
              lines.push(chunk);
            } else {
              currentLine = chunk;
            }
          }
          continue;
        }

        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
    }

    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= maxHeight || size === minFontSize) {
      return { fontSize: size, lines, lineHeight, totalHeight };
    }
  }

  const fallbackHeight = Math.round(minFontSize * 1.25);
  return { fontSize: minFontSize, lines: [cleanText], lineHeight: fallbackHeight, totalHeight: fallbackHeight };
}

/**
 * Generates an advertising text banner strictly sized to 1280x200 Canvas.
 * Default style: "cafe" (Ambiance Café ☕).
 * @param {object} options
 * @param {string} options.text 
 * @param {'cafe'|'official'} [options.style='cafe'] 
 * @param {string} [options.bgColor] 
 * @param {string} [options.textColor] 
 * @param {HTMLCanvasElement} [options.canvas] 
 * @returns {HTMLCanvasElement}
 */
export function generateTextBanner({
  text = "",
  style = "cafe",
  bgColor,
  textColor,
  canvas: customCanvas,
} = {}) {
  const canvas = customCanvas || createCanvas(1280, 200);
  const ctx = canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) return canvas;

  const isCafe = style === "cafe";
  const bg = bgColor || (isCafe ? "#2c1810" : "#1a365d");
  const fg = textColor || (isCafe ? "#fef3c7" : "#ffffff");
  const fontFamily = isCafe ? '"Quicksand", sans-serif' : "system-ui, -apple-system, sans-serif";

  // Fill opaque background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1280, 200);

  const trimmedText = (text || "").trim();
  if (!trimmedText) return canvas;

  const { fontSize, lines, lineHeight, totalHeight } = fitTextToBox(
    ctx,
    trimmedText,
    1160,
    160,
    72,
    24,
    fontFamily
  );

  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const startY = Math.max(lineHeight / 2, (200 - totalHeight) / 2 + lineHeight / 2);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 1280 / 2, startY + i * lineHeight);
  }

  return canvas;
}

/**
 * Exports a Canvas element to WebP format.
 * Returns a Blob or data URL.
 * @param {HTMLCanvasElement} canvas 
 * @param {number} [quality=0.92] 
 * @returns {Promise<Blob|string>}
 */
export function canvasToWebP(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            try {
              resolve(canvas.toDataURL("image/webp", quality));
            } catch (err) {
              reject(err);
            }
            return;
          }
          resolve(blob);
        },
        "image/webp",
        quality
      );
    } else if (typeof canvas.toDataURL === "function") {
      resolve(canvas.toDataURL("image/webp", quality));
    } else {
      reject(new Error("Canvas toBlob/toDataURL not supported"));
    }
  });
}
