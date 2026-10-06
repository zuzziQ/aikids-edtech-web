# Bàn giao tối ưu hiệu năng AI Kids

Cập nhật: 2026-10-06, Asia/Ho_Chi_Minh. File này dành cho agent tiếp quản; không phải xác nhận toàn bộ kế hoạch đã nghiệm thu production.

## 1. Mục tiêu và quyết định của người dùng

Kiểm tra/tối ưu xuyên frontend → Hub → core services → DB theo P0–P7; tăng tốc tải trang nhưng giữ tính nhất quán, ownership và tránh lỗi dây chuyền. Người dùng yêu cầu **đối chiếu commit mới nhất trước mỗi lần sửa**.

Quyết định cuối: **“Chỉ dựng frontend Preview trước; backend staging làm sau.”** Frontend Preview đã triển khai. Không tự triển khai backend staging, publish shared package, migrate DB, promote Preview hoặc deploy production. Production chưa được sửa/deploy trong công việc này.

Việc đã làm chủ yếu là code local và kiểm thử; chưa có số đo cold/warm browser + backend staging để tuyên bố hệ thống đạt “nhanh nhất”.

## 2. Tài liệu và repository cần đọc

Các đường dẫn dưới đây là nguồn trên máy hiện tại:

- Frontend: `/Users/imam/storymee/1-Harness-Apps/E-learning-AIKids`.
- Plan chi tiết: `docs/PERFORMANCE_AUDIT_AND_OPTIMIZATION_PLAN.md` trong frontend; đọc mục 10–16 để hiểu kết quả triển khai, không chỉ phần đề xuất ban đầu. Một số đoạn cũ đã được các mục sau cập nhật.
- Ownership: `docs/DATA_OWNERSHIP_AND_OFFLINE_SYNC.md`, `AGENTS.md` của frontend và các repo liên quan.
- Runbook: `/Users/imam/storymee/infra/00-Ecosystem-Docs/03-ops/AIKIDS_END_TO_END_AUDIT_RUNBOOK.md`.
- Skills đã áp dụng: `.agents/skills/aikids-engineering/SKILL.md`, `aikids-security-rbac/SKILL.md`, `aikids-domain-curriculum/SKILL.md` trong frontend.
- Account/LMS/System/Hub: `/Users/imam/storymee/2-MCP-Core/{core-account-api,core-lms-api,core-system-api,storymee-hub}`.
- Shared: `/Users/imam/storymee/0-Shared-Libs`, Prisma ở `prisma-client/` (dùng chung Git root Shared Libs).

Hub/core là nguồn authoritative cho identity, ownership, entitlement, progress, rewards và payment. Browser storage không cấp quyền/giá trị. Learner data phải có owner id; billing thuộc household. Không bật child PIN. 401/403 phải fail closed. Profile/account switch phải loại cache/draft/response của identity cũ. Offline mutation cần owner + idempotency key.

## 3. Snapshot Git và cảnh báo gộp thay đổi

HEAD vừa kiểm tra lại khi tạo file bàn giao:

| Repository | HEAD |
| --- | --- |
| Frontend | `723b5b51` |
| Account | `1bc1916` |
| LMS | `cf6e1cc` |
| System | `b5a5759` |
| Hub | `74ae380` |
| Shared Libs | `ae1fe61` |

Frontend có các commit gần nhất về creative/payment: `723b5b51`, `bf02e1ca`, `677a1eeb`. Một phần sửa performance trước đây đã được công việc khác đưa vào `3e11878b` và `98e365b1`; **không apply lại patch chỉ vì file không còn dirty**. Công việc này không tự tạo commit mới.

Tất cả repo đang có nhiều thay đổi chưa commit, gồm cả công việc khác. Không coi toàn bộ `git diff` là của performance; không reset/clean/stash/rebase tự động hoặc commit toàn bộ. Đặc biệt Shared có schema/dist billing đang sửa, migration chưa tracked và `.github/workflows/publish.yml` bị xóa sẵn; không publish nguyên working tree.

