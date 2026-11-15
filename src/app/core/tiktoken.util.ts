import { signal } from '@angular/core';
import type { Tiktoken } from 'js-tiktoken/lite';

let encoderInstance: Tiktoken | null = null;
let loadingPromise: Promise<Tiktoken | null> | null = null;

export const tiktokenReady = signal<boolean>(false);

function estimateTokensFallback(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const words = trimmed.split(/\s+/).length;
  return Math.round(words * 1.35);
}

export async function ensureTiktokenLoaded(): Promise<Tiktoken | null> {
  if (encoderInstance) return encoderInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const [{ Tiktoken }, ranksModule] = await Promise.all([
        import('js-tiktoken/lite'),
        import('js-tiktoken/ranks/cl100k_base')
      ]);
      const ranks = ranksModule.default ?? ranksModule;
      encoderInstance = new Tiktoken(ranks);
      tiktokenReady.set(true);
      return encoderInstance;
    } catch (e) {
      console.warn('Failed to load cl100k_base encoding, fallback to word ratio', e);
      loadingPromise = null;
      return null;
    }
  })();

  return loadingPromise;
}

export function countTokensSync(text: string): number {
  if (!text) return 0;
  // Read signal so Angular computed() signals re-evaluate once the BPE chunk finishes loading
  const isReady = tiktokenReady();
  if (!isReady || !encoderInstance) {
    void ensureTiktokenLoaded();
    return estimateTokensFallback(text);
  }
  try {
    return encoderInstance.encode(text).length;
  } catch (e) {
    console.warn('Tiktoken encoding failed, fallback to word ratio', e);
    return estimateTokensFallback(text);
  }
}

export async function countTokensAsync(text: string): Promise<number> {
  if (!text) return 0;
  const enc = await ensureTiktokenLoaded();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch (e) {
      console.warn('Tiktoken encoding failed, fallback to word ratio', e);
    }
  }
  return estimateTokensFallback(text);
}
