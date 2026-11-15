import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  VerticalAlign,
  FootnoteReferenceRun,
  ImportedXmlComponent
} from 'docx';
import { PANDOC_INLINE_MATH_RE } from './marked-setup';
import { createOmmlComponentFromLatex } from './docx-math.util';

export interface InlineToken {
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

export interface RunOptions {
  color?: string;
  size?: number;
  italics?: boolean;
  bold?: boolean;
  font?: string;
}

export function createRunsFromText(
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

export function parseMarkdownTable(tableLines: string[], getFootnoteId?: (k: string) => number): Table {
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
