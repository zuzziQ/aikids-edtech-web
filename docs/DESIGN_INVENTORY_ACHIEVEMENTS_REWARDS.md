# Inventory thiết kế — Achievement & Reward

> Cập nhật: 2026-08-11. Tên/mốc achievement thực tế đến từ Gamification API;
> frontend chỉ ánh xạ artwork theo semantic và không phải nguồn catalog.

Catalog mở rộng và mô hình level không giới hạn được định nghĩa tại
[`ACHIEVEMENT_CATALOG_V2.md`](./ACHIEVEMENT_CATALOG_V2.md).

## 1. Achievement đang hiển thị

| Nhóm | Mốc | Tên hiển thị | Hướng dẫn mở | Artwork đề xuất |
|---|---:|---|---|---|
| Khóa học | 1 khóa | Về đích | Hoàn thành khóa học đầu tiên | Mee chạm cờ đích |
| Bài học | 1 bài | Bước đầu tiên | Hoàn thành bài học đầu tiên | Mee bước lên phiến đá đầu tiên |
| Bài học | 10 bài | Nhà thám hiểm | Hoàn thành 10 bài học | Mee với la bàn/bản đồ |
| Ngôi sao | 10 sao | Mười ngôi sao | Tích lũy 10 sao từ bài học | Mee ôm chùm sao nhỏ |
| Ngôi sao | 50 sao | Bầu trời sao | Tích lũy 50 sao từ bài học | Mee dưới vòm sao lớn |
| Chuỗi học | 3 ngày | Ba ngày bền bỉ | Học tập trong 3 ngày liên tiếp | Mee giữ ngọn lửa mầm |
| Chuỗi học | 7 ngày | Một tuần bền bỉ | Học tập trong 7 ngày liên tiếp | Mee bên lửa trại 7 tia |
| Chuỗi học | 30 ngày | Tháng siêu bền bỉ | Học tập trong 30 ngày liên tiếp | Mee với vòng nguyệt quế/lịch |
| XP | 500 XP | Ngôi sao 500 XP | Tích lũy 500 XP | Mee nâng ngôi sao năng lượng |

### Artwork kỷ lục cá nhân

Các ảnh không chứa số/chữ; frontend đặt con số động bên dưới icon.

| Asset ID | Nội dung |
|---|---|
| `mee-record-streak` | Chuỗi ngày học |
| `mee-record-xp` | XP/ngôi sao tích lũy |
| `mee-record-perfect` | Bài học hoàn hảo |
| `mee-record-level` | Cấp cao nhất |

### Bộ badge semantic

`badge-title-first-light`, `badge-title-curious-seeker`, `badge-title-explorer`,
`badge-title-idea-hunter`, `badge-title-starlight-adventurer`, `badge-title-guide`,
`badge-title-world-architect`, `badge-title-firestarter`, `badge-title-star-keeper`,
`badge-title-young-legend`, `badge-code-comet`, `badge-kind-collaborator`.

## 1.1. Catalog mở rộng đề xuất — 10 họ × 5 cấp

Mỗi dòng dưới đây là **một series backend** với `seriesKey` ổn định và năm
`milestones`. Frontend gom năm mốc thành một huy hiệu tiến hoá; tổng cộng có 50
mốc achievement có thể mở. Đây là specification cho Gamification Admin, không
phải catalog hardcode trong frontend.

| Series key | Ý nghĩa | 5 mốc đề xuất |
|---|---|---|
| `lessons` | Hoàn thành bài học | 1 · 10 · 30 · 75 · 150 bài |
| `courses` | Hoàn thành khóa học | 1 · 3 · 5 · 8 · 12 khóa |
| `stars` | Tích lũy ngôi sao | 10 · 30 · 75 · 150 · 300 sao |
| `xp` | Tích lũy XP | 500 · 1.500 · 4.000 · 10.000 · 25.000 XP |
| `streak` | Chuỗi ngày học | 3 · 7 · 14 · 30 · 60 ngày |
| `perfect-lessons` | Bài đạt kết quả hoàn hảo | 1 · 5 · 15 · 30 · 75 bài |
| `quests` | Hoàn thành nhiệm vụ | 3 · 10 · 25 · 60 · 120 nhiệm vụ |
| `creative-projects` | Hoàn thành tác phẩm sáng tạo | 1 · 5 · 12 · 30 · 60 tác phẩm |
| `ai-tools` | Sử dụng công cụ AI đúng hoạt động | 3 · 10 · 25 · 50 · 100 lần |
| `collaboration` | Hoạt động cộng tác an toàn | 1 · 3 · 10 · 25 · 50 hoạt động |

Quy tắc nội dung:

- Tên từng mốc phải tiến hoá cùng một câu chuyện, không chỉ đổi con số.
- `currentValue` là cùng một metric xuyên suốt series.
- Mỗi milestone có `label`, `threshold`, `points`, `rewardLabel` và
  `rewardAssetId`; không nhúng số/chữ vào artwork.
- Mốc chưa mở vẫn được trả về cho học sinh để hiển thị hướng dẫn và tiến độ.
- Không dùng so sánh công khai giữa trẻ; toàn bộ là hành trình cá nhân.

## 2. Reward cấp độ xác nhận trong frontend

### Cấp 1–10

| Cấp | Reward | Kind |
|---:|---|---|
| 1 | Tia Sáng Đầu Tiên | Danh hiệu |
| 2 | Paco Mây; Người Tìm Tòi | Companion; danh hiệu |
| 3 | Khung Cầu Vồng; Nhà Khám Phá | Frame; danh hiệu |
| 4 | Nền Xưởng Sáng Tạo; Người Săn Ý Tưởng | Theme; danh hiệu |
| 5 | Sticker Nhà Thám Hiểm; Nhà Thám Hiểm Ánh Sao | Perk; danh hiệu |
| 6 | Hào Quang Lấp Lánh; Người Dẫn Đường | Effect; danh hiệu |
| 7 | Khung Dải Ngân Hà; Kiến Trúc Sư Thế Giới | Frame; danh hiệu |
| 8 | Vé Thử Thách Đặc Biệt; Người Truyền Lửa | Vé; danh hiệu |
| 9 | Mở Hint Boss Sớm; Người Giữ Ánh Sao | Perk; danh hiệu |
| 10 | Nền Storybook Huyền Thoại; Huyền Thoại Trẻ | Theme; danh hiệu |

### Frame cột mốc cấp 15–100

| Cấp | Asset ID | Tên/concept |
|---:|---|---|
| 15 | `frame-level-15` | Khung Mầm Xanh |
| 25 | `frame-level-25` | Khung Sao Mai |
| 35 | `frame-level-35` | Khung Sóng Biển |
| 45 | `frame-level-45` | Khung Lửa Nhỏ |
| 55 | `frame-level-55` | Khung Cánh Mây |
| 65 | `frame-level-65` | Khung Bản Đồ |
| 75 | `frame-level-75` | Khung Pha Lê |
| 85 | `frame-level-85` | Khung Hành Tinh |
| 95 | `frame-level-95` | Khung Vương Miện |
| 100 | `frame-level-100` | Khung Huyền Thoại Mee |

### Các họ reward động trong hành trình 11–100

Catalog chính xác do backend quản lý. Frontend đã hỗ trợ các ID:

- `companion-level-{level}` — bạn đồng hành Mee theo vùng.
- `background-level-{level}` — nền thẻ hồ sơ 3:1.
- `theme-level-{level}` — theme trang dọc 2:3.
- `effect-level-{level}` — hiệu ứng quanh avatar.
- `title-level-{level}` — danh hiệu chữ; artwork không chứa text.
- `frame-level-{level}` — chỉ các mốc 15, 25, 35, 45, 55, 65, 75, 85, 95, 100.

Các mốc curated đã được frontend nhận diện: companion cấp 23, 31, 41 và effect
cấp 12, 24, 32, 44. Team cần lấy export catalog từ Gamification Admin trước
khi vẽ toàn bộ từng level để tránh tự tạo một catalog song song.

## 3. Reward theo khóa học/sự kiện

| Điều kiện | Reward |
|---|---|
| Hè Trên Mây 2026 | Khung Mây Mùa Hè |
| Đấu Trường Ý Tưởng | Danh hiệu Chiến Binh Sáng Tạo |
| P01-S9 | Nền Bình Minh Cổng AI |
| P02-S9 | Khung Thư Viện Cổ |
| P03-S9 | Nền Đại Dương Sáng Tạo |
| P04-S9 | Khung Đỉnh Núi Vàng |
| P05-S9 | Theme Xưởng Paco |
| P06-S9 | Nền Rừng Hộ Vệ |
| P07-S9 | Khung Người Kể Chuyện Thiên Hà |
| P08-S9 | Theme Trái Tim Kết Nối |

## 4. Quy cách bàn giao nhanh

- Badge/companion: 512×512 PNG/WebP, alpha thật, không chữ/số.
- Frame: 1024×1024, vùng avatar trong suốt 62–68%, không nhúng `CẤP`.
- Background profile: 1920×640, tỷ lệ 3:1.
- Theme trang: 1440×2160, tỷ lệ 2:3, vùng giữa yên tĩnh.
- Effect: 1024×1024, tâm trong suốt, không che mặt, không chớp mạnh.
- Giữ IP Mee giống login; Soft Clay, silhouette rõ ở 64–96 px.
