# Retrospective (Bản Tổng Kết 4 Phase) — Đảo Đèn Lồng (`v1.0.0`)

- **Học viên:** Lê Văn Hoàng · **MSSV:** `2A202603357` · **Lớp:** `K5-L3A`
- **Dự án:** Đảo Đèn Lồng (Day 12 AI SDLC — Từ PRD-0 đến Release `v1.0.0`, Test Contract `v1.0 -> v1.3`)

---

## 1. Tổng hợp Evaluation qua 4 Phase

| Phase | Tag & Contract | Mục tiêu cốt lõi | Số bài Test | Kết quả Headless / Benchmark | Thời gian kiểm chứng |
|---|---|---|---:|---|---:|
| **Phase 1** | `phase-1` (`v1.0`) | MVP Đêm 1 (**Đảo Bến**), lõi mô phỏng 60 tick/s tất định, CLI `--headless`, bản 3D Three.js | `17 / 17` PASS | 5 kịch bản CLI (`win`, `pulse_stun`, `safe_zone`, `loss_flames`, `loss_dawn`), SHA-256 trùng khớp 100% | `4.68s` |
| **Phase 2** | `phase-2` (`v1.1`) | Mở rộng **Ba hòn đảo** (Đêm 1, 2, 3), 12 bước tick, Lướt (`dash`), Tạm dừng (`pause`), Rơi (`Y<-10`), Gió Lạc, Bùa Gió, Gió Mạnh, HUD 10 ô | `22 / 22` PASS | 7 kịch bản CLI đủ 3 Đêm, benchmark `21.600 tick` trong **`1.243s`** (`<= 30s`) | `6.48s` |
| **Phase 3** | `phase-3` (`v1.2`) | Change Request **"Đèn cạn dầu"**: nhiên liệu nguyên `1/60`, `refuel`, `relight (5)`, `lantern_out`, Bóng Mực `drain`, thắng `dawn_survived`, `capacity 10..20`, Chế độ mù màu, ADR 0001 | `24 / 24` PASS | 8 kịch bản CLI, benchmark `21.600 tick` trong **`2.886s`** (`<= 30s`) | `9.11s` |
| **Phase 4** | `phase-4` & `v1.0.0` (`v1.3`) | Sản phẩm phát hành: Benchmark 1280×720 (`200` Bóng Mực, `100` đom đóm), Soak Test 10 Đêm liên tiếp, Bảng xếp hạng cục bộ, Đổi phím & Phụ đề & Giảm chuyển động & Cỡ chữ `>= 18px` | `29 / 29` PASS | `bench.json`: **`avg_fps = 124.7`**, **`p1_low_fps = 31.2`**, `load_ms = 3ms`; `soak.json`: **`10 Đêm, 0 crash`**, `mem_end_mb = 24.0MB <= 1.2 * mem_start_mb` | `~16.8s` |

---

## 2. Điều gì hiệu quả và không hiệu quả khi làm việc với AI

### 2.1. Điều hiệu quả (What Worked Well)
1. **Kiến trúc tách biệt hoàn toàn Lõi Mô Phỏng (`src/core/`) và Lớp Hiển Thị 3D (`web/`):**
   - Đặt toàn bộ logic vật lý, máy trạng thái, PRNG Mulberry32 và quy tắc tính điểm trong Python 3 stdlib thuần (`src/core/engine.py`), đồng thời bắt buộc cả Python lẫn Three.js đọc chung [`game.contract.json`](../game.contract.json) làm **Single Source of Truth**.
   - Khi `TICKET-03` thay đổi toàn bộ luật đèn sáng, vùng an toàn, công thức điểm và điều kiện thắng (`all_lit -> dawn_survived`), chỉ cần cập nhật `game.contract.json` và 3 hàm trong `engine.py` là toàn bộ hệ thống chuyển đổi gọn gàng mà không làm vỡ các phần khác.
2. **Thiết kế theo Hợp đồng Kiểm thử (`Contract-First` & `12-Step Tick Order`):**
   - Viết bộ kiểm tra `src/core/contract.py` chặn mọi dữ liệu sai định dạng với mã thoát `2` ngay từ đầu giúp không bao giờ bị lỗi âm thầm khi thêm trường mới (`fuel`, `ever_lit`, `relit_count`, `capacity`, `bench_cmd`, `soak_cmd`).
