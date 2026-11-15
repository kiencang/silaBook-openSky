import { ImportedXmlComponent } from 'docx';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';

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
export function createOmmlComponentFromLatex(latex: string, displayMode = false): ImportedXmlComponent | null {
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
