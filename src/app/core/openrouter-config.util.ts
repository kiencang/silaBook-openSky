import { signal } from '@angular/core';

export interface CustomModel {
  id: string;
  name: string;
}

export const DEFAULT_CUSTOM_MODELS: CustomModel[] = [
  { id: '~google/gemini-flash-latest', name: 'Google Gemini Flash Latest' },
  { id: 'openai/gpt-5.6-luna', name: 'OpenAI GPT-5.6 Luna' },
  { id: 'meta/muse-spark-1.3', name: 'Meta Muse Spark 1.3' },
  { id: '~deepseek/deepseek-v4-flash-latest', name: 'DeepSeek V4 Flash Latest' },
  { id: '~z-ai/glm-flash-latest', name: 'Z.ai GLM Flash Latest' }
];

export const DEFAULT_ECONOMY_MODELS: CustomModel[] = [
  { id: 'google/gemini-3.5-flash-lite', name: 'Google Gemini 3.5 Flash Lite (đa phương thức)' },
  { id: '~z-ai/glm-flash-latest', name: 'Z.ai GLM Flash Latest (đa phương thức)' },
  { id: '~deepseek/deepseek-v4-flash-latest', name: 'DeepSeek V4 Flash Latest' }
];

export function getCustomModels(): CustomModel[] {
  if (typeof window === 'undefined') return DEFAULT_CUSTOM_MODELS;
  try {
    const raw = localStorage.getItem('user_openrouter_models');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 9).map((item: { id?: string; name?: string }) => ({
          id: String(item.id || '').trim(),
          name: String(item.name || '').trim() || String(item.id || '').trim()
        })).filter(item => item.id.length > 0);
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_CUSTOM_MODELS;
}

export function saveCustomModels(models: CustomModel[]): void {
  if (typeof window === 'undefined') return;
  const valid = models.slice(0, 9).map(m => ({
    id: m.id.trim(),
    name: m.name.trim() || m.id.trim()
  })).filter(m => m.id.length > 0);
  
  localStorage.setItem('user_openrouter_models', JSON.stringify(valid));
  customModelsState.set(valid);
}

export function getCustomEconomyModels(): CustomModel[] {
  if (typeof window === 'undefined') return DEFAULT_ECONOMY_MODELS;
  try {
    const raw = localStorage.getItem('user_openrouter_economy_models');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 3).map((item: { id?: string; name?: string }) => ({
          id: String(item.id || '').trim(),
          name: String(item.name || '').trim() || String(item.id || '').trim()
        })).filter(item => item.id.length > 0);
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_ECONOMY_MODELS;
}

export function saveCustomEconomyModels(models: CustomModel[]): void {
  if (typeof window === 'undefined') return;
  const valid = models.slice(0, 3).map(m => ({
    id: m.id.trim(),
    name: m.name.trim() || m.id.trim()
  })).filter(m => m.id.length > 0);
  
  localStorage.setItem('user_openrouter_economy_models', JSON.stringify(valid));
  customEconomyModelsState.set(valid);
}

const customModelsState = signal<CustomModel[]>(getCustomModels());
export const customModels = customModelsState.asReadonly();

const customEconomyModelsState = signal<CustomModel[]>(getCustomEconomyModels());
export const customEconomyModels = customEconomyModelsState.asReadonly();

export function getQualityTemperature(): number {
  if (typeof window === 'undefined') return 1.0;
  try {
    const raw = localStorage.getItem('user_quality_temperature');
    if (raw !== null) {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        return Math.min(1, Math.max(0, Math.round(parsed * 10) / 10));
      }
    }
  } catch {
    // fallback
  }
  return 1.0;
}

export function saveQualityTemperature(temp: number): void {
  if (typeof window === 'undefined') return;
  const clamped = Math.min(1, Math.max(0, Math.round(temp * 10) / 10));
  localStorage.setItem('user_quality_temperature', String(clamped));
}

export type ReasoningEffortOption = 'high' | 'medium' | 'low' | 'none';

export function getReasoningEffort(): ReasoningEffortOption {
  if (typeof window === 'undefined') return 'high';
  try {
    const raw = localStorage.getItem('user_reasoning_effort');
    if (raw === 'high' || raw === 'medium' || raw === 'low' || raw === 'none') {
      return raw;
    }
  } catch {
    // fallback
  }
  return 'high';
}

export function saveReasoningEffort(effort: ReasoningEffortOption): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('user_reasoning_effort', effort);
}

export class PromptLoadError extends Error {
  constructor(public readonly url: string, message?: string) {
    super(
      message ||
        `Lỗi: Không thể tải tệp chỉ thị AI (${url}). Vui lòng kiểm tra kết nối mạng hoặc tải lại trang (F5).`
    );
    this.name = 'PromptLoadError';
  }
}

export function isPromptLoadError(e: unknown): boolean {
  return e instanceof PromptLoadError || (e instanceof Error && e.name === 'PromptLoadError');
}

export function isQuotaError(e: unknown): boolean {
  const msg = (e as Error)?.message || e?.toString() || '';
  const lowerMsg = msg.toLowerCase();
  return (
    lowerMsg.includes('quota') ||
    lowerMsg.includes('429') ||
    lowerMsg.includes('402') ||
    lowerMsg.includes('insufficient_credits') ||
    lowerMsg.includes('rate_limit') ||
    lowerMsg.includes('credit')
  );
}

export function parseOpenRouterError(e: unknown): string {
  if (isPromptLoadError(e)) {
    return (e as Error).message;
  }

  const msg = (e as Error)?.message || e?.toString() || '';
  const lower = msg.toLowerCase();

  let rawDetail = '';
  try {
    if (msg.includes('{')) {
      const str = msg.substring(msg.indexOf('{'));
      const obj = JSON.parse(str);
      if (obj?.error?.message) {
        rawDetail = String(obj.error.message);
      }
    }
  } catch {
    // ignore
  }

  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return 'Lỗi: OpenRouter API Key không hợp lệ hoặc bị từ chối. Vui lòng kiểm tra lại cấu hình Key.';
  }
  if (lower.includes('402') || lower.includes('insufficient_credits') || lower.includes('credit')) {
    return rawDetail
      ? `Lỗi: Không đủ số dư/hạn mức trên OpenRouter (402). Chi tiết: ${rawDetail}`
      : 'Lỗi: Tài khoản OpenRouter của bạn đã hết số dư (Out of credits). Vui lòng nạp thêm credit trên OpenRouter.';
  }
  if (lower.includes('quota') || lower.includes('429') || lower.includes('rate limit')) {
    return 'Lỗi: Đã vượt quá giới hạn tần suất yêu cầu (Rate limit / Quota exceeded). Vui lòng thử lại sau giây lát.';
  }
  if (lower.includes('network') || lower.includes('fetch failed')) {
    return 'Lỗi kết nối mạng: Không thể kết nối tới máy chủ OpenRouter. Vui lòng kiểm tra kết nối internet.';
  }
  if (lower.includes('timeout')) {
    return 'Lỗi: Quá thời gian chờ phản hồi từ OpenRouter (Timeout).';
  }
  if (lower.includes('overloaded') || lower.includes('503') || lower.includes('502') || lower.includes('500')) {
    return 'Lỗi: Máy chủ AI hoặc OpenRouter đang quá tải, vui lòng thử lại sau giây lát.';
  }

  if (rawDetail) {
    return `Lỗi từ OpenRouter: ${rawDetail}`;
  }

  return msg ? msg : 'Lỗi không xác định khi kết nối OpenRouter, vui lòng thử lại.';
}
