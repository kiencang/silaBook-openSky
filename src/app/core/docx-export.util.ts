import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  BorderStyle,
  WidthType,
  VerticalAlign,
  FootnoteReferenceRun,
  ImportedXmlComponent
} from 'docx';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import { normalizeMathDelimiters, PANDOC_INLINE_MATH_RE } from './marked-setup';

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
const FALLBACK_1X1_PNG_BYTES = convertDataUrlToUint8Array(
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

/**
 * Chuẩn hóa DOM XML của công thức OMML (Office Math Markup Language) trước khi đưa vào DOCX.
 * 
 * Giải quyết các vấn đề:
 * 1. Triệt tiêu 2 dấu hỏi đỏ ngược (¿¿) ở ion có mũ kết thúc bằng toán tử (+, -, −, *): Ca^{2+}, K^+, Na^+.
 * 2. Ngăn hiện tượng nuốt công thức phía sau vào mũ (Na^+-K^+).
 * 3. Gộp ký hiệu nguyên tố hóa học 2 chữ cái (Ca, Na, Mg, Fe, Cl) không bị tách rời (C a, N a).
 * 4. Bổ sung cơ số giữ chỗ cho các toán tử khuyết thiếu (m:nary, m:sSup rỗng).
 * 5. Bọc an toàn dấu ngoặc đơn lẻ do lỗi OCR ($2),$).
 * 6. Loại bỏ các thẻ control property rỗng (<m:ctrlPr/>) gây lỗi glyph hiển thị trong Word.
 */
export function normalizeOmmlDom(doc: Document): void {
  const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
  const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // Helper tìm tag hỗ trợ cả có namespace prefix lẫn không prefix
  const getByTag = (root: Element | Document, local: string): Element[] => {
    const list: Element[] = [];
    const collect = (el: Element) => {
      const name = el.localName || el.nodeName.split(':').pop() || '';
      if (name === local) list.push(el);
      for (const child of Array.from(el.children)) {
        collect(child);
      }
    };
    if ('documentElement' in root) {
      const docEl = (root as Document).documentElement;
      if (docEl) collect(docEl);
    } else if ('children' in root) {
      collect(root as Element);
    }
    return list;
  };

  const getDirectChild = (parent: Element, local: string): Element | null => {
    for (const ch of Array.from(parent.children)) {
      const name = ch.localName || ch.nodeName.split(':').pop() || '';
      if (name === local) return ch;
    }
    return null;
  };

  // 1. Gộp ký hiệu hóa học 2 chữ cái đứng trước chỉ số (VD: C + a^{2+} -> Ca^{2+})
  const sSups = [...getByTag(doc, 'sSup'), ...getByTag(doc, 'sSub'), ...getByTag(doc, 'sSubSup')];
  for (const scriptEl of sSups) {
    const eEl = getDirectChild(scriptEl, 'e');
    if (!eEl) continue;
    const baseTextNodes = getByTag(eEl, 't');
    const baseText = baseTextNodes.map(n => n.textContent || '').join('');
    
    // Nếu cơ số là 1 chữ cái thường (a, g, e, l...)
    if (/^[a-z]$/.test(baseText)) {
      let prev = scriptEl.previousElementSibling;
      while (prev && prev.nodeType === 1 && prev.textContent?.trim() === '') {
        prev = prev.previousElementSibling;
      }
      if (prev) {
        const prevTextNodes = getByTag(prev, 't');
        const prevText = prevTextNodes.map(n => n.textContent || '').join('');
        // Và phần tử liền trước là đúng 1 chữ cái in hoa (C, N, M, F...)
        if (/^[A-Z]$/.test(prevText)) {
          if (baseTextNodes.length > 0) {
            baseTextNodes[0].textContent = prevText + baseText;
          }
          prev.parentElement?.removeChild(prev);
        }
      }
    }
  }

  // 1b. Tách riêng các dấu ngoặc nhọn '{' và '}' ra thành các <m:r> độc lập.
  // Trong LibreOffice (SmOoxmlImport::handleR), nếu một <m:r> vừa có <m:nor/> vừa chứa '{' hoặc '}',
  // LibreOffice sẽ bọc chuỗi trong dấu ngoặc kép "..." rồi mới chạy replaceAll("{", "\\{"),
  // khiến StarMath hiểu "\\{" là chuỗi văn bản thuần và in thừa dấu "\" ra màn hình.
  const initialRuns = getByTag(doc, 'r');
  for (const r of initialRuns) {
    const t = getDirectChild(r, 't');
    const rawText = t?.textContent || '';
    if (/[{}]/.test(rawText) && rawText.trim().length > 1 && r.parentElement) {
      const segments = rawText.split(/([{}])/).filter(s => s.length > 0);
      if (segments.length > 1) {
        const parent = r.parentElement;
        for (const seg of segments) {
          const clonedR = r.cloneNode(true) as Element;
          const clonedT = getDirectChild(clonedR, 't');
          if (clonedT) {
            clonedT.textContent = seg;
            clonedT.setAttribute('xml:space', 'preserve');
          }
          parent.insertBefore(clonedR, r);
        }
        parent.removeChild(r);
      }
    }
  }

  // 2. Chuẩn hóa các run (<m:r>) trong chỉ số mũ (<m:sup>) và chỉ số dưới (<m:sub>)
  // Đóng gói toán tử dạng literal text để tránh bị LibreOffice/Word báo lỗi cú pháp
  const scriptContainers = [...getByTag(doc, 'sup'), ...getByTag(doc, 'sub')];
  for (const container of scriptContainers) {
    const runs = getByTag(container, 'r');
    for (const r of runs) {
      const t = getDirectChild(r, 't');
      const text = t?.textContent || '';
      if (/^[{}]+$/.test(text.trim())) continue;
      
      // Nếu chứa toán tử ở cuối (như "2+", "+", "-", "3-") hoặc chứa dấu toán học đặc thù
      const hasTrailingOp = /[+\-−*∗]$/.test(text.trim());
      const hasOpChars = /[+\-−*∗/]/.test(text);

      if (hasTrailingOp || (hasOpChars && text.length > 1)) {
        // Loại bỏ thẻ <w:rPr> rỗng nếu có (vì w:rPr đứng trước m:rPr sẽ vô hiệu hóa m:rPr)
        for (const child of Array.from(r.children)) {
          const cName = child.localName || child.nodeName.split(':').pop() || '';
          if (cName === 'rPr' && child.namespaceURI === WORD_NS) {
            r.removeChild(child);
          }
        }

        // Đảm bảo <m:rPr><m:nor/></m:rPr> nằm ở vị trí đầu tiên trong <m:r>
        let mRPr = getDirectChild(r, 'rPr');
        if (!mRPr) {
          mRPr = doc.createElementNS(MATH_NS, 'm:rPr');
          r.insertBefore(mRPr, r.firstChild);
        }
        if (mRPr && !getDirectChild(mRPr, 'nor')) {
          const nor = doc.createElementNS(MATH_NS, 'm:nor');
          mRPr.appendChild(nor);
        }
      }
    }
  }

  // 3. Khắc phục cơ số rỗng (<m:e/>) trong các cấu trúc toán (nary, sSup, sSub)
  const emptyHolders = [...getByTag(doc, 'nary'), ...getByTag(doc, 'sSup'), ...getByTag(doc, 'sSub')];
  for (const el of emptyHolders) {
    const eEl = getDirectChild(el, 'e');
    if (eEl && eEl.children.length === 0 && (!eEl.textContent || eEl.textContent.trim() === '')) {
      const r = doc.createElementNS(MATH_NS, 'm:r');
      const t = doc.createElementNS(MATH_NS, 'm:t');
      t.textContent = '\u200B'; // Zero-width space để tránh rỗng DOM
      r.appendChild(t);
      eEl.appendChild(r);
    }
  }

  // 4. Bảo vệ các dấu ngoặc đơn lẻ (mở & đóng, trừ ngoặc nhọn '{' '}'), chuỗi gộp chứa ngoặc hoặc toán tử/dấu câu ở biên dễ gây lỗi OCR
  // (ví dụ: "$($", "$K^+ ($", "$(,$", "$2),$") và dọn dẹp <w:rPr/> / <m:sty m:val="undefined"/>
  const allRuns = getByTag(doc, 'r');
  for (const r of allRuns) {
    const t = getDirectChild(r, 't');
    const trimmedText = (t?.textContent || '').trim();
    const isCurlyBraceRun = /^[{}]+$/.test(trimmedText);

    if (isCurlyBraceRun) {
      // Đảm bảo thẻ <m:r> chứa '{' hoặc '}' không có <m:nor/> để tránh lỗi in thừa dấu '\' trong LibreOffice
      const mRPr = getDirectChild(r, 'rPr');
      if (mRPr) {
        const nor = getDirectChild(mRPr, 'nor');
        if (nor) {
          mRPr.removeChild(nor);
        }
        if (mRPr.children.length === 0) {
          r.removeChild(mRPr);
        }
      }
    }

    const hasBracketOrEdgeOp =
      !isCurlyBraceRun &&
      (/[()[\]<>⟨⟩]/.test(trimmedText) ||
        /^[+\-−*∗/=,;:~≈]|[+\-−*∗/=,;:~≈]$/.test(trimmedText) ||
        /[,;:~=<>][+\-−*∗]/.test(trimmedText));

    if (hasBracketOrEdgeOp) {
      // Loại bỏ thẻ <w:rPr> rỗng nếu có (vì w:rPr đứng trước m:rPr sẽ vô hiệu hóa m:rPr)
      for (const child of Array.from(r.children)) {
        const cName = child.localName || child.nodeName.split(':').pop() || '';
        if (cName === 'rPr' && child.namespaceURI === WORD_NS) {
          r.removeChild(child);
        }
      }

      let mRPr = getDirectChild(r, 'rPr');
      if (!mRPr) {
        mRPr = doc.createElementNS(MATH_NS, 'm:rPr');
        r.insertBefore(mRPr, r.firstChild);
      }
      if (mRPr && !getDirectChild(mRPr, 'nor')) {
        const nor = doc.createElementNS(MATH_NS, 'm:nor');
        mRPr.appendChild(nor);
      }
    }

    // Dọn dẹp <m:sty m:val="undefined"/> không hợp lệ do mathml2omml sinh ra khi gặp \mathrm
    const existingMRPr = getDirectChild(r, 'rPr');
    if (existingMRPr) {
      for (const child of Array.from(existingMRPr.children)) {
        const cName = child.localName || child.nodeName.split(':').pop() || '';
        if (cName === 'sty') {
          const valAttr = child.getAttribute('m:val') || child.getAttribute('val');
          if (valAttr === 'undefined') {
            existingMRPr.removeChild(child);
          }
        }
      }
      // Nếu có m:rPr thì đảm bảo không còn w:rPr đứng trước làm vô hiệu hóa m:rPr
      for (const child of Array.from(r.children)) {
        const cName = child.localName || child.nodeName.split(':').pop() || '';
        if (cName === 'rPr' && child.namespaceURI === WORD_NS) {
          r.removeChild(child);
        }
      }
    }
  }

  // 5. Loại bỏ triệt để các thẻ control property rỗng (<m:ctrlPr/>) sinh ra từ mathml2omml
  const ctrlPrs = getByTag(doc, 'ctrlPr');
  for (const cp of ctrlPrs) {
    if (cp.children.length === 0 && (!cp.textContent || cp.textContent.trim() === '')) {
      const parent = cp.parentElement;
      if (parent) {
        parent.removeChild(cp);
      }
    }
  }
}

/**
 * Chuyển đổi công thức LaTeX sang đối tượng OMML (<m:oMath> hoặc <m:oMathPara>) chuẩn của Microsoft Word
 * thông qua chuỗi xử lý: LaTeX -> KaTeX (MathML) -> mathml2omml (OMML XML) -> normalizeOmmlDom -> ImportedXmlComponent
 */
function createOmmlComponentFromLatex(latex: string, displayMode = false): ImportedXmlComponent | null {
  try {
    const trimmed = latex.trim();
    if (!trimmed) return null;

    // 1. Render LaTeX sang MathML bằng KaTeX
    const rawHtml = katex.renderToString(trimmed, {
      output: 'mathml',
      throwOnError: false,
      strict: false,
      displayMode
    });

    // 2. Xóa bỏ thẻ <annotation> để mathml2omml không đọc nhầm mã nguồn LaTeX thô
    const withoutAnnotation = rawHtml.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '');
    const mathMatch = withoutAnnotation.match(/<math[\s\S]*?<\/math>/i);
    if (!mathMatch) return null;

    // 3. Chuyển đổi MathML sang OMML (<m:oMath>...</m:oMath>) với disableDecode: true để giữ nguyên &lt; &gt; &amp;
    let ommlXml = mml2omml(mathMatch[0], { disableDecode: true });
    if (!ommlXml) return null;

    // 4. Chuẩn hóa DOM XML để triệt tiêu lỗi ¿¿, nuốt số mũ và gộp ký hiệu hóa học (Ca, Na)
    if (typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(ommlXml, 'text/xml');
        if (!doc.querySelector('parsererror')) {
          normalizeOmmlDom(doc);
          const serializer = new XMLSerializer();
          ommlXml = serializer.serializeToString(doc);
        }
      } catch (domErr) {
        console.warn('Could not normalize OMML DOM:', domErr);
      }
    }

    // Nếu là công thức khối độc lập (displayMode), bọc trong <m:oMathPara> để Word hiển thị ở chế độ Display Equation
    if (displayMode && !ommlXml.includes('<m:oMathPara')) {
      ommlXml = `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlXml}</m:oMathPara>`;
    }

    // 5. Parse chuỗi XML OMML thành cây đối tượng XmlComponent của thư viện docx
    const parsedWrapper = ImportedXmlComponent.fromXmlString(ommlXml) as unknown as {
      root?: ImportedXmlComponent[];
    };
    if (parsedWrapper && Array.isArray(parsedWrapper.root) && parsedWrapper.root.length > 0) {
      return parsedWrapper.root[0];
    }
    return parsedWrapper as unknown as ImportedXmlComponent;
  } catch (e) {
    console.warn('Failed to convert LaTeX to OMML for DOCX:', e);
    return null;
  }
}

