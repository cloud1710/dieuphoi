# Orchestra của {{NAME}}

- Mã trong sổ đăng ký của dieuphoi: `{{ID}}`
- Cấp trên: {{PARENT}}, rồi tới hub dieuphoi (nhóm trưởng).
- Kế hoạch: `plan/STATUS.yaml`. Câu hỏi: `plan/QUESTIONS.md`. Quyết định: `plan/CHANGELOG.md`.

## Báo lên cấp trên

dieuphoi chỉ đọc thư mục `plan/` này, không sửa. Việc cần anh Vinh quyết thì ghi theo một trong hai cách, hub sẽ
gom vào danh sách việc chờ anh:

1. Câu hỏi chặn việc: thêm khối `## Q-xxx` trong `plan/QUESTIONS.md`, `status: open`.
2. Việc cần tay người: mục có `owner: Vinh` trong `plan/STATUS.yaml`.

Việc không hệ trọng thì phiên tự quyết và ghi một dòng vào `plan/CHANGELOG.md`.
Luật riêng của project (CLAUDE.md nếu có) luôn thắng tệp này.
