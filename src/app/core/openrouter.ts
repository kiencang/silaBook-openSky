import { Injectable } from '@angular/core';
import { getCachedApiKey, loadSecureApiKey } from './crypto-storage.util';
import { countTokensAsync, countTokensSync } from './tiktoken.util';
import {
  CustomModel,
  DEFAULT_CUSTOM_MODELS,
  DEFAULT_ECONOMY_MODELS,
  getCustomModels,
  saveCustomModels,
  getCustomEconomyModels,
  saveCustomEconomyModels,
  customModels,
  customEconomyModels,
  getQualityTemperature,
  saveQualityTemperature,
  ReasoningEffortOption,
  getReasoningEffort,
  saveReasoningEffort,
  PromptLoadError,
  isPromptLoadError,
  isQuotaError,
  parseOpenRouterError
} from './openrouter-config.util';
import {
  OpenRouterJsonSchema,
  escapeMarkdownCell,
  stripMarkdownCodeFence,
  extractJsonArrayFromAiResponse,
  FILTER_GLOSSARY_JSON_SCHEMA,
  PRONOUNS_EXTRACTION_JSON_SCHEMA,
  GLOSSARY_EXTRACTION_JSON_SCHEMA,
  BOOK_ANALYSIS_JSON_SCHEMA
} from './openrouter-schemas.util';

export {
  DEFAULT_CUSTOM_MODELS,
  DEFAULT_ECONOMY_MODELS,
  getCustomModels,
  saveCustomModels,
  getCustomEconomyModels,
  saveCustomEconomyModels,
  customModels,
  customEconomyModels,
  getQualityTemperature,
  saveQualityTemperature,
  getReasoningEffort,
  saveReasoningEffort,
  PromptLoadError,
  isPromptLoadError,
  isQuotaError,
  parseOpenRouterError,
  escapeMarkdownCell,
  stripMarkdownCodeFence,
  extractJsonArrayFromAiResponse
};
export type { CustomModel, ReasoningEffortOption, OpenRouterJsonSchema };

@Injectable({ providedIn: 'root' })
export class OpenRouterClient {
  private readonly promptCache = new Map<string, string>();

  getApiKey(): string {
    const cached = getCachedApiKey();
    if (cached) return cached;

    if (typeof window !== 'undefined') {
      const userKey = localStorage.getItem('user_openrouter_api_key');
      if (userKey && userKey.trim()) {
        const trimmed = userKey.trim();
        if (!trimmed.startsWith('enc:v1:')) {
          return trimmed;
        }
      }
    }
    return (typeof process !== 'undefined' && process.env['OPENROUTER_API_KEY']) || '';
  }

