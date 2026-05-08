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
- ⏳ §1.2 모델 비교 실험 결과 (1~2일)
- ⏳ v4.2 instruction (edge-case 결정 4건 반영)

**Exit criteria:** 4개 결정 사항(`docs/EDGE-CASES.md` 하단) 컨펌 + LLM 모델 픽스.

---

### Phase 1 — 모델/프롬프트 PoC (2~3일)

**목표:** "사진 + 텍스트 → JSON" 파이프라인이 instruction 그대로 돌아가는지 확인.

**Tasks:**
1. `scripts/poc-claude.ts` — Claude Sonnet 4.6 + Vision으로 시스템 프롬프트 호출
2. `scripts/poc-gemini.ts` — Gemini 2.5 Pro 동일 호출
3. `tests/fixtures/` — 한식 사진 10장 + 운동 사진 5장 + 체중계 사진 3장 (실제 데이터)
4. 비교 매트릭스 작성:
   - 음식 종류 정확도 (정답률 %)
   - 칼로리 추정 오차 (±%)
   - JSON 유효성 (Schema 통과율)
   - 평균 응답 시간 (초)
   - 1,000회 호출 비용 ($)

**Exit criteria:** 비교표 → 모델 1개 픽스. v4.1 instruction이 픽스된 모델에서 즉시 동작.

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
│   │   ├── history/page.tsx        # 과거 조회
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
    └── ProgressBars.tsx            # 진행 바 시각화
```

**Exit criteria:** `pnpm dev`로 빈 페이지 렌더 확인.

---

### Phase 3 — 데이터 레이어 (2일)

**Supabase 스키마 (초안):**

```sql
-- 사용자 프로필 (온보딩 결과)
create table profiles (
  id uuid primary key references auth.users,
  start_date date not null,
  weight_kg numeric not null,
  goals jsonb not null,             -- {weight_loss, fitness, routine}
  daily_check_routines jsonb not null,
  base_metabolism_kcal int default 1500,
  created_at timestamptz default now()
);

-- 일일 기록 (#노션용 JSON과 1:1 매핑)
create table daily_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles not null,
  day int not null,
  date date not null,
  payload jsonb not null,           -- schemas/notion-output.schema.json 준수
  is_locked boolean default false,  -- §1.2 마감 여부
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, day)
);

-- 첨부 파일 (사진)
create table record_attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid references daily_records on delete cascade,
  storage_path text not null,
  mime_type text not null,
  uploaded_at timestamptz default now()
);
```

**Tasks:**
1. Supabase 프로젝트 생성 + RLS 정책 (각 user 본인 행만)
2. 마이그레이션 파일 작성 (`supabase/migrations/`)
3. Storage 버킷 `record-photos` (private)
4. `lib/supabase/queries.ts` 타입 추론 클라이언트

**Exit criteria:** 빈 DB에 더미 row insert/select RLS 통과.

---

### Phase 4 — 핵심 분석 API (3~4일)

**`POST /api/analyze` 흐름:**

```
1. 인증 확인 → user_id 추출
2. multipart/form-data로 텍스트 + 사진(N장) 수신
3. Storage에 사진 업로드 → URL 획득
4. lib/prompts에서 system-instruction-v4.1.md 로드
5. lib/llm/[claude|gemini].ts 호출 (시스템 프롬프트 + user message + image_urls)
6. 응답 파싱 → JSON Schema validator (Ajv 또는 Zod)
   - 실패 시 1회 retry (more strict instruction)
   - 재실패 시 {"error": "invalid_format"} 저장
7. lib/score 로 행동 점수 검증 (LLM 출력 검산)
8. daily_records upsert (같은 day면 머지 — EDGE-CASES §1.1)
9. 응답 반환 (markdown report + JSON)
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

**Exit criteria:** `curl`로 사진+텍스트 보내면 valid JSON + markdown 응답.

---

### Phase 5 — UI (5~7일)

**우선순위 화면:**

1. **온보딩 (`/onboarding`)** — 6개 질문 단계별 카드, 자유 입력 파싱(72 → 72kg)
2. **오늘 입력 (`/today`)** — 드래그&드롭 사진 + 텍스트 영역 + Day 자동 표시
3. **리포트 카드 (`/reports/[day]`)** — instruction의 #공식용 템플릿을 React 컴포넌트로 (진행바 포함)
4. **히스토리 (`/history`)** — 캘린더 뷰 + 주간 요약
5. **랜딩 (`/`)** — 포트폴리오용 demo URL

**디자인 원칙:**

- 모바일 우선 (입력 사용 환경 = 식사 직후 휴대폰)
- 다크모드 기본 (운동/저녁 시간대 사용 빈도)
- 입력 폼 → 응답까지 **체감 5초 이내** (스트리밍 응답으로 점진 렌더)

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

**Exit criteria:** 배포 URL 친구 3명에게 공유 → 첫 입력까지 도달률 100%.

---

## 2. 리스크 & 완화

| 리스크 | 확률 | 영향 | 완화 |
| --- | --- | --- | --- |
| LLM 응답이 JSON Schema 자주 깨짐 | 중 | 고 | Phase 1에서 측정, function calling/structured output API 사용 |
| 한식 라벨링 부정확 | 중 | 중 | 사용자 정정 UI를 1급 기능으로 (EDGE-CASES §2.1) |
| 사진 업로드 비용/속도 | 저 | 중 | Vercel 5MB 제한 → 클라이언트 리사이즈 (max 1024px) |
| API 키 노출 | 저 | 고 | 모든 LLM 호출 서버 라우트 경유, env 분리 |
| Vision 비용 폭주 | 중 | 중 | rate limit + 사용자별 일일 호출 cap (50회) |
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
[ ] Day 1 - 모델 비교 PoC 환경 셋업 (Claude API key, Gemini API key)
[ ] Day 2 - 한식 fixture 사진 15장 직접 촬영 (테스트 셋)
[ ] Day 3 - 비교 매트릭스 산출 → 모델 픽스
[ ] Day 4 - Next.js 프로젝트 + Supabase 셋업
[ ] Day 5 - 스키마 마이그레이션 + RLS
[ ] Day 6 - /api/analyze 1차 동작 (curl 테스트)
[ ] Day 7 - 온보딩 페이지 첫 화면
```

---

## 5. 다음 결정 게이트

이 로드맵 진행 중 다음 시점에 노바님께 다시 여쭤봐야 할 결정:

| 시점 | 결정 사항 |
| --- | --- |
| Phase 1 끝 | LLM 모델 픽스 (비교 결과 공유 후) |
| Phase 3 시작 전 | DB 스키마 컨펌 (필드 추가/제거 의향?) |
| Phase 5 중간 | UI 시안 — 직접 그리실지, shadcn 기본형으로 갈지 |
| Phase 6 시작 전 | Notion 연동 — 정말 필요한지, 후순위로 미룰지 |
| Phase 7 끝 | 공개 범위 — public URL / private demo |

---

**Version:** 1.0 (초안)
**Last Updated:** 2026-05-08
**Owner:** 노바 (Novah)
