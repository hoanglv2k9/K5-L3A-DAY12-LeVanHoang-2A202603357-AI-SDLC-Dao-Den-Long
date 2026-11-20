# Phase 3 Notes — Ticket-03 ("Đèn cạn dầu" · Change Request) & Test Contract v1.2

## 1. Bảng Thay Thế Luật Cũ (`[THAY THẾ]`) từ Phase 2 (v1.1) sang Phase 3 (v1.2)

`TICKET-03` là một **Change Request** thay đổi trực tiếp các luật cốt lõi. Bảng dưới đây ghi rõ từng luật cũ bị thay thế, luật mới trong `Contract v1.2`, quyết định thiết kế (xem chi tiết tại [`docs/adr/0001-lantern-fuel-and-dawn-survival.md`](../adr/0001-lantern-fuel-and-dawn-survival.md)) và lý do cập nhật test:

| Hạng mục | Luật cũ ở Phase 2 (v1.1) | Luật mới ở Phase 3 (v1.2 · `[THAY THẾ]`) | Quyết định Thiết kế & Cập nhật Test |
|---|---|---|---|
| Trạng thái Đèn Lồng Lớn | Đèn đã sáng là sáng vĩnh viễn, không nhận thêm đom đóm | Đèn vừa thắp có `fuel = 100`, tự hao `1.0 fuel/s` (`1/60` mỗi tick ở Bước 2). Khi `fuel <= 0` ngay sau Bước 2, đèn tắt (`lit=false, deposited=0, ever_lit=true`), phát `lantern_out`. Đèn từng sáng (`ever_lit=true`) chỉ cần **`5` đom đóm** để thắp lại (`relight: true`). Đèn đang sáng chưa đầy dầu nhận tương tác châm dầu (`used = min(carried, ceil((100 - fuel)/10))`), phát `refuel` | Lưu nhiên liệu nội bộ theo đơn vị nguyên `1/60` (`fuel_ticks: 0..6000`) để triệt tiêu sai số số thực; bổ sung test `test_lantern_fuel_decay_refuel_lantern_out_and_relight_cost_5`. |
| Vùng an toàn & Bóng Mực hút dầu (`drain`) | Mọi đèn sáng đều có vùng an toàn `6.0m`; Bóng Mực không bao giờ vào vùng an toàn | Đèn có `fuel < 30` **mất vùng an toàn** (đúng `30` vẫn còn). Bóng Mực ở `wander` ưu tiên tìm đèn sáng có `fuel < 30` gần nhất; khi cách `<= 2.0m (XZ)` chuyển sang trạng thái mới **`drain`**, đứng yên hút `5.0 fuel/s` (`5/60` mỗi tick, cộng dồn), phát `fuel_drain` mỗi `60 tick` hút. Hết choáng (`stunned`) luôn về `wander` | Mở rộng máy trạng thái Bóng Mực lên 6 state (`spawning, wander, chase, recoil, stunned, drain`); bổ sung test `test_shade_drain_weak_lantern_pulse_bonus_15_and_safe_zone_threshold_30`. |
| Luật thắng & Thời lượng Đêm | Thời lượng `300 / 330 / 360s`; thắp đủ toàn bộ đèn là thắng ngay lập tức (`reason: "all_lit"`) | Thời lượng rút xuống **`240 / 270 / 300s`**. **Bỏ thắng sớm `all_lit`**. Mây thắng khi còn sống lúc bình minh (`time_left_s == 0, flames > 0`) và số đèn đang sáng `>= ceil(0.6 * tổng đèn)` (`3/5`, `4/6`, `5/7`), phát `game_over {result: "won", reason: "dawn_survived"}`. Hết lửa luôn thua `no_flames` trước (kể cả ở tick cuối) | Cập nhật test `test_deposit_nearest_lantern_and_win_scoring` thành `test_dawn_survived_win_replaces_early_all_lit_and_dawn_loss_below_threshold` và kịch bản `win_scenario.json` sang kiểm chứng `dawn_survived` (ghi rõ lý do trong docstring & `CHANGELOG.md`). |
| Sức chứa đom đóm (`capacity`) | Cố định `10` suốt cả Đêm | Tăng dần: `capacity = min(20, 10 + 2 * successful_lights)` (reset về `10` đầu mỗi Đêm; đèn đặt sẵn `lit: true` bằng scenario không tính) | Thêm trường `player.capacity` vào snapshot và thanh 10..20 ô đom đóm động trên HUD; bổ sung test `test_progressive_carry_capacity_up_to_20`. |
| Công thức tính điểm | `+10/mote` nạp, `+100/lantern`, `+5/stun`, thưởng thời gian `+2/s`, thưởng lửa `+50/flame` | `+5/mote` nạp (thắp mới, thắp lại hoặc châm dầu), `+100` thắp đầu, `+40` thắp lại, `+5/stun` (`+15` nếu đang `drain`), **bỏ thưởng thời gian**, thưởng bình minh khi thắng: `+50 + floor(fuel)` mỗi đèn đang sáng và `+50` mỗi lửa còn lại | Cập nhật `game.contract.json` (`score`) và toàn bộ assertion điểm số trong unit/CLI test. |
| Hỗ trợ tiếp cận (Accessibility) | Bảng màu chuẩn duy nhất | Thêm **"Bảng màu dễ phân biệt" (Chế độ mù màu)** lưu trong `localStorage`: mắt/viền Bóng Mực đổi sang `#00B3FF`, cảnh báo UI đổi sang `#FFFFFF` kèm `⚠`, đèn tắt bị xẹp `20%` kèm vết rách trên giấy, đèn `fuel < 30` nhấp nháy chậm `1 Hz` | Cập nhật `web/index.html`, `web/style.css`, `web/game.js`. |

