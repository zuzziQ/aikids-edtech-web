# Achievement Catalog V2 — Ghi nhận mọi trải nghiệm có ý nghĩa

> Trạng thái: product/backend/design specification. Catalog production vẫn do
> Gamification Admin publish; frontend không hardcode danh sách này.

## 1. Mục tiêu

Học sinh cần cảm thấy mỗi hành động **có ý nghĩa** trong AI Kids đều được nhìn
thấy: bắt đầu, khám phá, luyện tập, sửa sai, sáng tạo, quay lại sau gián đoạn và
hoàn thành mục tiêu. Achievement không thưởng cho click rỗng, thời gian nhìn màn
hình hoặc chia sẻ công khai.

Mỗi achievement là một **series tiến hoá**. Series có thể có 3, 5, 8 hoặc nhiều
mốc hơn; frontend không giả định số cấp cố định.

## 2. Mô hình dữ liệu mở rộng

```json
{
  "key": "learning.lessons.completed",
  "seriesKey": "lessons",
  "category": "learning",
  "metric": "learning.lessons_completed",
  "aggregation": "lifetime",
  "milestones": [
    { "threshold": 1, "label": "Bước chân đầu tiên" },
    { "threshold": 10, "label": "Nhà thám hiểm nhỏ" },
    { "threshold": 30, "label": "Người mở đường" }
  ]
}
```

Quy tắc bắt buộc:

- `seriesKey` ổn định, không chứa số cấp.
- `milestones[]` là mảng có độ dài bất kỳ, sắp theo `threshold` tăng dần.
- Cấp achievement được suy ra từ vị trí milestone; không tạo enum `level_1..5`.
- Có thể append milestone mới mà không đổi key hoặc làm mất unlock cũ.
- Metric do service sở hữu hành động phát event; Gamification chỉ tổng hợp.
- Event phải idempotent bằng `eventId`; retry không được cộng hai lần.
- Milestone ẩn chỉ dành cho bất ngờ thật; mục tiêu thông thường phải hiển thị để
  trẻ biết cách đạt.
- Không hạ threshold của release đã publish; tạo catalog version mới khi đổi
  logic.

## 3. Danh sách achievement đề xuất

### A. Bắt đầu và khám phá

| Series key | Ghi nhận | Mốc khởi điểm đề xuất |
|---|---|---|
| `app-first-steps` | Hoàn thành các bước onboarding có ý nghĩa | 1 · 3 · 5 bước |
| `profile-builder` | Chọn avatar, nickname và sở thích học | 1 · 2 · 3 phần |
| `feature-explorer` | Trải nghiệm lần đầu các khu vực chính | 2 · 4 · 6 · 8 khu vực |
| `world-regions` | Mở vùng học mới | 1 · 3 · 5 · 8 · 12 vùng |
| `storybook-explorer` | Mở và đọc chương Storybook | 1 · 3 · 6 · 12 · 24 chương |
| `backpack-collector` | Nhận vật phẩm khác loại | 1 · 5 · 12 · 25 · 50 vật phẩm |
| `style-explorer` | Thử trang bị frame/theme/companion hợp lệ | 1 · 3 · 6 · 10 kiểu |

### B. Học và luyện tập

| Series key | Ghi nhận | Mốc khởi điểm đề xuất |
|---|---|---|
| `lessons` | Hoàn thành bài học | 1 · 10 · 30 · 75 · 150 · 300 |
| `courses` | Hoàn thành khóa học | 1 · 3 · 5 · 8 · 12 · 20 |
| `practice-rounds` | Hoàn thành lượt luyện tập | 3 · 10 · 30 · 75 · 150 |
| `knowledge-checks` | Hoàn thành bước kiểm tra | 1 · 5 · 15 · 40 · 100 |
| `perfect-lessons` | Bài đạt tiêu chí hoàn hảo | 1 · 5 · 15 · 30 · 75 |
| `mistakes-fixed` | Làm lại và sửa đúng câu từng sai | 1 · 10 · 30 · 75 · 150 |
| `review-master` | Hoàn thành phiên ôn tập nội dung cũ | 1 · 5 · 15 · 40 · 80 |
| `skill-variety` | Học đủ nhóm kỹ năng khác nhau | 2 · 4 · 6 · 8 · 10 nhóm |
| `independent-solve` | Hoàn thành thử thách không dùng hint | 1 · 5 · 15 · 40 · 100 |
| `smart-hints` | Dùng hint rồi hoàn thành đúng hoạt động | 1 · 5 · 15 · 30 · 60 |
| `improvement` | Tăng kết quả so với lần thử trước | 1 · 3 · 10 · 25 · 50 lần |

