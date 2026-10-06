# AI Kids — Hiện trạng hiệu năng và kế hoạch tối ưu

**Ngày audit:** 2026-10-05  
**Phạm vi:** đăng nhập, tải trạm/Home, Parent Portal, Admin Portal, Hub, core services và PostgreSQL.  
**Trạng thái:** đã triển khai các thay đổi local và kiểm thử theo mục 10; chưa deploy, chưa migrate hoặc sửa dữ liệu production.

## 1. Kết luận ngắn

DB hiện chưa phải nút thắt chính và chưa thấy N+1 query nghiêm trọng trong các luồng đã kiểm tra. Cảm giác chậm chủ yếu đến từ:

1. HTTP client chỉ dedupe GET đang chạy; TanStack Query đã có cache riêng, cần tối ưu từng projection thay vì bật TTL toàn cục;
2. bootstrap đăng nhập người lớn có waterfall `/auth/me -> /auth/access -> /auth/context`;
3. một màn hình gọi nhiều endpoint và phải chờ endpoint chậm nhất;
4. Parent có N+1 ở tầng HTTP khi lấy teacher-feedback theo từng trẻ;
5. Home/trạm lấy nhiều projection có dữ liệu chồng lặp rồi merge tại frontend;
6. các endpoint tổng hợp như Admin System chưa có bằng chứng timing chi tiết theo từng chặng.

Ưu tiên sửa request architecture và observability trước khi tối ưu SQL.

## 2. Kiến trúc request hiện tại

```text
Browser
  -> /api/* cùng origin
  -> StoryMee Hub :5100
  -> Account :4502 / Billing :4507 / LMS :4509 / Gamification :4513
  -> Prisma / PgBouncer
  -> Supabase PostgreSQL
```

Account, Billing, LMS và Gamification đã được xác minh cùng đi tới một Supabase PostgreSQL. Gamification đi qua PgBouncer nhưng đích cuối vẫn là cùng DB host.

## 3. Bằng chứng runtime và DB

### 3.1 Runtime

- Hub và các service Account, LMS, Billing, Gamification đều trả health `200`.
- TTFB nội bộ qua Hub cho health endpoint khoảng `0,7–1,6 ms`.
- Vite proxy/local request chưa đăng nhập có TTFB khoảng `123–155 ms`; proxy local không phải bottleneck lớn độc lập.

### 3.2 Quy mô dữ liệu tại thời điểm audit

| Bảng | Số dòng ước tính |
| --- | ---: |
| `child_profiles` | 21 |
| `lms_course_enrollments` | 151 |
| `lms_lesson_progress` | 1.064 |
| `user_subscriptions` | 21 |
| `lms_teacher_observations` | 0 |

### 3.3 EXPLAIN ANALYZE

- Query enrollment/pathway của learner lớn nhất: khoảng `0,716 ms`.
- Query danh sách con của household lớn nhất: khoảng `0,167 ms`.
- PostgreSQL hiện chọn sequential scan ở một số query vì bảng rất nhỏ. Đây là lựa chọn hợp lý tại quy mô hiện tại, không phải bằng chứng DB chậm.

### 3.4 N+1

Không thấy N+1 DB trong các luồng chính đã kiểm tra:

- danh sách con dùng `findMany` và các query batch `ANY(uuid[])`;
- pathway dùng query quan hệ có `include` course/progress;
- teacher feedback gom teacher bằng `WHERE id IN (...)`;
- subscription tra theo `user_id` có unique index.

Có N+1 ở tầng HTTP của Parent:

```text
GET /parent/children
  -> GET teacher-feedback/{child-1}
  -> GET teacher-feedback/{child-2}
  -> ... một request cho mỗi trẻ
```

## 4. Hiện trạng theo luồng

### 4.1 Cache frontend

`apps/web/src/shared/lib/api.ts` chỉ coalesce các GET đang chạy đúng cùng thời điểm. Sau khi hoàn tất, response bị loại khỏi map; TTL thực tế bằng `0`.

Hệ quả:

- đổi route rồi quay lại thường tải lại;
- component mount lệch thời điểm vẫn gọi trùng endpoint;
- focus, remount hoặc revalidation dễ tạo request mới;
- backend phải xử lý lại dữ liệu ít thay đổi.

### 4.2 Login và bootstrap

Mọi route bảo vệ bị chặn cho tới khi bootstrap hoàn tất. Tài khoản người lớn có thể đi theo chuỗi:

```text
GET /api/auth/me
  -> GET /api/auth/access nếu response chưa có access
    -> POST /api/auth/context nếu context khác
      -> render portal
```

Tài khoản Firebase-only còn có thể phải chờ `/login/adult` trả `401` rồi mới bắt đầu Firebase exchange.

### 4.3 Home và tải trạm

Home gọi ít nhất:

- `/api/courses`;
- `/api/v1/lms/compat/pathway`;
- `/api/gamification/profile`;
- `/api/gamification/daily-mission`.

