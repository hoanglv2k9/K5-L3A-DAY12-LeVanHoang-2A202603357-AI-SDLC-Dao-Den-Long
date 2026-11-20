# Đảo Đèn Lồng — Day 12 AI SDLC

> **Học viên:** Lê Văn Hoàng · **MSSV:** `2A202603357` · **Lớp:** `K5-L3A`  
> **Video demo:** *(sẽ cập nhật link Release `v1.0.0` ở Phase 4)*  
> **Trạng thái hiện tại:** Hoàn thành **Phase 1 (`phase-1`)** — Đêm 1: Đảo Bến & Test Contract v1.0.

---

## 1. Giới thiệu

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba. Người chơi điều khiển **Mây** (đội nón lá treo chiếc đèn lồng nhỏ) chạy trên **Đảo Bến** giữa biển mây, thu thập **đom đóm** vàng ấm để thắp sáng **5 Đèn Lồng Lớn (`L1`..`L5`)** và dùng kỹ năng **Tỏa sáng** xua **Bóng Mực** tím đen.

- **Nền tảng:** Python 3.10+ (stdlib thuần cho mô phỏng headless & web server) + Three.js (`r149`, giấy phép MIT, đóng gói sẵn offline tại `web/vendor/three.min.js`). Chạy trực tiếp trên **macOS, Linux và Windows** không cần cài thêm thư viện ngoài.
- **Single Source of Truth:** Toàn bộ thông số tuning nằm ở [`game.contract.json`](game.contract.json), được dùng chung cho cả engine headless Python (`src/core/engine.py`) và bản 3D WebGL (`web/game.js`).

---

## 2. Cài đặt và chạy (tối đa 3 lệnh)

```bash
git clone https://github.com/hoanglv2k9/K5-L3A-DAY12-LeVanHoang-2A202603357-AI-SDLC-Dao-Den-Long.git
cd K5-L3A-DAY12-LeVanHoang-2A202603357-AI-SDLC-Dao-Den-Long
python3 -m src.web_server
```

Mở trình duyệt tại **http://127.0.0.1:8080** (trên Windows có thể dùng `python` thay cho `python3`).

---

## 3. Điều khiển (Bản 3D)

| Phím / Chuột | Hành động |
|---|---|
| `W / A / S / D` hoặc phím Mũi tên | Di chuyển Mây theo hướng camera |
| `Q / E` hoặc kéo chuột trái | Xoay góc nhìn camera 3D (`cam_yaw_deg`) |
| `Space` | Nhảy |
| `F` hoặc `Enter` | Nạp đom đóm vào Đèn Lồng Lớn gần nhất (trong `interact_radius = 2.5m`) |
| `Shift`, `X` hoặc Chuột phải | **Tỏa sáng (Light Pulse)** — tốn `2` đom đóm, choáng & đẩy lùi Bóng Mực |
| `M` | Bật / tắt âm thanh |
| `R` | Chơi lại ngay |

---

## 4. Cách tính điểm & Tuning (`game.contract.json`)

| Sự kiện | Điểm | Ghi chú |
|---|---:|---|
| Nhặt 1 đom đóm (`per_mote`) | `+10` | Mang tối đa `6` đom đóm (`carry_capacity`) |
| Thắp sáng 1 Đèn Lồng Lớn (`per_lantern`) | `+100` | Cần nạp `4` đom đóm (`lantern_cost`); đèn sáng tạo vùng an toàn `safe_radius = 5.0m` |
| Làm choáng 1 Bóng Mực (`per_stun`) | `+25` | Tỏa sáng tốn `2` đom đóm, bán kính `6.0m`, choáng `2.5s`, đẩy `4.0m`, hồi chiêu `3.0s` |
| Thưởng thời gian còn lại khi thắng (`per_second_left`) | `+2 / giây` | Tính theo `floor(time_left_s)` khi thắp đủ 5 đèn |
| Thưởng ngọn lửa còn lại khi thắng (`per_flame_left`) | `+50 / lửa` | Bắt đầu với `3` lửa (`flames`), chạm Bóng Mực mất 1 lửa + rơi `50%` đom đóm |

- **`fall_enabled: false`**: Không áp dụng phạt rơi khỏi đảo vì Test Contract v1.0 không khai báo `island_radius`; bản 3D giới hạn di chuyển êm tại mép Đảo Bến (`38m`).

---

## 5. Chạy Test & Chế độ Headless (Test Contract v1.0)

```bash
# 1. Chạy toàn bộ unit test + 5 kịch bản headless + kiểm tra tính tất định + negative test
python3 scripts/verify_all.py --phase 1

# 2. Chạy headless CLI trực tiếp
python3 -m src.headless --seed 42 --night 1 --ticks 300 --out tmp/run.jsonl --snapshot-every 60
```

---

## 6. Sáng tạo của tôi

Mọi yếu tố sáng tạo đều chỉ nằm ở lớp hiển thị & âm thanh trong `web/`, **tách biệt hoàn toàn** khỏi lõi mô phỏng headless:
1. **Cột ánh sáng cổ tích (Lantern Sky-Beams):** Khi mỗi Đèn Lồng Lớn được thắp, một cột ánh sáng vàng ấm vươn lên bầu trời sao, đồng thời toàn bộ sương tím đen của đảo tan dần và ấm sáng lên theo tỉ lệ đèn đã thắp (`0/5 → 5/5`).
2. **Đảo Bến giữa biển mây & nón lá treo đèn:** Bến gỗ hướng Nam, vòng mây lơ lửng quay chậm quanh đảo, và chiếc đèn lồng nhỏ treo trên vành nón lá của Mây đung đưa theo nhịp bước chân và sáng mạnh dần theo số đom đóm đang mang.
3. **Âm thanh chuông cổ tích tổng hợp (Web Audio API):** Toàn bộ hiệu ứng âm thanh (nhặt đom đóm, nạp đèn, hợp âm thắp đèn, sóng tỏa sáng, thắng/thua) được tổng hợp trực tiếp bằng Web Audio API — không cần file ngoài, không vướng bản quyền.

**Kiểm chứng không phá phần lõi:** Chạy `python3 scripts/verify_all.py --phase 1` cho `17/17` test xanh, tất định SHA-256 trùng khớp 100% giữa 2 lần chạy (xem [`docs/proof/phase-1/summary.md`](docs/proof/phase-1/summary.md)).

---

## 7. Tài liệu, Bằng chứng & Harness AI

- **Bằng chứng Phase 1:** [`docs/proof/phase-1/summary.md`](docs/proof/phase-1/summary.md) và các file `.jsonl` thật trong `docs/proof/phase-1/`.
- **Ghi chép, giả định, nhật ký AI & token:** [`docs/notes/phase-1.md`](docs/notes/phase-1.md).
- **Harness AI:** [`AGENTS.md`](AGENTS.md), skill [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), pre-commit hook [`.githooks/pre-commit`](.githooks/pre-commit), CI [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- **Bản quyền & Ghi nguồn:** [`LICENSE`](LICENSE) (MIT), [`CREDITS.md`](CREDITS.md).
- **Tài liệu gốc của lab:** [`GUIDE.md`](GUIDE.md), [`CHECKPOINTS.md`](CHECKPOINTS.md), [`SUBMISSION.md`](SUBMISSION.md), [`RULES.md`](RULES.md), [`RUBRIC.md`](RUBRIC.md).
