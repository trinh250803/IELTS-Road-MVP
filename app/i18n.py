"""English versions of server error messages. Code raises ApiError in Vietnamese (the source
language); the error handler translates when the client sends `X-Lang: en`. Numbers inside
messages are captured by the patterns, so f-string messages translate too."""
import re

_EN = [
    (r"Không có bài thi này", "This test does not exist"),
    (r"Bài kiểm tra tuần (\d+) mở khi bạn học tới tuần \d+", r"The week \1 test unlocks when you reach week \1"),
    (r"Thiếu câu trả lời", "Answers are missing"),
    (r"Không tìm thấy lượt thi", "Attempt not found"),
    (r"Lượt thi này đã kết thúc", "This attempt has already ended"),
    (r"Hệ thống chấm đang quá tải.*", "The grading service is busy, please try again in a few minutes"),
    (r"Không chấm được bài lúc này.*", "The essay could not be graded right now, please try again later"),
    (r"Không kết nối được tới dịch vụ chấm bài", "Could not reach the grading service"),
    (r"Bài viết không thể chấm tự động.*", "This essay cannot be graded automatically. Please check its content."),
    (r"Kết quả chấm không hợp lệ.*", "The grading result was invalid, please try again"),
    (r"Chấm Writing bằng AI chưa được bật.*", "AI writing feedback is not enabled (ANTHROPIC_API_KEY is missing on the server)"),
    (r"Dạng bài phải là task1 hoặc task2", "Task type must be task1 or task2"),
    (r"Hãy nhập đề bài", "Please enter the task prompt"),
    (r"Bài viết cần ít nhất (\d+) từ để chấm \(hiện có (\d+) từ\)", r"The essay needs at least \1 words to be graded (it has \2)"),
    (r"Bài viết tối đa (\d+) từ", r"Essays can be at most \1 words"),
    (r"Mỗi ngày được chấm tối đa (\d+) bài.*", r"You can grade up to \1 essays per day. Please come back tomorrow."),
    (r"Tuần bắt đầu phải từ 1 đến (\d+)", r"Start week must be between 1 and \1"),
    (r"Không có ngày học này", "This study day does not exist"),
    (r"Không có nhiệm vụ này", "This task does not exist"),
    (r"Nhiệm vụ này tự hoàn thành khi bạn làm đạt bài kiểm tra tuần", "This task completes automatically when you pass the weekly test"),
    (r"Mức đánh giá không hợp lệ", "Invalid rating"),
    (r"Không có từ này", "This word does not exist"),
    (r"JSON không hợp lệ.*", "Invalid JSON (UTF-8 required)"),
    (r"Cần một đối tượng JSON", "A JSON object is required"),
    (r"Không có tài khoản dùng thử", "No demo account"),
    (r"Mật khẩu phải có ít nhất (\d+) ký tự", r"Password must be at least \1 characters"),
    (r"Tên đăng nhập 3–32 ký tự.*", "Username must be 3–32 characters: letters without accents, digits, dots or underscores"),
    (r"Tên đăng nhập đã tồn tại", "Username already exists"),
    (r"Sai tên đăng nhập hoặc mật khẩu", "Wrong username or password"),
    (r"Chưa đăng nhập", "Not signed in"),
    (r"Phiên đăng nhập hết hạn", "Your session has expired"),
    (r"Phiên đăng nhập đã kết thúc", "Your session has ended"),
    (r"Tài khoản không còn hiệu lực hoặc mật khẩu đã đổi", "The account is inactive or the password has changed"),
    (r"Bạn không có quyền.*", "You do not have permission to do this"),
    (r"Tài khoản đã bị khóa", "This account is locked"),
    (r"Không tìm thấy học viên", "Learner not found"),
    (r"Trò chơi không hợp lệ", "Invalid game"),
    (r"Danh sách trống", "The list is empty"),
    (r"Dòng (\d+): (.*)", r"Line \1: \2"),
    (r"Không tìm thấy", "Not found"),
    (r"Lỗi máy chủ", "Server error"),
]
_COMPILED = [(re.compile(f"^{p}$"), en) for p, en in _EN]


def translate(message: str, lang: str | None) -> str:
    if lang != "en":
        return message
    for pat, en in _COMPILED:
        m = pat.match(message)
        if m:
            out = m.expand(en)
            # Nested message, e.g. "Dòng 3: Tên đăng nhập đã tồn tại"
            return re.sub(r"(?<=: ).*$", lambda x: translate(x.group(0), lang), out) if pat.pattern.startswith("^Dòng") else out
    return message


def lang_of(request) -> str:
    return "en" if request.headers.get("x-lang", "").lower().startswith("en") else "vi"
