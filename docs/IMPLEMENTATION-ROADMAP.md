# Implementation Roadmap — 45Days Challenge Coach (v4.1 → MVP)

> **타겟 플랫폼:** 반응형 웹앱 (Next.js)
> **MVP 우선순위:** ① 멀티모달 정확도 ② 포트폴리오/공유용
> **소요 추정:** 2~3주 (1인 풀타임 기준 / 파트타임 4~6주)

---

## 0. 결정된 사항

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 플랫폼 | 반응형 웹 | 사용자 결정 |
| 프레임워크 | Next.js 15 (App Router) | 풀스택 + 배포 단순 + 포트폴리오 가독성 |
| 호스팅 | Vercel | Next.js 정합성 + 프리뷰 URL = 공유 쉬움 |
| LLM | **TBD — §1.2 비교 실험 후 결정** | 한식 멀티모달 정확도가 1순위 |
| DB | Supabase (Postgres) + Notion API 옵션 연동 | row 누적 + 인증 + 무료 티어 |
| 인증 | Supabase Auth (이메일·OAuth) | DB와 한 묶음, 추가 종속성 없음 |
| 스타일링 | Tailwind CSS + shadcn/ui | 디자인 시스템 빠르게 찍기 |

---

## 1. 단계별 마일스톤

### Phase 0 — 결정 잠금 (1일)

**산출물:**
- ✅ `docs/PRD-v4.1.md` (완료)
- ✅ `prompts/system-instruction-v4.1.md` (완료)
- ✅ `schemas/notion-output.schema.json` (완료)
- ✅ `docs/EDGE-CASES.md` (완료)
- ✅ `docs/DB-DESIGN.md` (완료)
- ✅ `docs/AI-PRODUCT-SPEC.md` (완료)
- ⏳ §1.2 모델 비교 실험 결과 (1~2일)
- ⏳ v4.2 instruction (edge-case 결정 4건 반영)
- ⏳ DB 결정 5건 (DB-DESIGN §12) 컨펌
- ⏳ AI 결정 6건 (AI-PRODUCT-SPEC 하단) 컨펌

**Exit criteria:** EDGE-CASES 4건 + DB-DESIGN 5건 + AI-SPEC 6건 컨펌 + LLM 모델 픽스.

---

### Phase 1 — 모델/프롬프트 PoC (2~3일)

**목표:** "사진 + 텍스트 → JSON" 파이프라인이 instruction 그대로 돌아가는지 확인.

**환경 (✅ 셋업 완료):**
- `package.json` + `tsconfig.json` + `.env.example`
- `scripts/poc-claude.ts` — Claude Sonnet 4.6 + Prompt Caching + 스트리밍 TTFT 측정
- `scripts/poc-gemini.ts` — Gemini 2.5 Pro 동일 인터페이스
- `scripts/compare.ts` — 7개 지표 자동 집계 + 우세 모델 추천
- `scripts/lib/` — fixtures 로더, JSON Schema validator, 결과 저장기
- `tests/fixtures/README.md` — 18장 촬영 가이드 (식단 10 + 운동 5 + 체중계 3)
- `tests/fixtures/ground-truth.template.json` — 정답 라벨/칼로리 범위 채울 템플릿

**남은 Tasks (노바님 작업):**
1. ⏳ API 키 발급 (Anthropic + Google AI Studio) → `.env`
2. ⏳ 사진 18장 촬영 (`tests/fixtures/README.md` §1~4 가이드)
3. ⏳ EXIF GPS strip (`exiftool -all= -r tests/fixtures/`)
4. ⏳ `ground-truth.json` 작성 (template 복사 후 18 entries)
5. ⏳ `npm run poc:claude && npm run poc:gemini && npm run poc:compare`

**비교 매트릭스 자동 산출 지표 (7개):**
- JSON Schema 통과율 (≥ 95%)
- 음식 라벨 정확도 (≥ 80%)
- 칼로리 추정 적중률 (≥ 70%, ground-truth 범위 내)
- 운동 키워드 적중률 (≥ 75%)
- 체중 OCR 정확도 (≥ 90%, ±0.3kg)
- 평균 TTFT / 전체 응답 시간 (< 2s / < 8s)
- 호출당 비용 (< $0.015)

