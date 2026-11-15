import {
  countWords,
  escapeRegExp,
  smartHardSplit,
  generatePreview,
  analyzeAndSplitText,
} from './splitter.util';

describe('splitter.util', () => {
  describe('countWords', () => {
    it('counts words accurately across ASCII, non-breaking, and ideographic spaces', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('   \n\t  ')).toBe(0);
      expect(countWords('Hello world')).toBe(2);
      expect(countWords('One\u00A0Two\u2003Three\u3000Four')).toBe(4);
    });
  });

  describe('escapeRegExp', () => {
    it('escapes special regular expression characters', () => {
      const raw = 'Chapter [1].*?+^$()|{}';
      const escaped = escapeRegExp(raw);
      const re = new RegExp(escaped);
      expect(re.test(raw)).toBe(true);
    });
  });

  describe('smartHardSplit', () => {
    it('returns a single chunk when word count is within maxWords', () => {
      const text = 'Short paragraph with only seven words.';
      expect(smartHardSplit(text, 10)).toEqual([text]);
    });

    it('prioritizes splitting at double newlines (\\n\\n) near the middle', () => {
      const p1 = 'word1 word2 word3 word4 word5';
      const p2 = 'word6 word7 word8 word9 word10';
      const text = `${p1}\n\n${p2}`;
      const chunks = smartHardSplit(text, 6);
      expect(chunks).toEqual([p1, p2]);
    });

    it('falls back to single newline (\\n) when no double newline exists in 20%–80% range', () => {
      const line1 = 'alpha beta gamma delta epsilon';
      const line2 = 'zeta eta theta iota kappa';
      const text = `${line1}\n${line2}`;
      const chunks = smartHardSplit(text, 6);
      expect(chunks).toEqual([line1, line2]);
    });

    it('falls back to sentence endings (.?!) when no newlines exist', () => {
      const s1 = 'First sentence has five words.';
      const s2 = 'Second sentence also five words!';
      const text = `${s1} ${s2}`;
      const chunks = smartHardSplit(text, 6);
      expect(chunks).toEqual([s1, s2]);
    });

    it('falls back to whitespace when no punctuation or newlines exist', () => {
      const text = 'one two three four five six seven eight nine ten';
      const chunks = smartHardSplit(text, 6);
      expect(chunks.length).toBe(2);
      expect(chunks.join(' ')).toBe(text);
      expect(countWords(chunks[0])).toBeLessThanOrEqual(6);
      expect(countWords(chunks[1])).toBeLessThanOrEqual(6);
    });
  });

  describe('generatePreview & analyzeAndSplitText', () => {
    it('isolates Project Gutenberg header and footer with excludeFromTranslation: true', () => {
      const sample = [
        'The Project Gutenberg eBook of Sample',
        '*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***',
        '## Chapter 1',
        'This is the first chapter body text with several words.',
        '## Chapter 2',
        'This is the second chapter body text with several words.',
        '*** END OF THE PROJECT GUTENBERG EBOOK SAMPLE ***',
        'Full license terms at the bottom of the file.',
      ].join('\n');

      const chapters = generatePreview(sample, 'Toàn bộ file', 5, 100, null);
      expect(chapters.length).toBe(3);
      expect(chapters[0].title).toBe('Thông tin Project Gutenberg');
      expect(chapters[0].excludeFromTranslation).toBe(true);
      expect(chapters[1].title).toBe('Nội dung sách');
      expect(chapters[1].excludeFromTranslation).toBeUndefined();
      expect(chapters[1].originalText).toContain('## Chapter 1');
      expect(chapters[1].originalText).not.toContain('START OF THE PROJECT GUTENBERG');
      expect(chapters[2].title).toBe('Giấy phép Project Gutenberg');
      expect(chapters[2].excludeFromTranslation).toBe(true);
    });

    it('merges short chapters below minWords and splits long chapters above maxWords', () => {
      const c1 = 'Chapter 1\n' + Array(10).fill('word').join(' ');
      const c2 = 'Chapter 2\n' + Array(10).fill('word').join(' ');
      const c3 =
        'Chapter 3\n' +
        Array(15).fill('first').join(' ') +
        '\n\n' +
        Array(15).fill('second').join(' ');
      const sample = [c1, c2, c3].join('\n\n');

      const methods = analyzeAndSplitText(sample, 18, 25, 'keyword', ['Chapter'], 'h2');
      const chapterMethod = methods.find((m) => m.keyword === 'Chapter');
      expect(chapterMethod).toBeDefined();
      const previews = chapterMethod!.previewChapters;

      // Chapter 1 (12 words) + Chapter 2 (12 words) = 24 words >= 18 minWords, <= 25 maxWords -> merged into "Chapter 1 & Chapter 2"
      expect(previews[0].title).toBe('Chapter 1 & Chapter 2');
      // Chapter 3 (32 words > 25 maxWords) -> split into 2 parts
      expect(previews[1].title).toBe('Chapter 3 (Phần 1)');
      expect(previews[2].title).toBe('Chapter 3 (Phần 2)');
    });

    it('supports heading mode (H2 and H3) and standalone mode', () => {
      const md = [
        'Intro text before headings.',
        '## Section One',
        Array(20).fill('alpha').join(' '),
        '## Section Two',
        Array(20).fill('beta').join(' '),
      ].join('\n\n');

      const headingMethods = analyzeAndSplitText(md, 10, 100, 'heading', [], 'h2');
      const h2Method = headingMethods.find((m) => m.keyword === 'Thẻ H2');
      expect(h2Method).toBeDefined();
      expect(h2Method!.previewChapters.length).toBe(2);
      expect(h2Method!.previewChapters[0].title).toBe('Phần đầu & Section One');
      expect(h2Method!.previewChapters[1].title).toBe('Section Two');

      const standaloneMethods = analyzeAndSplitText(md, 10, 25, 'standalone', [], 'h2');
      const autoMethod = standaloneMethods.find((m) => m.keyword === 'Chia đều tự động');
      expect(autoMethod).toBeDefined();
      expect(autoMethod!.previewChapters.length).toBeGreaterThanOrEqual(2);
    });
  });
});
