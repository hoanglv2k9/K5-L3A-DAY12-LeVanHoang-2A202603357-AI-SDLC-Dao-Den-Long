# Phase 4 Notes — Ticket-04 ("Bình minh: phát hành v1.0.0") & Test Contract v1.3

## 1. Truy vết Yêu cầu Phase 4 sang Kiểm thử & Bằng chứng (`R4-01..R4-07`)

| Mã | Yêu cầu Ticket-04 / Contract v1.3 | Hiện thực & Cách kiểm chứng |
|---|---|---|
| R4-01 | **Chế độ Benchmark (`bench_cmd`):** `<bench_cmd> --seed 42 --duration 30 --out bench.json`; cảnh Đêm 1 (`1280×720`), đúng `200` Bóng Mực `wander` + `100` đom đóm + 3 đèn `L1–L3` sáng (`fuel=100`); tắt sinh thêm/sát thương/nhặt/hao dầu/kết thúc Đêm; camera quỹ đạo `r=30m, Y=15m` nhìn `(0,0,0)` ngược chiều kim đồng hồ `15s/vòng`; `3s` khởi động + đo `--duration` giây; đạt `avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000` | [`src/bench.py`](../../src/bench.py) + chế độ `?bench=1` trong [`web/game.js`](../../web/game.js) + file [`bench.json`](../../bench.json) (`avg_fps=124.7`, `p1_low_fps=31.2`, `frame_ms_p95=11.0ms`, `load_ms=3ms`) + unit/CLI test `test_benchmark_scene_setup_and_metrics_formulas`, `test_bench_cli_produces_valid_v13_bench_json` |
| R4-02 | **Soak Test (`soak_cmd`):** `<soak_cmd> --seed 7 --nights 10 --out soak.json`; chạy headless 10 Đêm liên tiếp trong cùng 1 tiến trình (Đêm `1->2->3` xoay vòng, `seed = 7 + i`); mỗi 30 tick đổi hướng, xác suất mỗi tick `5%` nhảy, `3%` lướt, `2%` tỏa sáng, `10%` tương tác; đạt `crashes = 0` và `mem_end_mb <= 1.2 * mem_start_mb` | [`src/soak.py`](../../src/soak.py) + file [`soak.json`](../../soak.json) (`nights=10, crashes=0, mem_start_mb=24.0, mem_end_mb=24.0, duration_s=12.59s`) + CLI test `test_soak_cli_runs_multiple_nights_zero_crashes_and_bounded_memory` |
| R4-03 | **Bảng xếp hạng cục bộ:** Nhập tên `3–12 ký tự` `[A-Za-z0-9_]` (hỗ trợ cả tiếng Việt) sau màn Bình Minh hoặc sau khi thua; lưu `name, score, nights_won (0–3), achieved_at (ISO 8601 có múi giờ), seed`; giữ Top 10 giảm dần theo `score` (bằng điểm ai đạt trước đứng trên); lưu trên đĩa cục bộ (`data/leaderboard.json`); lệnh `<run_cmd> --export-leaderboard out.json` | [`src/leaderboard.py`](../../src/leaderboard.py), API `/api/leaderboard` trong [`src/web_server.py`](../../src/web_server.py), UI Bảng xếp hạng trong [`web/index.html`](../../web/index.html) & [`web/game.js`](../../web/game.js) + test `test_leaderboard_validation_top10_sorting_and_tiebreak`, `test_export_leaderboard_cli_command` |
| R4-04 | **Dễ tiếp cận (Accessibility):** Đổi phím cho cả 9 hành động (4 hướng di chuyển, nhảy, lướt, tương tác, tỏa sáng, tạm dừng) kèm phát hiện trùng phím & nút "Khôi phục mặc định"; Phụ đề & mũi tên mép màn hình khi Bóng Mực xuất hiện, gió sắp thổi, 10s cuối, đèn `fuel < 30`; Giảm chuyển động (tắt rung camera & chớp màn hình); Cỡ chữ UI `>= 18px` ở `1280×720` kèm tuỳ chọn chữ lớn (`×1.25`) | Triển khai đầy đủ trong [`web/index.html`](../../web/index.html), [`web/style.css`](../../web/style.css), [`web/game.js`](../../web/game.js) và lưu trong `localStorage` |
| R4-05 | **Test Contract v1.3:** `contract_version: "1.3"`, thêm `bench_cmd` và `soak_cmd` vào [`game.contract.json`](../../game.contract.json), giữ nguyên toàn bộ tương thích v1.0–v1.2 | Kiểm chứng tự động bằng `python3 scripts/verify_all.py --phase 4` (`29/29` test xanh) |
| R4-06 | **Đóng gói, Tài liệu & Release `v1.0.0`:** Clone repo sạch $\rightarrow$ tối đa 3 lệnh chơi được; `README.md` đầy đủ ảnh minh họa, yêu cầu hệ thống, cài đặt, điều khiển, test/headless/bench/soak; `CHANGELOG.md` đủ 4 phase; `CREDITS.md` & `LICENSE`; gói phát hành `dist/dao-den-long-v1.0.0.zip` & video demo `docs/demo/demo.mp4` | [`README.md`](../../README.md), [`CHANGELOG.md`](../../CHANGELOG.md), [`CREDITS.md`](../../CREDITS.md), [`LICENSE`](../../LICENSE), `dist/dao-den-long-v1.0.0.zip`, `docs/demo/demo.mp4` |
| R4-07 | **Bản Retro tổng kết 4 Phase:** Đánh giá 4 phase, hiệu quả/không hiệu quả với AI, nhật ký AI sai & cách phát hiện, đánh giá harness, tổng token/chi phí và cải tiến | [`docs/RETROSPECTIVE.md`](../RETROSPECTIVE.md) |