`courses` và `pathway` có dữ liệu chồng lặp. Home phải merge hai projection và chỉ bỏ loading chính sau khi cả courses và pathway hoàn tất. `useProgression` còn đặt `staleTime: 0` và `refetchOnMount: always`.

### 4.4 Parent Dashboard

Dashboard gọi song song:

- children;
- approvals;
- subscription.

AppShell đồng thời gọi lại children để tính feedback badge, rồi fan-out thêm một teacher-feedback request cho mỗi trẻ. Với ba trẻ, khi mở Parent có thể phát sinh tối thiểu bảy request chỉ cho dashboard và badge.

### 4.5 Parent Learning

Khi chọn một trẻ, màn hình gọi song song bảy nguồn:

- competency map;
- credentials;
- pathway;
- age policy;
- courses;
- progress;
- household subscription.

UI hiện vẫn chịu ảnh hưởng bởi endpoint chậm nhất và có timeout riêng `3,5 giây`. Subscription là dữ liệu household nhưng bị tải trong luồng child learning.

### 4.6 Admin

Sau auth bootstrap, trang tổng quan chờ `/api/admin/system`. Đây là endpoint tổng hợp nhiều count và trạng thái hệ thống; hiện chưa có `Server-Timing` để biết thời gian nằm ở Hub, service, pool connection hay SQL.

## 5. Điểm DB cần chuẩn bị khi tăng quy mô

`lms_course_enrollments` hiện có unique index:

```sql
(course_id, learner_key)
```

Pathway lại lọc chủ yếu theo `learner_key`, `status` và sắp xếp `enrolled_at`. B-tree trên `(course_id, learner_key)` không tối ưu cho query chỉ có `learner_key`.

Index dự kiến khi dữ liệu tăng:

```sql
CREATE INDEX CONCURRENTLY
ON lms_course_enrollments
  (learner_key, status, enrolled_at DESC);
```

Không triển khai index này chỉ dựa vào dự đoán. Cần xác nhận lại bằng `EXPLAIN (ANALYZE, BUFFERS)` trên dữ liệu lớn hơn hoặc khi query pathway bắt đầu vượt budget. Query hiện dưới `1 ms`, vì vậy index không phải P0.

## 6. Kế hoạch tối ưu theo thứ tự

### P0 — Observability end-to-end

**Mục tiêu:** xác định chính xác thời gian tại từng chặng trước khi tối ưu tiếp.

- Giữ một `X-Request-Id` từ browser qua Hub tới core service.
- Thêm `Server-Timing` cho auth, proxy/upstream, Prisma acquire, DB query và serialization.
- Ghi metric p50/p95/p99 theo route, không log PII, token hoặc dữ liệu trẻ em.
- Đo cold load và warm load cho login, Home, Parent và Admin.

**Hoàn thành khi:** dashboard timing chỉ ra được endpoint và chặng chiếm thời gian, không cần suy đoán từ tổng TTFB.

### P1 — Loại HTTP N+1 ở Parent

**Mục tiêu:** số request không tăng theo số trẻ.

- Tạo endpoint summary thuộc LMS/Hub trả latest published feedback cho tất cả child được parent sở hữu.
- Backend batch bằng `learner_key IN (...)` và `GROUP BY`, không loop query từng child.
- Dùng chung kết quả children giữa AppShell và Parent Dashboard.
- Chỉ poll badge khi tab visible; ưu tiên revalidate nền.

**Kỳ vọng:** Parent initial load từ `4 + N` request xuống số request cố định.

### P2 — Cache/SWR có scope theo identity

**Mục tiêu:** hiển thị dữ liệu gần nhất ngay, revalidate nền, không dùng browser cache để cấp quyền.

TTL khởi điểm đề xuất:

| Dữ liệu | TTL gợi ý | Invalidate |
| --- | ---: | --- |
| `auth/me` | 15–30 giây | login/logout/context switch |
| parent children | 30–60 giây | add/edit/delete/consent |
| subscription | 30–60 giây | checkout/webhook refresh |
| pathway/progression | 15–30 giây | completion/enrollment/profile switch |
| admin aggregate | 10–30 giây | manual refresh hoặc mutation liên quan |

Mọi cache/query key phụ thuộc learner phải chứa authenticated learner id. 401/403 phải đóng quyền truy cập; stale cache không được mở khóa khóa học hoặc xác nhận payment/progress.

### P3 — Rút gọn auth waterfall

**Mục tiêu:** login/bootstrap bình thường chỉ cần một server round-trip trước khi render shell.

- Để response login và `/auth/me` trả `user`, `access`, `activeContext` cùng lúc cho account người lớn.
- Chỉ gọi `POST /auth/context` khi người dùng chủ động đổi context hoặc context hiện tại thực sự không hợp lệ.
- Giữ nhánh Firebase migration nhưng đo tỷ lệ tài khoản phải đi qua fallback; migrate dần để không trả `401` rồi mới bắt đầu login thật.
- Có thể render shell skeleton sau khi xác định identity, thay vì chặn toàn bộ portal bởi dữ liệu phụ.

