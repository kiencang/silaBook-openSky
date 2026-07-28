# silaBook-openSky
Dịch sách thông qua bất cứ AI nào (triển khai qua OpenRouter). silaBook-openSky đang trong giai đoạn phát triển và thử nghiệm.

**Link**: https://silabook-opensky.wpsila.com

Ứng dụng web không cần đăng nhập, tạo tài khoản. Chỉ cần nhập API Key của OpenRouter là dùng được ngay. API Key được lưu cục bộ tại trình duyệt của người dùng, do vậy bạn chỉ nên dùng nó trên máy tính cá nhân của riêng bạn.

silaBook-openSky được phát triển dựa trên repo (v1.0.99) đã ổn định này: https://github.com/kiencang/silaBook (cùng tác giả).

---

Danh sách các model quan trọng nhất có thể tìm thấy ở đây: https://openrouter.ai/discover

Có thể chia thành các nhóm model AI sau:
- (a) Nhóm các model AI có chất lượng cao nhất: Tốt nhất nhưng thường có giá rất cao;
- (b) Nhóm các model có hiệu quả nhất cho mỗi đồng bỏ ra (Value leaders): Tuy không tốt nhất xét theo chất lượng thuần túy, nhưng giá lại cạnh tranh hơn nhiều;
- (c) Nhóm các model AI có tốc độ cao nhất (Fastest models);
- (d) Nhóm các model AI miễn phí;
- (e) Nhóm các model AI sử dụng bí danh (để luôn dùng model mới nhất và tránh phải cập nhật tên model liên tục): ví dụ các bí danh như `~anthropic/claude-opus-latest` là để chỉ model Claude bản mới nhất;

Với vai trò AI dịch thuật chúng ta nên tập trung vào các nhóm (a), (b), (e). Nhóm (c) tốc độ cao nhất không phải là trọng tâm trong dịch thuật. Nhóm (d) AI miễn phí các bạn có thể dùng để test, chất lượng của các model này rất khó để so sánh với các model trả phí chất lượng cao.

Lưu ý: OpenRouter có phí nên các bạn nào muốn rẻ và vẫn có chất lượng tốt thì tham khảo repo chuyên cho Gemini (https://github.com/kiencang/silaBook), dịch không quá nhiều thì thậm chí bạn không tốn đồng nào vì ngưỡng miễn phí ngày của Gemini khá lớn. Chỉ bạn nào quan tâm đến việc dùng các AI khác (Claude, OpenAI, Grok, v.v...) thì mới cần quan tâm đến repo này.

## Ghi công

Ứng dụng được phát triển tối ưu hoàn toàn ở phía Client-side (Trình duyệt). Một số thư viện quan trọng mà ứng dụng này dùng:

### 1. Khung Phát Triển Chính (Core Engine)
*   **[Angular](https://angular.dev/)**: Khung ứng dụng web đơn trang (SPA).

### 2. Giao Diện
*   **[Tailwind CSS](https://tailwindcss.com/)**: Framework utility-first CSS hỗ trợ xây dựng giao diện.
*   **[Angular Material Icons](https://material.angular.io/)**: Cung cấp hệ thống icon.

### 3. Xử Lý & Xuất Bản Tài Liệu (Document Processing)
*   **[docx](https://docx.js.org/)**: Thư viện chuyên dụng tạo cấu trúc tài liệu Word (`.docx`), hoạt động hoàn toàn phía client.
*   **[pdf-lib](https://pdf-lib.js.org/)**: Dùng để chia tách PDF thành các chunk (đoạn) để dễ xử lý hơn.
*   **[Mozilla PDF.js](https://mozilla.github.io/pdf.js/)** – Phát triển bởi **Mozilla**. Thư viện chạy hoàn toàn phía Client-side, giúp trích xuất text trong file PDF, phục vụ cho việc ước tính token trước khi chuyển PDF sang markdown.
*   **[JSZip](https://stuk.github.io/jszip/)**: Công cụ nén và đóng gói thư mục sách điện tử EPUB (`.epub`) ngay trên trình duyệt.
*   **[Marked & marked-footnote](https://marked.js.org/)**: Chuyển Markdown sang cấu trúc HTML, có hỗ trợ ghi chú chân trang (footnotes).
*   **[Turndown](https://github.com/mixmark-io/turndown)**: Chuyển đổi ngược các định dạng HTML thành cú pháp Markdown.

### 4. Lưu Trữ Nội Bộ (Local Database & Storage)
*   **[idb (IndexedDB Wrapper)](https://github.com/jakearchibald/idb)**: Thư viện wrap IndexedDB, hỗ trợ xử lý các tác vụ liên quan đến IndexedDB tốt hơn. Toàn bộ dữ liệu sách được lưu cục bộ tại trình duyệt là thông qua IndexedDB.

## Tuyên bố từ chối trách nhiệm
Công cụ này có thể được sử dụng cho mục đích nghiên cứu và học tập cá nhân.

silaBook-openSky cũng như người phát triển nó không đưa ra bất kỳ bảo đảm rõ ràng hay ngụ ý nào, cũng như không tuyên bố rằng công cụ sẽ vận hành hoàn hảo, chính xác hoặc cập nhật. Người phát triển sẽ không chịu trách nhiệm cho bất kỳ tổn thất hay thiệt hại nào phát sinh trực tiếp hoặc gián tiếp liên quan đến hoặc phát sinh từ việc sử dụng công cụ này.
