# Đảo Đèn Lồng — Day 12 AI SDLC

> **Học viên:** Lê Văn Hoàng · **MSSV:** `2A202603357` · **Lớp:** `K5-L3A`  
> **Video demo:** *(sẽ cập nhật link Release `v1.0.0` ở Phase 4)*  
> **Trạng thái hiện tại:** Hoàn thành **Phase 3 (`phase-3`)** — Change Request `"Đèn cạn dầu"` & Test Contract v1.2.

---

## 1. Giới thiệu

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba gồm chiến dịch **3 Đêm**, nơi Mây phải **thắp đèn, châm dầu và giữ cho ít nhất 60% số Đèn Lồng Lớn trên đảo còn cháy sáng khi bình minh tới (`dawn_survived`)**:
- **Đêm 1 — Đảo Bến (`240s`, cần giữ sáng `≥ 3/5` đèn):** Hòn đảo tròn bán kính `40m` giữa biển mây với bến gỗ hướng Nam.
- **Đêm 2 — Đảo Cau (`270s`, cần giữ sáng `≥ 4/6` đèn):** Hai hòn đảo tròn bán kính `28m` nối bằng cầu tre và 2 **Bệ Nhảy Gió**, xuất hiện **Gió Lạc** cướp đom đóm và **Bùa Gió** ở giữa cầu.
- **Đêm 3 — Đảo Chuông (`300s`, cần giữ sáng `≥ 5/7` đèn):** Đảo `45m` chia **3 tầng độ cao (`0m · 3m · 6m`)** với 2 dốc đá (`30°` và `150°`), Bệ Nhảy lên đỉnh **Tháp Chuông**, 2 Bùa Gió, Gió Lạc và **Gió Mạnh** thổi mỗi `30 giây`.

- **Nền tảng:** Python 3.10+ (stdlib thuần cho mô phỏng headless & web server) + Three.js (`r149`, giấy phép MIT, đóng gói sẵn offline tại `web/vendor/three.min.js`). Chạy trực tiếp trên **macOS, Linux và Windows** không cần cài thêm thư viện ngoài.
- **Single Source of Truth:** Toàn bộ thông số tuning nằm ở [`game.contract.json`](game.contract.json) (`contract_version: "1.2"`), được dùng chung cho cả engine headless Python (`src/core/engine.py`) và bản 3D WebGL (`web/game.js`).

---

## 2. Cài đặt và chạy (tối đa 3 lệnh)

```bash
git clone https://github.com/hoanglv2k9/K5-L3A-DAY12-LeVanHoang-2A202603357-AI-SDLC-Dao-Den-Long.git
cd K5-L3A-DAY12-LeVanHoang-2A202603357-AI-SDLC-Dao-Den-Long
python3 -m src.web_server
```

Mở trình duyệt tại **http://127.0.0.1:8080** (trên Windows có thể dùng `python` thay cho `python3`).

---

## 3. Điều khiển (Bản 3D — Contract v1.2)

| Phím / Chuột | Hành động |
|---|---|
| `W / A / S / D` hoặc phím Mũi tên | Di chuyển Mây theo hướng camera (`6.0 m/s`, hoặc `7.2 m/s` khi có Bùa Gió) |
| Kéo chuột trái (hoặc `[` / `]`) | Xoay góc nhìn camera 3D (`cam_yaw_deg`, chỉnh độ nhạy trong Cài đặt) |
| `Space` | Nhảy (`vy = 7.0 m/s`, trọng lực `-20 m/s²`) |
| `Shift` | **Lướt (Dash)** — `14.0 m/s` trong `0.2s`, hồi chiêu `1.5s` (`0s` khi có Bùa Gió), giữ nguyên độ cao trên không |
| `E` hoặc `F` | **Thắp mới (`10` đom đóm) / Thắp lại đèn đã từng sáng (`5` đom đóm) / Châm dầu đèn đang sáng (`+10 fuel/đom đóm`)** trong phạm vi `2.0m` |
| `Q`, `X` hoặc Chuột phải | **Tỏa sáng (Light Pulse)** — tốn `3` đom đóm, bán kính 3D `5.0m`, choáng `2.0s` (hết choáng về `wander`) & đẩy lùi `4.0m` trong `15 tick` đầu; thưởng `+15` điểm nếu ngắt Bóng Mực đang hút dầu (`drain`) |
| `Esc` hoặc `P` | **Tạm dừng (Pause)** — đóng băng toàn bộ nhịp mô phỏng, mở menu Tiếp tục / Chơi lại / Cài đặt (kèm **Chế độ mù màu**) / Về Menu |
| `M` | Bật / tắt nhanh âm thanh |