3. **Biểu diễn số học chính xác bằng số nguyên (`fuel_ticks` đơn vị `1/60`):**
   - Ngay khi đọc yêu cầu trừ dầu `1/60` và hút dầu `5/60` mỗi tick ở Phase 3, việc áp dụng quyết định thiết kế trong [`ADR 0001`](adr/0001-lantern-fuel-and-dawn-survival.md) (dùng số nguyên `0..6000`) đã ngăn chặn triệt để lỗi làm tròn dấu phẩy động IEEE-754.

### 2.2. Điều chưa hiệu quả nếu không kiểm soát (What Didn't Work Without Human Steering)
- Nếu yêu cầu AI sinh đồng thời cả engine, UI 3D và test trong một bước lớn mà không chạy `verify_all.py`, dễ phát sinh lệch hệ tọa độ camera 3D hoặc lệch đặc tả hệ điều hành (như độ phân giải `Sleep()` trên Windows). Chia nhỏ từng bước (Contract $\rightarrow$ Core Engine $\rightarrow$ Unit/CLI Test $\rightarrow$ 3D WebGL) hiệu quả hơn hẳn.

---

## 3. Những lần AI sai, Cách phát hiện và Cách khắc phục

| # | Phase | Lỗi phát sinh | Cách phát hiện | Cách khắc phục triệt để |
|---:|---|---|---|---|
| 1 | Phase 1 | Probe `http://127.0.0.1:18765` trong `test_web_server` trả về `HTTP 400` và cảnh báo `ResourceWarning` trên Windows sandbox | Chạy `python -m unittest` thất bại ở bài test tích hợp web server | Dùng `urllib.request.ProxyHandler({})` để bỏ qua biến môi trường proxy khi gọi `127.0.0.1` và đóng tường minh `proc.stdout`/`proc.stderr` trong khối `finally`. |
| 2 | Phase 2 | Đẩy lùi của Tỏa sáng (`pulse_push_m = 4.0m`) ở Phase 1 là dịch chuyển tức thời trong 1 tick, trong khi Ticket-02 yêu cầu đẩy chia đều trong **15 tick đầu** của trạng thái `stunned` | Đối chiếu bảng thông số chuẩn hóa Ticket-02 với `test_pulse_stuns_pushes` | Thêm bộ đếm `push_ticks_left = 15` cho mỗi `Shade`, dịch chuyển `4/15 m/tick` ở Bước 8 kèm kiểm tra va chạm vách đá/tháp chuông. |
| 3 | Phase 2 | **Ngược hướng phím rẽ Trái/Phải (`A/D` và `←/→`) trong camera 3D** | **Người chơi kiểm thử trực tiếp** trên trình duyệt phát hiện bấm rẽ trái nhân vật đi sang phải màn hình | Trong hệ tọa độ bàn tay phải của Three.js khi camera ở `-Z` nhìn về `+Z`, tích có hướng `Forward × Up` làm `+X` nằm bên trái màn hình. Đảo ánh xạ phím ngang trong `web/game.js` (`A/← -> mx += 1`, `D/→ -> mx -= 1`), giữ nguyên công thức `wx, wz` chuẩn trong `src/core/engine.py`. |
| 4 | Phase 3 | Thứ tự giữa Tỏa sáng (`pulse`, Bước 7) và chuyển trạng thái `drain -> chase` (Bước 8): nếu Mây đi bộ vào `< 6.0m` trước tick bấm `pulse`, Bóng Mực đã chuyển sang `chase` ở Bước 8 của tick trước | Phân tích kịch bản `phase3_fuel_drain_relight` theo đúng thứ tự 12 bước | Giữ đúng Bước 7 chạy trước Bước 8 và thiết kế kịch bản test kiểm chứng `pulse` ngay khi Bóng Mực đang ở trạng thái `drain` trong bán kính `5.0m` (`+15` điểm). |
| 5 | Phase 4 | Lần chạy `src/bench.py` đầu tiên có `p1_low_fps = 28.4` (dưới ngưỡng `>= 30`) dù `avg_fps = 76.5` | Kiểm tra trực tiếp file `bench.json` sau khi chạy lệnh `--duration 30` | Phát hiện hàm `time.sleep(0.0032)` trên Windows bị làm tròn theo chu kỳ bộ định thời kernel `15.625ms` (`64 Hz`). Thay bằng vòng đợi độ phân giải cao `time.perf_counter()` giúp `avg_fps` đạt **`137.1 FPS`** và `p1_low_fps` đạt **`63.0 FPS`**. |