  private async loadPromptText(url: string, maxAttempts = 3): Promise<string> {
    const cached = this.promptCache.get(url);
    if (cached !== undefined) {
      return cached;
    }

    const defaultOpts: RequestInit = { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(`${url}?t=${Date.now()}`, defaultOpts);
        if (res.ok) {
          const text = await res.text();
          if (text.trim().length > 0) {
            this.promptCache.set(url, text);
            return text;
          }
        } else if (res.status === 404) {
          // Không thử lại nếu file thực sự không tồn tại (404)
          break;
        }
      } catch (e) {
        if (attempt === maxAttempts) {
          console.error(`Failed to load ${url} after ${maxAttempts} attempts`, e);
        }
      }

      if (attempt < maxAttempts) {
        const delayMs = 400 * Math.pow(2, attempt - 1); // 400ms, 800ms
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw new PromptLoadError(url);
  }

  private async callChatCompletions(
    model: string,
    messages: { role: 'system' | 'user' | 'assistant'; content: string | unknown[] }[],
    options: {
      jsonMode?: boolean;
      jsonSchema?: OpenRouterJsonSchema;
      temperature?: number;
      plugins?: Record<string, unknown>[];
    } = {}
  ): Promise<string> {
    await loadSecureApiKey();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Chưa cấu hình OpenRouter API Key. Vui lòng mở mục cài đặt API Key để thiết lập.');
    }

    const reasoningEffort = getReasoningEffort();
    const buildPayload = (responseFormat?: Record<string, unknown>): Record<string, unknown> => {
      const p: Record<string, unknown> = {
        model: model || '~google/gemini-flash-latest',
        messages,
        temperature: options.temperature ?? getQualityTemperature()
      };

      if (reasoningEffort !== 'none') {
        p['reasoning'] = {
          effort: reasoningEffort,
          exclude: true
        };
      }

      if (responseFormat) {
        p['response_format'] = responseFormat;
      }

      if (options.plugins && options.plugins.length > 0) {
        p['plugins'] = options.plugins;
      }

      return p;
    };

    const sendRequest = async (payload: Record<string, unknown>): Promise<Response> => {
      return fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://silabook-opensky.wpsila.com',
          'X-Title': 'silaBook openSky',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    };

    let initialFormat: Record<string, unknown> | undefined;
    if (options.jsonSchema) {
      initialFormat = {
        type: 'json_schema',
        json_schema: {
          name: options.jsonSchema.name,
          strict: options.jsonSchema.strict ?? true,
          schema: options.jsonSchema.schema
        }
      };
    } else if (options.jsonMode) {
      initialFormat = { type: 'json_object' };
    }

    let res = await sendRequest(buildPayload(initialFormat));

    // Cơ chế Smart Fallback: Nếu model/provider trên OpenRouter không hỗ trợ json_schema (báo lỗi 400/422),
    // tự động hạ cấp về json_object (hoặc bỏ response_format nếu json_object cũng bị từ chối)
    if (!res.ok && options.jsonSchema && (res.status === 400 || res.status === 422)) {
      console.warn(`Model ${model} không hỗ trợ json_schema, tự động chuyển sang json_object fallback...`);
      res = await sendRequest(buildPayload({ type: 'json_object' }));
      if (!res.ok && (res.status === 400 || res.status === 422)) {
        res = await sendRequest(buildPayload(undefined));
      }
    } else if (!res.ok && options.jsonMode && !options.jsonSchema && (res.status === 400 || res.status === 422)) {
      res = await sendRequest(buildPayload(undefined));
    }

    if (!res.ok) {
      let errText = '';
      try {
        errText = await res.text();
      } catch {
        errText = res.statusText;
      }
      throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Phản hồi từ OpenRouter không hợp lệ hoặc bị rỗng.');
    }

    return content;
  }

  private async callResponses(
    model: string,
    input: unknown[],
    options: {
      instructions?: string;
      temperature?: number;
      plugins?: Record<string, unknown>[];
    } = {}
  ): Promise<string> {
    await loadSecureApiKey();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Chưa cấu hình OpenRouter API Key. Vui lòng mở mục cài đặt API Key để thiết lập.');
    }

    const reasoningEffort = getReasoningEffort();
    const payload: Record<string, unknown> = {
      model: model || '~google/gemini-flash-latest',
      input,
      temperature: options.temperature ?? getQualityTemperature()
    };

    if (options.instructions) {
      payload['instructions'] = options.instructions;
    }

    if (reasoningEffort !== 'none') {
      payload['reasoning'] = {
        effort: reasoningEffort
      };
    }

    if (options.plugins && options.plugins.length > 0) {
      payload['plugins'] = options.plugins;
    }

