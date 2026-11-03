# IELTS Road — MVP

Web học tiếng Anh theo lộ trình 12 tuần cho người mất gốc, hướng tới IELTS 6.0.

> ⚠ Mục tiêu 6.0 sau 3 tháng đòi hỏi học đều khoảng **3 giờ/ngày**. Với người mất gốc hoàn toàn đây là mục tiêu rất tham vọng; sản phẩm hiển thị mốc band từng giai đoạn là *mục tiêu*, không phải cam kết. Cần thống nhất cách truyền thông với chủ dự án.

## Chạy local

Yêu cầu: Python 3.12.

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Mở http://localhost:8000, tạo tài khoản → làm bài kiểm tra đầu vào → học theo trang *Hôm nay*. Swagger: http://localhost:8000/docs. Cấu hình: `.env.example`.

## Tính năng MVP

| Tính năng | Trạng thái |
|---|---|
| Đăng ký / đăng nhập; nhiều học viên; giao diện VI/EN | ✅ |
| Quản trị/giáo viên (`ADMIN_ACCOUNT`): dashboard báo cáo, bảng học viên, tạo tài khoản hàng loạt, khóa/mở, đặt lại mật khẩu, mọi lượt thi, xuất CSV | ✅ |
| Động lực: XP, cấp độ, 15 huy hiệu, mục tiêu XP/ngày, bảng xếp hạng tuần; trò chơi Ghép cặp và Nghe & chọn | ✅ |
| Kiểm tra đầu vào 20 câu (A1–B2) → gợi ý tuần bắt đầu | ✅ |
| Kiểm tra hằng tuần: 12 bài × 15 câu (ngữ pháp/chiến lược, từ vựng, đọc hiểu), có giờ, đạt ≥ 70% mới hoàn thành tuần | ✅ |
| Luyện thi EnglishScore: đề mô phỏng 4 phần (Ngữ pháp, Từ vựng, Nghe đọc bằng giọng trình duyệt, Đọc), có giờ, chấm xong quy ra mốc CEFR (A1–B2) kèm lời khuyên; chạy không cần key | ✅ 2 đề mẫu |
| Nhật ký lượt thi: mọi lượt (kể cả bỏ dở) lưu giờ bắt đầu/nộp, thời lượng, từng câu trả lời, điểm theo phần, đạt/chưa đạt; ghi cả vào log máy chủ | ✅ ⚠ mất khi Render free khởi động lại |
| Lộ trình 12 tuần × 7 ngày (6 ngày học + 1 ngày ôn/kiểm tra), ~180 phút/ngày | ✅ khung đủ 84 ngày |
| Bài học ngữ pháp có giải thích + bài tập chấm ngay | ⏳ mới có 6 bài tuần 1 |
| Flashcard từ vựng lặp lại ngắt quãng (SM-2), phát âm bằng trình duyệt; thẻ lật 3D, nút chấm hiện ngày ôn kế tiếp, thẻ đảo chiều (Việt → Anh, điền chỗ trống) cho từ đã quen, phím tắt | ⏳ mới có 72 từ tuần 1 |
| Trí nhớ từ vựng: số từ theo giai đoạn (chưa học / đang học / đang nhớ / nhớ lâu 21+ ngày) và dự báo lượt ôn 7 ngày; nhắc ôn trên trang Hôm nay | ✅ |
| Bài tập ngữ pháp: làm lại câu sai với đáp án xáo trộn | ✅ |
| Âm thanh hiệu ứng (đúng/sai, lật thẻ, hoàn thành), tổng hợp bằng Web Audio, bật/tắt được | ✅ |
| Nhắc học hằng ngày theo giờ học viên chọn: thông báo đẩy kể cả khi đã đóng trình duyệt; khi app đang mở thì có chuông + thông báo. Chỉ nhắc khi còn thẻ cần ôn/nhiệm vụ chưa xong, tối đa 1 lần/ngày | ✅ cần `CRON_SECRET` + cron ngoài (xem dưới) |
| Cài như app (PWA): biểu tượng, "Thêm vào màn hình chính" | ✅ |
| Giao diện động: hiệu ứng vào trang, số đếm lên, vòng/thanh tiến độ chạy, pháo giấy khi hoàn thành (tắt khi hệ điều hành bật giảm chuyển động) | ✅ |
| Theo dõi tiến độ: chuỗi ngày học, số giờ 7 ngày, % lộ trình | ✅ |
| Học theo mạch dẫn dắt: mỗi ngày làm từng nhiệm vụ một, xong tự đánh dấu và tự chuyển sang phần tiếp theo (`#/learn/NGÀY/NHIỆMVỤ`) | ✅ |
| Luyện Viết: ô nhập bài + nhận xét. Không cần key: tự kiểm tra cơ bản (độ dài, số câu, đoạn, lặp từ). Có `ANTHROPIC_API_KEY` thì chấm band + sửa lỗi bằng AI | ✅ |
| Luyện Nghe / Đọc tự chấm: sinh từ kho từ trong ngày (nghe câu chọn nghĩa; đọc điền từ), chạy hoàn toàn trong trình duyệt, không cần key | ✅ mới có từ vựng tuần 1 |
| Luyện Nói: nghe mẫu (phát âm trình duyệt) rồi đọc to, trình duyệt nghe và chấm độ khớp; trình duyệt không hỗ trợ thì tự xác nhận | ✅ mới có từ vựng tuần 1 |
| Thanh toán, quản trị nội dung | ❌ |

