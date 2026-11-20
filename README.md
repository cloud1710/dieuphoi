# dieuphoi

Hub điều phối: một sổ đăng ký các orchestra (kế hoạch) của nhiều project, một lệnh gom việc chờ người quyết, và một
trang "văn phòng agents" cho thấy project nào đang có việc chạy.

dieuphoi chỉ đọc kế hoạch của các project. Mỗi project tự giữ kế hoạch của mình theo định dạng
[projectplaner](https://github.com/cloud1710/projectplaner) (`plan/STATUS.yaml`, `plan/QUESTIONS.md`).

## Cần gì

Python 3.10 trở lên và `pip install pyyaml`. Có thêm `psutil` thì trang văn phòng đếm được phiên Claude Code đang mở.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `python tools/dp.py check` | Sổ đăng ký hợp lệ, mọi thư mục có, mọi kế hoạch đọc được |
| `python tools/dp.py scan` | Ghi `out/state.json` và `out/INBOX.md` (việc chờ anh Vinh) |
| `python tools/dp.py serve` | Mở văn phòng agents tại http://127.0.0.1:8765 (`--host 0.0.0.0` để xem từ máy khác trong mạng) |
| `python tools/dp.py init <id>` | Viết kế hoạch khởi đầu vào một project đã đăng ký mà chưa có kế hoạch |

Trên Windows: bấm đúp `office.cmd`.

## Các cấp

1. Hub dieuphoi (nhóm trưởng).
2. Nhóm (`groups` trong `registry.yaml`).
3. Orchestra của từng project.
4. Orchestra con: project có `parent` trỏ tới một orchestra khác.

Việc đi lên: câu hỏi `status: open` và mục có `owner` là người trong kế hoạch của project được `dp scan` gom vào
`out/INBOX.md`. Việc đi xuống: sửa kế hoạch trong chính project đó.

## Thêm một project

1. Thêm một dòng vào `projects` trong `registry.yaml` (`kind: plan`).
2. `python tools/dp.py init <id>`, rồi sửa `plan/STATUS.yaml` của project.
3. `pp check` trong project, `python tools/dp.py check` ở đây.

## Giới hạn

- Orchestra SEAL (`kind: seal`) chỉ được đọc; dieuphoi không ghi gì vào đó.
- `kind: archive` là bản lưu: không tạo kế hoạch, không sửa.
- Trang văn phòng dựng từ kế hoạch, không điều khiển phiên nào. Mở phiên vẫn là việc của `pp`.
- `out/` không lên git.