**Exit criteria:** `tests/fixtures/results/MATRIX.md` 생성 + 우세 모델 픽스.

**❓ 결정 필요:** Claude / Gemini / 둘 다 지원 (BYOK 패턴)?
> **제안:** MVP는 1개로. 이후 BYOK는 v2 기능.

---

### Phase 2 — 프로젝트 골격 (1일)

```bash
npx create-next-app@latest wellness-coach --ts --tailwind --app --eslint
```

**디렉터리 제안:**

```
src/
├── app/
│   ├── (marketing)/page.tsx        # 랜딩
│   ├── (auth)/login/
│   ├── (app)/
│   │   ├── onboarding/page.tsx     # STEP 1~3
│   │   ├── today/page.tsx          # 입력 화면
│   │   ├── trends/page.tsx         # 시계열 대시보드 (DB-DESIGN §6)
│   │   ├── history/page.tsx        # Day별 원본 조회
│   │   └── reports/[day]/page.tsx  # Day별 리포트
│   └── api/
│       ├── analyze/route.ts        # POST 멀티모달 분석
│       └── notion/route.ts         # POST Notion 동기화 (옵션)
├── lib/
│   ├── llm/                        # 모델 클라이언트 (어댑터 패턴)
│   ├── prompts/                    # system-instruction-v4.1.md 로더
│   ├── schema/                     # Zod + JSON Schema validator
│   ├── score/                      # 행동 점수·기여도 계산 (instruction §2 이식)
│   └── supabase/                   # DB 클라이언트
└── components/
    ├── DailyInputForm.tsx          # 사진+텍스트 업로드
    ├── ReportCard.tsx              # #공식용 리포트 렌더
    ├── ProgressBars.tsx            # 진행 바 시각화
    ├── TrendChart.tsx              # 라인 차트 + 이동평균 (Recharts/Visx)
    └── CalendarHeatmap.tsx         # 월간 히트맵
```

**Exit criteria:** `pnpm dev`로 빈 페이지 렌더 확인.

---

### Phase 3 — 데이터 레이어 (3일)

> **상세 설계는 [`docs/DB-DESIGN.md`](DB-DESIGN.md)** 참조.
> 핵심: 일일 원본 JSON(`daily_records.payload`)과 시계열 정규화 테이블(`metrics`)을
> 듀얼로 두고, 트리거로 payload → metrics 자동 분해.
> 주/월/연 집계는 머티리얼라이즈드 뷰로 사전 계산 → 트렌드 차트 즉시 응답.

**테이블 구성 (총 5 + 정의 1 + MV 3):**

| 테이블 | 역할 |
| --- | --- |
| `profiles` | 사용자 프로필 + 타임존/하루 경계 |
| `challenges` | 다회차 챌린지 (1:N) — 한 사용자 여러 챌린지 |
| `daily_records` | v4.1 #노션용 payload 원본 (audit) |
| `metric_definitions` | metric_type lookup (체중/수면/물/...) |
| `metrics` | 정규화 시계열 (분석의 핵심) |
| `record_attachments` | 사진 |
| `weekly/monthly/yearly_summary_mv` | 사전 집계 |

**Tasks:**
1. Supabase 프로젝트 생성, `pg_cron` 확장 활성화
2. 마이그레이션 — `docs/DB-DESIGN.md` §4 DDL 그대로 적용
3. `metric_definitions` 시드 데이터 13개 INSERT
4. payload → metrics 분해 트리거 (`fn_explode_payload_to_metrics`)
5. RLS 정책 (모든 테이블 user_id 격리)
6. Storage 버킷 `record-photos` (private)
7. 머티리얼라이즈드 뷰 3개 + cron 갱신 잡 (매일 03:00 KST)
8. `lib/supabase/queries.ts` — Zod 스키마 + 자주 쓸 6개 쿼리 (DB-DESIGN §6)

