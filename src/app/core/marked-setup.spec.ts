import {
  normalizeMathDelimiters,
  stripMathMlAnnotation,
  sanitizeHtml,
  parseMarkdownWithImages,
} from './marked-setup';

describe('marked-setup', () => {
  describe('normalizeMathDelimiters', () => {
    it('converts \\[...\\] to block $$...$$ and \\(...\\) to inline $...$', () => {
      const input = 'Inline \\( E = mc^2 \\) and display \\[ \\int_0^1 x^2 dx \\] math.';
      const result = normalizeMathDelimiters(input);
      expect(result).toContain('$E = mc^2$');
      expect(result).toContain('\n$$\n\\int_0^1 x^2 dx\n$$\n');
    });

    it('converts multiline \\(...\\) into block $$...$$', () => {
      const input = 'Formula: \\( a = 1 \n + 2 \\)';
      const result = normalizeMathDelimiters(input);
      expect(result).toContain('\n$$\na = 1 \n + 2\n$$\n');
    });

    it('trims inner OCR spaces around LaTeX formulas inside $...$', () => {
      const input = 'Ion $ \\mathrm{Ca^{2+}} $ and power $ x^2 $';
      const result = normalizeMathDelimiters(input);
      expect(result).toBe('Ion $\\mathrm{Ca^{2+}}$ and power $x^2$');
    });

    it('preserves fenced code blocks and inline code without altering math-like syntax inside them', () => {
      const input = [
        'Inline code `\\( not_math \\)` and `$ x^2 $`.',
        '```js',
        'const tex = "\\[ a + b \\]";',
        'const price = "$ \\mathrm{test} $";',
        '```',
      ].join('\n');

      const result = normalizeMathDelimiters(input);
      expect(result).toBe(input);
    });
  });

  describe('stripMathMlAnnotation', () => {
    it('removes <annotation> tags from MathML output', () => {
      const html =
        '<math><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math>';
      expect(stripMathMlAnnotation(html)).toBe('<math><semantics><mi>x</mi></semantics></math>');
    });
  });

  describe('sanitizeHtml', () => {
    it('strips dangerous tags such as script, iframe, object, style, link, meta, and form', () => {
      const dirty =
        '<p>Safe</p><script>alert(1)</script><iframe src="https://evil.com"></iframe><style>body{display:none}</style><form action="/steal"></form>';
      const clean = sanitizeHtml(dirty);
      expect(clean).toBe('<p>Safe</p>');
    });

    it('removes all event handler attributes (on*) and srcdoc', () => {
      const dirty =
        '<p onclick="evil()" onmouseover="steal()"><img src="https://example.com/a.png" onerror="alert(1)" onload="hack()"></p>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('onclick');
      expect(clean).not.toContain('onmouseover');
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('onload');
      expect(clean).toContain('src="https://example.com/a.png"');
    });

    it('blocks javascript:, vbscript:, and non-image data: URIs even with obfuscated whitespace/control chars', () => {
      const dirty = [
        '<a href="javascript:alert(1)">Link1</a>',
        '<a href="  j\nav\tascript:alert(2)">Link2</a>',
        '<a href="vbscript:msgbox(1)">Link3</a>',
        '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Link4</a>',
        '<img src="data:text/html;base64,abc">',
      ].join('');
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('href=');
      expect(clean).not.toContain('src=');
    });

    it('preserves valid base64 data:image/* URIs and resolves placeholder image keys via parseMarkdownWithImages', () => {
      const validDataImg =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const html = `<img src="${validDataImg}" alt="pixel">`;
      expect(sanitizeHtml(html)).toContain(`src="${validDataImg}"`);

      const rendered = parseMarkdownWithImages('![Diagram](SILA_IMG_1)\n\nInline math $E=mc^2$[^1]\n\n[^1]: Note text', {
        SILA_IMG_1: validDataImg,
      });
      expect(rendered).toContain(`src="${validDataImg}"`);
      expect(rendered).toContain('<math');
      expect(rendered).not.toContain('<annotation');
      expect(rendered).toContain('Note text');
    });
  });
});
