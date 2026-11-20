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
| `python tools/dp.py build` | Ghi bản tĩnh của văn phòng vào `out/site` (trang + `state.json`), đưa lên host tĩnh nào cũng được |
| `python tools/dp.py who @ten` | Tìm project theo tên sau dấu @ và in nơi đặt orchestra của nó |
| `python tools/dp.py msg @ten nội dung` | Để lại thư trong hộp thư của project (`plan/INBOX.md`) |
| `python tools/dp.py init <id>` | Viết kế hoạch khởi đầu vào một project đã đăng ký mà chưa có kế hoạch |

Trên Windows: bấm đúp `office.cmd`.

## Văn phòng agents

`office/index.html` là cảnh 3D (three.js r187, đóng gói sẵn trong `office/vendor/`, giấy phép MIT, chạy không cần mạng).
Cảnh là một diorama ba khu: phòng trưởng phòng (mỗi orchestra một bàn, điều phối đứng trước bảng), văn phòng lớn
(mỗi việc đang làm hoặc sắp làm là một nhân viên, cờ trên bàn cùng màu với nhóm), và kho (bản lưu và project đã xong
chỉ còn hộp). Kéo để xoay, cuộn để phóng, bấm biển tên để xem việc. `office/flat.html` là bản phẳng cho máy không có WebGL.

Trang chỉ vẽ lại khi có thay đổi: robot chuyển động 10 khung hình mỗi giây (2 khi cửa sổ nằm nền), dừng hẳn khi tab ẩn;
bóng đổ tính một lần; server chỉ đọc lại kế hoạch nào có tệp đổi.

Bản tĩnh (`dp build`) chứa tên project, đường dẫn và câu hỏi đang mở: chỉ đưa lên host có đăng nhập.

## Nhắn một orchestra bằng @

Nhắn cho điều phối `@pathbrain chạy thêm một lượt radar`: điều phối tìm project (`dp who`), đọc luật và kế hoạch của
project đó rồi làm việc trong đó. Việc cần một phiên riêng của project thì để lại thư (`dp msg`), phiên của project đọc
`plan/INBOX.md` đầu phiên. Tên sau @ là `id`, tên, tên thư mục hoặc `aliases` trong `registry.yaml`.
Orchestra SEAL và bản lưu không bị ghi: thư cho chúng nằm ở `out/mail/` của hub.

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