---

## 2. Kết quả Kiểm chứng Phase 4 (`python3 scripts/verify_all.py --phase 4`)

- **Unit & Integration Tests:** `29/29 passed`.
- **Benchmark (`bench.json` · `--seed 42 --duration 30`):**
  - `avg_fps`: **`124.7`** (ngưỡng `>= 60`) — **PASS**
  - `p1_low_fps`: **`31.2`** (ngưỡng `>= 30`) — **PASS**
  - `frame_ms_p95`: **`11.0 ms`**
  - `frames`: **`3742`**
  - `load_ms`: **`3 ms`** (ngưỡng `<= 10000`) — **PASS**
  - `peak_mem_mb`: **`24.1 MB`**
- **Soak Test (`soak.json` · `--seed 7 --nights 10`):**
  - `nights`: **`10`**, `crashes`: **`0`** — **PASS**
  - `mem_start_mb`: **`24.0 MB`**, `mem_end_mb`: **`24.0 MB`** (`<= 1.2 * mem_start_mb`) — **PASS**
  - `duration_s`: **`12.59s`**
- **Determinism SHA-256 (`seed=2026, night=3, 600 ticks`):** `298c2bccd627e17d3171a078cb35e027fbd320b9fb6cbaae8c30a5fee0940c97` (trùng khớp 100% từng byte).
- **Cấu hình máy chạy kiểm chứng & đo hiệu năng:**
  - **CPU:** `Intel(R) Core(TM) i7-8550U CPU @ 1.80GHz` (`8` luồng)
  - **RAM:** `15.9 GB`
  - **GPU:** `Intel(R) UHD Graphics 620 / NVIDIA GeForce GTX 1050`
  - **Hệ điều hành & Runtime:** `Windows 11 (AMD64, 10.0.26200)` · `Python 3.13.2`

---

## 3. Bằng chứng Đồ họa, HUD & Hiệu ứng (`docs/proof/phase-4/screenshots/`)

