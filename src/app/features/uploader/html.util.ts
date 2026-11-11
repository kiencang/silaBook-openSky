import TurndownService from 'turndown';

const turndownService = new TurndownService({ headingStyle: 'atx' }).remove(['style', 'script', 'head', 'meta', 'title', 'noscript']);

turndownService.addRule('stripInternalLinks', {
  filter: 'a',
  replacement: function (content, node) {
    const href = (node as HTMLElement).getAttribute('href');
    // Nếu không có href, hoặc là liên kết nội bộ/tương đối -> loại bỏ liên kết, chỉ giữ content
    if (!href || (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:'))) {
      return content;
    }
    const title = (node as HTMLElement).title ? ` "${(node as HTMLElement).title}"` : '';
    return href ? `[${content}](${href}${title})` : content;
  }
});

export function preprocessHtmlStr(htmlContent: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  const elements = doc.querySelectorAll('[style]');
  elements.forEach(node => {
    const el = node as HTMLElement;
    const styleAttr = el.getAttribute('style') || '';
    
    const isBold = /font-weight\s*:\s*(bold|bolder|[7-9]00)/i.test(styleAttr);
    const isItalic = /font-style\s*:\s*(italic|oblique)/i.test(styleAttr);
    
    if (isBold && el.tagName !== 'B' && el.tagName !== 'STRONG') {
      const b = doc.createElement('b');
      while (el.firstChild) {
        b.appendChild(el.firstChild);
      }
      el.appendChild(b);
    }
    
    if (isItalic && el.tagName !== 'I' && el.tagName !== 'EM') {
      const i = doc.createElement('i');
      while (el.firstChild) {
        i.appendChild(el.firstChild);
      }
      el.appendChild(i);
    }
  });

  return doc.body.innerHTML;
}

export function extractBase64Images(htmlContent: string): { html: string, images: Record<string, string> } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const images: Record<string, string> = {};
  const timestamp = Date.now();
  let imgCounter = 0;

  const imgElements = doc.querySelectorAll('img');
  imgElements.forEach(img => {
    const src = img.getAttribute('src')?.trim();
    if (src && /^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(src)) {
      const placeholderId = `HTML_IMG_${timestamp}_${imgCounter++}`;
      images[placeholderId] = src.replace(/\s+/g, '');
      img.setAttribute('src', placeholderId);
    }
  });

  return { html: doc.body.innerHTML, images };
}

export function extractBase64FromMarkdown(markdownContent: string): { markdown: string, images?: Record<string, string> } {
  if (!markdownContent || !/data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(markdownContent)) {
    return { markdown: markdownContent };
  }

  const images: Record<string, string> = {};
  const timestamp = Date.now();
  let imgCounter = 0;

  // 1. Tách ảnh Base64 dạng cú pháp Markdown: ![alt](data:image/...;base64,...)
  let processed = markdownContent.replace(
    /!\[([^\]]*)\]\(\s*<?(data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+?)>?(?:\s+(["'][^"']*["']))?\s*\)/gi,
    (_match, alt: string, rawDataUrl: string, titlePart?: string) => {
      const cleanDataUrl = rawDataUrl.replace(/\s+/g, '');
      const placeholderId = `MD_IMG_${timestamp}_${imgCounter++}`;
      images[placeholderId] = cleanDataUrl;
      const titleSuffix = titlePart ? ` ${titlePart}` : '';
      return `![${alt || ''}](${placeholderId}${titleSuffix})`;
    }
  );

  // 2. Gỡ thẻ <p> hoặc <div> chỉ bọc duy nhất thẻ <img ... data:image/...> để tránh rò rỉ thẻ HTML thô khi xuất DOCX
  processed = processed.replace(
    /<(p|div)\b[^>]*>\s*(<img\b[^>]*?\bsrc\s*=\s*["']data:image\/[a-zA-Z0-9+.-]+;base64,[\s\S]*?>)\s*<\/\1>/gi,
    (_match, _tag: string, innerImg: string) => `\n\n${innerImg}\n\n`
  );

  // 3. Tách ảnh Base64 dạng thẻ HTML <img ... src="data:image/...;base64,..." ...> nhúng trong Markdown/TXT
  processed = processed.replace(
    /<img\b([^>]*?)\bsrc\s*=\s*(["'])\s*(data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+?)\s*\2([^>]*?)>/gi,
    (_match, beforeSrc: string, _quote: string, rawDataUrl: string, afterSrc: string) => {
      const cleanDataUrl = rawDataUrl.replace(/\s+/g, '');
      const placeholderId = `MD_IMG_${timestamp}_${imgCounter++}`;
      images[placeholderId] = cleanDataUrl;
      const attrs = `${beforeSrc} ${afterSrc}`;
      const altMatch = attrs.match(/\balt\s*=\s*(["'])(.*?)\1/i);
      const alt = altMatch ? altMatch[2] : '';
      return `![${alt}](${placeholderId})`;
    }
  );

  // 4. Tách ảnh Base64 dạng định nghĩa tham chiếu Markdown: [ref]: data:image/...;base64,...
  processed = processed.replace(
    /^(\s*\[[^\]]+\]:\s*)<?(data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+?)>?(?=\s|$)/gim,
    (_match, prefix: string, rawDataUrl: string) => {
      const cleanDataUrl = rawDataUrl.replace(/\s+/g, '');
      const placeholderId = `MD_IMG_${timestamp}_${imgCounter++}`;
      images[placeholderId] = cleanDataUrl;
      return `${prefix}${placeholderId}`;
    }
  );

  return {
    markdown: processed,
    images: Object.keys(images).length > 0 ? images : undefined
  };
}

export async function processHtmlContent(file: File): Promise<{ markdown: string, images?: Record<string, string> }> {
  const text = await file.text();
  const processedHtml = preprocessHtmlStr(text);
  const { html, images } = extractBase64Images(processedHtml);
  return {
    markdown: turndownService.turndown(html),
    images: Object.keys(images).length > 0 ? images : undefined
  };
}

export function getTurndownService(): TurndownService {
  return turndownService;
}
