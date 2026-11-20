# Phase 2 Notes — Ticket-02 ("Ba hòn đảo") & Test Contract v1.1

## 1. Đối chiếu & Cập nhật Giả định từ Phase 1 sang Phase 2

Ticket-02 chuẩn hóa toàn bộ thông số và mở rộng game lên 3 Đêm. Bảng dưới đây ghi rõ những giả định ở Phase 1 đã được Ticket-02 thay thế/làm rõ và lý do cập nhật test:

| Hạng mục | Giả định Phase 1 (v1.0) | Chuẩn hóa Ticket-02 (v1.1) | Cập nhật Thiết kế & Test |
|---|---|---|---|
| Sức chứa & chi phí đèn | `carry_capacity=6`, `lantern_cost=4` | `carry_capacity=10`, `lantern_cost=10` | Cập nhật `game.contract.json` và kịch bản `win_scenario.json` (`L1` đã có `deposited=6`, nhặt 4 đom đóm nạp đủ `10/10`). |
| Bán kính nhặt & nạp | `pickup_radius=1.5m`, `interact_radius=2.5m` | `pickup_radius=1.0m` (kèm `|dy|<=1.5m`), `interact_radius=2.0m` | Thêm kiểm tra chênh cao `|dy|<=1.5m` khi nhặt đom đóm/bùa và chạm Bóng Mực. |
| Tỏa sáng (`pulse`) | `cost=2, radius=6.0m, stun=2.5s, push=4m tức thời, per_stun=25` | `cost=3, 3D radius=5.0m` từ `chân + 0.8m`, `stun=120 tick (2.0s)`, đẩy lùi `4.0m` chia đều trong **15 tick đầu**, `per_stun=5` | Chuyển đẩy lùi tức thời sang dịch chuyển `4/15 m/tick` trong 15 tick đầu của trạng thái `stunned`; cập nhật test `test_pulse_stuns_pushes_over_15_ticks_and_enforces_cooldown`. |
| Vùng an toàn đèn | `safe_radius=5.0m` | `safe_radius=6.0m`; bóng đang ở trong lúc đèn vừa thắp bị đẩy ra mép trong tối đa 30 tick và không gây sát thương | Cập nhật `safe_radius=6.0m`, tốc độ đẩy ra mép `>= 0.20 m/tick` và vô hiệu hóa hit khi bóng đang trong `safe_radius`. |
| Bóng Mực (`shades`) | `speed=3.5m/s`, sinh đầu trận, trạng thái `chase/flee/stunned` | `speed=4.0m/s` (Đêm 3: `4.5m/s`), phát hiện `12m` / bỏ đuổi `18m`, chạm gây `recoil` lùi `2m` trong `60 tick`, sinh 2 con tại `tick 300` + chu kỳ `480/420/360 tick`, trạng thái chuẩn: `spawning, wander, chase, recoil, stunned` | Chuẩn hóa máy trạng thái 5 state; cập nhật test kiểm tra state `recoil` sau khi chạm Mây và lịch sinh `shade_spawned`. |
| Điểm đom đóm (`per_mote`) | Cộng `+10` lúc nhặt | Cộng `+10` mỗi đom đóm **nạp vào đèn** (`deposit`) | Chuyển cộng điểm `per_mote * amount` sang bước `deposit`; cập nhật `test_mote_pickup_capacity_and_deposit_scoring`. |
| Rơi khỏi đảo (`fall_enabled`) | `false` (do v1.0 chưa quy định bán kính đảo) | `true` (`Y < -10`): đảo Đêm 1 bán kính `40m`, Đêm 2 hai đảo `28m` + cầu tre, Đêm 3 đảo `45m` 3 tầng. Rơi trừ 1 lửa (bỏ qua bất tử), mất hết đom đóm (`lost`), chờ `60 tick` rồi hồi sinh tại `(0,0,0)` bất tử `90 tick` (nếu hết lửa thì thua ngay) | Bật vật lý rơi ngoài mép đảo/cầu/tầng và bổ sung test rơi khỏi đảo (`test_fall_off_island_loses_all_motes_waits_60_ticks_and_respawns`). |

