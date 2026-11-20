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
Cảnh là một diorama ba khu: phòng trưởng phòng (mỗi orchestra một bàn, tổng quản đứng trước bảng), văn phòng lớn
(mỗi việc đang làm hoặc sắp làm là một nhân viên, cờ trên bàn cùng màu với nhóm), và kho (bản lưu và project đã xong
chỉ còn hộp). Kéo để xoay, cuộn để phóng, bấm biển tên để xem việc. `office/flat.html` là bản phẳng cho máy không có WebGL.

Trang chỉ vẽ lại khi có thay đổi: robot chuyển động 10 khung hình mỗi giây (2 khi cửa sổ nằm nền), dừng hẳn khi tab ẩn;
bóng đổ tính một lần; server chỉ đọc lại kế hoạch nào có tệp đổi.

Bản tĩnh (`dp build`) chứa tên project, đường dẫn và câu hỏi đang mở: chỉ đưa lên host có đăng nhập.

## App điện thoại

`office/m.html` là app 2D cho điện thoại, nối thẳng với PC qua mạng riêng ảo (ZeroTier, Tailscale). PC chỉ chạy một
server Python nhỏ: không mở trình duyệt, không vẽ 3D, chỉ đọc kế hoạch khi có điện thoại đang nối và chỉ đẩy dữ liệu
khi có thay đổi.

Bốn tab:

- **Văn phòng**: sơ đồ 2D, mỗi orchestra một bàn; robot đi lại theo trạng thái thật (báo cáo việc đang làm, mang câu hỏi
  tới cửa "Anh Vinh", đưa thư, project con sang báo project cha). Kéo để di chuyển, chụm để phóng, chạm một bàn để
  phóng vào project đó. Cột bên dưới ghi ai đang làm gì và những gì vừa thay đổi, bằng tiếng Việt. Dòng "phiên chính/nhân viên đang chạy
  lệnh, đang đọc tệp..." lấy từ bản ghi phiên Claude Code trên PC (`~/.claude/projects`); chỉ loại bước được hiện,
  không hiện tên tệp hay nội dung. Nút bánh răng mở cài đặt kết nối (ghép lại, quên máy, liên kết sang trang việc).
- **Việc**: việc chờ anh (trả lời câu hỏi ngay trên app), nhân viên đang làm, từng trưởng phòng; nút "Mở phiên" chạy
  `pp open <ID>` của projectplaner trên PC, mọi kiểm tra an toàn của projectplaner vẫn áp dụng.
- **Máy**: CPU, RAM, GPU, ổ đĩa và project nào đang chạy (xem `tools/hw.py`). Chỉ đo khi tab này đang mở. Có nút
  ngủ, khởi động lại, tắt máy (trễ 60 giây, huỷ được). Bật máy từ xa cần Wake-on-LAN và một thiết bị luôn bật trong
  mạng nhà; app này không làm được.
- **Nhắn**: gửi thư vào hộp thư của một orchestra.

Cài:

1. PC và điện thoại ở cùng một mạng ZeroTier. Trên PC: `pip install pyyaml psutil`.
2. Trên PC: `office.cmd --host zerotier`. Lệnh in ra một đường dẫn có `#k=<khoá>`.
3. Mở tường lửa Windows cho cổng 8765, chỉ với mạng ZeroTier.
4. Mở đường dẫn đó trên điện thoại một lần (khoá được lưu trên máy), rồi "Thêm vào màn hình chính".

Chạy ngầm: bấm đúp `start-hidden.vbs` (không hiện cửa sổ; nhật ký ở `out/serve.log`, đường dẫn ghép khoá ở
`out/phone-link.txt`). Muốn tự bật khi đăng nhập Windows: bấm đúp `autostart.cmd` một lần (nó đặt một tệp nhỏ vào thư mục Startup, bật server
ngay và in đường dẫn ghép). Gỡ: xoá `dieuphoi-server.vbs` trong `shell:startup`.

Mật khẩu kết nối: `python tools/dp.py passwd` đọc một dòng từ bàn phím và chỉ lưu bản băm (`out/pass.hash`); điện
thoại ghép bằng mật khẩu đó hoặc bằng khoá ngẫu nhiên. Sai 5 lần thì địa chỉ đó bị khoá 1 phút.

Khoá nằm ở `out/token.txt`; xoá tệp rồi chạy lại server để đổi khoá. Mọi lệnh ghi (trả lời, nhắn, mở phiên) đều cần
khoá, kể cả gọi từ chính PC. Kết nối là HTTP trong mạng riêng: iPhone vẫn thêm được app toàn màn hình; Chrome trên
Android chỉ tạo lối tắt, vì cài PWA đầy đủ và chạy ngoại tuyến cần HTTPS.

## Trang việc chờ anh trên Cloudflare Pages

`todo/` là một trang tĩnh liệt kê việc cần anh Vinh làm: câu hỏi đang mở và mục có `owner` là người trong mọi kế
hoạch (ví dụ gắn nhãn). Việc biến mất khỏi trang khi đã xong trong kế hoạch.

- Trang công khai, nên dữ liệu được mã hoá. Mở bằng đường dẫn có `#k=…` ở `out/todo-link.txt`, hoặc bằng mật khẩu kết
  nối nếu đã đặt (`dp passwd`). Lưu ý: tệp mã hoá ai cũng tải được, nên mật khẩu dễ đoán có thể bị dò ngoại tuyến;
  bỏ đường mật khẩu bằng cách xoá mật khẩu (`dp passwd` với dòng trống) rồi đăng lại.
- Lần đầu: bấm đúp `publish-todo.cmd` (cần `npx wrangler login`). Tên project lấy ở `publish.pages_project` trong
  `registry.yaml`.
- Sau lần đầu, server tự đăng lại trong vòng 5 phút mỗi khi danh sách việc đổi (`publish.auto`); nhật ký ở
  `out/publish.log`.
- Báo xong một việc của mình: nút "Báo đã xong" trong app điện thoại, hoặc nhắn tổng quản.

## Phần cứng

`python tools/dp.py hw` (hoặc `python tools/hw.py --watch 5`) in CPU, RAM, GPU, ổ đĩa và một dòng cho mỗi project:
`running` khi có chương trình (claude, python, node...) đang chạy trong thư mục project, `recent` khi kế hoạch, ghi chú
phiên hoặc git index đổi trong 24 giờ, còn lại là `idle`. Chương trình nặng không thuộc project nào được liệt kê riêng.
Cần `psutil`; số GPU cần `nvidia-smi`.

## Nhắn một orchestra bằng @

Nhắn cho điều phối `@pathbrain chạy thêm một lượt radar`: điều phối tìm project (`dp who`), đọc luật và kế hoạch của
project đó rồi làm việc trong đó. Việc cần một phiên riêng của project thì để lại thư (`dp msg`), phiên của project đọc
`plan/INBOX.md` đầu phiên. Tên sau @ là `id`, tên, tên thư mục hoặc `aliases` trong `registry.yaml`.
Orchestra SEAL và bản lưu không bị ghi: thư cho chúng nằm ở `out/mail/` của hub.

## Các cấp

1. Hub dieuphoi (tổng quản).
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