## Bật nhắc học bằng thông báo đẩy (miễn phí)

1. Trên Render, `CRON_SECRET` được tự sinh (Environment → xem giá trị). Chạy local thì đặt trong `.env`.
2. Tạo tài khoản miễn phí ở [cron-job.org](https://cron-job.org), thêm job gọi
   `https://<tên-miền>/api/reminders/run?key=<CRON_SECRET>` **mỗi 10 phút**. Gọi đều như vậy cũng giữ máy chủ Render free không ngủ (dùng ~744/750 giờ miễn phí mỗi tháng nếu chỉ có một dịch vụ).
3. Học viên vào *Thành tích → Nhắc nhở & âm thanh*, bấm **Bật thông báo**, chọn giờ.

Lưu ý:
- iPhone/iPad (iOS 16.4+) chỉ nhận thông báo khi đã *Chia sẻ → Thêm vào MH chính* và mở app từ biểu tượng đó.
- Âm thanh của thông báo đẩy là âm mặc định của máy (trình duyệt không cho dùng âm riêng); chuông riêng chỉ phát khi app đang mở.
- Khóa VAPID được tự sinh và lưu cùng dữ liệu. Chưa đặt `DATABASE_URL` thì khóa và đăng ký thông báo mất khi Render khởi động lại. Khi học viên mở lại app, thiết bị sẽ tự đăng ký lại; nếu khóa đã đổi thì học viên phải bấm Bật thông báo lần nữa.

## Kiến trúc

| Thành phần | Công nghệ | Mã nguồn |
|---|---|---|
| Backend/API | Python FastAPI | [app/main.py](app/main.py) |
| Nội dung khóa học | File JSON | [content/](content/) |
| Lộ trình theo ngày | Sinh từ định nghĩa tuần | [app/content.py](app/content.py) |
| Nghe / Đọc / Nói tự chấm | Sinh từ kho từ trong ngày, chạy trong trình duyệt | [app/activity.py](app/activity.py) |
| Tiến độ, flashcard | SM-2 | [app/learner.py](app/learner.py) |
| Chấm Writing | AI (Claude) khi có key, nếu không thì kiểm tra cơ bản theo luật | [app/writing.py](app/writing.py) |
| Lưu trữ | PostgreSQL khi có `DATABASE_URL` (ví dụ Neon miễn phí), nếu không thì file JSON | [app/store.py](app/store.py) |
| Giao diện | HTML/JS thuần | [public/](public/) |

## Việc cần quyết định / làm tiếp

1. **Nguồn nội dung**: soạn tiếp bài ngữ pháp tuần 2–12 và kho từ (mục tiêu ~3.000 từ), hoặc mua/cấp phép giáo trình. Nghe/Đọc/Nói hiện sinh tự động từ kho từ nên chỉ có nội dung ở các ngày đã có từ vựng (tuần 1); các tuần sau cần thêm từ. Đề Listening/Reading thu âm riêng cần bản quyền.
2. **Speaking**: hiện chấm bằng nhận dạng giọng nói của trình duyệt (miễn phí, khớp từ). Có thể nâng cấp chấm phát âm chi tiết hơn sau.
3. **Chi phí AI**: Writing chạy miễn phí (kiểm tra cơ bản) khi không có key; khi có `ANTHROPIC_API_KEY` thì mỗi lần chấm band gọi Claude, giới hạn `WRITING_DAILY_LIMIT` bài/học viên/ngày.
4. **Lưu trữ**: chưa đặt `DATABASE_URL` thì Render free xóa dữ liệu mỗi lần khởi động lại. Tạo database Neon miễn phí và dán connection string vào `DATABASE_URL` trên Render trước khi cho học viên thật vào học.
