# CREDITS — Đảo Đèn Lồng

## Nhân vật & Bối cảnh
- Nhân vật **Mây**, **Đảo Bến**, **Đom Đóm**, **Đèn Lồng Lớn**, **Bóng Mực**: thiết kế gốc theo đề bài Day 12 AI SDLC Lab.

## Thư viện & Công cụ bên ngoài
- **Three.js (`r160`)**: Thư viện dựng hình WebGL 3D — Giấy phép **MIT** (https://threejs.org / https://github.com/mrdoob/three.js). Bản minified được đóng gói sẵn tại `web/vendor/three.min.js` để chạy offline trên macOS/Linux/Windows.
- **Python 3 Standard Library**: Logic mô phỏng headless (`src/core/`), CLI (`src/headless.py`), HTTP server (`src/web_server.py`) và bộ test (`unittest`).

## Đồ họa & Âm thanh
- Toàn bộ mô hình 3D low-poly (Mây đội nón lá treo đèn, 5 Đèn Lồng Lớn, Đảo Bến, biển mây, đom đóm, Bóng Mực): tự dựng bằng hình học Three.js trong `web/game.js` (không dùng asset bản quyền bên ngoài).
- Toàn bộ hiệu ứng âm thanh (nhặt đom đóm, nạp đèn, thắp đèn, tỏa sáng, bị chạm, thắng/thua): tự tổng hợp thời gian thực bằng Web Audio API trong `web/game.js` (không dùng file âm thanh bên ngoài).

## Công cụ AI hỗ trợ
- **Antigravity AI Assistant**: hỗ trợ lập kế hoạch, sinh mã nguồn, viết kịch bản kiểm thử và rà soát đối chiếu theo Test Contract v1.0 dưới sự điều phối và kiểm chứng của học viên.