### P4 — Hợp nhất projection Home/trạm

**Mục tiêu:** một nguồn LMS authoritative cho course, enrollment và station progress.

- Chọn pathway làm projection chính cho Home nếu contract đã đủ dữ liệu.
- Loại request `/courses` trùng lặp, hoặc chỉ tải catalog khi pathway chưa chứa metadata cần thiết.
- Với dữ liệu xuyên domain, tạo BFF overview ở Hub và fan-out song song bằng pooled HTTP client.
- Không đưa billing/entitlement truth vào cache frontend.

**Kỳ vọng:** Home critical path chỉ phụ thuộc một LMS projection; gamification/daily mission tải nền.

### P5 — Progressive loading cho Parent Learning

**Mục tiêu:** dữ liệu chính xuất hiện trước, panel phụ không chặn cả trang.

- Critical: child summary, courses/pathway và progress.
- Deferred: competency, credentials và age policy.
- Household subscription: tải một lần ở Parent scope và chia sẻ cho các tab.
- Mỗi panel có error/skeleton riêng; không giữ full-page loading vì một endpoint phụ chậm.

### P6 — Admin aggregate

**Mục tiêu:** first paint không phụ thuộc mọi health/count.

- Chạy các count/service check song song.
- Cache aggregate ngắn hạn tại service/Hub.
- Trả overview tối thiểu trước; audit/log/AI checks tải sau.
- Đo và tối ưu query riêng chỉ khi timing chứng minh DB là chặng chậm.

### P7 — Index và DB tuning theo số liệu

- Theo dõi slow query và `pg_stat_statements` nếu được bật.
- Đặt budget cho pathway DB query, ví dụ p95 dưới `20 ms`.
- Thêm index `(learner_key, status, enrolled_at DESC)` khi scan cost hoặc dữ liệu đủ lớn.
- Chạy `CREATE INDEX CONCURRENTLY` theo migration có rollback/verification; không sửa production trực tiếp.

## 7. Tiêu chí thành công đề xuất

Đo trên cùng môi trường, cùng account test và cùng network:

| Luồng | Mục tiêu warm p75 | Mục tiêu cold p75 |
| --- | ---: | ---: |
| Login tới shell usable | < 1,0 giây | < 1,8 giây |
| Home thấy danh sách đảo/trạm | < 0,8 giây | < 1,5 giây |
| Parent Dashboard usable | < 0,8 giây | < 1,5 giây |
| Parent đổi tab đã tải | < 0,2 giây | — |
| Admin Overview usable | < 1,0 giây | < 2,0 giây |

Các chỉ số bổ sung:

- không có request count tăng tuyến tính theo số trẻ;
- không request trùng endpoint/scope trong cùng một navigation;
- cache hit/miss và invalidation có metric;
- profile switch không hiển thị dữ liệu của learner trước;
- p95 DB của các query chính nằm trong budget;
- 401/403 không fallback sang demo/local data.

## 8. Trình tự triển khai khuyến nghị

```text
Sprint 1: P0 timing + baseline test
  -> Sprint 2: P1 Parent N+1 + P2 scoped SWR
    -> Sprint 3: P3 auth bootstrap + P4 Home projection
      -> Sprint 4: P5 Parent Learning + P6 Admin
        -> P7 DB index khi số liệu xác nhận cần thiết
```

Mỗi phase cần đo trước/sau và có test hai trẻ dùng chung một browser để bảo đảm cache, draft và query key không làm rò dữ liệu giữa các learner.

## 9. Ràng buộc an toàn

- Browser chỉ gọi `/api/*` qua StoryMee Hub.
- StoryMee Hub/core service/DB là nguồn authoritative cho identity, ownership, entitlement, payment, progress, XP và reward.
- Cache frontend chỉ phục vụ tốc độ hiển thị; không được cấp quyền hay xác nhận trạng thái cuối cùng.
- Mọi learner query/cache key phải có learner id đã xác thực.
- Không deploy, restart, migrate hoặc sửa dữ liệu production nếu chưa có phê duyệt rõ ràng, backup/rollback và audit record.

## 10. Triển khai local và kiểm chứng — 2026-10-05

### Đối chiếu commit

- Frontend được kiểm tra lại trên `723b5b51`, sau các commit billing `3e11878b`, checkout `bf02e1ca`, creative `677a1eeb` và `723b5b51`.
- Trong lúc triển khai, các commit `98e365b1`/`3e11878b` đã bao gồm nhiều thay đổi hiệu năng của đợt này. Không reset hoặc ghi đè các commit đó.
- Backend base: LMS `cf6e1cc`, Account `1bc1916`, System `b5a5759`, Hub `74ae380`. Các repo có thay đổi dở dang từ trước; không coi toàn bộ working-tree diff là thay đổi của đợt này.
- Xung đột logic đã xử lý: giao diện Home của commit billing mới vẫn thể hiện gói đã mua, nhưng link đảo phải theo trạng thái khóa của LMS. Tham số URL/localStorage giả lập mua gói chỉ được đọc trong dev.
- Creative giữ stream/polling và reference image của commit mới; origin backend được đưa về cấu hình chung, không hardcode trong domain adapter.