---

## 2. Truy vết Yêu cầu Phase 3 sang Kiểm thử (`R3-01..R3-07`)

| Mã | Yêu cầu Ticket-03 / Contract v1.2 | Bài test / Kịch bản kiểm chứng |
|---|---|---|
| R3-01 | Nhiên liệu đèn (`fuel=100`, hao `1/60` mỗi tick, `refuel`, `lantern_out` khi `fuel<=0`, `relight_cost=5`, `lantern_lit.relight`) | `test_lantern_fuel_decay_refuel_lantern_out_and_relight_cost_5` + CLI `phase3_fuel_drain_relight` |
| R3-02 | Bóng Mực hút dầu (`fuel < 30` mất vùng an toàn, `wander -> drain` ở `<= 2m`, hút `5/60` mỗi tick, `fuel_drain` mỗi 60 tick, hết choáng về `wander`) | `test_shade_drain_weak_lantern_pulse_bonus_15_and_safe_zone_threshold_30` + CLI `phase3_fuel_drain_relight` |
| R3-03 | Luật thắng mới (`240/270/300s`, không thắng sớm khi đủ đèn, thắng `dawn_survived` khi `>= ceil(0.6 * total)` đèn sáng lúc hết giờ) | `test_dawn_survived_win_replaces_early_all_lit_and_dawn_loss_below_threshold` + CLI `win_dawn_survived` |
| R3-04 | Sức chứa tăng dần (`capacity = min(20, 10 + 2 * successful_lights)`, đèn scenario không tính) | `test_progressive_carry_capacity_up_to_20` |
| R3-05 | Công thức điểm mới (`+5/mote`, `+100` thắp đầu, `+40` thắp lại, `+15` stun bóng đang `drain`, `+50 + floor(fuel)` mỗi đèn sáng lúc bình minh) | Kiểm chứng trong `test_lantern_fuel_decay...`, `test_shade_drain...`, `test_dawn_survived...` |
| R3-06 | Chế độ mù màu (`#00B3FF`, `#FFFFFF` + `⚠`, đèn tắt xẹp `20%` + vết rách, đèn yếu `< 30` nhấp nháy `1 Hz` + thanh nhiên liệu 3D) | Triển khai trong `web/index.html`, `web/style.css`, `web/game.js` |
| R3-07 | Tài liệu quản trị thay đổi: ADR + Changelog Breaking Changes + lý do cập nhật test cũ | [`docs/adr/0001-lantern-fuel-and-dawn-survival.md`](../adr/0001-lantern-fuel-and-dawn-survival.md), [`CHANGELOG.md`](../../CHANGELOG.md), tài liệu này |

---

## 3. Kết quả Kiểm chứng Phase 3, Nhật ký Lỗi AI & Token

### 3.1. Kết quả chạy `python3 scripts/verify_all.py --phase 3`
- **Unit & Integration Tests:** `24/24 passed` trong `3.583s`.
- **8 Kịch bản Headless (`docs/proof/phase-3/*.jsonl`):**
  - `win_dawn_survived.jsonl` (Đêm 1): `state="won"`, `ticks=180`, `score=677` (`reason="dawn_survived"` khi giữ `>= 3/5` đèn sáng tới hết giờ)
  - `phase3_fuel_drain_relight.jsonl` (Đêm 1): `state="playing"`, `ticks=160`, `score=85` (kiểm chứng đầy đủ `pulse` trên bóng `drain` `+15đ`, `lantern_lit(relight=true)` với `5` đom đóm `+40đ`, `refuel`, `fuel_drain` tại tick 60, và `lantern_out` khi cạn dầu)
  - `pulse_stun.jsonl` (Đêm 1): `state="playing"`, `ticks=60`, `score=5`
  - `safe_zone.jsonl` (Đêm 1): `state="playing"`, `ticks=240`, `score=0` (0 lần bị chạm trong vùng an toàn `6.0m` khi `fuel >= 30`)
  - `loss_flames.jsonl` (Đêm 1): `state="lost"`, `ticks=15`, `reason="no_flames"`
  - `loss_dawn.jsonl` (Đêm 1): `state="lost"`, `ticks=120`, `reason="dawn"` (số đèn sáng lúc hết giờ dưới ngưỡng `3/5`)
  - `night2_drifter_charm.jsonl` (Đêm 2): `state="playing"`, `ticks=60` (`charm_picked`, `drifter_steal`, `drifter_drop`, `dash`)
  - `night3_wind_fall.jsonl` (Đêm 3): `state="playing"`, `ticks=120` (`paused`, `resumed`, `player_hit(by="fall")`)
