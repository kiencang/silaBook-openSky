import { parseMarkdownWithImages } from './marked-setup';

function escapeXml(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function detectImageFormat(dataUrl: string): { mediaType: string; ext: string } {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
    return { mediaType: 'image/jpeg', ext: 'jpg' };
  }
  if (dataUrl.startsWith('data:image/gif')) {
    return { mediaType: 'image/gif', ext: 'gif' };
  }
  if (dataUrl.startsWith('data:image/webp')) {
    return { mediaType: 'image/webp', ext: 'webp' };
  }
  if (dataUrl.startsWith('data:image/svg+xml')) {
    return { mediaType: 'image/svg+xml', ext: 'svg' };
  }
  return { mediaType: 'image/png', ext: 'png' };
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

/**
 * Chuyển đổi HTML5 sang XHTML chuẩn W3C (Strict XML) dành cho EPUB 3
 * đồng thời chuẩn hóa các thuộc tính ID không trùng lặp và trích xuất Mục lục động (h1, h2, h3).
 */
function convertHtmlToStrictXhtmlAndExtractToc(html: string): {
  xhtml: string;
  tocEntries: TocEntry[];
} {
  const tocEntries: TocEntry[] = [];
  if (!html) return { xhtml: '', tocEntries };

  if (typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const usedIds = new Set<string>();

    const ensureUniqueXmlId = (rawId: string, fallbackPrefix: string): string => {
      let clean = (rawId || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!clean || !/^[a-zA-Z_]/.test(clean)) {
        clean = `${fallbackPrefix}-${clean || 'item'}`;
      }
      let candidate = clean;
      let counter = 2;
      while (usedIds.has(candidate)) {
        candidate = `${clean}-${counter++}`;
      }
      usedIds.add(candidate);
      return candidate;
    };

    // 1. Đảm bảo mọi phần tử có thuộc tính id trong tài liệu đều hợp lệ chuẩn XML NCName và duy nhất
    const elementsWithId = doc.body.querySelectorAll('[id]');
    for (const el of Array.from(elementsWithId)) {
      const currentId = el.getAttribute('id') || '';
      const validId = ensureUniqueXmlId(currentId, 'sec');
      el.setAttribute('id', validId);
    }

    // 2. Quét các thẻ tiêu đề h1, h2, h3 để xây dựng Mục lục động (Dynamic TOC)
    const headings = doc.body.querySelectorAll('h1, h2, h3');
    let headingIdx = 1;
    for (const h of Array.from(headings)) {
      const text = (h.textContent || '').trim();
      if (!text) continue;
      let id = h.getAttribute('id');
      if (!id) {
        id = ensureUniqueXmlId(`heading-${headingIdx}`, 'heading');
        h.setAttribute('id', id);
      }
      const level = Number(h.tagName.substring(1)) || 1;
      tocEntries.push({ id, text, level });
      headingIdx++;
    }

    // 3. Serialize toàn bộ các node con của body sang XHTML chuẩn bằng XMLSerializer
    const serializer = new XMLSerializer();
    let xhtml = '';
    for (const child of Array.from(doc.body.childNodes)) {
      xhtml += serializer.serializeToString(child);
    }
    // Loại bỏ khai báo xmlns lặp lại trên từng thẻ con (vì thẻ <html> gốc đã khai báo sẵn)
    xhtml = xhtml.replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
    return { xhtml, tocEntries };
  }

  // Fallback cơ bản nếu chạy ngoài môi trường trình duyệt không có DOMParser
  let fallbackXhtml = html.replace(/<img\b([^>]*?)>/gi, (match) => {
    if (!match.endsWith('/>')) return match.replace(/>$/, ' />');
    return match;
  });
  fallbackXhtml = fallbackXhtml.replace(/<br\s*\/?>/gi, '<br />');
  fallbackXhtml = fallbackXhtml.replace(/<hr\s*\/?>/gi, '<hr />');
  return { xhtml: fallbackXhtml, tocEntries };
}

export class EpubExporter {
  /**
   * Zip compilation of valid, standard EPUB structure package
   */
  static async generateEpub(
    title: string,
    markdownContent: string,
    images?: Record<string, string>
  ): Promise<Blob> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const safeTitle = escapeXml(title || 'Tài liệu dịch thuật');

    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="UTF-8" ?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    const allImages: {
      id: string;
      key: string;
      dataUrl: string;
      fileName: string;
      mediaType: string;
    }[] = [];

    if (images) {
      Object.keys(images).forEach((key, idx) => {
        const dataUrl = images[key];
        const { mediaType, ext } = detectImageFormat(dataUrl);
        const rawSafeKey = key
          .replace(/\.[a-zA-Z0-9]+$/, '')
          .replace(/[^a-zA-Z0-9-_]/g, '');
        const safeKey = rawSafeKey || `image-${idx + 1}`;
        allImages.push({
          id: `img-${idx + 1}-${safeKey.toLowerCase()}`,
          key: key,
          dataUrl: dataUrl,
          fileName: `images/${safeKey}-${idx + 1}.${ext}`,
          mediaType: mediaType,
        });
      });
    }

    const mappedImages: Record<string, string> = {};
    allImages.forEach((img) => {
      mappedImages[img.key] = img.fileName;
    });

    const rawHtmlContent = parseMarkdownWithImages(markdownContent, mappedImages);

    const { xhtml: htmlContent, tocEntries } =
      convertHtmlToStrictXhtmlAndExtractToc(rawHtmlContent);

    // Chỉ đính kèm những bức ảnh thực sự được tham chiếu trong nội dung xuất ra
    const usedImages = allImages.filter(
      (img) => htmlContent.includes(img.fileName) || rawHtmlContent.includes(img.fileName)
    );

    usedImages.forEach((img) => {
      const base64Clean = img.dataUrl.includes('base64,')
        ? img.dataUrl.split('base64,')[1]
        : img.dataUrl.split(',')[1];
      zip.file(`OEBPS/${img.fileName}`, base64Clean || '', { base64: true });
    });

    zip.file(
      'OEBPS/section1.xhtml',
      `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${safeTitle}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  ${htmlContent}
</body>
</html>`
    );

    zip.file(
      'OEBPS/stylesheet.css',
      `body {
  font-family: "Liberation Serif", "Times New Roman", serif;
  line-height: 1.6;
  margin: 1em;
  color: #111111;
}
h1, h2, h3 {
  font-family: sans-serif;
  color: #000000;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}
p {
  margin-bottom: 0.8em;
  text-align: justify;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
}
blockquote {
  margin: 1em 2em;
  font-style: italic;
  border-left: 3px solid #ccc;
  padding-left: 1em;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}
th, td {
  border: 1px solid #ccc;
  padding: 0.5em;
  text-align: left;
}
code {
  font-family: monospace;
  background-color: #f4f4f4;
  padding: 2px 4px;
  border-radius: 3px;
}
math {
  font-family: "Cambria Math", "Latin Modern Math", "STIX Two Math", math, serif;
}
math[display="block"], .katex-display math {
  display: block;
  margin: 1em auto;
  text-align: center;
  overflow-x: auto;
}
annotation, annotation-xml {
  display: none !important;
}`
    );

    const navListItems =
      tocEntries.length > 0
        ? tocEntries
            .map(
              (entry) =>
                `      <li><a href="section1.xhtml#${escapeXml(entry.id)}">${escapeXml(entry.text)}</a></li>`
            )
            .join('\n')
        : `      <li><a href="section1.xhtml">${safeTitle}</a></li>`;

    zip.file(
      'OEBPS/nav.xhtml',
      `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Mục lục</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h2>Mục lục</h2>
    <ol>
${navListItems}
    </ol>
  </nav>
</body>
</html>`
    );

    const uuid = this.generateUuid();
    let imageManifestItems = '';
    usedImages.forEach((img) => {
      imageManifestItems += `    <item id="${escapeXml(img.id)}" href="${escapeXml(img.fileName)}" media-type="${img.mediaType}"/>\n`;
    });

    const currentDate = new Date().toISOString().split('.')[0] + 'Z';
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="vi">
  <metadata>
    <dc:identifier id="id">urn:uuid:${uuid}</dc:identifier>
    <dc:creator id="author_0">PDF-2-EPUB AI Converter</dc:creator>
    <meta property="file-as" refines="#author_0">PDF-2-EPUB AI Converter</meta>
    <meta property="role" refines="#author_0" scheme="marc:relators">aut</meta>
    <dc:title>${safeTitle}</dc:title>
    <dc:language>vi</dc:language>
    <meta property="dcterms:modified">${currentDate}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="stylesheet.css" media-type="text/css"/>
    <item id="section1" href="section1.xhtml" media-type="application/xhtml+xml"${htmlContent.includes('<math') ? ' properties="mathml"' : ''}/>
${imageManifestItems}  </manifest>
  <spine toc="ncx">
    <itemref idref="nav"/>
    <itemref idref="section1"/>
  </spine>
</package>`
    );

    const ncxNavPoints =
      tocEntries.length > 0
        ? tocEntries
            .map(
              (entry, idx) => `    <navPoint id="navpoint-${idx + 2}" playOrder="${idx + 2}">
      <navLabel><text>${escapeXml(entry.text)}</text></navLabel>
      <content src="section1.xhtml#${escapeXml(entry.id)}"/>
    </navPoint>`
            )
            .join('\n')
        : `    <navPoint id="navpoint-2" playOrder="2">
      <navLabel><text>${safeTitle}</text></navLabel>
      <content src="section1.xhtml"/>
    </navPoint>`;

    zip.file(
      'OEBPS/toc.ncx',
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${safeTitle}</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>Mục lục</text></navLabel>
      <content src="nav.xhtml"/>
    </navPoint>
${ncxNavPoints}
  </navMap>
</ncx>`
    );

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    return blob;
  }

  private static generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
