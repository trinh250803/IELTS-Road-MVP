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
| Đăng ký / đăng nhập | ✅ |
| Kiểm tra đầu vào 20 câu (A1–B2) → gợi ý tuần bắt đầu | ✅ |
| Lộ trình 12 tuần × 7 ngày (6 ngày học + 1 ngày ôn/kiểm tra), ~180 phút/ngày | ✅ khung đủ 84 ngày |
| Bài học ngữ pháp có giải thích + bài tập chấm ngay | ⏳ mới có 6 bài tuần 1 |
| Flashcard từ vựng lặp lại ngắt quãng (SM-2), phát âm bằng trình duyệt | ⏳ mới có 72 từ tuần 1 |
| Theo dõi tiến độ: chuỗi ngày học, số giờ 7 ngày, % lộ trình | ✅ |
| Chấm Writing Task 1/2 bằng AI (Claude) theo 4 tiêu chí IELTS | ✅ cần `ANTHROPIC_API_KEY` |
| Luyện Listening / Reading có audio và đề | ❌ chưa có — hiện chỉ là nhiệm vụ mô tả |
| Luyện Speaking (ghi âm, chấm) | ❌ |
| Thanh toán, quản trị nội dung | ❌ |

## Kiến trúc

| Thành phần | Công nghệ | Mã nguồn |
|---|---|---|
| Backend/API | Python FastAPI | [app/main.py](app/main.py) |
| Nội dung khóa học | File JSON | [content/](content/) |
| Lộ trình theo ngày | Sinh từ định nghĩa tuần | [app/content.py](app/content.py) |
| Tiến độ, flashcard | SM-2 | [app/learner.py](app/learner.py) |
| Chấm Writing | Claude API, structured output | [app/writing.py](app/writing.py) |
| Lưu trữ | File JSON (giai đoạn sau: PostgreSQL) | [app/store.py](app/store.py) |
| Giao diện | HTML/JS thuần | [public/](public/) |

## Việc cần quyết định / làm tiếp

1. **Nguồn nội dung**: soạn tiếp bài ngữ pháp tuần 2–12 và kho từ (mục tiêu ~3.000 từ), hoặc mua/cấp phép giáo trình. Đề Listening/Reading cần bản quyền.
2. **Speaking**: ghi âm trên trình duyệt + chấm bằng AI (cần chuyển giọng nói thành chữ).
3. **Chi phí AI**: mỗi lần chấm Writing gọi Claude; mặc định giới hạn 5 bài/học viên/ngày (`WRITING_DAILY_LIMIT`).
4. **Lưu trữ**: Render free xóa ổ đĩa khi khởi động lại → mất tiến độ học viên. Cần PostgreSQL trước khi cho người dùng thật.
