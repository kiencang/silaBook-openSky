import {
  Document,
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
import { normalizeMathDelimiters } from './marked-setup';

function convertDataUrlToUint8Array(dataUrl: string): Uint8Array {
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

/**
 * Chuyển đổi công thức LaTeX sang đối tượng OMML (<m:oMath> hoặc <m:oMathPara>) chuẩn của Microsoft Word
 * thông qua chuỗi xử lý: LaTeX -> KaTeX (MathML) -> mathml2omml (OMML XML) -> ImportedXmlComponent
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

    // Nếu là công thức khối độc lập (displayMode), bọc trong <m:oMathPara> để Word hiển thị ở chế độ Display Equation
    if (displayMode && !ommlXml.includes('<m:oMathPara')) {
      ommlXml = `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlXml}</m:oMathPara>`;
    }

    // 4. Parse chuỗi XML OMML thành cây đối tượng XmlComponent của thư viện docx
    const parsedWrapper = ImportedXmlComponent.fromXmlString(ommlXml) as any;
    if (parsedWrapper && Array.isArray(parsedWrapper.root) && parsedWrapper.root.length > 0) {
      return parsedWrapper.root[0] as ImportedXmlComponent;
    }
    return parsedWrapper;
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

    // Nhận diện công thức toán học $$...$$ trên cùng 1 dòng hoặc $...$ (inline)
    if (text.startsWith('$', index)) {
      const rest = text.substring(index);
      // Ưu tiên kiểm tra $$...$$ trước, sau đó đến $...$ chuẩn
      const mathMatch = rest.match(/^(\${1,2})(?!\$)((?:\\.|[^\\\n])+?(?:\\.|[^\\\n$\s]))\1/)
        || rest.match(/^(\${1,2})(?!\$)([^\n$\s])\1/);
      if (mathMatch) {
        const delimiter = mathMatch[1];
        const innerLatex = mathMatch[2].trim();
        parts.push({
          text: '',
          bold: false,
          italic: false,
          code: false,
          mathLatex: innerLatex,
          mathDisplay: delimiter.length === 2
        });
        index += mathMatch[0].length;
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
      if (char === '`' || char === '$' || char === '*' || char === '_' || char === '\\' || (getFootnoteId && char === '[' && text.startsWith('[^', nextIndex))) {
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

function createRunsFromText(text: string, getFootnoteId?: (k: string) => number, opts?: RunOptions): any[] {
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
    const cols = line.split('|').map(s => s.trim());
    if (line.startsWith('|')) cols.shift();
    if (line.endsWith('|')) cols.pop();

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

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve({ width: 400, height: 300 });
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 });
    };
    img.onerror = () => {
      resolve({ width: 400, height: 300 });
    };
    img.src = dataUrl;
  });
}

export class DocxExporter {
  static async generateDocx(title: string, markdownContent: string, images?: Record<string, string>): Promise<Blob> {
    // Strip ONLY internal Markdown links (but not images) and internal HTML links before processing
    let cleanedContent = markdownContent.replace(/(^|[^!])\[([^\]]+)\]\(#[^)]*\)/g, '$1$2');
    cleanedContent = cleanedContent.replace(/<a\b[^>]*href=["']#[^"']*["'][^>]*>(.*?)<\/a>/gi, '$1');
    // Chuẩn hóa \[...\], \(...\), và các khối $$ nhiều dòng
    cleanedContent = normalizeMathDelimiters(cleanedContent);

    const activeImages: Record<string, { dataUrl: string; width: number; height: number }> = {};
    if (images) {
      const promises = Object.entries(images).map(async ([key, dataUrl]) => {
        try {
          const dims = await getImageDimensions(dataUrl);
          activeImages[key] = { dataUrl, ...dims };
        } catch {
          activeImages[key] = { dataUrl, width: 400, height: 300 };
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

    const children: any[] = [];
    
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
          
          let headingLevel: any = HeadingLevel.HEADING_1;
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
          let key = match[2] || match[4] || match[5] || match[6];


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

              const uint8Arr = convertDataUrlToUint8Array(imgObj.dataUrl);

              children.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: uint8Arr,
                      transformation: {
                        width: displayWidth,
                        height: displayHeight,
                      },
                      type: imgObj.dataUrl.includes('image/jpeg') ? "jpg" : "png",
                    }),
                  ],
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

    const doc = new Document({
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

