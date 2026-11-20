# ADR 0001: Chuyển đổi sang Mô hình Đèn Tiêu hao Nhiên liệu (Integer Tick-Units) và Luật Thắng Giữ Đảo Sáng Tới Bình Minh

- **Trạng thái:** Đã chấp nhận & Triển khai (Phase 3 · `Test Contract v1.2`)
- **Ngày:** 2026-11-20
- **Bối cảnh:** `TICKET-03 — Change Request "Đèn cạn dầu"` thay thế hai cơ chế cốt lõi của Phase 1–2: (1) Đèn đã thắp sáng không còn sáng vĩnh viễn mà tiêu hao nhiên liệu theo thời gian và bị Bóng Mực hút dầu (`drain`); (2) Mục tiêu chiến thắng chuyển từ *"thắp sáng hết tất cả đèn để thắng ngay (`all_lit`)"* sang *"duy trì tối thiểu 60% số đèn đang sáng khi bình minh tới (`dawn_survived`)"*.

---

## 1. Quyết định Thiết kế

### 1.1. Biểu diễn nhiên liệu đèn bằng số nguyên đơn vị `1/60` (`fuel_ticks`)
- **Vấn đề:** Mỗi tick (`1/60 s`), đèn đang sáng tự hao `1/60` đơn vị dầu và mỗi Bóng Mực ở trạng thái `drain` hút thêm `5/60` đơn vị dầu. Nếu cộng/trừ trực tiếp bằng số thực IEEE-754 (`float += -1.0/60.0`), sai số tích lũy qua `18.000 tick` sẽ làm lệnh so sánh ngưỡng `fuel >= 30`, `fuel <= 0`, hoặc `ceil((100 - fuel) / 10)` bị lệch 1 tick giữa các nền tảng hoặc thứ tự phép tính.
- **Quyết định:**
  - Lưu trữ nhiên liệu nội bộ của mỗi `Lantern` dưới dạng số nguyên **`fuel_ticks: int`** (đơn vị `1/60 fuel`), trong đó:
    - `fuel_max = 100` tương ứng `FUEL_TICKS_MAX = 6000`.
    - Ngưỡng yếu `low_fuel_threshold = 30` tương ứng `LOW_FUEL_TICKS = 1800` (đúng `1800` vẫn giữ vùng an toàn `6.0m`; `< 1800` mất vùng an toàn).
    - Mỗi tick ở Bước 2: đèn đang sáng trừ `1 + 5 * num_draining_shades` khỏi `fuel_ticks`.
    - Phép tính số đom đóm cần khi châm dầu `ceil((100 - fuel) / 10)` được tính chính xác tuyệt đối bằng số nguyên:
      ```python
      missing_ticks = max(0, 6000 - lan.fuel_ticks)
      needed_motes = (missing_ticks + 599) // 600
      used = min(self.player.carried, needed_motes)
      lan.fuel_ticks = min(6000, lan.fuel_ticks + 600 * used)
      ```
  - Chỉ khi xuất ra `snapshot`, sự kiện (`refuel`, `fuel_drain`), hoặc tính điểm bình minh `floor(fuel)`, giá trị mới được chuyển sang đơn vị `fuel`:
    - Khi xuất JSON: `round(lan.fuel_ticks / 60.0, 1)` (đèn tắt xuất `0.0`).
    - Khi tính thưởng bình minh `floor(fuel)`: `lan.fuel_ticks // 60`.

### 1.2. Máy trạng thái Đèn Lồng Lớn & Tương tác Hợp nhất (`deposit` / `relight` / `refuel`)
- Mỗi `Lantern` có 3 trạng thái logic rõ ràng:
  1. **Unlit-New (`lit=False, ever_lit=False`):** Cần `lantern_cost = 10` đom đóm. Khi đủ `10`, chuyển sang `Lit` với `fuel_ticks = 6000`, `ever_lit = True`, phát `lantern_lit {lantern_id, relight: False}`, cộng `+100` điểm, tăng `successful_lights += 1`.
  2. **Lit (`lit=True, 0 < fuel_ticks <= 6000`):**
     - Chỉ nhận tương tác châm dầu khi `fuel_ticks < 6000` (`used > 0`), phát `refuel {lantern_id, amount, fuel}`.
     - Có vùng an toàn `6.0m` khi và chỉ khi `fuel_ticks >= 1800` (`fuel >= 30`). Khi được châm dầu từ `< 30` lên `>= 30`, Bước 6 (`_step_safe_zones`) tự động đẩy mọi Bóng Mực trong vùng `6.0m` ra mép trong `<= 30 tick` và khóa sát thương của chúng khi còn ở trong vùng.
     - Ngay sau Bước 2, nếu `fuel_ticks <= 0`: chuyển sang `Unlit-EverLit` (`lit=False, fuel_ticks=0, deposited=0, ever_lit=True`) và phát `lantern_out {lantern_id}`.
  3. **Unlit-EverLit (`lit=False, ever_lit=True`):** Chỉ cần `relight_cost = 5` đom đóm để thắp lại. Khi đủ `5`, chuyển sang `Lit` với `fuel_ticks = 6000`, `relit_count += 1`, phát `lantern_lit {lantern_id, relight: True}`, cộng `+40` điểm, tăng `successful_lights += 1`.

### 1.3. Mở rộng Máy trạng thái Bóng Mực với `drain` và Luật Thắng Bình Minh (`dawn_survived`)
- Bóng Mực có 6 trạng thái: `spawning, wander, chase, recoil, stunned, drain`.
- Khi kết thúc `stunned` (`state_ticks_left <= 0`), Bóng Mực luôn chuyển về `wander`.
- Ở Bước 8, Bóng Mực đang ở `wander` tìm mục tiêu theo thứ tự ưu tiên:
  1. Đèn đang sáng nhưng yếu (`lit and fuel_ticks < 1800`) gần nhất (bằng nhau chọn `id` nhỏ hơn). Nếu khoảng cách `XZ <= 2.0m`, chuyển sang `drain` và đứng yên.
  2. Nếu không có đèn yếu nào, đi về phía đèn đang tắt (`not lit`) gần nhất (bằng nhau chọn `id` nhỏ hơn).
- Ở Bước 11 (xét thắng/thua cuối tick):
  1. Kiểm tra `player.flames <= 0` **trước tiên** (kể cả ở tick bình minh) $\rightarrow$ thua `no_flames`.
  2. Không còn kiểm tra thắng sớm khi tất cả đèn sáng.
  3. Khi `time_left_s <= 0`: đếm số đèn `lan.lit == True`. Nếu `lit_count >= math.ceil(0.6 * len(lanterns))` (`3/5`, `4/6`, `5/7`), Mây thắng với `reason: "dawn_survived"` và nhận thưởng bình minh (`+50 + (lan.fuel_ticks // 60)` cho mỗi đèn sáng, `+50` cho mỗi Ngọn lửa còn lại); ngược lại thua với `reason: "dawn"`.

---

## 2. Hệ quả & Cập nhật Kiểm thử
- Loại bỏ hoàn toàn sai số dấu phẩy động trong chu kỳ trừ dầu/hút dầu 60 tick/s.
- Các bài test cũ của Phase 1–2 kiểm tra thắng sớm `all_lit`, công thức điểm cũ (`+10/mote`, thưởng thời gian) hoặc đèn sáng không nhận thêm đom đóm được cập nhật sang luật `Contract v1.2` và ghi rõ lý do trong [`docs/notes/phase-3.md`](../notes/phase-3.md) cùng [`CHANGELOG.md`](../../CHANGELOG.md).