**Exit criteria:**
- 더미 daily_record 1건 insert → 트리거가 metrics 12행 자동 생성 확인
- `select * from monthly_summary_mv where user_id = ...` 1초 이내 응답
- RLS: 다른 user_id로 시도 시 0행 반환

---

### Phase 4 — 핵심 분석 API (3~4일)

**`POST /api/analyze` 흐름:**

```
1. 인증 확인 → user_id 추출
2. Rate limit 체크 (Upstash sliding window — 일 50, 분 5)
3. multipart/form-data로 텍스트 + 사진(N장) 수신
4. 사진 EXIF GPS strip (Sharp.js, 클라이언트 단에서 1차)
5. 입력 인젝션 1차 필터 (정규식 — AI-SPEC §5)
6. Storage에 사진 업로드 → URL 획득
7. lib/prompts에서 system-instruction-v4.1.md 로드 (Prompt Caching 활용)
8. lib/llm/[claude|gemini].ts 호출 (시스템 프롬프트 + user 메시지 + image_urls)
   - 사용자 입력은 <user_input>...</user_input> 태그 wrap
9. 응답 파싱 → JSON Schema validator (Ajv)
   - 실패 시 1회 retry (more strict instruction)
   - 재실패 시 {"error": "invalid_format"} 저장
10. lib/score 로 행동 점수 검증 (LLM 출력 검산)
11. 코멘트 toxicity 체크 (자체 키워드 필터)
12. daily_records upsert (같은 day면 머지 — EDGE-CASES §1.1)
    → 트리거가 metrics 자동 분해 (DB-DESIGN §7)
13. audit_logs 기록 (호출자·모델·토큰·비용)
14. 응답 반환 (markdown report 스트리밍 + JSON)
```

**핵심 파일:**

```ts
// lib/llm/index.ts
export interface LLMAdapter {
  analyze(input: AnalyzeInput): Promise<AnalyzeOutput>;
}

// lib/score/calculate.ts
// instruction §2-A,B,C 그대로 구현
export function calculateActionScore(record: DailyRecord): number;
export function calculateGoalContributions(record: DailyRecord): GoalContribs;

// lib/schema/notion-output.ts
import schema from '@/schemas/notion-output.schema.json';
export const ajv = new Ajv();
export const validate = ajv.compile(schema);
```

**Tasks:**
1. LLM 어댑터 (Claude/Gemini) — 동일 인터페이스
2. JSON Schema validation (`schemas/notion-output.schema.json` 직접 import)
3. 점수 계산기 (LLM 출력 vs 자체 계산 비교 → 불일치 시 자체 계산 우선)
4. 머지 로직 (EDGE-CASES §1.1 표 그대로 구현)
5. Day 번호 자동 계산 (start_date 기준)
6. `daily_records.payload` upsert → DB 트리거가 `metrics` 자동 분해 (DB-DESIGN §7)
7. 체중계 사진 OCR 결과는 `metrics`에 직접 INSERT (`source = 'photo_inferred'`)

**Exit criteria:** `curl`로 사진+텍스트 보내면 valid JSON + markdown 응답.

---

### Phase 5 — UI (5~7일)

**우선순위 화면 (6개):**

1. **온보딩 (`/onboarding`)** — 6개 질문 단계별 카드, 자유 입력 파싱(72 → 72kg)
2. **오늘 입력 (`/today`)** — 드래그&드롭 사진 + 텍스트 영역 + Day 자동 표시
3. **리포트 카드 (`/reports/[day]`)** — instruction의 #공식용 템플릿을 React 컴포넌트로 (진행바 포함)
4. **트렌드 대시보드 (`/trends`)** — DB-DESIGN §6 쿼리 기반:
   - 체중·수면·물·점수 라인 차트 (기간 토글 30D/90D/1Y/All)
   - 7일 이동평균 오버레이
   - 월간 히트맵 (캘린더 뷰)
   - 챌린지 1차·2차 비교 (다회차 시)
