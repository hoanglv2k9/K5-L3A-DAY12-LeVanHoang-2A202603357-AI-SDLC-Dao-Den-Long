# Đảo Đèn Lồng — Day 12 AI SDLC

> **Học viên:** Lê Văn Hoàng · **MSSV:** `2A202603357` · **Lớp:** `K5-L3A`  
> **Video demo:** *(sẽ cập nhật link Release `v1.0.0` ở Phase 4)*  
> **Trạng thái hiện tại:** Hoàn thành **Phase 2 (`phase-2`)** — Chiến dịch 3 Đêm ("Ba hòn đảo": Đảo Bến · Đảo Cau · Đảo Chuông) & Test Contract v1.1.

---

## 1. Giới thiệu

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba gồm chiến dịch **3 Đêm**:
- **Đêm 1 — Đảo Bến (`300s`, 5 đèn):** Hòn đảo tròn bán kính `40m` giữa biển mây với bến gỗ hướng Nam.
- **Đêm 2 — Đảo Cau (`330s`, 6 đèn):** Hai hòn đảo tròn bán kính `28m` nối bằng cầu tre và 2 **Bệ Nhảy Gió**, xuất hiện **Gió Lạc** cướp đom đóm và **Bùa Gió** ở giữa cầu.
- **Đêm 3 — Đảo Chuông (`360s`, 7 đèn):** Đảo `45m` chia **3 tầng độ cao (`0m · 3m · 6m`)** với 2 dốc đá (`30°` và `150°`), Bệ Nhảy lên đỉnh **Tháp Chuông**, 2 Bùa Gió, Gió Lạc và **Gió Mạnh** thổi mỗi `30 giây`.

- **Nền tảng:** Python 3.10+ (stdlib thuần cho mô phỏng headless & web server) + Three.js (`r149`, giấy phép MIT, đóng gói sẵn offline tại `web/vendor/three.min.js`). Chạy trực tiếp trên **macOS, Linux và Windows** không cần cài thêm thư viện ngoài.
- **Single Source of Truth:** Toàn bộ thông số tuning nằm ở [`game.contract.json`](game.contract.json) (`contract_version: "1.1"`), được dùng chung cho cả engine headless Python (`src/core/engine.py`) và bản 3D WebGL (`web/game.js`).

---

## 2. Cài đặt và chạy (tối đa 3 lệnh)

```bash
git clone https://github.com/hoanglv2k9/K5-L3A-DAY12-LeVanHoang-2A202603357-AI-SDLC-Dao-Den-Long.git
cd K5-L3A-DAY12-LeVanHoang-2A202603357-AI-SDLC-Dao-Den-Long
python3 -m src.web_server
```

Mở trình duyệt tại **http://127.0.0.1:8080** (trên Windows có thể dùng `python` thay cho `python3`).

---

## 3. Điều khiển (Bản 3D — Contract v1.1)

| Phím / Chuột | Hành động |
|---|---|
| `W / A / S / D` hoặc phím Mũi tên | Di chuyển Mây theo hướng camera (`6.0 m/s`, hoặc `7.2 m/s` khi có Bùa Gió) |
| Kéo chuột trái (hoặc `[` / `]`) | Xoay góc nhìn camera 3D (`cam_yaw_deg`, chỉnh độ nhạy trong Cài đặt) |
| `Space` | Nhảy (`vy = 7.0 m/s`, trọng lực `-20 m/s²`) |
| `Shift` | **Lướt (Dash)** — `14.0 m/s` trong `0.2s`, hồi chiêu `1.5s` (`0s` khi có Bùa Gió), giữ nguyên độ cao trên không |
| `E` hoặc `F` | Nạp đom đóm vào Đèn Lồng Lớn chưa sáng gần nhất (trong `interact_radius = 2.0m`) |
| `Q`, `X` hoặc Chuột phải | **Tỏa sáng (Light Pulse)** — tốn `3` đom đóm, bán kính 3D `5.0m`, choáng `2.0s` & đẩy lùi `4.0m` trong `15 tick` đầu, buộc Gió Lạc đánh rơi đom đóm đã cướp |
| `Esc` hoặc `P` | **Tạm dừng (Pause)** — đóng băng toàn bộ nhịp mô phỏng, mở menu Tiếp tục / Chơi lại / Cài đặt / Về Menu |
| `M` | Bật / tắt nhanh âm thanh |

---

## 4. Cách tính điểm & Tuning (`game.contract.json` v1.1)

