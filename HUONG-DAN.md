# Định biên & Ngân sách – bản local ĐỘC LẬP

App chạy hoàn toàn trên máy, **không kết nối KOI, không cần API key**.

## Chạy app
Bấm đúp **start** (Windows Batch File). Một cửa sổ đen hiện ra, **không tắt** trong lúc dùng. Trình duyệt sẽ tự mở http://localhost:5180.
Nếu app không lên, xem file `nhat-ky.txt`.

## Dữ liệu
- `data/du-lieu-goc-tu-KOI.json`: ảnh chụp cơ cấu tổ chức, vị trí và số người đang giữ của T02 lấy từ KOI ngày 23/11/2026. **Không sửa file này.**
- `data/du-lieu.json`: dữ liệu làm việc (kế hoạch, điều chỉnh, nhật ký). Được tạo từ file gốc ở lần chạy đầu.
- `data/sao-luu/`: mỗi ngày tự lưu một bản sao.
- Nút **Sao lưu** / **Khôi phục** ở góc phải: tải toàn bộ dữ liệu về hoặc nạp lại.
- Cần số liệu mới từ KOI, hoặc thêm công ty khác: nhờ Claude cập nhật file gốc.

## Khung định biên (mô phỏng luồng "Tạo và xem Kế hoạch định biên" của KOI)
- Chọn **Đơn vị**, **Kịch bản**, **Năm** rồi bấm **Mở kế hoạch**.
- Chưa có kế hoạch: app hiện bản đề xuất (bằng số người đang giữ). Chị chỉnh lại rồi bấm **Tạo kế hoạch Nháp**.
- Các nút theo trạng thái kế hoạch:
  - **Nháp**: Lưu bảng, Điền nhanh, + Vị trí mới, Điều chuyển (bắt buộc ghi lý do), Gửi phê duyệt, Huỷ.
  - **Chờ phê duyệt**: Duyệt, Từ chối, Huỷ (rút lại).
  - **Đã phê duyệt**: sửa ô rồi bấm **Tạo điều chỉnh** (Tăng/giảm, Thêm, Xoá). Điều chỉnh đi theo luồng Gửi, Duyệt hoặc Từ chối. Có thể **Tạo phiên bản mới**; khi bản mới được duyệt thì bản cũ tự huỷ.
  - **Từ chối / Đã huỷ**: Đặt lại về Nháp.
- Quy tắc giống KOI:
  - Định biên không được thấp hơn số người đang giữ ở vị trí có Kiểm soát vị trí (lỗi VLD-HC-05).
  - Một vị trí trong một tháng chỉ được duyệt ở một kế hoạch.
- Nút **Xuất Excel (CSV)** để mang số liệu đi nơi khác (ví dụ nhập vào KOI).

## Ngân sách
Đang chờ thiết kế luồng.
