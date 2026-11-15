export function convertDataUrlToUint8Array(dataUrl: string): Uint8Array {
  if (dataUrl.includes(';base64,')) {
    const parts = dataUrl.split(';base64,');
    const base64 = parts[parts.length - 1].replace(/\s+/g, '');
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  const commaIdx = dataUrl.indexOf(',');
  const rawPayload = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  let decoded = rawPayload;
  try {
    decoded = decodeURIComponent(rawPayload);
  } catch {
    // Giữ nguyên nếu chuỗi không phải URI-encoded
  }
  return new TextEncoder().encode(decoded);
}

// Ảnh PNG 1x1 trong suốt dự phòng khi môi trường không có Canvas 2D (SSR/Unit Test)
export const FALLBACK_1X1_PNG_BYTES = convertDataUrlToUint8Array(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
);

export interface PreparedDocxImage {
  width: number;
  height: number;
  type: 'jpg' | 'png' | 'gif' | 'bmp' | 'svg';
  data: Uint8Array;
  fallback?: {
    type: 'png';
    data: Uint8Array;
  };
}

export function parseSvgIntrinsicDimensions(svgBytes: Uint8Array): { width: number; height: number } | null {
  try {
    const svgText = new TextDecoder().decode(svgBytes);
    const svgTagMatch = svgText.match(/<svg\b[^>]*>/i);
    if (!svgTagMatch) return null;
    const svgTag = svgTagMatch[0];

    const widthMatch = svgTag.match(/\bwidth=["']\s*([0-9.]+)\s*(?:px)?\s*["']/i);
    const heightMatch = svgTag.match(/\bheight=["']\s*([0-9.]+)\s*(?:px)?\s*["']/i);
    if (widthMatch && heightMatch) {
      const w = parseFloat(widthMatch[1]);
      const h = parseFloat(heightMatch[1]);
      if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h) };
    }

    const viewBoxMatch = svgTag.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);
    if (viewBoxMatch) {
      const vbW = parseFloat(viewBoxMatch[1]);
      const vbH = parseFloat(viewBoxMatch[2]);
      if (vbW > 0 && vbH > 0) {
        const scale = vbW < 400 ? 800 / vbW : 1;
        return { width: Math.round(vbW * scale), height: Math.round(vbH * scale) };
      }
    }
  } catch {
    // Bỏ qua nếu không đọc được XML SVG
  }
  return null;
}

export function rasterizeImageElementToPng(img: HTMLImageElement, width: number, height: number): Uint8Array | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngDataUrl = canvas.toDataURL('image/png');
    if (pngDataUrl && pngDataUrl.startsWith('data:image/png;base64,')) {
      return convertDataUrlToUint8Array(pngDataUrl);
    }
  } catch {
    // Bỏ qua nếu trình duyệt/JSDOM không hỗ trợ Canvas 2D
  }
  return null;
}

export function prepareImageForDocx(dataUrl: string): Promise<PreparedDocxImage> {
  const mimeMatch = dataUrl.match(/^data:([^;,]+)[;,]/i);
  const mime = mimeMatch ? mimeMatch[1].toLowerCase().trim() : 'image/png';
  const rawBytes = convertDataUrlToUint8Array(dataUrl);

  let nativeType: 'jpg' | 'png' | 'gif' | 'bmp' | 'svg' | 'convert-to-png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    nativeType = 'jpg';
  } else if (mime === 'image/png') {
    nativeType = 'png';
  } else if (mime === 'image/gif') {
    nativeType = 'gif';
  } else if (mime === 'image/bmp' || mime === 'image/x-ms-bmp') {
    nativeType = 'bmp';
  } else if (mime === 'image/svg+xml') {
    nativeType = 'svg';
  } else {
    // WebP, AVIF hoặc định dạng ảnh khác không được OOXML hỗ trợ trực tiếp -> chuyển sang PNG
    nativeType = 'convert-to-png';
  }

  const svgDims = nativeType === 'svg' ? parseSvgIntrinsicDimensions(rawBytes) : null;
  const defaultWidth = svgDims?.width || 400;
  const defaultHeight = svgDims?.height || 300;

  const isJsdom =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');

  if (typeof window === 'undefined' || typeof Image === 'undefined' || isJsdom) {
    if (nativeType === 'svg') {
      return Promise.resolve({
        width: defaultWidth,
        height: defaultHeight,
        type: 'svg',
        data: rawBytes,
        fallback: { type: 'png', data: FALLBACK_1X1_PNG_BYTES },
      });
    }
    return Promise.resolve({
      width: defaultWidth,
      height: defaultHeight,
      type: nativeType === 'convert-to-png' ? 'png' : nativeType,
      data: rawBytes,
    });
  }

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;

      const width = (loaded && img.naturalWidth) ? img.naturalWidth : defaultWidth;
      const height = (loaded && img.naturalHeight) ? img.naturalHeight : defaultHeight;

      if (nativeType === 'svg') {
        const pngFallback = loaded ? rasterizeImageElementToPng(img, width, height) : null;
        resolve({
          width,
          height,
          type: 'svg',
          data: rawBytes,
          fallback: {
            type: 'png',
            data: pngFallback || FALLBACK_1X1_PNG_BYTES,
          },
        });
        return;
      }

      if (nativeType === 'convert-to-png') {
        const convertedPng = loaded ? rasterizeImageElementToPng(img, width, height) : null;
        resolve({
          width,
          height,
          type: 'png',
          data: convertedPng || rawBytes,
        });
        return;
      }

      resolve({
        width,
        height,
        type: nativeType,
        data: rawBytes,
      });
    };

    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = dataUrl;
  });
}
