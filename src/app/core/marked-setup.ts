import { marked } from 'marked';
import markedFootnote from 'marked-footnote';
import markedKatex from 'marked-katex-extension';

declare global {
  interface Window {
    __SILA_IMAGES__?: Record<string, string>;
  }
}

let isConfigured = false;

/**
 * Chuẩn hóa các ký hiệu toán học LaTeX phổ biến từ PDF/AI sang định dạng chuẩn của marked-katex-extension:
 * - Chuyển \[ ... \] sang khối $$ ... $$
 * - Chuyển \( ... \) sang inline $ ... $
 * - Đảm bảo khối $$ nhiều dòng có dấu $$ nằm riêng trên dòng đầu và dòng cuối
 */
export function normalizeMathDelimiters(markdown: string): string {
  if (!markdown) return '';

  // 0. Bảo vệ các khối code ```...``` và inline code `...` khỏi bị biến đổi nhầm
  const codeBlocks: string[] = [];
  let text = markdown.replace(/```[\s\S]*?```|`[^`\n]+`/g, (match) => {
    codeBlocks.push(match);
    return `\x00CODE_BLOCK_${codeBlocks.length - 1}\x00`;
  });

  // 1. Chuyển \[ ... \] sang khối $$\n...\n$$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner) => {
    return `\n$$\n${inner.trim()}\n$$\n`;
  });

  // 2. Chuyển \( ... \) sang inline $...$
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_match, inner) => {
    const trimmed = inner.trim();
    if (trimmed.includes('\n')) {
      return `\n$$\n${trimmed}\n$$\n`;
    }
    return `$${trimmed}$`;
  });

  // 3. Chuẩn hóa các khối $$...$$ có nhiều dòng hoặc đứng độc lập trên 1 dòng
  // thành dạng chuẩn của marked-katex-extension ($$\n...\n$$)
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    if (inner.includes('\n')) {
      return `\n$$\n${inner.trim()}\n$$\n`;
    }
    return match;
  });
  text = text.replace(/^[ \t]*\$\$([^\n$]+?)\$\$[ \t]*$/gm, (_match, inner) => {
    return `\n$$\n${inner.trim()}\n$$\n`;
  });

  // Khôi phục lại các khối code
  text = text.replace(/\x00CODE_BLOCK_(\d+)\x00/g, (_match, idx) => {
    return codeBlocks[Number(idx)];
  });

  return text;
}

/**
 * Loại bỏ thẻ <annotation encoding="application/x-tex">...</annotation> bên trong MathML
 * để các trình đọc EPUB (như Aquile Reader) không bị in lặp lại mã nguồn LaTeX thô bên cạnh công thức.
 */
export function stripMathMlAnnotation(html: string): string {
  if (!html) return '';
  return html.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '');
}

export function getConfiguredMarked() {
  if (!isConfigured) {
    marked.use(
      markedKatex({
        throwOnError: false,
        nonStandard: false,
        strict: false,
        output: 'mathml',
      })
    );
    marked.use(markedFootnote());
    marked.use({
      hooks: {
        preprocess(markdown: string) {
          return normalizeMathDelimiters(markdown);
        },
        postprocess(html: string) {
          return stripMathMlAnnotation(html);
        }
      },
      renderer: {
        heading(token) {
          // Token is just a single object in marked v12+
          // we use text and tokens to parse inner html
          let parsedText = '';
          if (typeof this.parser?.parseInline === 'function') {
            parsedText = this.parser.parseInline(token.tokens || []);
          } else {
            parsedText = token.text;
          }

          let id = '';
          const idMatch = parsedText.match(/(.*?)\s*\{#([^}]+)\}\s*$/);
          if (idMatch) {
            parsedText = idMatch[1];
            id = idMatch[2];
          } else {
            // Generate basic slug if no ID exists (default markdown behavior)
            id = parsedText.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w-]+/g, '-');
          }
          return `<h${token.depth} id="${id}">${parsedText}</h${token.depth}>\n`;
        },
        image(token) {
          let href = token.href;
          if (typeof window !== 'undefined' && window.__SILA_IMAGES__ && window.__SILA_IMAGES__[href]) {
             href = window.__SILA_IMAGES__[href];
          }
           // Use marked original logic or simple img tag
           let out = `<img src="${href}" alt="${token.text}"`;
           if (token.title) {
             out += ` title="${token.title}"`;
           }
           out += ' class="max-w-full h-auto rounded-lg" />';
           return out;
        }
      }
    });
    isConfigured = true;
  }
  return marked;
}