---

## 4. Harness nào (`AGENTS.md`, Skill, Hook, Verify Script) giúp nhiều nhất?

1. **[`scripts/verify_all.py`](../scripts/verify_all.py) + Skill [`.agents/skills/verify-phase/SKILL.md`](../.agents/skills/verify-phase/SKILL.md) (Hiệu quả #1):**
   - Gom toàn bộ kiểm tra (`game.contract.json`, `29` unit/CLI test, `8` kịch bản headless `.jsonl`, kiểm tra tính tất định SHA-256 byte-for-byte, benchmark `21.600 tick`, ngưỡng `bench.json` & `soak.json`) vào **một lệnh duy nhất** đồng thời tự động sinh báo cáo bằng chứng `docs/proof/phase-N/summary.md`.
2. **[`AGENTS.md`](../AGENTS.md) (Hiệu quả #2):**
   - Lưu danh sách bất biến ngắn gọn (thứ tự 12 bước mỗi tick, không hardcode thông số ngoài `game.contract.json`, công thức nhiên liệu nguyên `1/60`) giúp không bị trôi ngữ cảnh giữa các Phase.
3. **Pre-commit Hook [`.githooks/pre-commit`](../.githooks/pre-commit) & CI [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):**
   - Đảm bảo không có commit hay tag nào vượt qua nếu làm gãy bất kỳ bài test ẩn nào của Phase trước.

---

## 5. Tổng Token / Chi phí AI ước tính & Chiến lược Tiết kiệm Token

| Phase | Số lượt Prompt / Tool Call | Token Input (ước tính) | Token Output (ước tính) | Chi phí quy đổi ước tính |
|---|---:|---:|---:|---:|
| **Phase 0 & Phase 1** (`phase-1`) | 16 | ~58.000 | ~19.500 | ~$0.46 |
| **Phase 2** (`phase-2`) | 15 | ~64.000 | ~22.500 | ~$0.52 |
| **Phase 3** (`phase-3`) | 13 | ~54.000 | ~20.800 | ~$0.47 |
| **Phase 4** (`phase-4` & `v1.0.0`) | 14 | ~56.000 | ~23.200 | ~$0.50 |
| **Tổng cộng toàn dự án (4 Phase)** | **58** | **~232.000** | **~86.000** | **~$1.95** |

**Cách chúng tôi tiết kiệm Token:**
1. **Không đọc lại toàn bộ file lớn nhiều lần:** Tách riêng `src/core/contract.py`, `src/core/rng.py`, `src/core/memory.py`, `src/leaderboard.py`, `src/bench.py`, `src/soak.py` thành các mô-đun nhỏ gọn, độc lập.
2. **Dùng một script `verify_all.py` trả về kết quả ngắn gọn:** Thay vì chạy lẻ tẻ hàng chục lệnh terminal làm phình context log, `verify_all.py` chỉ in 1 dòng tóm tắt khi PASS và tự ghi chi tiết vào `docs/proof/`.
3. **Không dùng thư viện ngoài nặng nề:** Dùng Python 3 stdlib thuần + `three.min.js` đóng gói sẵn giúp loại bỏ hoàn toàn các vòng lặp sửa lỗi xung đột dependency (`npm` / `pip`).

---

## 6. Nếu làm lại từ đầu thì sẽ đổi gì?

1. **Viết bài test kiểm tra hướng camera 3D (`Screen-Left / Screen-Right` vs `World +X / -X`) ngay từ Phase 1:** Để phát hiện sớm sự khác biệt giữa hệ trục bàn tay phải của Three.js và phím `A/D` trước khi người chơi phải báo lỗi ở Phase 2.
2. **Đưa công thức nhiên liệu đơn vị nguyên `1/60 tick` vào ngay từ thiết kế ban đầu:** Mọi đại lượng thời gian/nhiên liệu liên tục trong mô phỏng 60 tick/s đều nên lưu dưới dạng số nguyên `ticks` ở tầng lõi và chỉ quy đổi sang `float` ở tầng snapshot/UI.
