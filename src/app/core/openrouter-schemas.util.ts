export interface OpenRouterJsonSchema {
  name: string;
  strict?: boolean;
  schema: Record<string, unknown>;
}

export function escapeMarkdownCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\\?\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/**
 * Loại bỏ vỏ bọc code block Markdown (```markdown, ```json, ```) ở đầu và cuối chuỗi trả về từ AI.
 */
export function stripMarkdownCodeFence(text: string): string {
  let result = text;
  if (result.startsWith('```markdown')) {
    result = result.replace(/^```markdown\n/, '').replace(/\n```$/, '');
  } else if (result.startsWith('```json')) {
    result = result.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (result.startsWith('```')) {
    result = result.replace(/^```\n/, '').replace(/\n```$/, '');
  }
  return result.trim();
}

/**
 * Trích xuất mảng dữ liệu JSON từ phản hồi của AI, hỗ trợ cả JSON chuẩn lẫn fallback bằng Regex
 * khi một số model trả kèm văn bản giải thích xung quanh.
 */
export function extractJsonArrayFromAiResponse<T>(
  responseText: string,
  preferredKeys: string[]
): T[] | null {
  const findArrayInObject = (obj: Record<string, unknown>): T[] | null => {
    for (const key of preferredKeys) {
      if (Array.isArray(obj[key])) {
        return obj[key] as T[];
      }
    }
    const firstArray = Object.values(obj).find(val => Array.isArray(val));
    return firstArray ? (firstArray as T[]) : null;
  };

  try {
    const parsed = JSON.parse(responseText);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const found = findArrayInObject(parsed as Record<string, unknown>);
      if (found) return found;
    }
  } catch {
    const arrMatch = responseText.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsedArr = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsedArr) && parsedArr.length > 0) {
          return parsedArr as T[];
        }
      } catch {
        // Bỏ qua lỗi parse mảng fallback, thử tiếp object fallback bên dưới
      }
    }

    const objMatch = responseText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsedObj = JSON.parse(objMatch[0]);
        if (typeof parsedObj === 'object' && parsedObj !== null) {
          const found = findArrayInObject(parsedObj as Record<string, unknown>);
          if (found) return found;
        }
      } catch {
        // Bỏ qua lỗi parse object fallback
      }
    }
  }

  return null;
}

export const FILTER_GLOSSARY_JSON_SCHEMA: OpenRouterJsonSchema = {
  name: 'filter_glossary',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            english: { type: 'string' },
            pos: { type: 'string' }
          },
          required: ['english', 'pos'],
          additionalProperties: false
        }
      }
    },
    required: ['items'],
    additionalProperties: false
  }
};

export const PRONOUNS_EXTRACTION_JSON_SCHEMA: OpenRouterJsonSchema = {
  name: 'pronouns_extraction',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      characters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            originalName: { type: 'string' },
            gender: {
              type: 'string',
              enum: ['Male', 'Female', 'Non-binary', 'Unknown']
            },
            ageGroup: { type: 'string' },
            role: { type: 'string' },
            translatedTitles: { type: 'string' },
            narratorPronoun: { type: 'string' },
            dialoguePronouns: { type: 'string' },
            reasoning: { type: 'string' },
            notes: { type: 'string' }
          },
          required: [
            'originalName',
            'gender',
            'ageGroup',
            'role',
            'translatedTitles',
            'narratorPronoun',
            'dialoguePronouns',
            'reasoning',
            'notes'
          ],
          additionalProperties: false
        }
      }
    },
    required: ['characters'],
    additionalProperties: false
  }
};

export const GLOSSARY_EXTRACTION_JSON_SCHEMA: OpenRouterJsonSchema = {
  name: 'glossary_extraction',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      glossary: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            english: { type: 'string' },
            vietnamese: { type: 'string' },
            pos: { type: 'string' },
            contextNotes: { type: 'string' }
          },
          required: ['english', 'vietnamese', 'pos', 'contextNotes'],
          additionalProperties: false
        }
      }
    },
    required: ['glossary'],
    additionalProperties: false
  }
};

export const BOOK_ANALYSIS_JSON_SCHEMA: OpenRouterJsonSchema = {
  name: 'book_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      splitOptions: {
        type: 'object',
        properties: {
          recommendedOption: {
            type: 'string',
            enum: ['keyword', 'regex', 'standalone']
          },
          recommendedKeywords: {
            type: 'array',
            items: { type: 'string' }
          },
          recommendedRegex: { type: 'string' },
          reason: { type: 'string' }
        },
        required: [
          'recommendedOption',
          'recommendedKeywords',
          'recommendedRegex',
          'reason'
        ],
        additionalProperties: false
      }
    },
    required: ['splitOptions'],
    additionalProperties: false
  }
};