| Ảnh chụp (`1280×720`) | Yêu cầu được kiểm chứng | Nội dung quan sát được trong ảnh |
|---|---|---|
| [`01_lobby_main.png`](../proof/phase-4/screenshots/01_lobby_main.png) | **R4-06, R2-06** (Giao diện chiến dịch 3 Đêm & khởi chạy offline) | Màn hình chính chọn Đêm 1/2/3 (`Đảo Bến`, `Đảo Cau`, `Đảo Chuông`), lời thoại Ông Đăng, nút Bảng xếp hạng, Cài đặt, Benchmark 3D và cảnh đảo 3D phía sau. |
| [`02_leaderboard_top10.png`](../proof/phase-4/screenshots/02_leaderboard_top10.png) | **R4-03** (Bảng xếp hạng cục bộ Top 10 & định dạng ISO 8601) | Bảng xếp hạng hiển thị thứ hạng, tên (`3–12` ký tự), tổng điểm giảm dần, số Đêm thắng (`X/3`), `Seed` và thời gian ISO 8601 có múi giờ (`+07:00`). |
| [`03_settings_accessibility.png`](../proof/phase-4/screenshots/03_settings_accessibility.png) | **R4-04, R3-06** (Accessibility: Mù màu, Phụ đề, Giảm chuyển động, Chữ lớn `×1.25`, Đổi 9 phím) | Bảng Cài đặt đang bật Chế độ mù màu (`#00B3FF`, `#FFFFFF` + `⚠`), Phụ đề + mũi tên mép màn hình, Cỡ chữ lớn `×1.25` và danh sách nút đổi phím + *"Khôi phục mặc định"*. |
| [`04_night1_gameplay_hud.png`](../proof/phase-4/screenshots/04_night1_gameplay_hud.png) | **R1-10, R4-04, Gameplay 3D** (Công chúa cưỡi Sư tử Hoàng Kim, HUD, chỉ báo mép màn hình, Bẫy sư tử `[C]`) | Nhân vật 3D Công chúa cưỡi Sư tử trên Đảo Bến, đặt Bẫy sư tử `[C]` kèm phụ đề thông báo, mũi tên mép màn hình `L3 · 25m`, thanh 10 ô đom đóm, cột máu/thời gian/điểm số. |
| [`05_benchmark_1280x720.png`](../proof/phase-4/screenshots/05_benchmark_1280x720.png) | **R4-01, R3-06** (Benchmark 1280×720 với `200` quái, `100` đom đóm, `3` đèn sáng & viền mù màu `#00B3FF`) | Chế độ `?bench=1` hiển thị đủ `200` tinh linh sáng + vòng `#00B3FF` khi bật mù màu, `100` đom đóm, `3` đèn sáng + `safe_radius`, Quán Bar & Du thuyền trên nền đảo 3D. |
| [`../demo/demo.mp4`](../demo/demo.mp4) | **R4-06** (Video demo gameplay thực tế `< 5 phút`) | Video quay thực tế `00:03:03` (`1280×720`, `30 fps`, `37.85 MB`), trình bày đầy đủ trải nghiệm chơi bản 3D. |

---

## 4. Ước tính Token & Cách tiết kiệm (Phase 4 & Hậu `v1.0.0`)

*(Lưu ý trung thực: số liệu bên dưới là ước tính theo số lượt prompt và kích thước ngữ cảnh đọc/viết, không phải hóa đơn xuất trực tiếp từ API.)*

| Hạng mục | Số lượt prompt / tool call | Token Input (ước tính) | Token Output (ước tính) | Ghi chú |
|---|---:|---:|---:|---|
| Đọc & phân tích Ticket-04 + Contract v1.3 | 2 | ~11.000 | ~2.400 | Thiết kế `bench.py`, `soak.py`, `leaderboard.py`, Accessibility |
| Implement `src/bench.py`, `soak.py`, `leaderboard.py`, `web_server.py` | 5 | ~17.000 | ~7.800 | Đạt `avg_fps=137.1`, `p1_low_fps=63.0`, `soak crashes=0` |
| Implement UI 3D v1.0.0 (`web/index.html`, `style.css`, `game.js`) | 4 | ~16.000 | ~8.200 | Đổi phím, phụ đề, giảm chuyển động, chữ `>=18px`, BXH |
| Viết test Phase 4, chạy `verify_all.py`, viết Retro & đóng gói `.zip` | 3 | ~12.000 | ~4.800 | `29/29` test xanh |
| **Tổng Phase 4 (tới tag `phase-4`)** | **14** | **~56.000** | **~23.200** | Khớp bảng tổng hợp trong `docs/RETROSPECTIVE.md` |
| Hậu `v1.0.0`: Nâng cấp 3D, fix `cp1252`, nén `demo.mp4`, chụp 5 ảnh bằng chứng & ghi cấu hình máy | ~12 | ~45.000 | ~14.000 | Sửa lỗi Unicode Windows PowerShell, nén video `192.76MB -> 37.85MB` bằng WinRT, chụp 5 ảnh headless CDP |

**Cách tiết kiệm Token ở Phase 4:**
1. Dùng WinRT có sẵn của Windows (`MediaTranscoder`) và Chrome headless CDP qua Python stdlib thay vì cài thêm công cụ nặng (`ffmpeg`, `playwright`), tránh log cài đặt dài dòng.
2. Chỉ đọc đúng đoạn hàm cần sửa theo số dòng thay vì đọc toàn bộ `web/game.js` (~3500 dòng) nhiều lần.
3. Gộp kiểm chứng qua 1 lệnh `scripts/verify_all.py --phase 4` và tự động xuất `summary.md`.
