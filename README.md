# Định biên & Ngân sách nhân sự – bản mẫu

Web chạy local mô phỏng luồng **Kế hoạch định biên** và thiết kế **Ngân sách nhân sự** (cấu hình chính sách chung, biến số kịch bản, tuỳ chỉnh theo phòng/bộ phận/vị trí/ngạch, đơn giá vị trí mới, bảo hiểm – thuế – thực nhận).

- **Xem online:** https://haovu94-gif.github.io/dinh-bien-ngan-sach/ (Ngân sách) và https://haovu94-gif.github.io/dinh-bien-ngan-sach/dinh-bien.html (Định biên). Bản online chạy hoàn toàn trên trình duyệt, dữ liệu mỗi người lưu riêng trên máy mình.
- **Chạy đầy đủ trên máy (Windows):** cài Node.js, tải repo về, bấm đúp `start.bat`, trình duyệt mở http://localhost:5180. Hướng dẫn chi tiết trong `HUONG-DAN.md`.

> Dữ liệu cá nhân trong bản công khai đã được ẩn: tên nhân viên thay bằng "Nhân viên A, B, …", mức lương là số giả lập. Ứng dụng không kết nối KOI và không chứa API key.

## Chạy chung nhiều người trên Render
Repo có sẵn `render.yaml`: vào Render → **New → Blueprint** → chọn repo này. Render tạo web service gói Free. Lưu ý: gói Free không có ổ đĩa riêng, dữ liệu về trắng mỗi khi server khởi động lại — nhớ bấm Sao lưu thường xuyên.
- `APP_PASSWORD`: mật khẩu chung để vào web (trình duyệt hỏi khi mở; tên đăng nhập gõ gì cũng được).
- Mỗi người được hỏi tên một lần; tên này ghi vào nhật ký, người tạo/duyệt.
- Kế hoạch định biên và cấu hình ngân sách lưu chung trên server; bắt đầu trắng.