interface InlineToken {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  superScript?: boolean;
  subScript?: boolean;
  strike?: boolean;
  underline?: boolean;
  footnoteId?: number;
  mathLatex?: string;
  mathDisplay?: boolean;
}

export function tokenizeInline(text: string, getFootnoteId?: (k: string) => number): InlineToken[] {
  const parts: InlineToken[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.startsWith('\\', index)) {
      if (index + 1 < text.length) {
        parts.push({
          text: text[index + 1],
          bold: false,
          italic: false,
          code: false
        });
        index += 2;
        continue;
      }
    }

    if (getFootnoteId && text.startsWith('[^', index)) {
      const end = text.indexOf(']', index + 2);
      if (end !== -1) {
        const fnKey = text.substring(index + 2, end);
        parts.push({
          text: '',
          bold: false,
          italic: false,
          code: false,
          footnoteId: getFootnoteId(fnKey)
        });
        index = end + 1;
        continue;
      }
    }
    if (text.startsWith('`', index)) {
      const end = text.indexOf('`', index + 1);
      if (end !== -1) {
        parts.push({
          text: text.substring(index + 1, end),
          bold: false,
          italic: false,
          code: true
        });
        index = end + 1;
        continue;
      }
    }

    // Nhận diện công thức toán học $$...$$ trên cùng 1 dòng hoặc $...$ (inline) theo chuẩn Pandoc tex_math_dollars
    if (text.startsWith('$', index)) {
      const prevChar = index > 0 ? text[index - 1] : '';
      if (prevChar !== '\\' && !/[a-zA-Z0-9$]/.test(prevChar)) {
        const rest = text.substring(index);
        const mathMatch = rest.match(PANDOC_INLINE_MATH_RE);
        if (mathMatch) {
          const isDisplay = mathMatch[0].startsWith('$$');
          const innerLatex = (mathMatch[1] ?? mathMatch[2] ?? mathMatch[3]).trim();
          parts.push({
            text: '',
            bold: false,
            italic: false,
            code: false,
            mathLatex: innerLatex,
            mathDisplay: isDisplay
          });
          index += mathMatch[0].length;
          continue;
        }
      }
    }

    // Nhận diện các thẻ HTML nội tuyến an toàn theo whitelist (sup, sub, del, s, u)
    // Dùng whitelist nghiêm ngặt để không bao giờ nhận nhầm các dấu so sánh toán học như "p < 0.05", "EF < 40%"
    if (text.startsWith('<', index)) {
      const rest = text.substring(index);

      const supMatch = rest.match(/^<sup\b[^>]*>([\s\S]*?)<\/sup>/i);
      if (supMatch) {
        parts.push({
          text: supMatch[1].replace(/<[^>]+>/g, ''),
          bold: false,
          italic: false,
          code: false,
          superScript: true
        });
        index += supMatch[0].length;
        continue;
      }

      const subMatch = rest.match(/^<sub\b[^>]*>([\s\S]*?)<\/sub>/i);
      if (subMatch) {
        parts.push({
          text: subMatch[1].replace(/<[^>]+>/g, ''),
          bold: false,
          italic: false,
          code: false,
          subScript: true
        });
        index += subMatch[0].length;
        continue;
      }

      const delMatch = rest.match(/^<(?:del|s|strike)\b[^>]*>([\s\S]*?)<\/(?:del|s|strike)>/i);
      if (delMatch) {
        parts.push({
          text: delMatch[1].replace(/<[^>]+>/g, ''),
          bold: false,
          italic: false,
          code: false,
          strike: true
        });
        index += delMatch[0].length;
        continue;
      }

      const uMatch = rest.match(/^<u\b[^>]*>([\s\S]*?)<\/u>/i);
      if (uMatch) {
        parts.push({
          text: uMatch[1].replace(/<[^>]+>/g, ''),
          bold: false,
          italic: false,
          code: false,
          underline: true
        });
        index += uMatch[0].length;
        continue;
      }
    }

    if (text.startsWith('***', index)) {
      const end = text.indexOf('***', index + 3);
      if (end !== -1) {
        parts.push({
          text: text.substring(index + 3, end),
          bold: true,
          italic: true,
          code: false
        });
        index = end + 3;
        continue;
      }
    }

    if (text.startsWith('**', index)) {
      const end = text.indexOf('**', index + 2);
      if (end !== -1) {
        parts.push({
          text: text.substring(index + 2, end),
          bold: true,
          italic: false,
          code: false
        });
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith('__', index)) {
      const end = text.indexOf('__', index + 2);
      if (end !== -1) {
        parts.push({
          text: text.substring(index + 2, end),
          bold: true,
          italic: false,
          code: false
        });
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith('*', index)) {
      const end = text.indexOf('*', index + 1);
      if (end !== -1) {
        parts.push({
          text: text.substring(index + 1, end),
          bold: false,
          italic: true,
          code: false
        });
        index = end + 1;
        continue;
      }
    }

    if (text.startsWith('_', index)) {
      const end = text.indexOf('_', index + 1);
      if (end !== -1) {
        parts.push({
          text: text.substring(index + 1, end),
          bold: false,
          italic: true,
          code: false
        });
        index = end + 1;
        continue;
      }
    }

    let nextIndex = index;
    while (nextIndex < text.length) {
      const char = text[nextIndex];
      if (
        char === '`' ||
        char === '$' ||
        char === '*' ||
        char === '_' ||
        char === '\\' ||
        (getFootnoteId && char === '[' && text.startsWith('[^', nextIndex)) ||
        (char === '<' && /^<\/?(?:sup|sub|del|s|strike|u)\b/i.test(text.substring(nextIndex)))
      ) {
        break;
      }
      nextIndex++;
    }

    if (nextIndex > index) {
      parts.push({
        text: text.substring(index, nextIndex),
        bold: false,
        italic: false,
        code: false
      });
      index = nextIndex;
    } else {
      parts.push({
        text: text[index],
        bold: false,
        italic: false,
        code: false
      });
      index++;
    }
  }

  return parts;
}

interface RunOptions {
  color?: string;
  size?: number;
  italics?: boolean;
  bold?: boolean;
  font?: string;
}

function createRunsFromText(
  text: string,
  getFootnoteId?: (k: string) => number,
  opts?: RunOptions
): (TextRun | FootnoteReferenceRun | ImportedXmlComponent)[] {
  const tokens = tokenizeInline(text, getFootnoteId);
  return tokens.map(token => {
    if (token.footnoteId) {
      return new FootnoteReferenceRun(token.footnoteId);
    }
    if (token.mathLatex !== undefined) {
      const ommlComp = createOmmlComponentFromLatex(token.mathLatex, false);
      if (ommlComp) {
        return ommlComp;
      }
      // Fallback sang TextRun nếu công thức lỗi không thể chuyển sang OMML
      return new TextRun({
        text: token.mathLatex,
        font: "Cambria Math",
        size: opts?.size ?? 22,
      });
    }
    return new TextRun({
      text: token.text,
      bold: opts?.bold ?? (token.bold || undefined),
      italics: opts?.italics ?? (token.italic || undefined),
      superScript: token.superScript || undefined,
      subScript: token.subScript || undefined,
      strike: token.strike || undefined,
      underline: token.underline ? {} : undefined,
      font: token.code ? "Consolas" : (opts?.font ?? "Calibri"),
      size: token.code ? 19 : (opts?.size ?? 22),
      color: token.code ? "A855F7" : (opts?.color ?? undefined),
    });
  });
}

function parseMarkdownTable(tableLines: string[], getFootnoteId?: (k: string) => number): Table {
  const rowsData = tableLines.filter(line => {
    const clean = line.trim();
    if (/^[|:\-\s]+$/.test(clean)) return false;
    return true;
  });

  const parsedRows: TableRow[] = [];

  for (let rIndex = 0; rIndex < rowsData.length; rIndex++) {
    const line = rowsData[rIndex];
    const safeLine = line.replace(/\$([^$\n]+)\$/g, m => m.replace(/(?<!\\)\|/g, '\\|'));
    const cols = safeLine.split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
    if (safeLine.startsWith('|')) cols.shift();
    if (safeLine.endsWith('|') && !safeLine.endsWith('\\|')) cols.pop();

    const cells = cols.map(colText => {
      return new TableCell({
        children: [
          new Paragraph({
            children: createRunsFromText(colText, getFootnoteId),
            spacing: { before: 80, after: 80 },
          }),
        ],
        shading: rIndex === 0 ? { fill: "F2F5F9" } : undefined,
        verticalAlign: VerticalAlign.CENTER,
      });
    });

    parsedRows.push(new TableRow({ children: cells }));
  }

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: "D1D5DB" },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: "D1D5DB" },
      left: { style: BorderStyle.SINGLE, size: 8, color: "D1D5DB" },
      right: { style: BorderStyle.SINGLE, size: 8, color: "D1D5DB" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
    },
    rows: parsedRows,
  });
}

