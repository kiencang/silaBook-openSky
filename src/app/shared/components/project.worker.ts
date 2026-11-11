/// <reference lib="webworker" />
import JSZip from 'jszip';

addEventListener('message', async ({ data }) => {
  const { type, payload, id } = data;

  try {
    if (type === 'EXPORT_PROJECT') {
      const fullProject = payload;
      
      // Convert Uint8Array back to base64 for JSON serialization
      if (fullProject.pdfTask && fullProject.pdfTask.chunks) {
        fullProject.pdfTask.chunks = fullProject.pdfTask.chunks.map((chunk: { pdfData?: Uint8Array | Record<string, number>; base64Pdf?: string; [key: string]: unknown }) => {
          if (chunk.pdfData) {
            let base64 = "";
            let uint8Array: Uint8Array | null = null;
            
            if (chunk.pdfData instanceof Uint8Array || (chunk.pdfData as { buffer?: ArrayBuffer }).buffer) {
               uint8Array = chunk.pdfData as Uint8Array;
            } else {
               uint8Array = new Uint8Array(Object.values(chunk.pdfData));
            }
            
            if (uint8Array) {
               let binary = '';
               const len = uint8Array.byteLength;
               for (let i = 0; i < len; i++) {
                  binary += String.fromCharCode(uint8Array[i]);
               }
               base64 = self.btoa(binary);
               
               chunk.base64Pdf = base64;
               delete chunk.pdfData; // clear old data to save space in JSON
            }
          }
          return chunk;
        });
      }
      
      const jsonStr = JSON.stringify(fullProject, null, 2);
      const safeName = (fullProject.name || 'Project').replace(/\s+/g, '_');
      const innerFileName = `SilaProject_${safeName}_${fullProject.id}.json`;

      const zip = new JSZip();
      zip.file(innerFileName, jsonStr);
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      postMessage({ type: 'SUCCESS', id, payload: { zipBlob } });
      
    } else if (type === 'IMPORT_PROJECT') {
      let jsonText = '';

      if (payload && payload.file instanceof Blob) {
        const file: File | Blob = payload.file;
        const fileName = (file as File).name ? (file as File).name.toLowerCase() : '';
        
        // Kiểm tra magic bytes PK (0x50 0x4B) hoặc đuôi .zip để nhận diện file ZIP chính xác
        const headerBuf = await file.slice(0, 4).arrayBuffer();
        const headerBytes = new Uint8Array(headerBuf);
        const isZipSignature =
          headerBytes.length >= 2 && headerBytes[0] === 0x50 && headerBytes[1] === 0x4b;

        if (isZipSignature || fileName.endsWith('.zip')) {
          const zip = await JSZip.loadAsync(file);
          const entries = Object.values(zip.files).filter(
            (entry) => !entry.dir && !entry.name.startsWith('__MACOSX/')
          );
          const jsonEntry =
            entries.find((entry) => entry.name.toLowerCase().endsWith('.json')) || entries[0];

          if (!jsonEntry) {
            throw new Error('Không tìm thấy dữ liệu dự án bên trong file ZIP.');
          }
          jsonText = await jsonEntry.async('string');
        } else {
          jsonText = await file.text();
        }
      } else if (payload && typeof payload.text === 'string') {
        jsonText = payload.text;
      } else {
        throw new Error('Dữ liệu đầu vào không hợp lệ.');
      }

      const proj = JSON.parse(jsonText);
      
      if (proj && proj.pdfTask && proj.pdfTask.chunks) {
         for (const chunk of proj.pdfTask.chunks) {
           let base64 = null;
           
           if (chunk.base64Pdf) {
             base64 = chunk.base64Pdf;
             delete chunk.base64Pdf;
           } else if (chunk.pdfData && typeof chunk.pdfData === 'string') {
             base64 = chunk.pdfData;
           } else if (chunk.pdfData && typeof chunk.pdfData === 'object') {
             // In case someone exports an object format
             chunk.pdfData = new Uint8Array(Object.values(chunk.pdfData));
           }

           if (base64) {
             // Use browser native API fetch to parse base64 extremely fast
             const response = await fetch(`data:application/pdf;base64,${base64}`);
             const arrayBuffer = await response.arrayBuffer();
             chunk.pdfData = new Uint8Array(arrayBuffer);
           }
         }
      }
      
      postMessage({ type: 'SUCCESS', id, payload: { project: proj } });
    }

  } catch (error) {
    postMessage({ type: 'ERROR', id, payload: { error: error instanceof Error ? error.message : String(error) } });
  }
});