---

## 4. Luật Nhiên Liệu, Sức Chứa & Cách Tính Điểm (`game.contract.json` v1.2)

- **Nhiên liệu đèn (`fuel_max = 100`):** Khi vừa thắp (lần đầu hoặc thắp lại), đèn có `fuel = 100.0`, tự hao `1.0 fuel/s` (`1/60` mỗi tick). Khi `fuel < 30`, đèn **mất vùng an toàn `6.0m`** và nhấp nháy chậm `1 Hz`. Bóng Mực ở `wander` ưu tiên tìm đèn sáng có `fuel < 30` gần nhất; khi cách `<= 2.0m (XZ)` sẽ đứng yên ở trạng thái **`drain`** và hút `5.0 fuel/s` (`5/60` mỗi tick, cộng dồn). Khi `fuel <= 0`, đèn tắt (`lantern_out`, nhớ `ever_lit = true`, thắp lại chỉ cần **`5` đom đóm**).
- **Sức chứa tăng dần (`capacity`):** Bắt đầu mỗi Đêm ở `10`, mỗi lần thắp đèn thành công (tính cả thắp lại) tăng `+2` lên tối đa **`20`** (`10 + 2 * successful_lights`).

| Sự kiện | Điểm | Ghi chú |
|---|---:|---|
| Mỗi đom đóm nạp vào đèn (`per_mote`) | `+5` | Áp dụng cho cả thắp mới (`deposit`), thắp lại (`deposit`) và châm dầu (`refuel`) |
| Thắp sáng đèn lần đầu (`per_lantern`) | `+100` | Cần `10` đom đóm (`relight: false`) |
| Thắp lại đèn từng sáng (`per_relight`) | `+40` | Chỉ cần `5` đom đóm (`ever_lit: true`, `relight: true`) |
| Tỏa sáng trúng Bóng Mực (`per_stun` / `per_drain_stun`) | `+5` / `+15` | `+5` mỗi con; tăng lên **`+15`** nếu ngay trước đó Bóng Mực đang hút dầu (`drain`) |
| Bình minh khi thắng (`dawn_survived`) — Mỗi đèn đang sáng | `+50 + floor(fuel)` | Thắng khi hết giờ (`time_left_s == 0`) mà số đèn đang sáng `>= ceil(0.6 * tổng đèn)` (`3/5`, `4/6`, `5/7`) |
| Bình minh khi thắng (`dawn_survived`) — Mỗi Ngọn lửa còn lại | `+50 / lửa` | Không còn thưởng thời gian còn lại (`per_second_left = 0`) |

---

## 5. Chạy Test & Chế độ Headless (Test Contract v1.2)

```bash
# 1. Chạy toàn bộ 24 unit/CLI test + 8 kịch bản headless + determinism + benchmark 21.600 tick
python3 scripts/verify_all.py --phase 3

# 2. Chạy headless CLI trực tiếp cho Đêm 1, 2 hoặc 3
python3 -m src.headless --seed 42 --night 1 --ticks 300 --out tmp/night1.jsonl --snapshot-every 60
python3 -m src.headless --seed 22 --night 2 --ticks 300 --out tmp/night2.jsonl --snapshot-every 60
python3 -m src.headless --seed 33 --night 3 --ticks 300 --out tmp/night3.jsonl --snapshot-every 60
```