### C. Nhiệm vụ và thử thách

| Series key | Ghi nhận | Mốc khởi điểm đề xuất |
|---|---|---|
| `quests` | Hoàn thành nhiệm vụ | 1 · 5 · 15 · 40 · 100 · 200 |
| `daily-missions` | Hoàn thành nhiệm vụ ngày | 1 · 5 · 15 · 30 · 60 |
| `weekly-goals` | Hoàn thành mục tiêu tuần | 1 · 3 · 8 · 16 · 32 tuần |
| `challenge-variety` | Hoàn thành nhiều loại game/thử thách | 2 · 4 · 6 · 8 · 10 loại |
| `event-journeys` | Hoàn thành hành trình sự kiện | 1 · 2 · 4 · 8 · 12 sự kiện |
| `boss-challenges` | Vượt thử thách tổng kết | 1 · 3 · 8 · 20 · 40 |

### D. Sáng tạo và AI

| Series key | Ghi nhận | Mốc khởi điểm đề xuất |
|---|---|---|
| `creative-projects` | Hoàn thành tác phẩm sáng tạo | 1 · 5 · 12 · 30 · 60 · 120 |
| `project-iterations` | Chỉnh sửa tác phẩm sau preview/feedback | 1 · 5 · 15 · 40 · 100 lần |
| `creative-tools` | Dùng các công cụ sáng tạo khác nhau | 2 · 4 · 6 · 8 · 10 công cụ |
| `ai-tools` | Hoàn thành hoạt động có công cụ AI | 1 · 5 · 15 · 40 · 100 |
| `prompt-refinement` | Sửa prompt để đạt kết quả phù hợp hơn | 1 · 3 · 10 · 25 · 60 |
| `story-creator` | Hoàn thành truyện/chương do trẻ tạo | 1 · 3 · 8 · 20 · 50 |
| `image-creator` | Hoàn thành sản phẩm hình ảnh | 1 · 5 · 15 · 40 · 80 |
| `code-creator` | Hoàn thành hoạt động lập trình | 1 · 5 · 15 · 40 · 100 |
| `portfolio-ready` | Tác phẩm được gửi cha/mẹ duyệt | 1 · 3 · 10 · 25 · 50 |
| `portfolio-approved` | Tác phẩm được cha/mẹ duyệt vào portfolio | 1 · 3 · 10 · 25 · 50 |

### E. Thói quen lành mạnh

| Series key | Ghi nhận | Mốc khởi điểm đề xuất |
|---|---|---|
| `active-days` | Ngày có hoàn thành hoạt động học | 1 · 3 · 7 · 14 · 30 · 60 · 120 |
| `streak` | Ngày học liên tiếp | 3 · 7 · 14 · 30 · 60 · 100 · 180 |
| `comeback` | Quay lại và hoàn thành bài sau một khoảng nghỉ | 1 · 3 · 5 · 10 lần |
| `balanced-week` | Học ở nhiều ngày trong tuần, không dồn một ngày | 1 · 3 · 8 · 16 · 32 tuần |
| `goal-keeper` | Hoàn thành mục tiêu tự chọn | 1 · 5 · 15 · 30 · 60 mục tiêu |
| `healthy-session` | Hoàn thành phiên học trong giới hạn lành mạnh | 3 · 10 · 30 · 75 phiên |

Không dùng achievement để phạt khi mất streak. `comeback` phải ghi nhận việc
quay lại, không hiển thị copy gây tội lỗi.

### F. Cộng tác, phản hồi và an toàn

