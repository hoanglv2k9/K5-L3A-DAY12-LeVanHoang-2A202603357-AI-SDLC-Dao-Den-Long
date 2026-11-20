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

## 4. Đánh giá Phase 1, Truy vết Bằng chứng, Nhật ký AI & Token

### Bảng truy vết yêu cầu → bằng chứng thật (`docs/proof/phase-1/`)

| Mã | Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|---|
| R1-01 | 5 Đèn Lồng Lớn `L1`..`L5` tại `Y=0` | `test_tick0_snapshot_and_default_lanterns` | `docs/proof/phase-1/summary.md` | **ĐẠT** |
| R1-02 | Di chuyển + xoay theo `cam_yaw_deg` + nhảy | `test_movement_camera_yaw_and_normalization`, `test_jump_rises_and_lands` | `docs/proof/phase-1/summary.md` | **ĐẠT** |
| R1-03 | Nhặt đom đóm + giới hạn `carry_capacity` | `test_mote_pickup_and_carry_capacity`, `win.jsonl` | `docs/proof/phase-1/win.jsonl` | **ĐẠT** |
| R1-04 | Nạp đèn rising-edge + thắp đèn + thắng `all_lit` | `test_deposit_rising_edge_and_win_scoring`, `win.jsonl` | `docs/proof/phase-1/win.jsonl` (`ticks=116, score=886`) | **ĐẠT** |
| R1-05 | Bóng Mực đuổi + chạm mất máu + rơi đom đóm + `invuln_s` + thua `no_flames` | `test_shade_hit_drops_motes_invuln_and_no_flames_loss`, `loss_flames.jsonl` | `docs/proof/phase-1/loss_flames.jsonl` (`ticks=18, lost`) | **ĐẠT** |
| R1-06 | Bóng Mực không vào `safe_radius` quanh đèn sáng | `test_shade_respects_lit_lantern_safe_radius`, `safe_zone.jsonl` | `docs/proof/phase-1/safe_zone.jsonl` (0 hit / 240 ticks) | **ĐẠT** |
| R1-07 | Tỏa sáng tốn `pulse_cost`, choáng `stunned`, đẩy `pulse_push_m`, cooldown | `test_pulse_stuns_pushes_and_enforces_cooldown`, `pulse_stun.jsonl` | `docs/proof/phase-1/pulse_stun.jsonl` (`score=25`) | **ĐẠT** |
| R1-08 | Thua hết giờ `dawn` + chơi lại trên UI 3D | `test_dawn_timeout_loss`, `loss_dawn.jsonl`, nút Restart trên `web/index.html` | `docs/proof/phase-1/loss_dawn.jsonl` (`ticks=120, lost`) | **ĐẠT** |
| R1-09 | Headless chuẩn Contract v1.0, tất định SHA-256, mã thoát `2` khi file lỗi | `test_determinism_identical_bytes`, `test_invalid_inputs_exits_with_code_2` | `docs/proof/phase-1/summary.md` (`SHA-256` khớp 100%, exit `2`) | **ĐẠT** |
| R1-10 | Game 3D Three.js + HUD + âm thanh + offline | `test_web_server_serves_game_and_contract` + chạy thật trình duyệt | `web/index.html`, `web/game.js`, `web/vendor/three.min.js` | **ĐẠT** |

### Nhật ký lỗi AI & Cải tiến Harness
1. **Rủi ro phát hiện lúc thiết kế (`fall_enabled`):** Ban đầu cân nhắc bật `fall_enabled: true`, nhưng rà soát Test Contract v1.0 thấy không có trường `island_radius` trong `tuning` → nếu bật có thể làm trượt test ẩn khi kịch bản chạy xa tâm. **Xử lý:** đặt `fall_enabled: false` (khớp default của contract), ghi rõ giả định.
2. **Lỗi trong kiểm thử web server (`HTTP 400` qua proxy cục bộ & `ResourceWarning`):** Lần thử `urllib.request.urlopen` đầu tiên bị dính biến proxy môi trường và chưa đóng `proc.stdout`/`proc.stderr`. **Xử lý:** dùng `ProxyHandler({})` khi probe `127.0.0.1` và đóng stream sạch trong `finally`; không sửa code sản phẩm cho test mà sửa đúng test harness.
3. **Cập nhật Harness:** Đã chốt quy tắc `AGENTS.md` (Single Source of Truth `game.contract.json`, các bất biến Test Contract v1.0), skill `.agents/skills/verify-phase/SKILL.md`, hook `.githooks/pre-commit` và GitHub Actions `.github/workflows/ci.yml`.

### Ước tính sử dụng Token & Cách tiết kiệm (Phase 1)
- **Ước tính Phase 1:** ~38K input tokens + ~14K output tokens (~52K tokens tổng, 1 phiên gọn từ CP0 tới tag `phase-1`).
- **Cách đã tiết kiệm token:**
  1. Đọc kỹ toàn bộ Test Contract v1.0 **trước** khi sinh code → không phải viết lại kiến trúc.
  2. Chọn Python stdlib + Three.js vendored (không cài framework nặng, không log build dài hàng nghìn dòng).
  3. Giữ `AGENTS.md` ngắn (~28 dòng) và gom toàn bộ kiểm chứng vào 1 lệnh `scripts/verify_all.py`.

