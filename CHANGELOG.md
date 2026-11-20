# Changelog — Đảo Đèn Lồng

Tài liệu này ghi lại lịch sử thay đổi qua từng Phase, đặc biệt là các **thay đổi phá vỡ tương thích (`Breaking Changes`)** khi chuyển sang luật mới ở Phase 3 (`TICKET-03 — "Đèn cạn dầu"`, `Test Contract v1.2`).

---

## [Phase 3] — Test Contract v1.2 (`tag: phase-3`) · 2026-11-20

### ⚠️ Breaking Changes (Thay đổi phá vỡ tương thích so với Phase 2 / Contract v1.1)

1. **`[BREAKING]` Mô hình trạng thái Đèn Lồng Lớn — Đèn sáng tiêu hao nhiên liệu & có thể tắt:**
   - Thay thế luật cũ *"đèn đã sáng là sáng vĩnh viễn và không nhận thêm đom đóm"*.
   - Đèn vừa thắp (lần đầu hoặc thắp lại) có `fuel = 100.0`, tự hao `1.0 fuel/giây` (`1/60` mỗi tick ở Bước 2).
   - Khi `fuel <= 0`, đèn chuyển sang tắt (`lit = false`, `deposited = 0`, nhớ `ever_lit = true`) và phát sự kiện mới `lantern_out {lantern_id}`.
   - Đèn từng sáng (`ever_lit = true`) khi tắt chỉ cần **`relight_cost = 5`** đom đóm để thắp lại (thay vì `10`), và sự kiện `lantern_lit` nay bắt buộc có thêm trường boolean **`relight: true|false`**.
   - Đèn đang sáng nhưng chưa đầy dầu (`fuel < 100`) nay nhận tương tác châm dầu (`used = min(carried, ceil((100 - fuel) / 10))`) và phát sự kiện mới **`refuel {lantern_id, amount, fuel}`** thay vì bị bỏ qua.

2. **`[BREAKING]` Vùng an toàn phụ thuộc mức dầu & trạng thái Bóng Mực hút dầu (`drain`):**
   - Thay thế luật cũ *"đèn đang sáng luôn có vùng an toàn 6.0m"*.
   - Đèn có `fuel < 30` (`low_fuel_threshold = 30`) **mất vùng an toàn** (đúng `30.0` vẫn còn vùng an toàn).
   - Bóng Mực ở trạng thái `wander` ưu tiên nhắm tới đèn đang sáng có `fuel < 30` gần nhất; khi cách đèn `<= 2.0m (XZ)` sẽ chuyển sang trạng thái mới **`drain`**, đứng yên hút `5.0 fuel/giây` (`5/60` mỗi tick, cộng dồn nhiều con) và phát sự kiện **`fuel_drain {lantern_id, shade_id, fuel}`** mỗi `60 tick` đang hút.
   - Khi Bóng Mực hết choáng (`stunned`), nó luôn trở về trạng thái **`wander`** (thay vì vào thẳng `chase`).

3. **`[BREAKING]` Luật thắng mới — Giữ đảo sáng tới bình minh (`dawn_survived` thay cho `all_lit`):**
   - Thay thế hoàn toàn luật cũ *"thắp đủ đèn là thắng ngay lập tức (`reason: "all_lit"`)"*.
   - **Bỏ sự kiện thắng sớm `all_lit`:** Thắp đủ đèn không kết thúc Đêm.
   - Thời lượng mỗi Đêm rút xuống **`240s / 270s / 300s`** (thay vì `300s / 330s / 360s`).
   - Mây chỉ thắng khi sống sót tới hết giờ (`time_left_s == 0`, `flames > 0`) **và** số đèn đang sáng tại tick cuối đạt ngưỡng `>= ceil(0.6 * tổng đèn)` (Đêm 1: `3/5`, Đêm 2: `4/6`, Đêm 3: `5/7`), phát `game_over {result: "won", reason: "dawn_survived"}`. Nếu hết giờ mà số đèn sáng dưới ngưỡng thì thua với `reason: "dawn"`.

4. **`[BREAKING]` Công thức tính điểm mới:**
   - Thay thế toàn bộ bảng điểm v1.1:
     - Mỗi đom đóm nạp vào đèn (`deposit` hoặc `refuel`): giảm từ `+10` xuống **`+5`**.
     - Thắp đèn lần đầu (`relight: false`): **`+100`**; thắp lại (`relight: true`): **`+40`**.
     - Tỏa sáng trúng Bóng Mực: **`+5`** mỗi con, hoặc **`+15`** nếu ngay trước đó con Bóng Mực đang ở trạng thái `drain`.
     - **Bỏ thưởng thời gian còn lại** (`per_second_left = 0`).
     - Khi thắng ở bình minh (`dawn_survived`): thưởng **`+50 + floor(fuel)`** cho mỗi đèn đang sáng và **`+50`** cho mỗi Ngọn lửa còn lại.

5. **`[BREAKING]` Thay đổi Schema Snapshot & Scenario (Contract v1.2):**
   - `snapshot.lanterns[]` thêm 3 trường bắt buộc: `fuel` (float 1 chữ số thập phân, đèn tắt là `0`), `ever_lit` (bool), `relit_count` (int).
   - `snapshot.player` thêm trường `capacity` (`10 + 2 * successful_lights`, tối đa `20`).
   - `snapshot.shades[].state` mở rộng thành 6 trạng thái: `spawning | wander | chase | recoil | stunned | drain`.

### ✨ Added (Tính năng mới ở Phase 3)
- **Sức chứa đom đóm tăng dần (`capacity`):** Bắt đầu mỗi Đêm ở `10`, tăng `+2` sau mỗi lần thắp đèn thành công (tính cả thắp lại) lên tối đa `20`.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Lưu trong `localStorage`; đổi mắt/viền Bóng Mực sang `#00B3FF`, cảnh báo UI sang `#FFFFFF` kèm biểu tượng `⚠`, đèn tắt bị xẹp `20%` kèm vết rách trên lồng giấy, đèn sắp cạn dầu (`fuel < 30`) nhấp nháy `1 Hz` kèm thanh nhiên liệu trên đèn.

---

## [Phase 2] — Test Contract v1.1 (`tag: phase-2`) · 2026-11-20
- Mở rộng chiến dịch 3 Đêm (**Đảo Bến · Đảo Cau · Đảo Chuông**), bổ sung kỹ năng **Lướt (`dash`)**, **Tạm dừng (`pause`)**, **Rơi khỏi đảo (`Y < -10`)**, **Gió Lạc (`drifters`)**, **Bùa Gió (`charms`)**, **Bệ Nhảy Gió**, **Gió Mạnh Đêm 3**, và chuẩn hóa thứ tự 12 bước mỗi tick.

## [Phase 1] — Test Contract v1.0 (`tag: phase-1`) · 2026-11-20
- Phiên bản MVP Đêm 1 (**Đảo Bến**) với lõi mô phỏng tất định 60 tick/s, CLI `--headless`, và giao diện 3D Three.js.
