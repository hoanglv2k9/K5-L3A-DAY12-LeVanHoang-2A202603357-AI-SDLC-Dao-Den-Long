# CREDITS.md — Ghi nguồn Tài nguyên, Âm thanh & Công cụ AI

Dự án **Đảo Đèn Lồng (`v1.0.0`)** tuân thủ nghiêm ngặt quy định bản quyền của Lab Day 12. Mọi thư viện, tài nguyên đồ họa, âm thanh và công cụ AI sử dụng trong kho mã đều được kê khai minh bạch dưới đây:

## 1. Thư viện Phần mềm Mã nguồn mở (Third-Party Libraries)

| Tên thư viện | Phiên bản | Giấy phép | Vị trí trong repo | Mục đích sử dụng |
|---|---|---|---|---|
| **Three.js** | `r149` | **MIT License** (Copyright © 2010–2023 Three.js authors, mrdoob) | [`web/vendor/three.min.js`](web/vendor/three.min.js) | Dựng hình 3D WebGL cho 3 hòn đảo (Đảo Bến, Đảo Cau, Đảo Chuông), nhân vật Mây, Đèn Lồng Lớn, Đom đóm, Bóng Mực, Gió Lạc, Bùa Gió |
| **Python Standard Library** | Python `3.10+` (`3.13.2`) | **PSF License** | `src/`, `tests/`, `scripts/` | Lõi mô phỏng tất định 60 tick/s, CLI `--headless`, `--bench`, `--soak`, HTTP server cục bộ và bộ kiểm thử `unittest` |

## 2. Mô hình 3D, Hình ảnh & Giao diện (3D Models, Graphics & UI)

- **Mô hình 3D Procedural (100% tự sinh bằng mã nguồn):**
  - Toàn bộ hình học 3D trong [`web/game.js`](web/game.js) — bao gồm địa hình 3 đảo, cầu tre, bệ nhảy gió, tháp chuông 3 tầng, nhân vật **Mây** (áo choàng, nón lá, đèn lồng nhỏ), **Đèn Lồng Lớn** (kèm thanh dầu 3D và hiệu ứng giấy rách/xẹp 20% khi tắt), **Đom đóm**, **Bóng Mực**, **Gió Lạc**, **Bùa Gió** và lá bay — được tạo hoàn toàn bằng các khối hình học cơ bản của Three.js (`CylinderGeometry`, `ConeGeometry`, `SphereGeometry`, `ExtrudeGeometry`, `RingGeometry`, `TorusGeometry`, `OctahedronGeometry`).
  - Không sử dụng bất kỳ file mô hình hay texture bên ngoài nào không rõ nguồn gốc.
- **Ảnh minh họa (`docs/preview.svg`) & Video Demo (`docs/demo/demo.mp4`):**
  - Tự sinh hoàn toàn bằng script Python nội bộ của dự án, thuộc giấy phép **MIT** của kho mã này.

## 3. Âm thanh (Procedural Audio)

- **Web Audio API Synthesizer (100% tự sinh bằng thuật toán trong [`web/game.js`](web/game.js)):**
  - Mọi hiệu ứng âm thanh (nhặt đom đóm, nhặt Bùa Gió, Lướt, Bệ Nhảy Gió, nạp đèn, châm dầu, hợp âm thắp đèn, đèn tắt cạn dầu, sóng Tỏa sáng, Gió Lạc cướp đom đóm, Gió Mạnh Đêm 3, tiếng tích-tắc 10 giây cuối, thắng/thua) đều được tổng hợp thời gian thực bằng `AudioContext`, `OscillatorNode` và `GainNode` của trình duyệt.
  - Không sử dụng bất kỳ tệp âm thanh `.mp3` / `.wav` bên ngoài nào.

## 4. Công cụ AI Hỗ trợ Phát triển (AI Tools Disclosure)

| Công cụ AI | Vai trò trong quy trình AI SDLC | Kiểm soát và Xác minh của Học viên |
|---|---|---|
| **Antigravity AI Coding Agent (Google DeepMind)** | Hỗ trợ phân tích PRD-0 & Ticket-02/03/04, sinh mã lõi mô phỏng Python (`src/`), giao diện 3D Three.js (`web/`), kịch bản kiểm thử tự động (`tests/`) và tài liệu kỹ thuật (`docs/`, `ADR`, `CHANGELOG`, `RETROSPECTIVE`) | Học viên trực tiếp kiểm thử gameplay trên trình duyệt (phát hiện & yêu cầu sửa lỗi ngược hướng phím rẽ trái/phải camera 3D ở Phase 2), kiểm tra bằng chứng định lượng `verify_all.py`, `bench.json`, `soak.json` và quản lý toàn bộ quy trình Git / Tag |