- **Tính tất định (Determinism):** Chạy 2 lần độc lập `--seed 2026 --night 3 --ticks 600` cho mã băm SHA-256 trùng khớp 100%: `298c2bccd627e17d3171a078cb35e027fbd320b9fb6cbaae8c30a5fee0940c97`.
- **Benchmark hiệu năng 21.600 tick (Đêm 3):** Hoàn tất trong **`2.886s`** (`<= 30.0s`).
- **Negative test (`bad_inputs.json`):** Thoát mã **`2`** kèm thông báo lỗi trên `stderr`.

### 3.2. Nhật ký lỗi AI & Cách khắc phục ở Phase 3
1. **Sai số số thực khi trừ dầu `1/60` và hút dầu `5/60` mỗi tick:**
   - *Vấn đề:* Nếu lưu `fuel` bằng `float` và trừ `1.0 / 60.0` mỗi tick, sau nhiều tick giá trị `fuel` bị lệch `1e-13`, dẫn tới `ceil((100 - fuel) / 10)` bị tăng thừa 1 đom đóm hoặc lệch thời điểm phát `lantern_out`.
   - *Khắc phục:* Ghi nhận trong [`ADR 0001`](../adr/0001-lantern-fuel-and-dawn-survival.md): lưu nhiên liệu nội bộ bằng số nguyên `fuel_ticks` (`100 fuel = 6000 ticks`, tự hao `-1/tick`, mỗi Bóng Mực `drain` trừ `-5/tick`, mỗi đom đóm châm dầu cộng `+600 ticks`), chỉ làm tròn `round(fuel_ticks / 60.0, 1)` khi xuất ra JSON.
2. **Thứ tự tương tác giữa Tỏa sáng (`pulse`, Bước 7) và chuyển trạng thái `drain -> chase` (Bước 8):**
   - *Vấn đề:* Nếu Mây bước vào phạm vi `<= 6.0m` của một Bóng Mực đang `drain` trước tick bấm `pulse`, ở Bước 8 của tick di chuyển đó Bóng Mực đã chuyển từ `drain` sang `chase`, làm lần bấm `pulse` ở tick sau chỉ nhận `+5` thay vì `+15`.
   - *Khắc phục:* Giữ đúng thứ tự 12 bước (Bước 7 `_step_light_pulse` chạy trước Bước 8 `_step_move_shades_and_drifters`), đồng thời trong kịch bản kiểm thử `phase3_fuel_drain_relight` tách riêng Bóng Mực `S2` (đang `drain` trong bán kính `5.0m` để kiểm chứng `pulse` nhận `+15` ở Bước 7) và Bóng Mực `S1` (đang `drain` ở xa `> 6.0m` để kiểm chứng `fuel_drain` mỗi 60 tick và `lantern_out`).

### 3.3. Ước tính Token & Chi phí Phase 3
| Hạng mục | Số lượt prompt / tool call | Token Input (ước tính) | Token Output (ước tính) | Ghi chú |
|---|---:|---:|---:|---|
| Đọc & phân tích Ticket-03 + Contract v1.2 (6 trang) | 2 | ~10.000 | ~2.200 | Lập bảng thay thế luật, ADR 0001, Changelog |
| Nâng cấp `src/core/engine.py`, `contract.py`, `game.contract.json` | 4 | ~16.000 | ~6.200 | Nhiên liệu nguyên `1/60`, `drain`, `refuel`, `relight`, `dawn_survived`, `capacity` |
| Nâng cấp 3D WebGL (`web/index.html`, `style.css`, `game.js`) | 3 | ~15.000 | ~7.800 | Thanh dầu 3D, nhấp nháy `1 Hz`, đèn tắt xẹp 20% + vết rách, chế độ mù màu |
| Cập nhật unit/CLI test, kịch bản Phase 3 & tài liệu | 4 | ~13.000 | ~4.600 | `24/24` test xanh, `perf=2.886s` |
| **Tổng Phase 3** | **13** | **~54.000** | **~20.800** | Kiến trúc tách lõi giúp cập nhật Change Request nhanh và không vỡ cấu trúc |
