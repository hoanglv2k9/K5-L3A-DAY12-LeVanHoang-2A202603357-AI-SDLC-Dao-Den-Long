# AGENTS.md — Quy tắc dành cho AI Agent (Đảo Đèn Lồng · Contract v1.2)

Tệp này định nghĩa các bất biến kỹ thuật mà mọi AI agent bắt buộc tuân thủ khi sửa đổi kho mã này.

## 1. Kiến trúc & Single Source of Truth
- **`game.contract.json`** (`contract_version: "1.2"`) là nguồn sự thật duy nhất (Single Source of Truth) cho toàn bộ thông số tuning (`player_speed`, `dash_speed`, `dash_duration_s`, `dash_cooldown_s`, `carry_capacity`, `capacity_max`, `lantern_cost`, `relight_cost`, `fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `low_fuel_threshold`, `drain_per_s`, `win_ratio`, `pickup_radius`, `interact_radius`, `pulse_cost`, `pulse_radius`, `night1_duration_s`, `night2_duration_s`, `night3_duration_s`, `flames`, `invuln_s`, `hit_drop_ratio`, `pulse_stun_s`, `pulse_push_m`, `pulse_cooldown_s`, `safe_radius`, `shade_speed`, `shade_hit_radius`, `fall_enabled`, `score`).
- **Cấm tuyệt đối** hardcode các con số tuning này trong `src/` hoặc `web/` khác với `game.contract.json`.
- Lõi mô phỏng nằm trong `src/core/` (Python 3 stdlib thuần, không phụ thuộc WebGL/DOM).

## 2. Hợp đồng Kiểm thử Tự động (Test Contract v1.2)
- Nhịp mô phỏng cố định: **60 tick = 1 giây** (`dt = 1/60 s`).
- Lệnh CLI bắt buộc hoạt động trên macOS, Linux, Windows (`--night 1|2|3`):
  ```bash
  python3 -m src.headless --seed <int> --night <1|2|3> [--scenario <file.json>] [--inputs <file.json>] --ticks <int> --out <file.jsonl> [--snapshot-every <int>]
  ```
- Thứ tự 12 bước mỗi tick bắt buộc (Ticket-02 + bổ sung Ticket-03):
  1. Đọc input (`pause` xử lý trước; khi đang `paused`, `tick` tăng nhưng `sim_tick`, thời gian, cooldown, TTL, fuel đứng yên, snapshot ghi `state="paused"`).
  2. Giảm bộ đếm (thời gian, hồi chiêu, bất tử, choáng/lùi, bùa, TTL đom đóm rơi, hồi bùa) **và trừ dầu đèn đang sáng** (`1/60` tự hao + `5/60` cho mỗi Bóng Mực đang `drain` đèn đó, phát `fuel_drain` mỗi `60 tick` hút). **Ngay sau bước 2**, đèn có `fuel <= 0` tắt (`lit=false, fuel=0, deposited=0, ever_lit=true`, phát `lantern_out`).
  3. Di chuyển Mây (nhảy, lướt, bệ nhảy, gió mạnh) và kiểm tra rơi khỏi đảo (`Y < -10`).
  4. Nhặt đom đóm (tối đa `capacity = min(20, 10 + 2 * successful_lights)`) và Bùa Gió.
  5. Tương tác đèn lồng (`interact`): chỉ xét đèn nhận được (`not lit` hoặc `lit and fuel < 100`), gần nhất, bằng nhau chọn `id` nhỏ hơn. Đèn tắt chưa từng sáng cần `10` đom đóm (`+100` điểm, `relight: false`), đèn tắt đã từng sáng (`ever_lit`) cần `5` đom đóm (`+40` điểm, `relight: true`); mỗi lần thắp thành công tăng `successful_lights += 1`. Đèn đang sáng chưa đầy dầu thì châm dầu (`refuel`, `+10 fuel/đom đóm`, tối đa `100`). Mỗi đom đóm nạp (`deposit` hoặc `refuel`) cộng `+5` điểm.
  6. Cập nhật vùng an toàn (`safe_radius = 6.0m`, chỉ đèn sáng có `fuel >= 30` mới có vùng an toàn; đẩy Bóng Mực bên trong ra mép trong `<= 30 tick`).
  7. Tỏa sáng (`pulse`): tốn `3` đom đóm, bán kính 3D `5.0m` từ `chân + 0.8m`, choáng `120 tick` (hết choáng về `wander`), đẩy lùi `4.0m` trong `15 tick` đầu; cộng `+5` điểm mỗi Bóng Mực trúng (`+15` nếu ngay trước đó đang `drain`).
  8. Di chuyển Bóng Mực (`spawning, wander, chase, recoil, stunned, drain`) và Gió Lạc (`idle, chase, flee, removed`). Bóng Mực ở `wander` ưu tiên đi tới đèn sáng có `fuel < 30` gần nhất; khi cách `<= 2.0m` (XZ) chuyển sang `drain`.
  9. Va chạm: Gió Lạc cướp trước (`drifter_steal`), Bóng Mực đánh sau (`player_hit`, tối đa mất 1 lửa/tick).
  10. Sinh thực thể theo lịch (chỉ tương tác từ tick kế tiếp).
  11. Xét thắng / thua: hết Ngọn Lửa luôn thua `no_flames` trước (ngay lập tức, kể cả ở tick cuối); khi hết giờ (`time_left_s <= 0`), nếu số đèn đang sáng `>= ceil(0.6 * tổng đèn)` (`3/5`, `4/6`, `5/7`) thì thắng `dawn_survived` (thưởng `+50 + floor(fuel)` mỗi đèn sáng và `+50` mỗi lửa còn lại), ngược lại thua `dawn`. Không còn thắng sớm `all_lit`.
  12. Xuất snapshot nếu đến kỳ.
- Tính tất định (Determinism): Cùng `--seed`, `--night`, `--scenario`, `--inputs`, `--ticks` phải sinh file `.jsonl` giống hệt từng byte.
- Khi đầu vào sai định dạng: thoát với **mã khác 0 (exit code 2)** và ghi rõ lý do ra `stderr`.

## 3. Quy trình Kiểm chứng Bắt buộc trước khi Commit
- Luôn chạy `python3 scripts/verify_all.py` (hoặc `python scripts/verify_all.py` trên Windows) và đảm bảo **100% test PASS** trước mọi commit.
- Mọi tính năng sáng tạo trong `web/` chỉ là hình ảnh/âm thanh/trải nghiệm, không được thay đổi kết quả hay schema của chế độ `--headless`.
