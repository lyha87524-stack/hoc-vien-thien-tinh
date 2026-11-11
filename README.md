# HỌC VIỆN THIÊN TINH 星辰學院

Dự án độc lập, tham khảo cách triển khai Node.js + Express + PostgreSQL + Render từ Hàn Thiên Môn v3.8.17. Không sửa hoặc ghi đè dự án cũ.

## Yêu cầu
- Node.js 20+
- PostgreSQL 14+
- iPhone Safari hoặc trình duyệt máy tính

## Chạy local
1. `npm install`
2. Tạo database PostgreSQL.
3. Đặt biến môi trường `DATABASE_URL`.
4. (Tuỳ chọn) `PORT=10000`
5. `npm start`
6. Mở `http://localhost:10000`

Migration `db/migrations/001_init.sql` tự chạy khi server khởi động. Migration idempotent, tạo schema/tables/catalogue mẫu; không xóa dữ liệu.

## Render
- Tạo Web Service từ repository mới.
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `DATABASE_URL` (Internal Database URL của PostgreSQL), `NODE_ENV=production`.
- Health check: `/health`
- Không đưa `.env`, DATABASE_URL hoặc token vào Git.

## Tạo Admin đầu tiên
Đăng ký tài khoản thông thường, sau đó chạy SQL trực tiếp trên PostgreSQL:
```sql
UPDATE users SET role='admin' WHERE username='TEN_DANG_NHAP_CUA_BAN';
```
Không có tài khoản quản trị mặc định. Không bật quyền admin qua API công khai.

## Các chức năng đã có trong nền tảng v1.0
- Đăng ký/đăng nhập/đăng xuất, hash mật khẩu bằng scrypt, token phiên lưu hash ở DB.
- Tạo OC, chỉnh sửa hồ sơ, chọn OC hiện hành.
- Danh mục khoa/lớp, đăng ký khoa.
- EXP/level up, stat points, nhiệm vụ và nhận thưởng chống nhận trùng bằng transaction + row lock.
- Cửa hàng, mua hàng trừ Star Coin và cộng túi đồ trong transaction.
- Sử dụng vật phẩm hồi HP/MP.
- Khám phá khu vực có điều kiện level và chống nhận EXP lặp.
- Bảng xếp hạng, trang quản trị cơ bản, nhật ký hoạt động.
- Giao diện responsive, mobile nav, cuộn nội dung, dark mode lưu localStorage.

## Phạm vi cần hoàn thiện ở các giai đoạn tiếp
- Quên mật khẩu qua email/OTP (cần nhà cung cấp email), đổi mật khẩu, upload ảnh an toàn.
- Nhiều OC/UI chỉnh sửa toàn bộ trường, phân trang hồ sơ công khai.
- Lớp học có danh sách thành viên/giảng viên và luồng gia nhập.
- Hệ thống học kỹ năng và phân bổ stat points.
- Nhiệm vụ theo lịch, tiến độ tự động theo event, nhiệm vụ daily/weekly reset.
- Trang bị/tháo trang bị và tính lại chỉ số; shop nhiều loại tiền.
- Hoạt động NPC riêng theo từng bản đồ, sự kiện và achievement tự động.
- CRUD đầy đủ cho toàn bộ module Admin, audit log UI.
- Rate limit chuyên dụng, CSRF strategy nếu chuyển sang cookie auth, upload storage.
- Automated integration tests và kiểm thử tải trên môi trường staging.

## Kiểm tra
- `npm run check`
- `GET /health`
- Kiểm thử đăng ký, đăng nhập, tạo OC, nhận nhiệm vụ, mua vật phẩm, khám phá và đăng xuất.
- Kiểm thử giao dịch đồng thời trước khi mở cho người dùng thật.