### Kết quả theo phase

| Phase | Thay đổi local | Giới hạn / bước nghiệm thu runtime |
| --- | --- | --- |
| P0 | Giữ request id sẵn có; thêm Server-Timing tổng thời gian service cho Account, LMS, Admin System. Đo DB read-only và bundle graph. | Chưa hoàn thành observability end-to-end: cần pool/acquire/SQL/proxy spans và dashboard p50/p95/p99; chưa có phép đo browser cold/warm cùng tài khoản sau deploy. |
| P1 | Badge Parent dùng một endpoint summary LMS, hai query cố định (owned children + groupBy published feedback); không fan-out theo số trẻ; chỉ poll khi tab visible. | Deploy LMS trước FE; xác minh Hub forwarding và ownership bằng tài khoản staging. |
| P2 | Session epoch loại GET trả muộn; cache Parent có identity/context/epoch; children dùng chung query 30s; progression 15s; clear cache khi đổi profile. Redis bỏ L1 mỗi replica và bỏ cache learner entitlement projection. | Không bật TTL cho auth, subscription hoặc entitlement. Đổi lấy thêm một số lần đọc DB để không phục vụ quyền học hết hạn. |
| P3 | Adult login/Firebase/me trả access cùng user; tái sử dụng user đã xác thực để tránh query lại; child không gọi adult access. | Context switch thật vẫn cần request riêng; Firebase migration fallback vẫn tồn tại. |
| P4 | Home lấy pathway làm nguồn course/progress; bỏ GET courses trùng; bỏ import tĩnh WorldPage/full curriculum khỏi critical graph. | Offline sync còn là dynamic import khi Home mount; số liệu graph bên dưới không đại diện tổng byte tải cả phiên. |
| P5 | Parent Learning hiển thị critical data trước; competency/credentials/age policy có lỗi/retry riêng; chặn response cũ khi đổi trẻ; subscription tách household state. | Subscription không cache kết quả theo TTL, chỉ coalesce khi request trùng thời điểm. |
| P6 | Admin system view dùng một SQL round trip chỉ lấy số liệu cần; analytics vẫn dùng contract cũ. | Không thêm cache aggregate khi chưa có invalidation đáng tin cậy; cần đo lại TTFB runtime. |
| P7 | Kiểm tra EXPLAIN và pg_stat_statements; không thêm index. | Chỉ migrate khi số liệu chứng minh cần thiết; đây là quyết định theo bằng chứng, không phải index bị quên. |

Sửa bổ sung cho tính nhất quán: LMS outbox chỉ đánh dấu published sau JetStream PubAck, retry giữ message id; event polling tách khỏi reminder polling. Queue offline frontend dừng giữa các item khi session đổi, giữ key bài kiểm tra khi retry, và không xóa item của learner khác khi dọn queue.

### Hiệu năng đã đo

Đợt xác minh DB bổ sung: query enrollment khoảng 0,31 ms; các mean query liên quan trong pg_stat_statements khoảng 0,39–3 ms. Tuy nhiên `SELECT 1` từ container service sau warm-up mất khoảng 46–93 ms (LMS khoảng 73–75 ms). Do đó **SQL execution nhanh không đồng nghĩa round trip DB nhanh**. Cần tiếp tục đo pool/network và vị trí triển khai trước khi kết luận backend không phải nút thắt.

Static JavaScript dependency graph của entry + Home (cộng từng chunk, gzip riêng):

| | Baseline trước thay đổi | Build sau thay đổi |
| --- | ---: | ---: |
| Số chunk tĩnh | 27 | 21 |
| Raw | 1.147,3 KiB | 708,8 KiB |
| Gzip | 307,4 KiB | 198,7 KiB |

Giảm khoảng 38% raw / 35% gzip trên critical static graph. Đây **không phải** kết quả LCP/TTFB hay tổng payload cả phiên; dynamic imports, ảnh, font và cache browser cần đo riêng. CSS vẫn khoảng 622 KiB raw.

### Verification local

- LMS: build và toàn bộ 119 tests qua, dùng DB/Redis test trỏ cổng local không hoạt động để tránh đụng dữ liệu thật; test cache, scope feedback và durable outbox có mock riêng.
- Account: build, test session access mới và suite Firebase Google qua. Chưa chạy suite audit có khả năng ghi DB vào môi trường thật.
- System: build và 8 tests qua, có test admin guard trước query, một round trip, đúng DTO và không tải analytics.
- Frontend trên HEAD `723b5b51` + working changes: typecheck qua; **192 files / 1.550 tests qua**; build, asset validation và performance budget qua. Có regression cho GET trả muộn, lesson start scope, Parent đổi A → B khi request A chưa xong, panel credentials chậm, và offline retry/profile switch.
- `git diff --check` frontend/Account/System qua. LMS còn hai cảnh báo blank-line EOF có sẵn ở `catalog/schemas.ts` và `learning/legacy-compat.test.ts`; không sửa nội dung ngoài phạm vi vì đang có thay đổi khác.

