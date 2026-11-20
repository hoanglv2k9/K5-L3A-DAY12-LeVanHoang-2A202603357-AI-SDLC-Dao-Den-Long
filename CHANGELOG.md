# Changelog — Đảo Đèn Lồng

Tài liệu này ghi lại toàn bộ lịch sử phát triển qua **4 Phase** của dự án **Đảo Đèn Lồng** (`Test Contract v1.0 -> v1.3`), bao gồm các tính năng mới, sửa lỗi và các **thay đổi phá vỡ tương thích (`Breaking Changes`)**.

---

## [v1.0.0 / Phase 4] — Test Contract v1.3 (`tag: phase-4`, `tag: v1.0.0`) · 2026-11-20

### ✨ Added (Tính năng phát hành `v1.0.0`)
- **Chế độ Benchmark chuẩn 1280×720 (`src/bench.py` & `web/game.js?bench=1`):**
  - Lệnh CLI: `python3 -m src.bench --seed 42 --duration 30 --out bench.json`.
  - Cảnh chuẩn Đêm 1 với đúng `200` Bóng Mực ở trạng thái `wander`, `100` đom đóm, `3` đèn `L1–L3` đang sáng (`fuel = 100`), tắt sinh thêm/sát thương/nhặt/hao dầu/kết thúc Đêm, Mây đứng tại `(0,0,0)` và camera bay vòng tròn tâm `(0,0,0)` bán kính `30m`, độ cao `Y = 15m` ngược chiều kim đồng hồ `15s/vòng` (`3s` khởi động + `--duration` giây đo).
  - Xuất đầy đủ `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, `load_ms`, `peak_mem_mb`, `vsync_off`, `renderer`, `os`.
- **Soak Test 10 Đêm liên tiếp (`src/soak.py`):**
  - Lệnh CLI: `python3 -m src.soak --seed 7 --nights 10 --out soak.json`.
  - Chạy headless `10` Đêm liên tiếp trong cùng một tiến trình (Đêm `1 -> 2 -> 3` xoay vòng, `seed = 7 + i`) với input ngẫu nhiên theo seed (mỗi `30 tick` đổi hướng; xác suất mỗi tick `5%` nhảy, `3%` lướt, `2%` tỏa sáng, `10%` tương tác) và giám sát bộ nhớ RSS (`crashes = 0`, `mem_end_mb <= 1.2 * mem_start_mb`).
- **Bảng xếp hạng cục bộ (`src/leaderboard.py` & `data/leaderboard.json`):**
  - Cho phép nhập tên `3–12 ký tự` (`[A-Za-z0-9_]` và tiếng Việt) sau màn Bình Minh (thắng Đêm 3) hoặc sau khi thua ở bất kỳ Đêm nào.
  - Lưu Top 10 trên đĩa cục bộ (`data/leaderboard.json`) kèm màn hình Bảng xếp hạng từ Menu chính và lệnh xuất CLI: `python3 -m src.web_server --export-leaderboard out.json`.
- **Dễ tiếp cận toàn diện (Accessibility):**
  - **Đổi phím điều khiển:** Cho phép đổi phím cả 9 hành động (4 hướng di chuyển, nhảy, lướt, tương tác, tỏa sáng, tạm dừng), tự động phát hiện trùng phím, có nút *"Khôi phục mặc định"*, lưu trong `localStorage`.
  - **Phụ đề & chỉ báo hình ảnh:** Hiện phụ đề + mũi tên chỉ hướng ở mép màn hình khi Bóng Mực xuất hiện, gió mạnh sắp thổi, 10 giây cuối, và khi đèn có `fuel < 30`.
  - **Giảm chuyển động:** Tắt rung camera và hiệu ứng chớp màn hình khi bị thương.
  - **Cỡ chữ UI:** Tối thiểu `18px` ở `1280×720`, kèm tuỳ chọn **Cỡ chữ lớn (`×1.25`)**.
- **Đóng gói phát hành & Tổng kết:** Bổ sung [`docs/RETROSPECTIVE.md`](docs/RETROSPECTIVE.md), [`bench.json`](bench.json), [`soak.json`](soak.json), video demo [`docs/demo/demo.mp4`](docs/demo/demo.mp4) và gói phát hành `dist/dao-den-long-v1.0.0.zip`.

---

## [Phase 3] — Test Contract v1.2 (`tag: phase-3`) · 2026-11-20

### ⚠️ Breaking Changes (Thay đổi phá vỡ tương thích so với Phase 2 / Contract v1.1)
1. **`[BREAKING]` Mô hình trạng thái Đèn Lồng Lớn — Đèn sáng tiêu hao nhiên liệu & có thể tắt:**
   - Thay thế luật cũ *"đèn đã sáng là sáng vĩnh viễn và không nhận thêm đom đóm"*.
   - Đèn vừa thắp có `fuel = 100.0`, tự hao `1.0 fuel/giây` (`1/60` mỗi tick ở Bước 2). Khi `fuel <= 0` ngay sau Bước 2, đèn chuyển sang tắt (`lit = false, deposited = 0, ever_lit = true`), phát sự kiện `lantern_out {lantern_id}`.
   - Đèn từng sáng (`ever_lit = true`) khi tắt chỉ cần **`relight_cost = 5`** đom đóm để thắp lại, và sự kiện `lantern_lit` thêm trường boolean **`relight: true|false`**.
   - Đèn đang sáng chưa đầy dầu (`fuel < 100`) nhận tương tác châm dầu (`used = min(carried, ceil((100 - fuel) / 10))`), phát sự kiện **`refuel {lantern_id, amount, fuel}`**.
2. **`[BREAKING]` Vùng an toàn phụ thuộc mức dầu & trạng thái Bóng Mực hút dầu (`drain`):**
   - Đèn có `fuel < 30` **mất vùng an toàn** (đúng `30.0` vẫn còn).
   - Bóng Mực ở `wander` ưu tiên đi tới đèn sáng có `fuel < 30` gần nhất; khi cách `<= 2.0m (XZ)` chuyển sang trạng thái **`drain`**, đứng yên hút `5.0 fuel/giây` (`5/60` mỗi tick, cộng dồn) và phát `fuel_drain {lantern_id, shade_id, fuel}` mỗi `60 tick` hút. Hết choáng (`stunned`) luôn trở về `wander`.
3. **`[BREAKING]` Luật thắng mới — Giữ đảo sáng tới bình minh (`dawn_survived` thay cho `all_lit`):**
   - Thời lượng mỗi Đêm rút xuống **`240s / 270s / 300s`**; **bỏ thắng sớm `all_lit`**.
   - Thắng khi sống tới hết giờ (`time_left_s == 0, flames > 0`) và số đèn đang sáng `>= ceil(0.6 * tổng đèn)` (`3/5`, `4/6`, `5/7`), phát `game_over {result: "won", reason: "dawn_survived"}`.
4. **`[BREAKING]` Công thức tính điểm mới & Schema Snapshot v1.2:**
   - Mỗi đom đóm nạp (`deposit` hoặc `refuel`) `+5`; thắp đầu `+100`; thắp lại `+40`; choáng Bóng Mực `+5` (`+15` nếu đang `drain`); bỏ thưởng thời gian; thưởng bình minh khi thắng `+50 + floor(fuel)` mỗi đèn sáng + `+50` mỗi lửa còn lại.
   - `snapshot.lanterns[]` thêm `fuel, ever_lit, relit_count`; `snapshot.player` thêm `capacity` (`min(20, 10 + 2 * successful_lights)`).

### ✨ Added
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Mắt/viền Bóng Mực `#00B3FF`, cảnh báo UI `#FFFFFF` kèm `⚠`, đèn tắt bị xẹp `20%` kèm vết rách trên giấy, đèn `fuel < 30` nhấp nháy `1 Hz` kèm thanh nhiên liệu 3D.