## 2. Yêu cầu mới ở Phase 2 & Kế hoạch kiểm chứng

| Mã | Yêu cầu Ticket-02 / Contract v1.1 | Cách kiểm chứng |
|---|---|---|
| R2-01 | Lướt (`dash`): `14 m/s`, `0.2s (12 tick)`, hồi chiêu `1.5s (90 tick từ lúc bắt đầu)`, giữ độ cao trên không, phát event `dash` | Unit test `test_dash_speed_duration_cooldown_and_midair_constant_y` |
| R2-02 | Tạm dừng (`pause`): `tick` tăng nhưng `sim_tick`, thời gian, cooldown, TTL đứng yên; snapshot `state="paused"`; phát `paused` / `resumed` | Unit test `test_pause_freezes_sim_tick_and_timers` + kịch bản CLI `night3_wind_fall` |
| R2-03 | Rơi khỏi đảo (`Y < -10`): bỏ qua bất tử, `-1` lửa, mất toàn bộ đom đóm (`lost`), chờ 60 tick rồi hồi sinh `(0,0,0)` bất tử 90 tick | Unit test `test_fall_off_island_loses_all_motes_waits_60_ticks_and_respawns` + kịch bản CLI `night3_wind_fall` |
| R2-04 | Gió Lạc (`drifters`): sinh ở `1200, 2400...` (Đêm 2 & 3), `idle -> chase` khi Mây mang `>= 5` và cách `<= 15m`, chạm `XZ <= 1.2m` cướp `min(3, carried)` (`drifter_steal`), trúng Pulse lúc `flee` có đồ sẽ thả lại thành đom đóm rơi (`drifter_drop`) | Unit test `test_drifter_steal_and_pulse_drop_night2` + kịch bản CLI `night2_drifter_charm` |
| R2-05 | Bùa Gió (`charms`): Đêm 2 `(35,0,0)`, Đêm 3 `(30,0,25)` & `(-30,0,25)`, hiệu lực `600 tick` (tốc độ `7.2 m/s`, Lướt không hồi chiêu), hồi lại sau `2700 tick`, phát `charm_picked` | Unit test `test_wind_charm_speed_zero_dash_cd_and_respawn` + kịch bản CLI `night2_drifter_charm` |
| R2-06 | Bản đồ Đêm 2 (Đảo Cau: 2 đảo `r=28m`, cầu tre, 2 bục nhảy bắn `vy=14, vh=24`, 6 đèn) & Đêm 3 (Đảo Chuông: 3 tầng `Y=0/3/6`, 2 dốc `30°/150°`, bục nhảy `(0,3,13)`, tháp chuông, gió mạnh mỗi 30s, 7 đèn) | Unit test `test_night2_jump_pad_and_night3_tiers_and_strong_wind` + 3D WebGL (`web/game.js`) |
| R2-07 | Hiệu năng headless: chạy 1 Đêm đầy đủ (`21.600 tick`) hoàn tất trong `<= 30 giây` | Benchmark tự động trong `scripts/verify_all.py --phase 2` |

## 3. Kết quả Kiểm chứng Phase 2, Nhật ký Lỗi AI & Token

### 3.1. Kết quả chạy `python3 scripts/verify_all.py --phase 2`
- **Unit & Integration Tests:** `22/22 passed` trong `3.116s`.
- **7 Kịch bản Headless (`docs/proof/phase-2/*.jsonl`):**
  - `win.jsonl` (Đêm 1): `state="won"`, `ticks=116`, `score=886`
  - `pulse_stun.jsonl` (Đêm 1): `state="playing"`, `ticks=60`, `score=5`
  - `safe_zone.jsonl` (Đêm 1): `state="playing"`, `ticks=240`, `score=0` (0 lần bị chạm trong vùng an toàn `6.0m`)
  - `loss_flames.jsonl` (Đêm 1): `state="lost"`, `ticks=15`, `reason="no_flames"`
  - `loss_dawn.jsonl` (Đêm 1): `state="lost"`, `ticks=120`, `reason="dawn"`
  - `night2_drifter_charm.jsonl` (Đêm 2): `state="playing"`, `ticks=60`, kiểm chứng `charm_picked`, `drifter_steal`, `drifter_drop`, `dash`
  - `night3_wind_fall.jsonl` (Đêm 3): `state="playing"`, `ticks=120`, kiểm chứng `paused`, `resumed`, và `player_hit` (`by="fall", lost=5`)