Trước khi sửa tiếp: kiểm tra `git status --short`, `git log -5 --oneline`, đọc diff của từng file liên quan; nếu HEAD đổi, kiểm tra tương tác với thay đổi mới và chạy lại regression phù hợp. Hash baseline cũ có thể còn ở `/tmp/aikids-performance-baseline/`, chỉ là hỗ trợ, không thay thế review hiện tại.

## 4. Các thay đổi đã thực hiện

| Phase | Nội dung | Phần còn thiếu |
| --- | --- | --- |
| P0 | Request ID theo wire request; Server-Timing service/Hub/LMS DB; HAR summary; Account histogram và Prisma tracing local | Collector/dashboard runtime, browser cold/warm và p50/p95/p99 thực tế |
| P1 | Parent badge dùng family feedback summary, 2 query cố định: owned children + published feedback groupBy; poll khi tab visible | Nghiệm thu Hub forwarding/ownership staging; LMS phải có endpoint trước FE |
| P2 | Identity/context/session epoch cho cache và response; children shared query 30s, progression 15s; bỏ Redis L1 mỗi replica, bỏ cache learner entitlement projection | Test đa replica và profile switch runtime; không thêm TTL auth/entitlement/subscription |
| P3 | Adult login/Firebase/me hydrate access với user đã xác thực để tránh query user lặp; child không gọi adult access | Đo auth waterfall staging; context switch vẫn cần request riêng |
| P4 | Home lấy pathway authoritative, bỏ GET courses trùng và import tĩnh WorldPage/full curriculum | Dynamic offline import vẫn tải sau mount; chưa đo LCP |
| P5 | Parent Learning tải critical data trước; panel phụ lỗi/retry riêng; abort/version guard khi đổi trẻ; subscription household riêng | Nghiệm thu tài khoản thật staging |
| P6 | Admin system view aggregate một SQL round trip; giữ contract analytics cũ | Đo TTFB staging |
| P7 | EXPLAIN/pg_stat_statements và round trip DB read-only | Không thêm index/migration khi chưa có bằng chứng; index trong Shared HEAD đã tồn tại từ trước |

### Frontend: các điểm cần giữ khi sửa tiếp

- `apps/web/src/shared/lib/api.ts`: request ID, cache/session epoch, loại GET trả muộn của session cũ; lessonStart dedupe theo epoch/owner/lesson.
- Parent query/cache và AppShell remount theo identity; regression đổi A → B khi A chưa trả về. Subscription chỉ coalesce inflight, không cache TTL.
- `learning-sync-store.ts`: dừng replay giữa các item khi session đổi; submitCheck giữ idempotency key theo owner/item; chỉ xóa item thành công của đúng owner.
- Home giữ giao diện purchased từ commit billing mới nhưng khóa course/island theo LMS; DEV override chỉ trong DEV. `household-billing-api.ts` tách adapter billing; `environment.ts` tập trung media origin; creative không hardcode URL riêng.
- `scripts/summarize-performance-har.mjs` + test: tổng hợp percentile/request count/Server-Timing theo route whitelist, không xuất URL/query/PII. Đọc CLI script trước khi chạy.
- `scripts/prepare-frontend-preview.mjs` + test: đóng gói Preview cô lập backend, mô tả ở mục 6.

### Backend: các điểm chính