    const res = await fetch('https://openrouter.ai/api/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://silabook-opensky.wpsila.com',
        'X-Title': 'silaBook openSky',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      let errText = '';
      try {
        errText = await res.text();
      } catch {
        errText = res.statusText;
      }
      throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();

    if (Array.isArray(data.output)) {
      const texts: string[] = [];
      for (const item of data.output) {
        if (item?.type === 'message' && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part?.type === 'output_text' && typeof part.text === 'string') {
              texts.push(part.text);
            }
          }
        }
      }
      const combined = texts.join('\n').trim();
      if (combined) return combined;
    }

    if (typeof data.output_text === 'string' && data.output_text.trim()) {
      return data.output_text;
    }

    throw new Error('Phản hồi từ OpenRouter Responses API không hợp lệ hoặc bị rỗng.');
  }

  countTokensText(text: string): number {
    return countTokensSync(text);
  }

  async countTokens(base64OrText: string, mimeType = 'text/plain', _model = '~google/gemini-flash-latest'): Promise<number> {
    void _model;
    if (mimeType !== 'text/plain' && (mimeType === 'application/pdf' || base64OrText.startsWith('data:') || base64OrText.length > 50000)) {
      // Base64 estimation (~ 1 token per 3 bytes of raw base64 data)
      return Math.round(base64OrText.length / 4);
    }
    return countTokensAsync(base64OrText);
  }

  async convertPdfToMarkdown(base64Data: string, model = '~google/gemini-flash-latest'): Promise<string> {
    const [systemInstruction, textPrompt] = await Promise.all([
      this.loadPromptText('/prompts/pdf_to_md_system_instruction.md'),
      this.loadPromptText('/prompts/pdf_to_md_prompt.md')
    ]);

    const input = [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: textPrompt },
          {
            type: 'input_file',
            filename: 'document.pdf',
            file_data: `data:application/pdf;base64,${base64Data}`
          }
        ]
      }
    ];

    // Sử dụng OpenRouter Responses API (/api/v1/responses) theo tài liệu chuẩn chính thức
    // và khóa engine 'native' để không tự nhảy sang mistral-ocr có thu phí.
    const result = await this.callResponses(model, input, {
      instructions: systemInstruction,
      temperature: 0.3,
      plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }]
    });

    return stripMarkdownCodeFence(result);
  }

  async filterGlossary(text: string, glossaryTable: string, model = '~google/gemini-flash-latest'): Promise<{ text: string; usedCount: number; totalCount: number }> {
    try {
      const lines = glossaryTable.split('\n').filter(l => l.trim().startsWith('|'));
      if (lines.length <= 2) return { text: glossaryTable, usedCount: 0, totalCount: 0 };

      const headers = lines[0].split(/(?<!\\)\|/).map(h => h.trim()).filter(h => h);
      if (headers.length < 4 || headers[0] !== 'Tiếng Anh') return { text: glossaryTable, usedCount: 0, totalCount: 0 };

      const fullGlossary: { english: string; pos: string; vietnamese: string; notes: string }[] = [];
      const compactList: { english: string; pos: string }[] = [];
      
      for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
        if (cells.length >= 5) {
           const english = cells[1];
           const pos = cells[2];
           const vietnamese = cells[3];
           const notes = cells[4];
           fullGlossary.push({ english, pos, vietnamese, notes });
           compactList.push({ english, pos });
        }
      }

      if (compactList.length <= 100) return { text: glossaryTable, usedCount: compactList.length, totalCount: compactList.length };

      const [si, rawPrompt] = await Promise.all([
        this.loadPromptText('/prompts/filter_glossary_system_instruction.md'),
        this.loadPromptText('/prompts/filter_glossary_prompt.md')
      ]);

      let prompt = rawPrompt.replace('{{danh sách thuật ngữ}}', () => JSON.stringify(compactList));
      prompt = prompt.replace('{{nội dung cần dịch}}', () => text);
      prompt += '\nReturn JSON format: {"items": [{"english": "...", "pos": "..."}]}';

      const responseText = await this.callChatCompletions(
        model,
        [
          { role: 'system', content: si },
          { role: 'user', content: prompt }
        ],
        {
          jsonMode: true,
          temperature: 0.3,
          jsonSchema: FILTER_GLOSSARY_JSON_SCHEMA
        }
      );

      const matchedItems = extractJsonArrayFromAiResponse<{ english: string; pos: string }>(
        responseText,
        ['items', 'terms']
      );
      
      if (!matchedItems || matchedItems.length === 0) {
        return { text: '', usedCount: 0, totalCount: fullGlossary.length };
      }
      
      const matchedSet = new Set(matchedItems.map((item) => `${item.english}_${item.pos}`.toLowerCase()));
      const filteredGlossary = fullGlossary.filter(item => matchedSet.has(`${item.english}_${item.pos}`.toLowerCase()));
      
      if (filteredGlossary.length === 0) return { text: '', usedCount: 0, totalCount: fullGlossary.length };
      
      let resultTable = '| Tiếng Anh | Từ loại | Tiếng Việt | Ghi chú văn cảnh |\n|---|---|---|---|\n';
      for (const item of filteredGlossary) {
        resultTable += `| ${escapeMarkdownCell(item.english)} | ${escapeMarkdownCell(item.pos)} | ${escapeMarkdownCell(item.vietnamese)} | ${escapeMarkdownCell(item.notes)} |\n`;
      }
      
      return { text: resultTable, usedCount: filteredGlossary.length, totalCount: fullGlossary.length };
      
    } catch (e) {
      if (isPromptLoadError(e)) {
        throw e;
      }
      console.error('Failed to filter glossary', e);
      return { text: glossaryTable, usedCount: 0, totalCount: 0 }; 
    }
  }

  async normalizePronouns(text: string, rawPronounTable: string, model = '~google/gemini-flash-latest', bookTitle = '', author = ''): Promise<string> {
    try {
      if (!rawPronounTable.trim()) return '';
      
      const [si, rawPrompt] = await Promise.all([
        this.loadPromptText('/prompts/normalize_pronouns_system_instructions.md'),
        this.loadPromptText('/prompts/normalize_pronouns_prompt.md')
      ]);
      
      let prompt = rawPrompt.replace('{{tên sách}}', () => bookTitle || 'Không rõ');
      prompt = prompt.replace('{{tên tác giả}}', () => author || 'Vô danh');
      prompt = prompt.replace('{{bảng đại từ}}', () => rawPronounTable);
      prompt = prompt.replace('{{nội dung}}', () => text);

      const result = await this.callChatCompletions(model, [
        { role: 'system', content: si },
        { role: 'user', content: prompt }
      ]);
      
      return stripMarkdownCodeFence(result);
      
    } catch (e) {
      if (isPromptLoadError(e)) {
        throw e;
      }
      console.error('Failed to normalize pronouns', e);
      return rawPronounTable; 
    }
  }

  async translateChapter(
    text: string,
    model = '~google/gemini-flash-latest',
    bookTitle = '',
    author = '',
    pronounTable = '',
    usePronouns = false,
    glossaryTable = '',
    useGlossary = false,
    shouldFilterGlossary = true,
    contextSummary?: string,
    customInstructions?: string,
    translationMode: 'standard' | 'scientific' = 'standard',
    economyModel?: string,
    preloadSummary = true
  ): Promise<{ text: string; customGlossary?: string; glossaryStatus?: 'none' | 'full' | 'filtered'; glossaryRatio?: number }> {
    const siFileName = translationMode === 'scientific' ? '/prompts/scientific_system_instructions.md' : '/prompts/multi_system_instructions.md';
    const promptFileName = translationMode === 'scientific' ? '/prompts/scientific_prompt.md' : '/prompts/multi_prompt.md';
    const summarySiFileName = translationMode === 'scientific' ? '/prompts/summary_scientific_system_instruction.md' : '/prompts/summary_multi_system_instruction.md';
    const summaryPromptFileName = translationMode === 'scientific' ? '/prompts/summary_scientific_prompt.md' : '/prompts/summary_multi_prompt.md';

    // Tiền tải toàn bộ bộ SI/Prompt cần thiết (dịch + tóm tắt) trước khi gọi API OpenRouter để không tốn credit nếu mất tệp chỉ thị
    const preloadTasks: Promise<string>[] = [
      this.loadPromptText(siFileName),
      this.loadPromptText(promptFileName)
    ];
    if (preloadSummary) {
      preloadTasks.push(
        this.loadPromptText(summarySiFileName),
        this.loadPromptText(summaryPromptFileName)
      );
    }
    const [systemInstruction, loadedPrompt] = await Promise.all(preloadTasks);

    let activeGlossary = '';
    let glossaryStatus: 'none' | 'full' | 'filtered' = 'none';
    let glossaryRatio: number | undefined = undefined;

    if (useGlossary && glossaryTable) {
        if (shouldFilterGlossary) {
            const filterRes = await this.filterGlossary(text, glossaryTable, economyModel || model);
            activeGlossary = filterRes.text;
            glossaryStatus = activeGlossary === glossaryTable ? 'full' : 'filtered';
            if (filterRes.totalCount > 0) {
              glossaryRatio = Math.round((filterRes.usedCount / filterRes.totalCount) * 100);
            }
        } else {
            activeGlossary = glossaryTable;
            glossaryStatus = 'full';
            glossaryRatio = 100;
        }
    }

    let finalPrompt = loadedPrompt.replace('{{tên sách}}', () => bookTitle || 'Không rõ');
    finalPrompt = finalPrompt.replace('{{tên tác giả}}', () => author || 'Vô danh');
    
    if (usePronouns && pronounTable) {
      const pronounBlock = `<pronouns_rules>\n**Bảng đại từ nhân xưng:**\n${pronounTable}\n\n*LƯU Ý: Ở trên là Bảng đại từ nhân xưng tham chiếu. Bạn BẮT BUỘC phải sử dụng cấu trúc xưng hô này cho cách người kể chuyện gọi nhân vật (ngôi thứ 3) và trong các cuộc hội thoại thông thường. TUY NHIÊN, bạn được phép điều chỉnh linh hoạt cách xưng hô (ngôi thứ 1 & 2) nếu bối cảnh cảm xúc của câu chuyện thực sự đòi hỏi sự chuyển đổi.*\n</pronouns_rules>`;
      finalPrompt = finalPrompt.replace('{{đại từ nhân xưng}}', () => pronounBlock);
    } else {
      finalPrompt = finalPrompt.replace('{{đại từ nhân xưng}}', '');
    }

    if (activeGlossary) {
      const glossaryBlock = `<glossary_rules>\n**Bảng thuật ngữ / Từ khó:**\n${activeGlossary}\n\n*LƯU Ý: Bảng thuật ngữ trên đây là một DANH SÁCH THAM KHẢO quan trọng, NHƯNG bạn hãy áp dụng LINH HOẠT các thuật ngữ này vào bản dịch để đảm bảo tính thống nhất chuyên môn/từ ngữ toàn cục của cuốn sách. Điều cần ghi nhớ là đừng ép buộc áp dụng một cách cứng nhắc nếu ngữ cảnh cụ thể của đoạn văn hoàn toàn khác.*\n</glossary_rules>`;
      finalPrompt = finalPrompt.replace('{{thuật ngữ}}', () => glossaryBlock);
    } else {
      finalPrompt = finalPrompt.replace('{{thuật ngữ}}', '');
    }

    if (contextSummary) {
       const contextBlock = `<previous_chunk_handoff>\n**Tóm tắt bối cảnh từ phần trước để tham khảo:**\n${contextSummary}\n\n*LƯU Ý: Đây là thông tin nối tiếp từ khối văn bản trước (diễn biến sự kiện, trạng thái nhân vật, hoặc luồng logic/lập luận, **cùng với sắc thái/giọng điệu chung**). Hãy dùng nó để nắm bắt ngữ cảnh nhằm đảm bảo tính liền mạch cho bản dịch, đặc biệt là duy trì đúng giọng điệu và cảm xúc. TUYỆT ĐỐI KHÔNG lặp lại nội dung tóm tắt này vào phần bản dịch.*\n</previous_chunk_handoff>`;
       finalPrompt = finalPrompt.replace('{{tóm tắt bối cảnh}}', () => contextBlock);
    } else {
       finalPrompt = finalPrompt.replace('{{tóm tắt bối cảnh}}', '');
    }

    if (customInstructions) {
       const instructionsBlock = `<custom_instructions>\n**Chỉ thị bổ sung khi dịch:**\n${customInstructions}\n</custom_instructions>`;
       finalPrompt = finalPrompt.replace('{{chỉ thị bổ sung}}', () => instructionsBlock);
    } else {
       finalPrompt = finalPrompt.replace('{{chỉ thị bổ sung}}', '');
    }

    finalPrompt = finalPrompt.replace('{{nội dung cần dịch}}', () => '\n' + text);
    finalPrompt = finalPrompt.replace(/\n\s*\n\s*\n/g, '\n\n');

    const result = await this.callChatCompletions(model, [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: finalPrompt }
    ]);
    
    return {
      text: stripMarkdownCodeFence(result),
      customGlossary: activeGlossary || undefined,
      glossaryStatus,
      glossaryRatio
    };
  }

  async generatePronounsRaw(
    text: string,
    model = '~google/gemini-flash-latest',
    bookTitle = '',
    author = ''
  ): Promise<{ originalName?: string; gender?: string; ageGroup?: string; role?: string; translatedTitles?: string; narratorPronoun?: string; dialoguePronouns?: string; reasoning?: string; notes?: string; }[]> {
    const [psi, pp] = await Promise.all([
      this.loadPromptText('/prompts/pronouns_system_instructions.md'),
      this.loadPromptText('/prompts/pronouns_prompt.md')
    ]);

    let finalPrompt = pp.replace('{{tên sách}}', () => bookTitle || 'Không rõ');
    finalPrompt = finalPrompt.replace('{{tên tác giả}}', () => author || 'Vô danh');
    finalPrompt = finalPrompt.replace('{{nội dung}}', () => text);
    finalPrompt += '\n\nIMPORTANT: Return a JSON object with a "characters" array containing objects with keys: originalName, gender, ageGroup, role, translatedTitles, narratorPronoun, dialoguePronouns, reasoning, notes. Example: {"characters": [...]}';

    const responseText = await this.callChatCompletions(
      model,
      [
        { role: 'system', content: psi },
        { role: 'user', content: finalPrompt }
      ],
      {
        jsonMode: true,
        jsonSchema: PRONOUNS_EXTRACTION_JSON_SCHEMA
      }
    );

    const arr = extractJsonArrayFromAiResponse<{
      originalName?: string;
      gender?: string;
      ageGroup?: string;
      role?: string;
      translatedTitles?: string;
      narratorPronoun?: string;
      dialoguePronouns?: string;
      reasoning?: string;
      notes?: string;
    }>(responseText, ['characters', 'pronouns', 'data', 'items']);

    if (arr !== null) {
      return arr;
    }

    throw new Error('Không thể đọc dữ liệu JSON từ AI. Vui lòng thử lại.');
  }

  async generatePronouns(text: string, model = '~google/gemini-flash-latest', bookTitle = '', author = ''): Promise<string> {
    const arr = await this.generatePronounsRaw(text, model, bookTitle, author);
    if (arr.length > 0) {
      let md = '| Nhân vật (Original) | Giới tính | Ước lượng độ tuổi | Đặc điểm & Vai trò | Xưng hô / Tước vị (Dịch) | Ngôi thứ 3 (Narrator) | Xưng - Hô (Với người khác) | Lý do | Ghi chú |\n|---|---|---|---|---|---|---|---|---|\n';
      for (const pt of arr) {
        md += `| ${escapeMarkdownCell(pt.originalName)} | ${escapeMarkdownCell(pt.gender)} | ${escapeMarkdownCell(pt.ageGroup)} | ${escapeMarkdownCell(pt.role)} | ${escapeMarkdownCell(pt.translatedTitles)} | ${escapeMarkdownCell(pt.narratorPronoun)} | ${escapeMarkdownCell(pt.dialoguePronouns)} | ${escapeMarkdownCell(pt.reasoning)} | ${escapeMarkdownCell(pt.notes)} |\n`;
      }
      return md;
    }
    return '';
  }

  async generateGlossaryRaw(
    text: string,
    model = '~google/gemini-flash-latest',
    bookTitle = '',
    author = ''
  ): Promise<{ english?: string; pos?: string; vietnamese?: string; contextNotes?: string; }[]> {
    const [gsi, gp] = await Promise.all([
      this.loadPromptText('/prompts/glossary_system_instructions.md'),
      this.loadPromptText('/prompts/glossary_prompt.md')
    ]);

    let finalPrompt = gp.replace('{{tên sách}}', () => bookTitle || 'Không rõ');
    finalPrompt = finalPrompt.replace('{{tên tác giả}}', () => author || 'Vô danh');
    finalPrompt = finalPrompt.replace('{{nội dung}}', () => text);
    finalPrompt += '\n\nIMPORTANT: Return a JSON object with a "glossary" array containing objects with keys: english, pos, vietnamese, contextNotes. Example: {"glossary": [...]}';

    const responseText = await this.callChatCompletions(
      model,
      [
        { role: 'system', content: gsi },
        { role: 'user', content: finalPrompt }
      ],
      {
        jsonMode: true,
        jsonSchema: GLOSSARY_EXTRACTION_JSON_SCHEMA
      }
    );

    const arr = extractJsonArrayFromAiResponse<{
      english?: string;
      pos?: string;
      vietnamese?: string;
      contextNotes?: string;
    }>(responseText, ['glossary', 'terms', 'items', 'data']);

    if (arr !== null) {
      return arr;
    }

    throw new Error('Không thể đọc dữ liệu JSON thuật ngữ từ AI. Vui lòng thử lại.');
  }

  async generateGlossary(text: string, model = '~google/gemini-flash-latest', bookTitle = '', author = ''): Promise<string> {
    const arr = await this.generateGlossaryRaw(text, model, bookTitle, author);
    if (arr.length > 0) {
      let md = '| Tiếng Anh | Từ loại | Tiếng Việt | Ghi chú văn cảnh |\n|---|---|---|---|\n';
      for (const pt of arr) {
        md += `| ${escapeMarkdownCell(pt.english)} | ${escapeMarkdownCell(pt.pos)} | ${escapeMarkdownCell(pt.vietnamese)} | ${escapeMarkdownCell(pt.contextNotes)} |\n`;
      }
      return md;
    }
    return '';
  }

  async analyzeBook(text: string, model = '~google/gemini-flash-latest', bookTitle = '', author = ''): Promise<string> {
    const [si, p] = await Promise.all([
      this.loadPromptText('/prompts/book_analysis_system_instructions.md'),
      this.loadPromptText('/prompts/book_analysis_prompt.md')
    ]);

    let finalPrompt = p.replace('{{tên sách}}', () => bookTitle || 'Không rõ');
    finalPrompt = finalPrompt.replace('{{tên tác giả}}', () => author || 'Vô danh');
    finalPrompt = finalPrompt.replace('{{nội dung}}', () => text);

    const result = await this.callChatCompletions(
      model,
      [
        { role: 'system', content: si },
        { role: 'user', content: finalPrompt }
      ],
      {
        jsonMode: true,
        temperature: 0.3,
        jsonSchema: BOOK_ANALYSIS_JSON_SCHEMA
      }
    );

    return stripMarkdownCodeFence(result);
  }

  async summarizeTranslation(translatedText: string, model = '~google/gemini-flash-latest', translationMode: 'standard' | 'scientific' = 'standard'): Promise<string> {
    try {
      if (!translatedText.trim()) return '';

      const siFileName = translationMode === 'scientific' ? '/prompts/summary_scientific_system_instruction.md' : '/prompts/summary_multi_system_instruction.md';
      const promptFileName = translationMode === 'scientific' ? '/prompts/summary_scientific_prompt.md' : '/prompts/summary_multi_prompt.md';

      const [systemInstruction, promptTemplate] = await Promise.all([
        this.loadPromptText(siFileName),
        this.loadPromptText(promptFileName)
      ]);
      
      const finalPrompt = promptTemplate.replace('{{nội dung}}', () => translatedText);

      const result = await this.callChatCompletions(model, [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: finalPrompt }
      ]);
      
      return result.trim();
    } catch (e) {
      if (isPromptLoadError(e)) {
        throw e;
      }
      console.error('Failed to summarize translation', e);
      return '';
    }
  }
}