- **Tính tất định (Determinism):** Chạy 2 lần độc lập `--seed 2026 --night 3 --ticks 600` cho mã băm SHA-256 trùng khớp 100%: `561bd895cdcd0ae3d75138e31a69933b30f6f20cbde3ac3641f5d9f8c0cf15c8`.
- **Benchmark hiệu năng 21.600 tick (360s Đêm 3):** Hoàn tất trong **`1.2s`** (nhanh gấp 25 lần so với ngưỡng tối đa `30.0s` của Contract v1.1).
- **Negative test (`bad_inputs.json`):** Thoát mã **`2`** kèm thông báo lỗi trên `stderr`.

### 3.2. Nhật ký lỗi AI & Cách khắc phục ở Phase 2
1. **Chuyển đẩy lùi của Tỏa sáng (`pulse_push_m = 4.0m`) từ tức thời sang 15 tick đầu:**
   - *Vấn đề:* Ở Phase 1, Bóng Mực bị dịch chuyển ngay `4.0m` trong cùng 1 tick với sự kiện `pulse`. Ticket-02 quy định đẩy lùi `4.0m` chia đều trong **15 tick đầu** của trạng thái `stunned` (`4/15 m/tick`) và dừng nếu gặp vật cản.
   - *Khắc phục:* Thêm `push_ticks_left = 15` cho mỗi `Shade` trúng Pulse; trong Bước 8 (`_step_move_shades_and_drifters`), mỗi tick `stunned` còn `push_ticks_left > 0` sẽ dịch chuyển `4/15 m` và kiểm tra va chạm vách đá/tháp chuông (`_is_blocked_by_cliff_or_tower`).
2. **Thứ tự va chạm trong Bước 9 (Gió Lạc cướp trước, Bóng Mực đánh sau):**
   - *Vấn đề:* Nếu Bóng Mực đánh rơi `floor(carried/2)` trước khi Gió Lạc cướp trong cùng 1 tick thì số đom đóm bị cướp sẽ sai lệch.
   - *Khắc phục:* Tuân thủ đúng thứ tự 12 bước của Ticket-02 Phần 1: duyệt `drifters` theo `id` tăng dần trước để xử lý `drifter_steal`, sau đó mới duyệt `shades` theo `id` tăng dần để xử lý `player_hit` (tối đa mất 1 Ngọn lửa mỗi tick).

### 3.3. Ước tính Token & Chi phí Phase 2
| Hạng mục | Số lượt prompt / tool call | Token Input (ước tính) | Token Output (ước tính) | Ghi chú |
|---|---:|---:|---:|---|
| Đọc & phân tích Ticket-02 + Contract v1.1 (8 trang) | 3 | ~14.000 | ~2.500 | Trích xuất bảng thông số, tọa độ 3 đảo, schema v1.1 |
| Nâng cấp `src/core/engine.py`, `contract.py`, `headless.py` | 4 | ~18.000 | ~6.500 | Đủ 3 Đêm, 12 bước tick, Dash, Pause, Fall, Drifter, Charm, Wind |
| Nâng cấp bản 3D WebGL (`web/index.html`, `style.css`, `game.js`) | 3 | ~16.000 | ~8.500 | Bảng màu chuẩn, HUD 10 ô, mũi tên chỉ đèn khuất, chiến dịch 3 Đêm |
| Cập nhật unit/CLI test, benchmark 21.600 tick & tài liệu | 4 | ~14.000 | ~4.500 | `22/22` test xanh, `perf=1.2s` |
| **Tổng Phase 2** | **14** | **~62.000** | **~22.000** | Tiết kiệm token nhờ tách rõ lõi Python và UI 3D |
