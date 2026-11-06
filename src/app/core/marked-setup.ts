import { marked } from 'marked';
import markedFootnote from 'marked-footnote';
import katex from 'katex';

declare global {
  interface Window {
    __SILA_IMAGES__?: Record<string, string>;
  }
}

let isConfigured = false;

/**
 * Biểu thức chính quy chuẩn Pandoc `tex_math_dollars`:
 * 1. $$...$$ trên cùng 1 dòng: ^\$\$(?!\$)((?:\\.|[^\\\n$])+?)\$\$(?!\$)
 * 2. $...$ nhiều ký tự (không có khoảng trắng ngay sau $ mở hoặc ngay trước $ đóng, không chứa $ trần bên trong, không có chữ số ngay sau $ đóng):
 *    ^\$(?!\$)(?![ \t])((?:\\.|[^\\\n$])+?(?:\\.|[^\\\n$\s]))\$(?![\d$])
 * 3. $x$ 1 ký tự (không phải khoảng trắng hay $, không có chữ số ngay sau $ đóng):
 *    ^\$(?!\$)([^\n\\$\s])\$(?![\d$])
 */
export const PANDOC_INLINE_MATH_RE =
  /^\$\$(?!\$)((?:\\.|[^\\\n$])+?)\$\$(?!\$)|^\$(?!\$)(?![ \t])((?:\\.|[^\\\n$])+?(?:\\.|[^\\\n$\s]))\$(?![\d$])|^\$(?!\$)([^\n\\$\s])\$(?![\d$])/;

const PANDOC_BLOCK_MATH_RE = /^(\${1,2})\n((?:\\[\s\S]|[^\\])+?)\n\1(?:\n|$)/;

/**
 * Chuẩn hóa các ký hiệu toán học LaTeX phổ biến từ PDF/AI sang định dạng chuẩn:
 * - Chuyển \[ ... \] sang khối $$ ... $$
 * - Chuyển \( ... \) sang inline $ ... $
 * - Đảm bảo khối $$ nhiều dòng có dấu $$ nằm riêng trên dòng đầu và dòng cuối
 * - Cắt bỏ khoảng trắng thừa sát dấu $ trong công thức OCR (ví dụ: "$ \mathrm{Ca^{2+}} $" -> "$\mathrm{Ca^{2+}}$")
 */