| Sự kiện | Điểm | Ghi chú |
|---|---:|---|
| Nạp 1 đom đóm vào đèn (`per_mote`) | `+10` | Cộng khi **nạp vào đèn** (`deposit`); mang tối đa `10` đom đóm (`carry_capacity = 10`) |
| Thắp sáng 1 Đèn Lồng Lớn (`per_lantern`) | `+100` | Mỗi đèn cần `10` đom đóm (`lantern_cost = 10`); đèn sáng tạo vùng an toàn `safe_radius = 6.0m` |
| Làm choáng 1 Bóng Mực (`per_stun`) | `+5` | Cộng cho mỗi Bóng Mực trúng Tỏa sáng (kể cả khi đang choáng sẵn) |
| Thưởng thời gian còn lại khi thắng (`per_second_left`) | `+2 / giây` | Tính theo `floor(time_left_s)` khi thắp đủ toàn bộ đèn của Đêm |
| Thưởng ngọn lửa còn lại khi thắng (`per_flame_left`) | `+50 / lửa` | Bắt đầu với `3` lửa (`flames`), chạm Bóng Mực mất 1 lửa + rơi `floor(carried/2)` đom đóm (TTL `8s`) |
| Rơi khỏi đảo (`fall_enabled: true`, `Y < -10`) | `-1 lửa` | Bỏ qua bất tử, mất toàn bộ đom đóm đang mang (`lost`), chờ `1.0s (60 tick)` rồi hồi sinh tại `(0,0,0)` kèm bất tử `1.5s` |

---

## 5. Chạy Test & Chế độ Headless (Test Contract v1.1)

```bash
# 1. Chạy toàn bộ 22 unit/CLI test + 7 kịch bản headless (Đêm 1, 2, 3) + determinism + benchmark 21.600 tick
python3 scripts/verify_all.py --phase 2

# 2. Chạy headless CLI trực tiếp cho Đêm 1, 2 hoặc 3
python3 -m src.headless --seed 42 --night 1 --ticks 300 --out tmp/night1.jsonl --snapshot-every 60
python3 -m src.headless --seed 22 --night 2 --ticks 300 --out tmp/night2.jsonl --snapshot-every 60
python3 -m src.headless --seed 33 --night 3 --ticks 300 --out tmp/night3.jsonl --snapshot-every 60
```

---

## 6. Sáng tạo của tôi

Mọi yếu tố sáng tạo đều chỉ nằm ở lớp hiển thị & âm thanh trong `web/`, **tách biệt hoàn toàn** khỏi lõi mô phỏng headless:
1. **Bảng màu chuẩn hóa & ánh sáng môi trường động (`0.15 + 0.55 * (lit / total)`):** Khi từng Đèn Lồng Lớn bừng sáng trên Đảo Bến, Đảo Cau và Đảo Chuông, cột sáng vàng ấm vươn lên trời đêm và ánh sáng tổng thể của hòn đảo tăng dần theo công thức chuẩn của Ticket-02.
2. **Hiệu ứng lá bay báo trước Gió Mạnh ở Đêm 3 & vòng xoáy Gió Lạc:** Trước mỗi đợt Gió Mạnh `2 giây`, đàn lá vàng bay lượn quanh Mây theo đúng góc gió `dir_deg` để báo hiệu trực quan.
3. **Âm thanh chuông cổ tích & tiếng tích-tắc 10 giây cuối bằng Web Audio API:** Tổng hợp trực tiếp bằng Web Audio API (nhặt đom đóm, nhặt Bùa Gió, Lướt, Bệ Nhảy Gió, Gió Lạc, hợp âm thắp đèn, tiếng đếm ngược 10 giây cuối) — không phụ thuộc file âm thanh ngoài.

**Kiểm chứng không phá phần lõi:** Chạy `python3 scripts/verify_all.py --phase 2` cho `22/22` test xanh, benchmark `21.600 tick` hoàn tất trong `1.2s` (`<= 30s`), tất định SHA-256 trùng khớp 100% (xem [`docs/proof/phase-2/summary.md`](docs/proof/phase-2/summary.md)).

---

## 7. Tài liệu, Bằng chứng & Harness AI

- **Bằng chứng Phase 1 (`phase-1`):** [`docs/proof/phase-1/summary.md`](docs/proof/phase-1/summary.md) & [`docs/notes/phase-1.md`](docs/notes/phase-1.md).
- **Bằng chứng Phase 2 (`phase-2`):** [`docs/proof/phase-2/summary.md`](docs/proof/phase-2/summary.md) & [`docs/notes/phase-2.md`](docs/notes/phase-2.md).
- **Harness AI:** [`AGENTS.md`](AGENTS.md), skill [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), pre-commit hook [`.githooks/pre-commit`](.githooks/pre-commit), CI [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- **Bản quyền & Ghi nguồn:** [`LICENSE`](LICENSE) (MIT), [`CREDITS.md`](CREDITS.md).
- **Tài liệu gốc của lab:** [`GUIDE.md`](GUIDE.md), [`CHECKPOINTS.md`](CHECKPOINTS.md), [`SUBMISSION.md`](SUBMISSION.md), [`RULES.md`](RULES.md), [`RUBRIC.md`](RUBRIC.md).