/**
 * Tự động chuyển đổi các thẻ HTML <table>...</table> sang cú pháp Bảng Markdown (| ... |)
 * nhằm bảo đảm mọi bảng biểu (kể cả bảng do AI trả về dưới dạng HTML hoặc trích xuất từ EPUB)
 * đều được chuyển thành Bảng chuẩn của Microsoft Word (docx Table).
 */
export function convertHtmlTablesToMarkdown(content: string): string {
  if (!content || !content.includes('<table')) return content;

  return content.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (match) => {
    try {
      const rowMatches = match.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
      if (!rowMatches || rowMatches.length === 0) return match;

      const tableData: string[][] = [];
      let maxCols = 0;

      for (const rowHtml of rowMatches) {
        const cellMatches = rowHtml.match(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi);
        if (!cellMatches || cellMatches.length === 0) continue;

        const rowData: string[] = [];
        for (const cellHtml of cellMatches) {
          const innerMatch = cellHtml.match(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/i);
          let cellText = innerMatch ? innerMatch[1] : '';

          // Chuyển đổi các thẻ định dạng nội tuyến cơ bản sang Markdown, giữ lại thẻ chỉ số (sup, sub, del, s, strike, u)
          cellText = cellText.replace(/<(b|strong)\b[^>]*>(.*?)<\/\1>/gi, '**$2**');
          cellText = cellText.replace(/<(i|em)\b[^>]*>(.*?)<\/\1>/gi, '*$2*');
          cellText = cellText.replace(/<code\b[^>]*>(.*?)<\/code>/gi, '`$1`');
          cellText = cellText.replace(/<br\s*\/?>/gi, ' ');
          cellText = cellText.replace(/<(?!\/?(?:sup|sub|del|s|strike|u)\b)[^>]+>/gi, '');
          cellText = cellText.replace(/\|/g, '\\|').trim().replace(/\s+/g, ' ');

          rowData.push(cellText);
        }

        if (rowData.length > maxCols) {
          maxCols = rowData.length;
        }
        tableData.push(rowData);
      }

      if (maxCols === 0 || tableData.length === 0) return match;

      // Cân bằng số cột cho các hàng
      for (const row of tableData) {
        while (row.length < maxCols) {
          row.push('');
        }
      }

      const mdLines: string[] = [];
      const header = tableData[0];
      mdLines.push('| ' + header.join(' | ') + ' |');
      mdLines.push('| ' + Array(maxCols).fill('---').join(' | ') + ' |');

      for (let i = 1; i < tableData.length; i++) {
        mdLines.push('| ' + tableData[i].join(' | ') + ' |');
      }

      return '\n\n' + mdLines.join('\n') + '\n\n';
    } catch {
      return match;
    }
  });
}