- LMS teacher-feedback family summary kiểm tra ownership; outbox chỉ đánh dấu published sau JetStream PubAck, retry giữ message ID. Event polling 500ms riêng reminder polling 30s. Cache Redis không còn L1 replica-local và entitlement projection không dùng cache dễ stale.
- LMS `src/request-timing.ts`: AsyncLocalStorage + Prisma 5 `$use`; đo `db_busy` (union), `db_sum`, calls/errors cùng total; đóng measurement ở onSend; tests concurrent requests, errors và background work. Không ghi SQL/args.
- Hub `backend/services/http_timing.go`: bọc shared pooled transport, vẫn giữ OTel transport; `hub_upstream_headers`, `hub_connection` qua httptrace; mutex bảo vệ callback; không buffer body, giữ SSE/cancellation/error. Connection timing bao gồm pool/DNS/TCP/TLS, không gọi là pool-wait thuần.
- Account `src/metrics/request-performance.ts`: duration bằng monotonic clock, histogram route template/status class, loại metrics self-scrape. System cũng sửa timing bằng 0 khi logger tắt; admin summary có guard trước query và DTO test.

### Prisma tracing Account và candidate

- Account `src/instrumentation.ts` khởi tạo sau dotenv, trước import Prisma/domain. Mặc định tắt; chỉ bật với `AIKIDS_DB_TRACING=true`, OTLP endpoint và SDK không disabled. Dùng NodeTracerProvider tối thiểu, W3C context từ Hub vào Fastify/Prisma; không auto-instrument toàn bộ Node.
- `src/tracing-exporter.ts` loại SQL/args/attributes/events/links/status message/resource metadata/tracestate; giữ identifiers, quan hệ cha-con, tên nội bộ đã kiểm tra, timing/status. Queue 512, batch 64, timeout exporter 2s/batch 3s; shutdown flush.
- Pin Prisma instrumentation 5.22.0, OTel API 1.9.0, core/resources/trace SDK 1.26.0, HTTP exporter 0.53.0; override Jaeger 2.11.0, runtime chỉ W3C. Không nâng từng dependency tùy ý bỏ qua integration test.
- `npm audit` Account vẫn có high Fastify/Busboy/grpc; không tuyên bố dependency sạch, không chạy broad auto-fix.
- Shared schema thêm generator tracing flag nhưng **không regenerate tracked dist**. Scripts `build-tracing-validation-client.py` và `build-tracing-release-candidate.py` tạo output tạm, không ghi DB.
- Candidate tạo từ installed Account shared package 1.2.0, **chưa attestation với registry**. Datamodel/datasource và public TS API được so byte giữ nguyên; tracing generator thay đổi. Candidate private `1.2.0-aikids-tracing.0`, chưa publish; Account manifest vẫn dùng shared 1.2.0.
- Artifact: `/tmp/aikids-prisma-tracing-candidate-20261006/storymeedev-prisma-client-1.2.0-aikids-tracing.0.tgz`.
- SHA256: `1437e664029bea0b9ff587a2d2ef69e7512bae4892c777d5563485453ef59643`. Cùng thư mục có provenance, package và extracted/package.
- Tarball đã chạy trên Node 22 Alpine ARM64 + PostgreSQL 16 local. Engine x64 có trong package nhưng chưa thực thi x64. Test containers đã dừng/xóa.
- Integration `src/tracing.integration.test.ts` skip trừ khi có `AIKIDS_TRACING_TEST_CLIENT` và `AIKIDS_TRACING_TEST_DATABASE_URL`; chỉ nhận DB loopback/user test/database test. Xác nhận SELECT, commit, rollback, trace ID từ Fastify tới engine db_query, không lộ canary/SQL.
- LMS chỉ có middleware timing; chưa có cùng exporter pipeline với Account. Engine db_query có thể bao gồm network; không đồng nhất với SQL execution hoặc trừ span chồng lấp để suy ra network thuần.

## 5. Bằng chứng kiểm thử và giới hạn

Các kết quả dưới đây là từ các lượt trước, không phải tất cả vừa chạy lại lúc viết bàn giao:

