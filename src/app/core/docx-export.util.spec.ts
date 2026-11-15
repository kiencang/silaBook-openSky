import {
  normalizeOmmlDom,
  tokenizeInline,
  convertHtmlTablesToMarkdown,
  prepareImageForDocx,
  DocxExporter,
} from './docx-export.util';

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

describe('docx-export.util', () => {
  describe('normalizeOmmlDom', () => {
    const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
    const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    it('merges split two-letter chemical element symbols preceding superscript/subscript (e.g., C + a^{2+} -> Ca^{2+})', () => {
      const xml = `
        <m:oMath xmlns:m="${MATH_NS}">
          <m:r><m:t>C</m:t></m:r>
          <m:sSup>
            <m:e><m:r><m:t>a</m:t></m:r></m:e>
            <m:sup><m:r><m:t>2+</m:t></m:r></m:sup>
          </m:sSup>
        </m:oMath>
      `;
      const doc = parseXml(xml);
      normalizeOmmlDom(doc);
      const out = serializeXml(doc);

      // The preceding <m:r><m:t>C</m:t></m:r> is merged into the base <m:e> as "Ca"
      expect(out).toContain('<m:t>Ca</m:t>');
      expect(out).not.toContain('<m:t>C</m:t>');
    });

    it('adds <m:rPr><m:nor/></m:rPr> and strips conflicting <w:rPr> on superscript/subscript runs ending with operators (e.g., 2+, +, -)', () => {
      const xml = `
        <m:oMath xmlns:m="${MATH_NS}" xmlns:w="${WORD_NS}">
          <m:sSup>
            <m:e><m:r><m:t>Na</m:t></m:r></m:e>
            <m:sup>
              <m:r>
                <w:rPr/>
                <m:t>+</m:t>
              </m:r>
            </m:sup>
          </m:sSup>
        </m:oMath>
      `;
      const doc = parseXml(xml);
      normalizeOmmlDom(doc);
      const out = serializeXml(doc);

      expect(out).not.toContain('w:rPr');
      expect(out).toContain('<m:rPr><m:nor/></m:rPr>');
    });

    it('fills empty base <m:e/> elements in nary, sSup, and sSub with a zero-width space run', () => {
      const xml = `
        <m:oMath xmlns:m="${MATH_NS}">
          <m:sSup>
            <m:e/>
            <m:sup><m:r><m:t>2</m:t></m:r></m:sup>
          </m:sSup>
        </m:oMath>
      `;
      const doc = parseXml(xml);
      normalizeOmmlDom(doc);
      const eEl = doc.getElementsByTagName('m:e')[0] || doc.getElementsByTagName('e')[0];
      expect(eEl.textContent).toBe('\u200B');
    });

    it('protects standalone brackets/edge operators with <m:nor/> and removes invalid <m:sty m:val="undefined"/> and empty <m:ctrlPr/>', () => {
      const xml = `
        <m:oMath xmlns:m="${MATH_NS}" xmlns:w="${WORD_NS}">
          <m:ctrlPr/>
          <m:r>
            <w:rPr/>
            <m:rPr><m:sty m:val="undefined"/></m:rPr>
            <m:t>2),</m:t>
          </m:r>
        </m:oMath>
      `;
      const doc = parseXml(xml);
      normalizeOmmlDom(doc);
      const out = serializeXml(doc);

      expect(out).not.toContain('ctrlPr');
      expect(out).not.toContain('undefined');
      expect(out).not.toContain('w:rPr');
      expect(out).toContain('nor');
    });

    it('splits curly braces { and } into standalone <m:r> runs without <m:nor/> to prevent literal backslash \\{ in LibreOffice while keeping <m:nor/> on inner operators', () => {
      const xml = `
        <m:oMath xmlns:m="${MATH_NS}">
          <m:r><m:t xml:space="preserve">{…,−4,−3,−2,−1,0,1,2,3,4,…</m:t></m:r>
          <m:r><m:t xml:space="preserve">}={0,−1,1,−2,2,−3,3,−4,4,…</m:t></m:r>
          <m:r><m:t xml:space="preserve">}</m:t></m:r>
        </m:oMath>
      `;
      const doc = parseXml(xml);
      normalizeOmmlDom(doc);

      const runs = Array.from(doc.getElementsByTagName('m:r'));
      const runInfos = runs.map((r) => ({
        text: r.getElementsByTagName('m:t')[0]?.textContent || '',
        hasNor: r.getElementsByTagName('m:nor').length > 0,
      }));

      // Curly braces must be isolated in their own runs and must NEVER have <m:nor/>
      const braceRuns = runInfos.filter((info) => info.text === '{' || info.text === '}');
      expect(braceRuns.length).toBe(4);
      for (const br of braceRuns) {
        expect(br.hasNor).toBe(false);
      }

      // Inner '=' and negative number sequences must be protected with <m:nor/>
      const eqRun = runInfos.find((info) => info.text === '=');
      expect(eqRun?.hasNor).toBe(true);
      const seqRun = runInfos.find((info) => info.text.includes('−4'));
      expect(seqRun?.hasNor).toBe(true);
    });
  });

  describe('tokenizeInline & convertHtmlTablesToMarkdown', () => {
    it('tokenizes bold, italic, code, math, footnotes, and safe inline HTML without breaking comparison operators like p < 0.05', () => {
      const tokens = tokenizeInline(
        'Result **bold** *italic* `code` $x^2$ with p < 0.05 and H<sub>2</sub>O[^fn1]',
        (k) => (k === 'fn1' ? 1 : 0)
      );

      expect(tokens.some((t) => t.bold && t.text === 'bold')).toBe(true);
      expect(tokens.some((t) => t.italic && t.text === 'italic')).toBe(true);
      expect(tokens.some((t) => t.code && t.text === 'code')).toBe(true);
      expect(tokens.some((t) => t.mathLatex === 'x^2')).toBe(true);
      expect(tokens.some((t) => t.subScript && t.text === '2')).toBe(true);
      expect(tokens.some((t) => t.footnoteId === 1)).toBe(true);
      expect(tokens.map((t) => t.text).join('')).toContain('p < 0.05');
    });

    it('converts HTML tables into Markdown pipe tables', () => {
      const html = '<table><tr><th>Col 1</th><th>Col 2</th></tr><tr><td><b>A</b></td><td>B | C</td></tr></table>';
      const md = convertHtmlTablesToMarkdown(html);
      expect(md).toContain('| Col 1 | Col 2 |');
      expect(md).toContain('| **A** | B \\| C |');
    });
  });

  describe('prepareImageForDocx & DocxExporter image formats', () => {
    it('classifies native formats (jpg, png, gif, bmp), converts webp to png, and preserves svg with png fallback', async () => {
      const dummyBase64 = btoa('dummy-binary-data');
      const jpgImg = await prepareImageForDocx(`data:image/jpeg;base64,${dummyBase64}`);
      const pngImg = await prepareImageForDocx(`data:image/png;base64,${dummyBase64}`);
      const gifImg = await prepareImageForDocx(`data:image/gif;base64,${dummyBase64}`);
      const bmpImg = await prepareImageForDocx(`data:image/bmp;base64,${dummyBase64}`);
      const webpImg = await prepareImageForDocx(`data:image/webp;base64,${dummyBase64}`);

      expect(jpgImg.type).toBe('jpg');
      expect(pngImg.type).toBe('png');
      expect(gifImg.type).toBe('gif');
      expect(bmpImg.type).toBe('bmp');
      expect(webpImg.type).toBe('png');

      const svgXml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><circle cx="50" cy="50" r="40"/></svg>';
      const svgImg = await prepareImageForDocx(`data:image/svg+xml;base64,${btoa(svgXml)}`);
      expect(svgImg.type).toBe('svg');
      expect(svgImg.width).toBe(800);
      expect(svgImg.height).toBe(400);
      expect(svgImg.fallback).toBeDefined();
      expect(svgImg.fallback?.type).toBe('png');
      expect(svgImg.fallback?.data.length).toBeGreaterThan(0);

      const blob = await DocxExporter.generateDocx(
        'Test Images',
        '![svg](SILA_IMG_0)\n\n![gif](SILA_IMG_1)\n\n![webp](SILA_IMG_2)',
        {
          SILA_IMG_0: `data:image/svg+xml;base64,${btoa(svgXml)}`,
          SILA_IMG_1: `data:image/gif;base64,${dummyBase64}`,
          SILA_IMG_2: `data:image/webp;base64,${dummyBase64}`,
        }
      );
      expect(blob.size).toBeGreaterThan(0);
    });
  });
});
