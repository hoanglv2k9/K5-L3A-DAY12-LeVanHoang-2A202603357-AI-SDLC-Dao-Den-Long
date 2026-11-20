# Phase 1 Notes — PRD-0 & Test Contract v1.0

## 1. Phân tích yêu cầu & Tiêu chí nghiệm thu

| Mã | Yêu cầu từ PRD-0 / Contract v1.0 | Tiêu chí nghiệm thu kiểm chứng được |
|---|---|---|
| R1-01 | Đêm 1 (Đảo Bến): đảo tròn có 5 Đèn Lồng Lớn (`L1`..`L5`) | Snapshot tick 0 chứa đúng 5 đèn `L1`..`L5` tại mặt đất `Y=0`. |
| R1-02 | Mây di chuyển 3D, nhảy, xoay theo `cam_yaw_deg` | Vector `move=[x,z]` xoay đúng công thức `x'=x cosθ + z sinθ`, `z'=-x sinθ + z cosθ`, chuẩn hoá nếu dài > 1; nhảy nâng `y > 0` rồi rơi về `y = 0`. |
| R1-03 | Đom đóm rải rác & nhặt được tới `carry_capacity` | Khi `dist_xz(player, mote) <= pickup_radius` và `carried < carry_capacity`: nhặt đom đóm, tăng `carried`, cộng `score.per_mote`, phát event `mote_picked`. |
| R1-04 | Nạp ánh sáng vào đèn & thắp sáng khi đủ `lantern_cost` | Rising-edge `interact` trong `interact_radius` chuyển `min(carried, needed)` vào đèn gần nhất chưa sáng → event `deposit`; khi `deposited == lantern_cost` → `lit=true`, cộng `score.per_lantern`, phát `lantern_lit`. |
| R1-05 | Bóng Mực đuổi người chơi, chạm gây mất máu & rơi đom đóm, bất tử `invuln_s` | Shade di chuyển tốc độ `shade_speed`; khi `dist_xz <= shade_hit_radius` và hết `invuln_s` → giảm 1 `flames`, rơi `floor(carried * hit_drop_ratio)`, phát `player_hit`. |
| R1-06 | Bóng Mực sợ đèn sáng (`safe_radius`) | Bóng Mực không thể đi vào vùng `dist_xz <= safe_radius` quanh bất kỳ đèn nào đã `lit=true`; nếu đang ở trong sẽ lùi ra (`state="flee"`). |
| R1-07 | Tỏa sáng (`pulse`) tiêu hao `pulse_cost`, cooldown, choáng & đẩy lùi | Rising-edge `pulse` khi `carried >= pulse_cost` và hết `pulse_cooldown_s` → trừ `pulse_cost`, mọi Shade trong `pulse_radius` chuyển `state="stunned"` trong `pulse_stun_s`, bị đẩy ra `pulse_push_m` mét, cộng `score.per_stun`/con, phát `pulse`. |
| R1-08 | Thắng / Thua / Điểm / Chơi lại | Sáng hết 5 đèn → `won` (`all_lit`) + thưởng `floor(time_left_s)*per_second_left + flames*per_flame_left`; `flames==0` → `lost` (`no_flames`); hết `night1_duration_s` → `lost` (`dawn`); có nút chơi lại trên UI. |
| R1-09 | Chế độ headless chuẩn Test Contract v1.0 & tất định | 60 tick/s, snapshot tick 0 trước input, event ghi `tick=k+1`, dòng `end` cuối, tọa độ làm tròn 3 chữ số thập phân; chạy 2 lần cùng seed/scenario/inputs ra file JSONL giống nhau từng byte; file lỗi thoát mã `2`. |
| R1-10 | Giao diện 3D + HUD + phong cách cổ tích đêm ấm áp | Three.js 3D: Mây đội nón lá treo đèn, đảo sáng dần theo số đèn sáng, màu vàng cam ấm vs tím đen, HUD đủ chỉ số, không máu me. |

## 2. Giả định cho các chỗ mơ hồ trong PRD-0