- Frontend full Vitest: 192 files, khoảng 1.550–1.551 tests qua tùy lượt bổ sung; typecheck/build/asset validation/performance budget qua. Build Preview mới nhất qua; route config Node test qua.
- LMS build + 122 tests qua ở lượt mới hơn (mục 10 plan ghi 119 ở thời điểm trước); dùng DB/Redis local giả cho unit suite, không production.
- Account build, session access/request timing/exporter tests và Firebase Google regression qua. PostgreSQL tracing integration thật qua; lượt tarball Node 22 Alpine: 3 tests qua.
- System build + 8 tests; Hub `go test ./...` và race services qua.
- FE/Account/System diff check qua. LMS còn EOF blank-line warnings có sẵn ở catalog/schemas và learning/legacy-compat.test; Hub có warning sẵn ở session_cookie_test. Không sửa công việc khác chỉ để làm sạch báo cáo.
- Critical static entry+Home graph: 1.147,3 → 708,8 KiB raw; 307,4 → 198,7 KiB gzip (~35% giảm gzip). Không phải tổng payload phiên hoặc LCP. CSS vẫn ~622 KiB raw.
- SQL enrollment ~0,31ms, các mean query liên quan ~0,39–3ms; warmed service→DB SELECT 1 ~46–93ms (LMS ~73–75ms). Cần đo network/pool/vị trí triển khai; thêm index không giải quyết được round trip này.

Logs có thể còn trong `/tmp`: `aikids-preview-build.log`, `aikids-vercel-preview-deploy.log`, `aikids-candidate-linux-test.log`, `aikids-tracing-delivery-tests.log`, `aikids-tracing-last-unit.log`. File tạm không bảo đảm tồn tại lâu dài. Không đưa credential/cookie/bypass token vào báo cáo hoặc commit.

## 6. Frontend Preview đã triển khai

URL: https://aikid-lms-production-2qyz65rzb-zuzziqs-projects.vercel.app

- Project `aikid-lms-production`, team `zuzziqs-projects`; deployment `dpl_9kgF5Cg4waVZWq4VsU4vdyNzPg7K`, target Preview, không promote production.
- Source: HEAD frontend `723b5b51` **cộng working changes**, không phải artifact từ commit sạch.
- Build `VITE_APP_ENV=staging VITE_API_URL= npm run build` tại `apps/web`.
- Isolated output `/tmp/aikids-frontend-preview-20261006`; script chỉ copy project metadata và static dist, tự tạo Build Output API config v3.
- `/api`, `/internal`, `/worker`, `/sepay` và đường dẫn con trả 503 JSON `STAGING_BACKEND_NOT_CONFIGURED`; không proxy production. Noindex/nofollow; giữ Vercel deployment protection.
- Đã kiểm tra qua `vercel curl`: `/` 200, `/parent/learning` 200, entry `/assets/index-B3KUFs1t.js` 200, `/api/auth/me` 503 đúng body. Deep link có root và đúng entry script; không yêu cầu HTML byte-equal vì Vercel inject feedback.
- Chưa có visual/browser E2E đầy đủ; login/learning/payment data chưa hoạt động vì backend staging chưa có.
- **Không deploy thẳng cấu hình `vercel.json` hiện tại để tạo staging**: các rewrite trỏ `https://dev-hub.storymee.com`, là backend production đang sử dụng dù tên có “dev”. Không đọc/in giá trị `.vercel/.env.production.local`.

Tái tạo khi thực sự cần cập nhật Preview: build mới với env trên, chạy `node apps/web/scripts/prepare-frontend-preview.mjs /tmp/<thu-muc-moi>` từ root (script từ chối output đã tồn tại), rồi `vercel deploy --prebuilt --target=preview --yes --cwd /tmp/<thu-muc-moi>`. Luôn kiểm tra generated routes/test trước deploy; không dùng `--prod`. Không cần redeploy chỉ để tiếp quản.

## 7. Kế hoạch tiếp theo theo thứ tự