---

## [Phase 2] — Test Contract v1.1 (`tag: phase-2`) · 2026-11-20

### ✨ Added & Standardized
- Mở rộng chiến dịch 3 Đêm (**Đêm 1: Đảo Bến · Đêm 2: Đảo Cau · Đêm 3: Đảo Chuông**).
- Chuẩn hóa thứ tự **12 bước xử lý mỗi tick** và bảng thông số Ticket-02 (`carry_capacity = 10`, `lantern_cost = 10`, `pulse_cost = 3`, `pulse_radius = 5.0m`, `pulse_push_m = 4.0m` trong `15 tick` đầu, `safe_radius = 6.0m`).
- Thêm kỹ năng **Lướt (`dash`)**, **Tạm dừng (`pause`)**, **Rơi khỏi đảo (`Y < -10`)**, **Gió Lạc (`drifters`)**, **Bùa Gió (`charms`)**, **Bệ Nhảy Gió**, **Gió Mạnh Đêm 3**, bảng màu chuẩn hóa và mũi tên chỉ hướng đèn khuất màn hình.
- Sửa lỗi ngược hướng phím rẽ Trái/Phải (`A/D`) theo hệ tọa độ bàn tay phải của camera Three.js.

---

## [Phase 1] — Test Contract v1.0 (`tag: phase-1`) · 2026-11-20

### ✨ Added
- Thiết lập AI Harness (`AGENTS.md`, skill `verify-phase`, pre-commit hook, GitHub Actions CI).
- Lõi mô phỏng tất định 60 tick/s (`src/core/engine.py`, PRNG Mulberry32 `src/core/rng.py`), CLI `--headless` (`src/headless.py`) và bản 3D WebGL Đêm 1 (`web/`) với âm thanh Web Audio API tổng hợp.