5. **히스토리 (`/history`)** — Day별 원본 카드 + 검색
6. **랜딩 (`/`)** — 포트폴리오용 demo URL

**디자인 원칙:**

- 모바일 우선 (입력 사용 환경 = 식사 직후 휴대폰)
- 다크모드 기본 (운동/저녁 시간대 사용 빈도)
- 입력 폼 → 응답까지 **체감 5초 이내** (스트리밍 응답으로 점진 렌더)

**스택 결정 — UI 프레임워크:**

| 후보 | 채택? | 사유 |
| --- | --- | --- |
| **shadcn/ui + Tailwind CSS** | ✅ | (1) 복붙 방식 = 커스터마이징 자유도 최고, (2) Tokens Studio + Tailwind 생태계 최강, (3) 노바님의 [`songpoo/multi-tokens`](https://github.com/songpoo/multi-tokens) 디자인 토큰을 Style Dictionary 변환으로 `tailwind.config.ts`에 직결, (4) 모바일 웹 → React Native 확장 시 **NativeWind**로 클래스 그대로 재사용 가능, (5) 포트폴리오 시그널(최신 React 생태계) |
| gluestack-ui | ❌ | 웹+앱 동시 개발 시 강점이지만 MVP는 웹 단독 → 코드 공유 이점 미발현. 자유도 ↓ |
| Tamagui | ❌ | 성능 강점은 본 MVP 규모에서 의미 없음. 학습곡선 ROI 부정적 |

**확장 경로 (v2 모바일 앱):**
- Web → React Native(Expo) 마이그레이션 시 NativeWind로 같은 Tailwind 클래스 사용
- shadcn/ui 컴포넌트는 1:1 대응 안 되지만, Radix Primitives → React Native ARIA 매핑 패턴 정립되어 있음
- **이번 MVP에서 컴포넌트를 작성할 때 `className` 의존도를 최대화**하여 RN 이전 비용 최소화

**Exit criteria:** 본인 휴대폰으로 1주일 실사용 → 마찰 지점 < 3개.

---

### Phase 6 — Notion 연동 (옵션, 1~2일)

**왜 옵션인가:** Supabase에 이미 누적되니 Notion은 "가져가고 싶은 사람"용 부가 기능.

**구현:**
- Notion OAuth → 토큰 저장
- 사용자 워크스페이스에 DB 자동 생성 (스키마는 `notion-output.schema.json` 매핑)
- "Day N 노션에 보내기" 버튼 → daily_record.payload를 Notion API로 push
- 멱등성 보장 (page_id 저장, 재요청 시 update)

**Exit criteria:** 본인 워크스페이스에서 "Day 3 보내기" → Notion DB에 row 생성 확인.

---

### Phase 7 — 폴리싱 & 배포 (2~3일)

**포트폴리오 가중 작업:**

1. README에 데모 GIF + 아키텍처 다이어그램
2. Vercel 배포 + 커스텀 도메인 (옵션)
3. `/blog` 또는 `docs/JOURNEY.md` — "Gemini Gem → 풀스택 웹앱 마이그레이션 일지" (취업/이력서용)
4. Lighthouse 점수 90+ (반응형 + 접근성)
5. README 영어 버전 추가 (글로벌 어필)
6. `/showcase` — 실제 본인 챌린지 데이터 1주일 분량 공개 (포트폴리오 effective)

**AI Native 컴플라이언스 작업 (AI-PRODUCT-SPEC.md 기반):**

7. **AI 라벨링** — 모든 응답 카드 🤖 + "AI 분석 결과" 캡션
8. **EU AI Act 대비 페이지** `/about/ai` — 모델 정보·데이터셋·인간감독 절차
9. **건강 면책 문구** — 코치 코멘트 하단 강제 삽입
10. **약관·개인정보처리방침** — PII·LLM 전송·데이터 보존 명시 (AI-SPEC §5,6)
11. **사용자 정정 UI** — 라벨/점수 클릭 → 수정 → `metrics.source = 'manual_correction'`
12. **`/admin/metrics` 대시보드** — JSON Schema 통과율, TTFT, 일일 비용
13. **Sentry + audit_logs** — 에러 추적 + 감사 로그 30일

**Exit criteria:** 배포 URL 친구 3명에게 공유 → 첫 입력까지 도달률 100%.

---

## 2. 리스크 & 완화

| 리스크 | 확률 | 영향 | 완화 |
| --- | --- | --- | --- |
| LLM 응답이 JSON Schema 자주 깨짐 | 중 | 고 | Phase 1에서 측정, function calling/structured output API 사용 |
| 한식 라벨링 부정확 | 중 | 중 | 사용자 정정 UI를 1급 기능으로 (EDGE-CASES §2.1) |
| 사진 업로드 비용/속도 | 저 | 중 | Vercel 5MB 제한 → 클라이언트 리사이즈 (max 1024px) |
| API 키 노출 | 저 | 고 | 모든 LLM 호출 서버 라우트 경유, env 분리 (AI-SPEC §5) |
| Vision 비용 폭주 | 중 | 중 | rate limit + 사용자별 일일 호출 cap (50회) + 월 예산 $50 자동 차단 |
| 프롬프트 인젝션 | 중 | 고 | role 분리 + 정규식 필터 + Schema 검증 3단 (AI-SPEC §5) |
| PII가 LLM 학습에 사용됨 | 중 | 고 | Anthropic/Google opt-out 검증 + Vertex AI 우선 |
| EU AI Act 미준수 | 저 | 중 | Phase 7에 라벨링·고지·면책 일괄 적용 (AI-SPEC §6) |
| 포트폴리오로만 끝 (사용자 0명) | 고 | 저 | OK — 본인 챌린지 완주가 1차 검증, 공개는 부수적 |

---

## 3. 비-Goal (이번 MVP에서 안 할 것)

- ❌ 모바일 앱 (네이티브) — PWA로 충분
- ❌ 결제/구독 — 본인용 + 포트폴리오만
- ❌ 다국어 — 한국어 단일
- ❌ 알림 (푸시) — Phase 8 후보
- ❌ 소셜 기능 (친구·랭킹) — 범위 폭주
- ❌ 음성 입력 — Vision만으로도 검증 충분
- ❌ HealthKit / Google Fit 연동 — v2 후보

---

## 4. 첫 한 주 액션 아이템

```
[x] Day 1 - PoC 환경 셋업 (scripts/poc-{claude,gemini,compare}.ts, fixtures 가이드)
[ ] Day 2 - API 키 발급 + 사진 18장 촬영 + ground-truth.json 작성
[ ] Day 3 - npm run poc:* 실행 → MATRIX.md 산출 → 모델 픽스
[ ] Day 4 - Next.js 프로젝트 + Supabase 셋업
[ ] Day 5 - DB 마이그레이션 + RLS + payload→metrics 트리거
[ ] Day 6 - /api/analyze 1차 동작 (curl 테스트)
[ ] Day 7 - 온보딩 페이지 첫 화면
```

---

## 5. 다음 결정 게이트

이 로드맵 진행 중 다음 시점에 노바님께 다시 여쭤봐야 할 결정:

| 시점 | 결정 사항 |
| --- | --- |
| Phase 1 끝 | LLM 모델 픽스 (비교 결과 공유 후) |
| Phase 3 시작 전 | DB 스키마 컨펌 (`docs/DB-DESIGN.md` §12 결정 5건) |
| Phase 5 중간 | UI 시안 — 직접 그리실지, shadcn 기본형으로 갈지 |
| Phase 6 시작 전 | Notion 연동 — 정말 필요한지, 후순위로 미룰지 |
| Phase 7 끝 | 공개 범위 — public URL / private demo |

---

**Version:** 1.0 (초안)
**Last Updated:** 2026-05-08
**Owner:** 노바 (Novah)