1. **Tiếp quản và đối chiếu**: đọc contract/plan, kiểm tra HEAD+dirty từng repo; xác định hunk đã commit vs còn local, nhất là Home/billing/creative/auth và shared schema. Không lặp lại implementation đã có.
2. **Hoàn thiện bằng chứng frontend trong phạm vi hiện tại**: kiểm tra Preview bằng browser nếu có quyền truy cập; deep links/assets/noindex/error states khi API 503. Chỉ sửa lỗi frontend cụ thể có regression; không mở proxy production để làm login hoạt động. Ghi rõ backend-dependent screens chưa thể nghiệm thu.
3. **Chuẩn bị release local có thể review**: tách phạm vi performance khỏi thay đổi khác theo hunk, kiểm tra lockfile/API compatibility; đối chiếu candidate source với package registry hoặc source release đáng tin cậy. Kiểm thử Linux x64 nếu đó là kiến trúc runtime. Không publish candidate private hoặc regenerate toàn bộ dirty schema.
4. **Backend staging là công việc sau theo quyết định người dùng**: chỉ khi người dùng yêu cầu tiếp phần này mới chọn host và dựng Hub/core/DB/Redis/NATS/collector riêng, secrets riêng, test accounts riêng, không production payment/webhook/data. Trước đó vẫn có thể viết cấu hình/test local review được, không tự tạo hạ tầng tính phí.
5. **Khi staging đã được cho phép và sẵn sàng**: xác minh JetStream LMS_EVENTS/PubAck; release shared client được review trước Account tracing; rollout LMS/Account/System và Hub tương thích trước FE. Bật tracing có sampling/collector nội bộ phù hợp và kiểm tra overhead, lỗi export. Không mặc định bật trên production.
6. **Nghiệm thu E2E**: hai household, mỗi household hai trẻ; profile switch trong request đang chạy, cache/late response, 401/403, quyền hết hạn, offline retry/idempotency, outbox retry/dedup, auth bootstrap, parent summary và Admin guard. Kiểm tra SSE không bị buffer/cancel sai.
7. **Đo trước/sau có cùng điều kiện**: cold/warm browser, thiết bị/network thống nhất; request count/waterfall, payload, LCP/INP/CLS và p50/p95/p99 API; tách Hub connection/upstream, service, DB busy/sum và engine spans. Dùng HAR reporter đã có; không thu/công khai PII. Chỉ quyết định DB topology/pool/index sau số liệu.
8. **Production chỉ khi có yêu cầu rõ**: chuẩn bị artifact/version và rollback từng service, báo cáo staging trước; không reset repo dirty. Theo dõi 401/403, pending/retry outbox, latency, request count, profile isolation. Chưa có migration mới của công việc này cần rollback.

## 8. Lệnh xác minh cơ bản cho agent tiếp quản

Tại frontend root:

```sh
git status --short
git log -5 --oneline
git diff --check
npm --prefix apps/web run typecheck
npm --prefix apps/web test
npm --prefix apps/web run build
node --test apps/web/scripts/prepare-frontend-preview.test.mjs
node --test apps/web/scripts/summarize-performance-har.test.mjs
```

Account có `npm run test:performance` (build + các performance tests; DB integration skip nếu thiếu biến test). Đọc package scripts và cấu hình môi trường trước khi chạy suite backend; không chạy audit/seed/migration test có thể ghi DB với production credentials. Với thay đổi Go: chạy `go test ./...` tại Hub/backend và race suite services khi sửa concurrency/transport.

Không cần chạy lại mọi suite chỉ vì nhận bàn giao; chạy theo code mới, commit mới hoặc nghi vấn cụ thể. Trước handoff code: typecheck, relevant tests, build và diff check theo contract.

## 9. Trạng thái kết thúc

Frontend Preview hoạt động ở phạm vi static, backend cố ý đóng 503; production nguyên trạng. P0–P6 đã có phần triển khai và bằng chứng local nhưng chưa nghiệm thu runtime toàn hệ thống; P7 giữ nguyên DB theo số liệu. Prisma candidate và tracing được kiểm chứng local, chưa publish/deploy. Ưu tiên tiếp theo là review Git/Preview/release local; backend staging chờ yêu cầu tiếp của người dùng.