1. **Nền tảng chạy trên macOS/Linux (`build_cmd` / `run_cmd` / `headless_cmd`):** Chọn **Python 3 stdlib** cho toàn bộ logic + headless CLI + web server, kết hợp **Three.js WebGL** (đóng gói sẵn `web/vendor/three.min.js` giấy phép MIT) để chạy 100% offline trên macOS, Linux và Windows mà không cần cài Node/C++ toolchain.
2. **Rơi khỏi đảo (`fall_enabled: false`):** PRD-0 và Test Contract không có tham số `island_radius`, nên đặt `fall_enabled: false` để tránh làm hỏng các kịch bản test ẩn khi nhân vật di chuyển xa. Trên bản 3D, đảo Đảo Bến có bán kính hiển thị 38m kèm lan can đá/bến gỗ và sương mây bao quanh.
3. **Bố trí 5 Đèn Lồng Lớn (`L1`..`L5`):** Đặt đều trên vòng tròn bán kính `25.0m` quanh tâm `(0,0,0)`, bắt đầu từ `L1` tại `[0, 0, 25]` (khớp ví dụ trong Test Contract v1.0) và cách nhau 72°.
4. **Điểm thưởng khi thắng:** Cộng `floor(time_left_s) * per_second_left + flames * per_flame_left` khi `reason == "all_lit"`. Không cộng thưởng thời gian/máu nếu thua.
5. **Đom đóm bị đánh rơi khi trúng Bóng Mực:** `dropped = floor(carried * hit_drop_ratio)` (`hit_drop_ratio = 0.5`); các đom đóm rơi được đặt lại trên mặt đất cách người chơi `pickup_radius + 1.5m` để tránh bị nhặt lại ngay lập tức ở tick kế tiếp.
6. **Sinh đom đóm & Bóng Mực ngẫu nhiên (khi `random_motes`/`random_shades` = `true`):** Dùng PRNG tất định Mulberry32 theo `--seed`. Đêm 1 khởi đầu với 20 đom đóm và 2 Bóng Mực (`S1`, `S2`) xa tâm; bổ sung đom đóm mỗi 4s (tối đa 24) và sinh thêm Bóng Mực mới mỗi 35s (tối đa 5, phát `shade_spawned`). Khi scenario đặt `false`, tắt hoàn toàn sinh ngẫu nhiên.
7. **Sáng tạo gọn (Rubric F):** Thêm cột ánh sáng ấm vươn lên trời khi mỗi Đèn Lồng Lớn được thắp, vòng mây bồng bềnh quanh đảo và âm thanh chuông cổ tích tổng hợp bằng Web Audio API — toàn bộ chỉ nằm ở lớp hiển thị `web/`, **không ảnh hưởng** bất kỳ byte nào của đầu ra headless.

## 3. Kế hoạch kiểm chứng (viết trước khi code)

- **Unit tests (`tests/test_engine.py`):** Kiểm tra từng quy tắc độc lập (di chuyển + góc camera, chuẩn hoá vector, rising-edge, nhặt đom đóm & giới hạn mang, nạp/thắp đèn & thắng, tỏa sáng choáng/đẩy/cooldown, vùng an toàn `safe_radius`, chạm mất máu + rơi đom đóm + bất tử + thua `no_flames`, thua `dawn`, scenario không phát event/điểm).
- **Integration headless (`tests/test_headless_cli.py`):** Chạy `src.headless` dạng subprocess với 6 kịch bản JSON (`win`, `pulse_stun`, `safe_zone`, `loss_flames`, `loss_dawn`, `random_determinism`), kiểm tra JSONL schema, làm tròn 3 chữ số thập phân, so sánh SHA-256 hai lần chạy, và kiểm tra file lỗi trả mã thoát `2`.
- **Gate tự động (`scripts/verify_all.py` + GitHub Actions CI + `.githooks/pre-commit`):** Một lệnh chạy toàn bộ kiểm chứng và xuất bằng chứng thật vào `docs/proof/phase-1/`.

## 4. Đánh giá Phase 1, Nhật ký lỗi AI & Token (cập nhật sau khi Verify)

*(Sẽ cập nhật số liệu thật ngay sau khi chạy `scripts/verify_all.py --phase 1`.)*
