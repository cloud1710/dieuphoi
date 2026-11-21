# Bộ hình cho giao diện "Pixel AI" của văn phòng điều phối

Anh Vinh muốn thêm một giao diện cho tab Văn phòng trong app điều phối, vẽ bằng Gemini (cảnh) và PixelLab (nhân vật),
cùng cách làm của xoi-man (`tools/art/gem.py`, PixelLab create_character + animation). Đặt hết vào thư mục này.

## Cảnh (Gemini, 16:9, 1920x1080, góc nhìn chéo từ trên xuống, pixel art gọn, cùng một bảng màu)
- `bg_day.png`, `bg_night.png`: tầng thượng một tòa nhà văn phòng ở Sài Gòn: phòng CEO (bàn lớn, hai màn hình quay vào ghế CEO,
  ghế khách đối diện), sân thượng có hồ bơi, cây, đèn dây; phía sau là phòng Chủ tịch nhỏ hơn. Không chữ, không người.
- `bg_rain.png` (tuỳ chọn): như bg_day, trời mưa.
- Ghi toạ độ pixel (trên ảnh 1920x1080) của: ghế CEO, ghế khách, cửa thang máy, ghế Chủ tịch vào `manifest.json`.

## Nhân vật (PixelLab, cao khoảng 64 px, nhìn 4 hướng, nền trong suốt)
- `ceo`: nữ, dáng cao, tóc dài, vest + chân váy xanh navy, khăn cài túi đỏ (bản nam cũ ở `ceo_old/`). `chairman`: nam, vest xám than, đeo kính.
- `staff_1` … `staff_8`: nhân viên văn phòng khác nhau (nam, nữ, tóc, áo khác nhau).
- Mỗi nhân vật: `walk` 4 hướng (mỗi hướng 4–6 khung) và `idle`/`sit` hướng nam. Xuất dạng dải PNG (strip) mỗi hoạt ảnh.

## manifest.json
`{"size":[1920,1080], "spots":{"ceo":[x,y],"guest":[x,y],"lift":[x,y],"chairman":[x,y]}, "bg":{"day":"bg_day.png","night":"bg_night.png"},
  "chars":{"ceo":{"walk_s":"ceo_walk_s.png","frames":6,"w":64,"h":64, ...}, ...}}`

Không ghi khoá API vào thư mục này. Xong thì báo vào thư (dòng `- result:`); hub tự dựng phần hiển thị.