| Series key | Ghi nhận | Mốc khởi điểm đề xuất |
|---|---|---|
| `collaboration` | Hoàn thành hoạt động cộng tác trong lớp | 1 · 3 · 10 · 25 · 50 |
| `helpful-feedback` | Gửi phản hồi theo mẫu an toàn được giáo viên duyệt | 1 · 3 · 10 · 25 · 50 |
| `feedback-applied` | Cập nhật sản phẩm sau phản hồi | 1 · 3 · 10 · 25 · 50 |
| `reflection` | Hoàn thành câu hỏi tự nhìn lại sau bài | 1 · 5 · 15 · 40 · 80 |
| `safety-skills` | Hoàn thành tình huống kỹ năng số/an toàn AI | 1 · 3 · 8 · 20 · 40 |
| `kind-actions` | Hành động tích cực trong luồng lớp có kiểm duyệt | 1 · 5 · 15 · 40 · 80 |

Không tạo achievement từ tin nhắn tự do, số bạn bè, lượt thích hoặc chia sẻ
công khai. Event cộng tác chỉ phát sau khi backend/giáo viên xác nhận hợp lệ.

### G. Kỷ lục cá nhân và kinh tế game

| Series key | Ghi nhận | Mốc khởi điểm đề xuất |
|---|---|---|
| `stars` | Tích lũy sao từ hoạt động hợp lệ | 10 · 30 · 75 · 150 · 300 · 600 |
| `xp` | Tích lũy XP | 500 · 1.500 · 4.000 · 10.000 · 25.000 · 50.000 |
| `level` | Đạt level tài khoản | 5 · 10 · 20 · 35 · 50 · 75 · 100 |
| `best-score` | Cải thiện kỷ lục điểm của chính mình | 1 · 3 · 10 · 25 · 50 lần |
| `perfect-streak` | Chuỗi hoạt động hoàn thành tốt liên tiếp | 2 · 5 · 10 · 20 · 40 |

Các series này chỉ so với chính học sinh; không tạo global leaderboard.

## 4. Hành động nào không nên biến thành achievement

- Mở app, refresh trang hoặc click menu lặp lại.
- Tổng phút online hoặc cố giữ màn hình mở.
- Xem quảng cáo, mua vật phẩm hoặc thao tác thanh toán.
- Chia sẻ công khai, thu thập follower/like hoặc mời bạn hàng loạt.
- Nhập nhiều prompt rác, gửi nhiều tin nhắn hoặc tải lên nhiều file.
- Duy trì streak bằng một thao tác quá nhỏ không có kết quả học tập.
- Bất kỳ event nào chứa email, số điện thoại, nội dung chat hoặc dữ liệu trẻ
  không cần thiết.

## 5. Cách mở rộng cấp về sau

1. Catalog đọc `milestones[]` từ backend; UI render theo độ dài thực tế.
2. Mỗi release chỉ append mốc cao hơn, ví dụ `300 → 600 → 1.000`.
3. Threshold dùng config, không nằm trong code xử lý event.
4. Tên và artwork có thể tiến hoá theo nhóm 3–4 mốc, nhưng metric không đổi.
5. Khi cần đổi metric, tạo `seriesKey` mới và migrate unlock có chủ đích.
6. Achievement dài hơn 6 mốc dùng thanh ngang cuộn; luôn làm nổi mốc hiện tại
   và mốc kế tiếp thay vì nhồi toàn bộ vào một hàng.

## 6. Lộ trình publish

### Phase A — nền tảng (12 series)

`lessons`, `courses`, `stars`, `xp`, `streak`, `active-days`, `quests`,
`perfect-lessons`, `mistakes-fixed`, `creative-projects`, `ai-tools`,
`feature-explorer`.

### Phase B — chiều sâu trải nghiệm

Thêm practice, review, improvement, project iteration, story/image/code,
storybook, event, comeback và goal.

### Phase C — cộng tác có kiểm duyệt

Chỉ bật sau khi backend có event duyệt rõ ràng cho collaboration, feedback,
reflection và safety skills.

## 7. Điều kiện publish production

- Core service phát event ổn định, có owner và test idempotency.
- Gamification Admin có definition, milestone, điểm và reward hợp lệ.
- Copy tiếng Việt nói rõ “làm gì để mở”, không gây áp lực hoặc FOMO.
- Artwork không chứa số; frontend đặt level/progress động.
- Parent visibility giữ riêng tư; không đưa thành tích trẻ ra public mặc định.
- Reward Pack được validate, review và publish theo
  `REWARD_PACK_IMPORT_CONTRACT.md`.