export function normalizeMathDelimiters(markdown: string): string {
  if (!markdown) return '';

  // 0. Bảo vệ các khối code ```...``` và inline code `...` khỏi bị biến đổi nhầm
  const codeBlocks: string[] = [];
  let text = markdown.replace(/```[\s\S]*?```|`[^`\n]+`/g, (match) => {
    codeBlocks.push(match);
    return `\uE000CODE_BLOCK_${codeBlocks.length - 1}\uE000`;
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
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
    if (inner.includes('\n')) {
      return `\n$$\n${inner.trim()}\n$$\n`;
    }
    return match;
  });
  text = text.replace(/^[ \t]*\$\$([^\n$]+?)\$\$[ \t]*$/gm, (_match, inner) => {
    return `\n$$\n${inner.trim()}\n$$\n`;
  });

  // 4. Chuẩn hóa khoảng trắng thừa bên trong $...$ do OCR sinh ra (chỉ áp dụng khi chứa ký tự LaTeX \, ^, _, {, })
  text = text.replace(
    /\$(?!\$)([ \t]*(?:\\.|[^\\\n$])*?[\\^_{}](?:\\.|[^\\\n$])*?[ \t]*)\$(?![\d$])/g,
    (_match, inner) => {
      return `$${inner.trim()}$`;
    }
  );

  // Khôi phục lại các khối code
  text = text.replace(/\uE000CODE_BLOCK_(\d+)\uE000/g, (_match, idx) => {
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

/**
 * Escape các ký tự đặc biệt trong giá trị thuộc tính HTML (id, src, alt, title)
 * nhằm ngăn chặn Attribute Breakout Injection trong custom renderer.
 */
function escapeAttr(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'meta',
  'base',
  'link',
  'style',
  'template',
  'noscript',
  'frame',
  'frameset',
].join(',');

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);
const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg|gif|webp)[;,]/i;

/**
 * Lọc sạch mã độc XSS (HTML Sanitization) bằng bộ phân tích DOMParser gốc của trình duyệt:
 * - Xóa hoàn toàn các thẻ nguy hiểm (script, iframe, object, style, link, meta, form...)
 * - Xóa 100% thuộc tính sự kiện (on*) và srcdoc
 * - Chặn giao thức thực thi mã (javascript:, vbscript:, data:) sau khi đã loại bỏ ký tự ẩn/khoảng trắng,
 *   nhưng vẫn giữ nguyên vẹn ảnh Base64 hợp lệ (png, jpeg, jpg, gif, webp), KaTeX MathML và Footnote ID.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 1. Loại bỏ toàn bộ các thẻ có khả năng thực thi mã hoặc làm lệch cấu trúc trang
  doc.body.querySelectorAll(DANGEROUS_TAGS).forEach((el) => el.remove());

  // 2. Quét mọi phần tử còn lại để lọc sạch thuộc tính nguy hiểm
  const allElements = doc.body.querySelectorAll('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const attrs = el.attributes;
    // Duyệt ngược từ cuối về đầu vì chúng ta có thể xóa thuộc tính ngay trong vòng lặp
    for (let j = attrs.length - 1; j >= 0; j--) {
      const attrName = attrs[j].name.toLowerCase();
      const attrVal = attrs[j].value;

      // Xóa mọi thuộc tính sự kiện (onerror, onload, onclick, ontoggle...) và srcdoc
      if (attrName.startsWith('on') || attrName === 'srcdoc') {
        el.removeAttribute(attrs[j].name);
        continue;
      }

      // Kiểm tra các thuộc tính chứa đường dẫn URI
      if (URL_ATTRIBUTES.has(attrName) || attrName.endsWith(':href')) {
        // Loại bỏ toàn bộ khoảng trắng và ký tự điều khiển ASCII (0x00 - 0x1F) để chống lách luật (vd: "java\tscript:")
        const normalizedUri = attrVal.replace(/[\s\x00-\x1f]+/g, '').toLowerCase();
        if (
          normalizedUri.startsWith('javascript:') ||
          normalizedUri.startsWith('vbscript:') ||
          (normalizedUri.startsWith('data:') && !SAFE_DATA_IMAGE_RE.test(normalizedUri))
        ) {
          el.removeAttribute(attrs[j].name);
        }
      }
    }
  }

  return doc.body.innerHTML;
}

function createPandocKatexExtension(options: katex.KatexOptions = {}) {
  const renderMath = (text: string, displayMode: boolean, newlineAfter: boolean) => {
    let rendered = katex.renderToString(text, {
      ...options,
      displayMode,
    });
    if (displayMode) {
      rendered = rendered.replace(/<math\b(?![^>]*\bdisplay=)/i, '<math display="block"');
    }
    return rendered + (newlineAfter ? '\n' : '');
  };

  return {
    extensions: [
      {
        name: 'inlineKatex',
        level: 'inline' as const,
        start(src: string) {
          let offset = 0;
          let indexSrc = src;
          while (indexSrc) {
            const index = indexSrc.indexOf('$');
            if (index === -1) return;
            const prevChar =
              index > 0 ? indexSrc.charAt(index - 1) : offset > 0 ? src.charAt(offset - 1) : '';
            const validPrev = prevChar !== '\\' && !/[a-zA-Z0-9$]/.test(prevChar);
            if (validPrev) {
              const possibleKatex = indexSrc.substring(index);
              if (PANDOC_INLINE_MATH_RE.test(possibleKatex)) {
                return offset + index;
              }
            }
            const step = index + 1;
            const trailingDollars = indexSrc.substring(step).match(/^\$+/);
            const skip = step + (trailingDollars ? trailingDollars[0].length : 0);
            offset += skip;
            indexSrc = indexSrc.substring(skip);
          }
          return;
        },
        tokenizer(src: string) {
          const match = src.match(PANDOC_INLINE_MATH_RE);
          if (match) {
            const isDisplay = match[0].startsWith('$$');
            const inner = (match[1] ?? match[2] ?? match[3]).trim();
            return {
              type: 'inlineKatex',
              raw: match[0],
              text: inner,
              displayMode: isDisplay,
            };
          }
          return;
        },
        renderer(token: { text: string; displayMode: boolean }) {
          return renderMath(token.text, token.displayMode, false);
        },
      },
      {
        name: 'blockKatex',
        level: 'block' as const,
        tokenizer(src: string) {
          const match = src.match(PANDOC_BLOCK_MATH_RE);
          if (match) {
            return {
              type: 'blockKatex',
              raw: match[0],
              text: match[2].trim(),
              displayMode: match[1].length === 2,
            };
          }
          return;
        },
        renderer(token: { text: string; displayMode: boolean }) {
          return renderMath(token.text, token.displayMode, true);
        },
      },
    ],
  };
}

export function getConfiguredMarked() {
  if (!isConfigured) {
    marked.use(
      createPandocKatexExtension({
        throwOnError: false,
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
          return sanitizeHtml(stripMathMlAnnotation(html));
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
          return `<h${token.depth} id="${escapeAttr(id)}">${parsedText}</h${token.depth}>\n`;
        },
        html(token) {
          const rawHtml = typeof token === 'string' ? token : token.text;
          if (!rawHtml || !/<(?:td|th|caption|figcaption)\b/i.test(rawHtml)) {
            return rawHtml;
          }
          const inlineLexer = new marked.Lexer(this.options);
          return rawHtml.replace(
            /<(td|th|caption|figcaption)(\b[^>]*)>([\s\S]*?)<\/\1>/gi,
            (_match, tag: string, attrs: string, inner: string) => {
              const trimmed = inner.trim();
              if (!trimmed) return `<${tag}${attrs}></${tag}>`;
              if (typeof this.parser?.parseInline === 'function') {
                const inlineTokens = inlineLexer.inlineTokens(trimmed);
                const parsedInner = this.parser.parseInline(inlineTokens);
                return `<${tag}${attrs}>${parsedInner}</${tag}>`;
              }
              return `<${tag}${attrs}>${inner}</${tag}>`;
            }
          );
        },
        image(token) {
          let href = token.href || '';
          if (typeof window !== 'undefined' && window.__SILA_IMAGES__) {
            const imgDict = window.__SILA_IMAGES__;
            if (imgDict[href]) {
              href = imgDict[href];
            } else {
              const lowerHref = href.toLowerCase();
              const normHref = href.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
              for (const [k, v] of Object.entries(imgDict)) {
                if (
                  k.toLowerCase() === lowerHref ||
                  (normHref && k.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normHref)
                ) {
                  href = v;
                  break;
                }
              }
            }
          }
          let out = `<img src="${escapeAttr(href)}" alt="${escapeAttr(token.text)}"`;
          if (token.title) {
            out += ` title="${escapeAttr(token.title)}"`;
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