function parseSvgIntrinsicDimensions(svgBytes: Uint8Array): { width: number; height: number } | null {
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

function rasterizeImageElementToPng(img: HTMLImageElement, width: number, height: number): Uint8Array | null {
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

export class DocxExporter {
  static async generateDocx(title: string, markdownContent: string, images?: Record<string, string>): Promise<Blob> {
    // Strip ONLY internal Markdown links (but not images) and internal HTML links before processing
    let cleanedContent = markdownContent.replace(/(^|[^!])\[([^\]]+)\]\(#[^)]*\)/g, '$1$2');
    cleanedContent = cleanedContent.replace(/<a\b[^>]*href=["']#[^"']*["'][^>]*>(.*?)<\/a>/gi, '$1');
    // Tự động chuyển đổi các bảng HTML (<table>...</table>) thành Bảng Markdown (| ... |) trước khi xử lý <br>
    cleanedContent = convertHtmlTablesToMarkdown(cleanedContent);
    // Chuyển <br> trong dòng bảng Markdown thành khoảng trắng để không làm đứt hàng bảng, còn ngoài bảng thì chuyển thành \n
    cleanedContent = cleanedContent
      .split('\n')
      .map(line =>
        line.trim().startsWith('|')
          ? line.replace(/<br\s*\/?>/gi, ' ')
          : line.replace(/<br\s*\/?>/gi, '\n')
      )
      .join('\n');
    // Chuẩn hóa \[...\], \(...\), và các khối $$ nhiều dòng
    cleanedContent = normalizeMathDelimiters(cleanedContent);

    const activeImages: Record<string, PreparedDocxImage> = {};
    if (images) {
      const promises = Object.entries(images).map(async ([key, dataUrl]) => {
        try {
          activeImages[key] = await prepareImageForDocx(dataUrl);
        } catch {
          activeImages[key] = {
            width: 400,
            height: 300,
            type: 'png',
            data: FALLBACK_1X1_PNG_BYTES,
          };
        }
      });
      await Promise.all(promises);
    }

    const findImage = (key: string) => {
      let imgData = activeImages[key];
      if (!imgData) {
         const lowerKey = key.toLowerCase();
         for (const [k, v] of Object.entries(activeImages)) {
             if (k.toLowerCase() === lowerKey || k.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()) {
                 imgData = v;
                 break;
             }
         }
      }
      return imgData || null;
    };

    const children: (Paragraph | Table)[] = [];
    
    const linesRaw = cleanedContent.split('\n');
    const lines: string[] = [];
    const footnoteDefs: Record<string, string> = {};
    for (const line of linesRaw) {
      const match = line.trim().match(/^\[\^([^\]]+)\]:\s*(.*)$/);
      if (match) {
        footnoteDefs[match[1]] = match[2];
      } else {
        lines.push(line);
      }
    }

    let nextFootnoteId = 1;
    const footnoteKeyToId: Record<string, number> = {};
    const getFootnoteId = (key: string) => {
      if (!footnoteKeyToId[key]) {
        footnoteKeyToId[key] = nextFootnoteId++;
      }
      return footnoteKeyToId[key];
    };

    let idx = 0;

    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let inMathBlock = false;
    let mathBlockContent: string[] = [];

    while (idx < lines.length) {
      const line = lines[idx];
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('```')) {
        if (inCodeBlock) {
          const codeText = codeBlockContent.join('\n');
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
                left: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
                right: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: codeText,
                              font: "Consolas",
                              size: 19,
                              color: "374151",
                            }),
                          ],
                          spacing: { before: 120, after: 120 },
                        }),
                      ],
                      shading: { fill: "F3F4F6" },
                    }),
                  ],
                }),
              ],
            })
          );
          inCodeBlock = false;
          codeBlockContent = [];
        } else {
          inCodeBlock = true;
        }
        idx++;
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        idx++;
        continue;
      }

      // Xử lý khối công thức toán học độc lập trên 1 dòng: $$ ... $$
      if (!inMathBlock && trimmedLine.startsWith('$$') && trimmedLine.endsWith('$$') && trimmedLine.length > 4) {
        const singleLineMath = trimmedLine.slice(2, -2).trim();
        const ommlComp = createOmmlComponentFromLatex(singleLineMath, true);
        if (ommlComp) {
          children.push(
            new Paragraph({
              children: [ommlComp],
              alignment: AlignmentType.CENTER,
              spacing: { before: 160, after: 160 },
            })
          );
        } else {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: singleLineMath, font: "Cambria Math", size: 22 })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 160, after: 160 },
            })
          );
        }
        idx++;
        continue;
      }

      // Xử lý khối công thức toán học nhiều dòng mở/đóng bằng $$
      if (trimmedLine === '$$') {
        if (inMathBlock) {
          const mathText = mathBlockContent.join('\n').trim();
          const ommlComp = createOmmlComponentFromLatex(mathText, true);
          if (ommlComp) {
            children.push(
              new Paragraph({
                children: [ommlComp],
                alignment: AlignmentType.CENTER,
                spacing: { before: 160, after: 160 },
              })
            );
          } else if (mathText) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: mathText, font: "Cambria Math", size: 22 })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 160, after: 160 },
              })
            );
          }
          inMathBlock = false;
          mathBlockContent = [];
        } else {
          inMathBlock = true;
        }
        idx++;
        continue;
      }

      if (inMathBlock) {
        mathBlockContent.push(line);
        idx++;
        continue;
      }

      if (trimmedLine === '') {
        idx++;
        continue;
      }

      if (trimmedLine.startsWith('|')) {
        const tableLines: string[] = [];
        while (idx < lines.length && lines[idx].trim().startsWith('|')) {
          tableLines.push(lines[idx]);
          idx++;
        }
        try {
          children.push(parseMarkdownTable(tableLines, getFootnoteId));
        } catch {
          tableLines.forEach(l => {
            children.push(
              new Paragraph({
                children: createRunsFromText(l, getFootnoteId),
            spacing: { after: 120 },
              })
            );
          });
        }
        continue;
      }

      if (trimmedLine.startsWith('#')) {
        const levelMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
        if (levelMatch) {
          const depth = levelMatch[1].length;
          let text = levelMatch[2];
          
          text = text.replace(/\s*\{#[^}]+\}\s*$/, '');
          
          let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1;
          let fontSize = 36;
          let color = "1F497D";

          if (depth === 1) {
            headingLevel = HeadingLevel.HEADING_1;
            fontSize = 40;
            color = "1F497D";
          } else if (depth === 2) {
            headingLevel = HeadingLevel.HEADING_2;
            fontSize = 32;
            color = "2E74B5";
          } else if (depth === 3) {
            headingLevel = HeadingLevel.HEADING_3;
            fontSize = 26;
            color = "1F4E79";
          } else {
            headingLevel = HeadingLevel.HEADING_4;
            fontSize = 24;
            color = "333333";
          }

          children.push(
            new Paragraph({
              heading: headingLevel,
              children: createRunsFromText(text, getFootnoteId, {
                bold: true,
                size: fontSize,
                color: color,
                font: "Segoe UI",
              }),
              spacing: { before: 240, after: 120 },
            })
          );
          idx++;
          continue;
        }
      }

      if (trimmedLine.startsWith('>')) {
        const quoteText = trimmedLine.replace(/^>\s*/, '');
        children.push(
          new Paragraph({
            children: createRunsFromText(quoteText, getFootnoteId, {
              italics: true,
              size: 21,
              color: "4B5563"
            }),
            indent: { left: 720 },
            spacing: { before: 120, after: 120 },
          })
        );
        idx++;
        continue;
      }

      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || trimmedLine.startsWith('+ ')) {
        const bulletText = trimmedLine.substring(2);
        children.push(
          new Paragraph({
            children: createRunsFromText(bulletText, getFootnoteId),
            bullet: { level: 0 },
            spacing: { after: 100 },
          })
        );
        idx++;
        continue;
      }

      const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        const numStr = numberedMatch[1];
        const ordText = numberedMatch[2];
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${numStr}. `,
                bold: true,
                font: "Calibri",
                size: 22,
              }),
              ...createRunsFromText(ordText, getFootnoteId),
            ],
            indent: { left: 720 },
            spacing: { after: 100 },
          })
        );
        idx++;
        continue;
      }

      const robustImgRegex = /!\[([^\]]*)\]\(([^)]+)\)|!\[([^\]]*)\]\s*\[([^\]]+)\]|!\[([^\]]+)\]|<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
        
      const hasImage = robustImgRegex.test(trimmedLine);
      if (hasImage) {
        robustImgRegex.lastIndex = 0;
        let lastStop = 0;
        let match;
        
        while ((match = robustImgRegex.exec(trimmedLine)) !== null) {
          const matchIndex = match.index;
          const key = match[2] || match[4] || match[5] || match[6];


          if (matchIndex > lastStop) {
            const preText = trimmedLine.substring(lastStop, matchIndex).trim();
            if (preText) {
              children.push(
                new Paragraph({
                  children: createRunsFromText(preText, getFootnoteId),
                  spacing: { after: 120 },
                })
              );
            }
          }

          const imgObj = findImage(key);
          if (imgObj) {
            try {
              const maxW = 560;
              let displayWidth = imgObj.width || 400;
              let displayHeight = imgObj.height || 300;

              if (displayWidth > maxW) {
                const ratio = maxW / displayWidth;
                displayWidth = maxW;
                displayHeight = Math.floor(displayHeight * ratio);
              }

              const imageRunOptions =
                imgObj.type === 'svg'
                  ? {
                      type: 'svg' as const,
                      data: imgObj.data,
                      fallback: imgObj.fallback || {
                        type: 'png' as const,
                        data: FALLBACK_1X1_PNG_BYTES,
                      },
                      transformation: {
                        width: displayWidth,
                        height: displayHeight,
                      },
                    }
                  : {
                      type: imgObj.type,
                      data: imgObj.data,
                      transformation: {
                        width: displayWidth,
                        height: displayHeight,
                      },
                    };

              children.push(
                new Paragraph({
                  children: [new ImageRun(imageRunOptions)],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 240, after: 240 },
                })
              );
            } catch (e) {
              console.error(e);
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `[Lỗi hiển thị ảnh: ${key}]`,
                      color: "EF4444",
                      italics: true,
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 120, after: 120 },
                })
              );
            }
          } else {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[Đang tải ảnh: ${key}]`,
                    color: "6B7280",
                    italics: true,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 120 },
              })
            );
          }

          lastStop = robustImgRegex.lastIndex;
        }

        if (lastStop < trimmedLine.length) {
          const postText = trimmedLine.substring(lastStop).trim();
          if (postText) {
            children.push(
              new Paragraph({
                children: createRunsFromText(postText, getFootnoteId),
                spacing: { after: 120 },
              })
            );
          }
        }

        idx++;
        continue;
      }

      children.push(
        new Paragraph({
          children: createRunsFromText(trimmedLine, getFootnoteId),
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
        })
      );

      idx++;
    }

    const docxFootnotes: Record<number, { children: Paragraph[] }> = {};
    for (const [key, id] of Object.entries(footnoteKeyToId)) {
      const defText = footnoteDefs[key] || "Chú thích không xác định";
      docxFootnotes[id] = {
        children: [
          new Paragraph({
            children: createRunsFromText(defText, undefined, { size: 18 }),
            spacing: { before: 60, after: 60 },
          })
        ]
      };
    }

    const doc = new DocxDocument({
      footnotes: Object.keys(docxFootnotes).length > 0 ? docxFootnotes : undefined,
      sections: [
        {
          properties: {},
          children: children,
        },
      ],
    });

    return await Packer.toBlob(doc);
  }
}