---

## 6. Sáng tạo & Hỗ trợ Tiếp cận (Chế độ Mù Màu)

Mọi yếu tố sáng tạo đều chỉ nằm ở lớp hiển thị & âm thanh trong `web/`, **tách biệt hoàn toàn** khỏi lõi mô phỏng headless:
1. **Chế độ mù màu ("Bảng màu dễ phân biệt") & Phân biệt hình khối không cần màu:**
   - Đèn đang tắt bị **xẹp 20% chiều cao** và hiển thị **các vết rách trên giấy đèn**; đèn đang sáng phồng căng nguyên vẹn kèm **thanh nhiên liệu 3D** trên đỉnh đèn và nhấp nháy chậm `1 Hz` khi `fuel < 30`.
   - Khi bật *"Bảng màu dễ phân biệt"* trong Cài đặt (`localStorage`), mắt và viền Bóng Mực cùng tia hút dầu `drain` đổi sang xanh lam sáng `#00B3FF`, cảnh báo UI đổi sang trắng `#FFFFFF` kèm biểu tượng `⚠`.
2. **Tia hút năng lượng `drain` 3D & Lá bay báo gió mạnh Đêm 3:** Khi Bóng Mực vào trạng thái `drain`, một luồng tia năng lượng nối từ đèn yếu vào Bóng Mực kèm cảnh báo trực quan trên HUD.
3. **Âm thanh chuông cổ tích tổng hợp bằng Web Audio API:** Bổ sung âm thanh riêng cho sự kiện **Châm dầu (`refuel`)** và **Đèn tắt vì cạn dầu (`lantern_out`)**.

**Kiểm chứng không phá phần lõi:** Chạy `python3 scripts/verify_all.py --phase 3` cho `24/24` test xanh, benchmark `21.600 tick` hoàn tất trong `2.886s` (`<= 30s`), tất định SHA-256 trùng khớp 100% (xem [`docs/proof/phase-3/summary.md`](docs/proof/phase-3/summary.md)).

---

## 7. Tài liệu, ADR, Changelog, Bằng chứng & Harness AI

- **Quyết định thiết kế (ADR Phase 3):** [`docs/adr/0001-lantern-fuel-and-dawn-survival.md`](docs/adr/0001-lantern-fuel-and-dawn-survival.md).
- **Nhật ký thay đổi & Breaking Changes:** [`CHANGELOG.md`](CHANGELOG.md).
- **Bằng chứng & ghi chép theo từng Phase:**
  - Phase 1 (`phase-1`): [`docs/proof/phase-1/summary.md`](docs/proof/phase-1/summary.md) & [`docs/notes/phase-1.md`](docs/notes/phase-1.md).
  - Phase 2 (`phase-2`): [`docs/proof/phase-2/summary.md`](docs/proof/phase-2/summary.md) & [`docs/notes/phase-2.md`](docs/notes/phase-2.md).
  - Phase 3 (`phase-3`): [`docs/proof/phase-3/summary.md`](docs/proof/phase-3/summary.md) & [`docs/notes/phase-3.md`](docs/notes/phase-3.md).
- **Harness AI:** [`AGENTS.md`](AGENTS.md), skill [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), pre-commit hook [`.githooks/pre-commit`](.githooks/pre-commit), CI [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- **Bản quyền & Ghi nguồn:** [`LICENSE`](LICENSE) (MIT), [`CREDITS.md`](CREDITS.md).
- **Tài liệu gốc của lab:** [`GUIDE.md`](GUIDE.md), [`CHECKPOINTS.md`](CHECKPOINTS.md), [`SUBMISSION.md`](SUBMISSION.md), [`RULES.md`](RULES.md), [`RUBRIC.md`](RUBRIC.md).