### Thứ tự rollout và rollback đề xuất

Chưa thực hiện rollout. Khi được phép: xác minh stream JetStream LMS_EVENTS tồn tại và PubAck hoạt động trên staging; deploy LMS/Account/System trước, rồi FE. Endpoint Admin cũ vẫn phục vụ analytics; backend cũ bỏ qua view sẽ trả payload đầy đủ nên client tương thích. Badge summary cần backend mới trước FE. Theo dõi lỗi 401/403, publish retry/pending outbox, request count và cache/profile-switch trên hai trẻ/hai household. Rollback theo artifact từng service, không reset hàng loạt các repo dirty; không có DB migration cần rollback.

Không đánh dấu toàn bộ kế hoạch đã hoàn tất hoặc đạt “nhanh nhất” khi chưa có cold/warm p75/p95 sau triển khai và observability chi tiết P0.

## 11. Tiếp tục P0 — correlation và timing ở Hub

Đối chiếu lại: FE `723b5b51`, Hub `74ae380`; không thay đổi base commit trong lượt này.

- HTTP client browser sinh `X-Request-Id` cho mỗi wire request JSON/blob/SSE/session verification. GET coalescing giữ nguyên; không thay đổi hoặc tái sử dụng correlation ID làm idempotency key. Header correlation caller truyền được giữ nguyên.
- Hub bọc transport dùng chung bằng `httptrace`, giữ pooled transport và OpenTelemetry có sẵn. Không đọc/buffer body. `Server-Timing` của core service được giữ và bổ sung `hub_upstream_headers` và `hub_connection`.
- `hub_connection`: từ GetConn tới GotConn, **gồm** pool wait và DNS/TCP/TLS nếu cần; không gọi đây là thời gian pool thuần. `hub_upstream_headers`: từ bắt đầu RoundTrip tới khi nhận response headers; không gồm streaming/download body. Các số đo này chồng lấp với timing core, không cộng chúng thành tổng. Semantics theo [Go httptrace](https://pkg.go.dev/net/http/httptrace).
- Với response BFF tự tổng hợp JSON, timing của các request nội bộ không tự trở thành header của BFF; vẫn cần span/BFF instrumentation riêng. Lỗi transport không có response thì không có Server-Timing để xuất.
- Không thêm endpoint telemetry public, không gửi PII hoặc payload qua một dịch vụ mới, không đổi cấu hình runtime.

### Tổng hợp HAR có kiểm soát

Đã thêm `apps/web/scripts/summarize-performance-har.mjs`. Đọc HAR **local**, chỉ xuất nhóm route đã định nghĩa và số đo; ID động, query string, cookies, headers khác và body không đi vào output. Endpoint chưa biết vào nhóm `api/other`. Timing thiếu/-1 được bỏ qua, không coi là 0. Số samples hiển thị theo metric vì không phải mọi request có đầy đủ headers.

```sh
node apps/web/scripts/summarize-performance-har.mjs /absolute/path/cold.har
node apps/web/scripts/summarize-performance-har.mjs /absolute/path/warm.har
node --test apps/web/scripts/summarize-performance-har.test.mjs
```

Sau khi được phép deploy staging: giữ cùng build/account/network; capture riêng cold (cache rỗng) và warm (quay lại cùng route); so request count, wait/total và service timing theo luồng. Dùng Navigation/Web Vitals riêng cho LCP và thời gian màn hình usable: HAR request percentile không thay thế các chỉ số đó. Tệp HAR gốc có thể chứa dữ liệu nhạy cảm, không commit; báo cáo tổng hợp không cần upload HAR. Mẫu nhỏ chỉ dùng chẩn đoán, không kết luận p95 production.

### Verification lượt P0 này

- Hub: `go test ./...` qua; `go test -race ./services` qua. Test mới giữ core timing/request ID/trace callbacks và bảo đảm SSE không bị chờ hết body, cancellation/error không đổi.
- HAR reporter: 2 tests qua, gồm percentile, timing thiếu và chống xuất dữ liệu nhạy cảm.
- Frontend: typecheck qua; **192 files / 1.551 tests qua**; build, asset validation và performance budget qua. `git diff --check` frontend qua.
- Các cảnh báo whitespace có sẵn ở backend vẫn giữ nguyên; file mới sửa được kiểm tra riêng.
- P0 vẫn chưa hoàn tất: Prisma acquire/SQL spans, dashboard runtime và số đo sau deploy còn thiếu. Không suy diễn những chặng chưa đo từ tổng duration.

## 12. Tiếp tục P0 — thời gian Prisma theo request LMS

Base commit xác minh: FE `723b5b51`, LMS `cf6e1cc`. Giữ các thay đổi dở dang, không deploy/migrate.

LMS thêm AsyncLocalStorage scope từ Fastify `onRequest` và middleware trên Prisma 5 client đang được cài đặt. Không đổi query args, transaction flag, result/error hay datasource/connection-limit của working tree. Không lưu SQL, parameters, model/resource IDs hoặc payload vào scope timing. Middleware đo mỗi thao tác Prisma, không khẳng định mỗi thao tác tương ứng đúng một SQL query.

Các metric Server-Timing mới:

| Metric | Ý nghĩa |
| --- | --- |
| `lms` | Từ onRequest tới onSend, đo bằng monotonic clock độc lập với cấu hình logger. Không gồm truyền hết response body. |
| `lms_db_busy` | Hợp các khoảng có ít nhất một thao tác Prisma đang chạy trong request. Các lời gọi song song chỉ tính khoảng chồng nhau một lần. |
| `lms_db_sum` | Tổng duration các thao tác Prisma đã settle trước onSend, có thể lớn hơn thời gian request khi query song song. |
| `lms_db_calls` | Số thao tác Prisma bắt đầu trong scope request; số nguyên trong `desc`, không phải duration. |
| `lms_db_errors` | Số thao tác thất bại trước onSend; giữ nguyên exception cho code nghiệp vụ xử lý. |

Timing được chốt khi gửi response. Background work kết thúc muộn không sửa snapshot hoặc số liệu của request tiếp theo. Worker không nằm trong HTTP request scope vẫn chạy như cũ và không bị ghi nhận nhầm vào một request khác. Nếu một request cố ý để DB chạy sau response, calls có thể bao gồm thao tác chưa settle còn sum chỉ gồm thao tác đã settle; không dùng trường hợp đó để phân tích tổng chi phí worker.

**Giới hạn:** client-operation duration bao gồm overhead client/engine, chờ pool có thể xảy ra, network và SQL. Không gọi nó là SQL execution time. Transaction acquisition/commit ngoài model operation, query engine spans và pool wait riêng chưa được đo bởi middleware này. P0 vẫn còn phần tracing nội bộ cần staging/runtime xác minh; Account/System không tự có các metric LMS này.

HAR reporter nhận thêm hai duration và hai counter; counter nằm trong `counts`, không cộng vào timing milliseconds. Có thêm test xác nhận duration chồng lấp và operation count tách riêng.

Verification: LMS build + toàn bộ **122 tests qua**, gồm concurrent-request isolation, failure, giữ timing header có sẵn, giữ reference của Prisma args/result/error và transaction flag, late-background isolation. HAR reporter **3 tests qua**. Frontend typecheck, build, asset validation và performance budget qua. Không thay đổi frontend runtime trong lượt này; lượt full Vitest gần nhất vẫn là 1.551 tests qua. `git diff --check` các file sửa lượt này qua; không sửa cảnh báo EOF có sẵn ở các file backend khác.

## 13. Tiếp tục P0 — Account histogram và sửa timing bằng 0

HEAD đối chiếu: FE `723b5b51`, Account `1bc1916`, System `b5a5759`. Không thay đổi dependencies hoặc cấu hình runtime.

Phát hiện bổ sung: Account và System đều `logger: false`. Fastify `reply.elapsedTime` có thể bằng 0 với cấu hình này; header trước đó không đủ tin cậy. Account và Admin System đã chuyển sang monotonic clock từ onRequest tới onSend, giữ Server-Timing có sẵn và request ID. Có regression kiểm tra duration lớn hơn 0 khi logger tắt.

Account sử dụng registry `prom-client` đã có để xuất histogram **`account_http_request_duration_seconds`** tại `/metrics` hiện hữu. Không thêm public endpoint hoặc mở rộng CORS. Histogram đo tới onResponse, khác với header đo tới onSend. Labels chỉ gồm method chuẩn, route template đã đăng ký và status class. 404 chưa match dùng `unmatched`; `/metrics` không tự ghi vào histogram. Không đưa URL thực, query string, user/child ID, request ID hay token vào labels.

### PromQL cho collector/dashboard hiện hữu hoặc staging được phê duyệt

p95 theo method/route cho response thành công:

```promql
histogram_quantile(0.95,
  sum by (le, method, route) (
    rate(account_http_request_duration_seconds_bucket{status_class="2xx"}[5m])
  )
)
```

Đổi `0.95` thành `0.50` hoặc `0.99` để lấy p50/p99. Đơn vị giây; đây là bucket estimate, cần đủ request mẫu. Không gọi một phép đo đơn lẻ là p95 production.

Request throughput:

```promql
sum by (method, route) (
  rate(account_http_request_duration_seconds_count[5m])
)
```

Tỷ lệ server error:

```promql
sum by (method, route) (
  rate(account_http_request_duration_seconds_count{status_class="5xx"}[5m])
)
/
sum by (method, route) (
  rate(account_http_request_duration_seconds_count[5m])
)
```

Không cấu hình scrape hoặc công khai `/metrics` trong lượt này. Chưa có bằng chứng collector/dashboard runtime đang thu metric mới; không tuyên bố dashboard đã hoạt động.

### Tracing sâu còn thiếu

Account có file `instrumentation.ts` chưa được import vào entrypoint và dependencies OpenTelemetry không có trong manifest trực tiếp hiện tại. Shared Prisma schema được kiểm tra chưa bật tracing. Vì vậy chỉ thêm header hoặc import file này không đủ chứng minh có spans acquire/network/SQL. Cần xử lý shared Prisma generation + dependencies/version + collector trong một thay đổi có integration test và staging, không bật mù trên runtime hiện tại. Các sửa timing/histogram ở trên không phụ thuộc pipeline đó.

Verification: Account build và 2 tests (request-performance + session access) qua. Test histogram kiểm tra route aggregation, 403/404, không chứa dữ liệu nhạy cảm, bỏ qua self-scrape. Firebase Google suite qua; System build + 8 tests qua. Diff check các file sửa lượt này qua. Frontend runtime không thay đổi trong lượt này; verification frontend gần nhất vẫn giữ hiệu lực. Các thay đổi local chưa deploy; không sửa dữ liệu DB.

## 14. Tracing Prisma engine — kiểm chứng local ngày 2026-10-06

Đối chiếu commit: Shared Libs `ae1fe61` (đã có migration index AI Kids của công việc trước), Account `1bc1916`, frontend `723b5b51`. Không thêm index hoặc chạy migration; giữ các thay đổi schema/dist khác đang có.

### Thay đổi đã chuẩn bị

- Shared Prisma 5.22 thêm `previewFeatures = ["tracing"]` ở generator; **không regenerate đè lên tracked `dist`**. Thư mục đó đang có nhiều thay đổi chưa commit, không thể coi việc publish nguyên working tree là một release tracing độc lập.
- Thêm script `0-Shared-Libs/prisma-client/scripts/build-tracing-validation-client.py` để sinh client vào thư mục tạm, đóng gói runtime/native engine cùng phiên bản, không đụng DB hoặc output đang sửa. Schema validation qua. Script phục vụ kiểm thử, không phải publish script.
- Account pin `@prisma/instrumentation` 5.22.0 phù hợp client; dùng trace provider/exporter tối thiểu của OpenTelemetry 1.x tương thích, không bật auto-instrumentation toàn bộ Node. Manifest và lockfile được cập nhật cùng nhau.
- Tracing **mặc định tắt**. Chỉ khởi tạo khi `AIKIDS_DB_TRACING=true`, có OTLP endpoint và `OTEL_SDK_DISABLED` khác `true`. Tracing được khởi tạo sau dotenv, trước khi import Prisma/domain modules; khi tắt không nạp SDK/exporter.
- Dùng W3C trace context từ request Hub qua Fastify vào Prisma. Không dùng request ID làm identity hay authorization.
- Exporter loại toàn bộ query/SQL/args/URL, attributes, events, links, status message, process/environment metadata; chỉ giữ trace/span IDs, quan hệ cha-con, tên span nội bộ đã kiểm tra, duration và status code. Không bật logs/metrics exporters của OpenTelemetry. Prometheus registry cũ vẫn độc lập.
- Queue export được giới hạn 512 spans, batch 64; timeout exporter 2s / batch 3s. Shutdown flush provider trong luồng dừng Account. Collector hay shared client chưa được phát hành/bật trên production.

Prisma 5 cần preview flag để có engine spans; tham chiếu [Prisma tracing](https://www.prisma.io/docs/orm/v6/prisma-client/observability-and-logging/opentelemetry-tracing). Phiên bản SDK/instrumentation không được nâng riêng lẻ mà bỏ integration test vì Prisma 5 dùng cấu trúc span của SDK 1.x.

### Bằng chứng test thật, không chỉ mock

Dùng PostgreSQL 16 container **local riêng**, bind loopback với port ngẫu nhiên, database/user test; OTLP collector HTTP cũng chạy loopback. Client sinh vào thư mục tạm từ schema hiện tại. Test thực hiện SELECT, transaction commit và transaction rollback; không tạo dữ liệu nghiệp vụ.

- Collector nhận `prisma:engine:connection` và `prisma:engine:db_query`.
- Trace ID giả lập từ Hub đến được **db_query span qua Fastify request hook**, không chỉ ở client span.
- Kết quả SELECT và lỗi rollback giữ nguyên; output collector không có SQL, dữ liệu canary hoặc thông tin process.
- Test exporter không sửa span nguồn; test chế độ tắt xác nhận không nạp SDK/exporter.
- **5 tests qua**, Account build qua, Firebase Google regression suite qua, diff check các file sửa qua. Container thử nghiệm được dừng/xóa sau kiểm thử.
- Lượt đầu phát hiện thiếu runtime assets trong output generate tạm trên Node hiện tại và cleanup test khi khởi tạo thất bại; đã sửa script đóng gói tạm, cleanup collector và thêm timeout test. Kết quả cuối dùng client sinh bởi script tái lập được.

### Dependencies và giới hạn release

Kiểm tra dependency đã loại SDK tổng hợp không cần thiết, đồng thời pin bản sửa propagator Jaeger bằng override (runtime chỉ đăng ký W3C). `npm audit` vẫn báo các mục high ở Fastify/Busboy/grpc trong cây Account; chưa xử lý bằng nâng cấp hàng loạt ở lượt tracing này. Không gọi cây dependency là sạch vulnerability.

Để nghiệm thu runtime: chuẩn bị release shared client từ đúng phần schema được chọn, không publish lẫn các thay đổi billing/schema đang dở; kiểm tra compatibility ở Account rồi staging với collector nội bộ và sampling có kiểm soát. Chưa publish package, deploy, thay đổi collector hoặc sửa dữ liệu production. LMS hiện vẫn có per-request middleware timing, chưa tự nhận pipeline exporter của Account.

Engine `db_query` span vẫn có thể bao gồm giao tiếp client–DB; không đồng nhất nó với execution time trong EXPLAIN/pg_stat_statements, và không lấy phép trừ duration chồng lấp để suy ra network latency thuần. Cold/warm p75/p95 sau deploy vẫn là điều kiện nghiệm thu hiệu năng cuối cùng.

Bổ sung verification cuối: sanitizer cũng loại W3C tracestate; 4 unit/regression tests chạy lại sau bổ sung này và build qua. Test integration PostgreSQL thật đã qua ở lượt trước với cùng pipeline. `npm test` Account nay bao gồm `test:performance`; integration test tự skip nếu thiếu `AIKIDS_TRACING_TEST_CLIENT` và `AIKIDS_TRACING_TEST_DATABASE_URL`. Khi chạy integration, test từ chối DB không phải loopback/user test/database test. Không chạy suite audit có thể ghi dữ liệu với production credentials. Script tạo client tạm từ chối chạy nếu generator output không đúng mẫu dự kiến, tránh vô tình ghi đè dist khi schema đổi định dạng.


## 15. Prisma release candidate — local, 2026-10-06

Script `0-Shared-Libs/prisma-client/scripts/build-tracing-release-candidate.py` tạo candidate từ package 1.2.0 đang được Account cài đặt, không lấy schema billing đang sửa trong working tree. Nguồn installed package chưa được đối chiếu checksum registry. Script xác nhận datamodel/datasource và public TypeScript API giữ nguyên; chỉ thêm tracing generator flag, đóng gói runtime/engines Prisma 5.22.0.

- Artifact local: `/tmp/aikids-prisma-tracing-candidate-20261006/storymeedev-prisma-client-1.2.0-aikids-tracing.0.tgz`.
- SHA256: `1437e664029bea0b9ff587a2d2ef69e7512bae4892c777d5563485453ef59643`.
- Candidate đặt `private: true`; chưa publish hoặc thay dependency production.
- Giải nén tarball thật và chạy integration PostgreSQL + exporter tests trong Node 22 Alpine: **3 tests qua**. Native engine ARM64 được thực thi; engine Alpine x64 được đóng gói nhưng chưa được thực thi trên máy x64.
- Container PostgreSQL thử nghiệm được dọn sau kiểm thử. Backend staging và collector runtime vẫn chưa triển khai.

## 16. Frontend-only Vercel Preview — 2026-10-06

Theo lựa chọn của người dùng: chỉ dựng frontend Preview trước, backend staging làm sau. Dùng cùng Vercel project `aikid-lms-production`, target Preview; không promote, không sửa deployment/config/env production.

**URL:** https://aikid-lms-production-2qyz65rzb-zuzziqs-projects.vercel.app

Deployment ID: `dpl_9kgF5Cg4waVZWq4VsU4vdyNzPg7K`. Source HEAD: `723b5b51`, kèm các thay đổi local đang kiểm chứng; đây không phải bản chỉ gồm nội dung đã commit. Đối chiếu HEAD trước/sau build không thấy commit mới.

Script `apps/web/scripts/prepare-frontend-preview.mjs` đóng gói dist vào thư mục tạm riêng theo Vercel Build Output API. Build dùng `VITE_APP_ENV=staging`, `VITE_API_URL=`. Các route `/api`, `/internal`, `/worker`, `/sepay` và đường dẫn con trả JSON `STAGING_BACKEND_NOT_CONFIGURED`, HTTP 503; không proxy backend production. Có header noindex/nofollow và environment frontend-preview. Giữ deployment protection của Vercel.

Verification: frontend build và performance budget qua; test cấu hình route qua. HTTP đã triển khai: `/` 200, `/parent/learning` 200, `/api/auth/me` 503 với đúng error code. Kiểm tra qua Vercel CLI với deployment protection bypass dành cho tài khoản quản trị. Login, dữ liệu học tập/thanh toán và E2E frontend–Hub–DB chưa thể nghiệm thu với bản frontend-only này. Chưa có số đo LCP/p95 runtime để kết luận mức cải thiện thực tế.
