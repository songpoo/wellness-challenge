# Database Design — 시계열 트래킹 & 트렌드 분석

> **목적:** 45일 챌린지 1회분이 아니라, 사용자의 **장기간 건강 데이터**(수면·물·식단·운동·체중·점수)를 년/월/일 단위로 정확히 추적하고, 변화 추이를 빠르게 시각화하는 DB 설계.

---

## 1. 요구사항 (이 설계가 풀어야 할 것)

| 카테고리 | 요구 | 쿼리 예시 |
| --- | --- | --- |
| 일별 기록 | v4.1 #노션용 JSON 그대로 보관 (audit) | "Day 7의 원본 응답 보여줘" |
| 시계열 조회 | 단일 metric의 N개월/년 추이 | "최근 6개월 체중 추이" |
| 월간 집계 | metric별 월평균/min/max | "2026년 3월 평균 수면 시간" |
| 연간 집계 | 챌린지 누적 비교 | "1차 챌린지 vs 2차 챌린지 행동 점수 평균" |
| 다중 챌린지 | 한 사용자가 여러 번 챌린지 가능 | "지금까지 완주한 챌린지 횟수" |
| 결측 처리 | 기록 안 한 날과 0 입력한 날 구분 | "기록한 날 기준 평균"이 분모 정확 |
| 멀티 입력 | 하루 여러 번 입력 시 머지 (`EDGE-CASES §1.1`) | 자동 합산/덮어쓰기 |
| 사진 보관 | record와 1:N 관계 | "Day 12 사진 다 보여줘" |
| RLS | 사용자 본인 데이터만 | Supabase Auth 연동 |

---

## 2. 핵심 설계 원칙

### 2.1 듀얼 표현 — 원본(JSONB) + 정규화(rows)

JSONB만 두면:
- ✅ 원본 무결성, 스키마 변경 자유로움
- ❌ 시계열 쿼리 느림, 인덱싱 제한

정규화만 두면:
- ✅ 빠른 집계, 분석 친화
- ❌ v4.1 instruction의 24개 키가 변경되면 마이그레이션 매번

**해결:** 둘 다 둔다.
- `daily_records.payload`: 원본 JSON (소스 오브 트루스)
- `metrics`: 정규화된 시계열 (분석용, daily_records에서 derive)

### 2.2 metric_type을 enum이 아니라 lookup table로

새 메트릭(예: 걸음 수, 심박수)을 추가할 때 ALTER TYPE 없이 INSERT만으로 가능하게 함.

### 2.3 사전 집계 테이블 (materialized view)

월/주 단위 집계는 **매 쿼리마다 계산하지 않음**. 매일 1회 갱신되는 머티리얼라이즈드 뷰로 처리.

### 2.4 timestamp가 아니라 date로 일별 키

수면처럼 자정 경계 걸치는 데이터도 "어느 날의 기록"이라는 의미가 명확해야 함. timestamp는 `created_at` 메타에만 사용.

---

## 3. ER 개요

```
auth.users (Supabase 내장)
   │
   └─< profiles (1:1)
           │
           ├─< challenges (1:N — 한 사용자가 여러 챌린지)
           │       │
           │       └─< daily_records (1:N)
           │              │
           │              ├─< record_attachments (1:N — 사진들)
           │              │
           │              └─< metrics (1:N — payload에서 분해된 시계열 행들)
           │
           └─< metrics (직접 참조도 허용 — 챌린지 외 기간 기록용)

metric_definitions (lookup)
   │
   └─< metrics (FK)

(materialized views)
- daily_metrics_view  : metrics + 결측 보정
- weekly_summary_mv   : 주간 집계
- monthly_summary_mv  : 월간 집계
- yearly_summary_mv   : 연간 집계
```

---

## 4. 테이블 DDL

### 4.1 `profiles`

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  birth_year int check (birth_year between 1900 and 2030),
  sex text check (sex in ('M', 'F', 'other', null)),
  height_cm numeric(5,2),
  base_metabolism_kcal int default 1500,
  timezone text default 'Asia/Seoul',
  day_boundary_hour int default 0 check (day_boundary_hour between 0 and 6),
  -- "내 하루는 03:00에 끝남" 같은 옵션 (EDGE-CASES §4.1 결정사항)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 4.2 `challenges`

```sql
create table challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  start_date date not null,
  duration_days int not null default 45,
  status text not null default 'active'
    check (status in ('active', 'completed', 'paused', 'abandoned')),
  initial_weight_kg numeric(5,2),
  goals jsonb not null,                     -- {weight_loss, fitness, routine}
  daily_check_routines jsonb not null,      -- 7개 루틴
  notes text,
  created_at timestamptz default now(),
  ended_at timestamptz,

  -- 한 사용자가 동시에 active 챌린지 1개만
  exclude using gist (
    user_id with =,
    daterange(start_date, start_date + duration_days, '[)') with &&
  ) where (status = 'active')
);

create index challenges_user_active_idx
  on challenges (user_id) where status = 'active';
```

### 4.3 `daily_records` (v4.1 원본 보관)

```sql
create table daily_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  challenge_id uuid references challenges on delete set null,
  -- challenge_id null 허용: 챌린지 외 기간도 기록 가능 (장기 추적)
  date date not null,
  day_index int,
  -- challenge_id가 있을 때만 채움 (챌린지 시작일 기준 day 번호)
  payload jsonb not null,
  -- schemas/notion-output.schema.json 준수
  is_locked boolean default false,
  -- EDGE-CASES §1.2 노션용 마감 여부
  source text default 'app' check (source in ('app', 'gemini_gem', 'manual_import')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (user_id, date)
  -- 하루 1행 원칙. 멀티 입력은 payload 안에서 머지
);

create index daily_records_user_date_idx
  on daily_records (user_id, date desc);
create index daily_records_challenge_idx
  on daily_records (challenge_id, day_index);
create index daily_records_payload_gin
  on daily_records using gin (payload jsonb_path_ops);
```

### 4.4 `metric_definitions` (lookup)

```sql
create table metric_definitions (
  metric_type text primary key,
  display_name text not null,
  unit text not null,
  category text not null check (category in
    ('body', 'intake', 'output', 'sleep', 'workout', 'score', 'check')),
  data_type text not null check (data_type in ('numeric', 'integer', 'boolean')),
  min_value numeric,
  max_value numeric,
  is_cumulative boolean default false,
  -- true면 같은 날 여러 입력 합산 (water_l), false면 마지막값 (sleep_hr)
  description text
);

-- 시드 데이터
insert into metric_definitions (metric_type, display_name, unit, category, data_type, min_value, max_value, is_cumulative) values
  ('weight_kg',          '체중',          'kg',   'body',    'numeric', 20,  300, false),
  ('sleep_hr',           '수면 시간',      'hr',   'sleep',   'numeric', 0,   24,  false),
  ('water_l',            '물 섭취',       'L',    'intake',  'numeric', 0,   10,  true),
  ('calories_intake',    '섭취 칼로리',    'kcal', 'intake',  'integer', 0,   6000, true),
  ('calories_burn',      '소모 칼로리',    'kcal', 'output',  'integer', 0,   3000, true),
  ('protein_g',          '단백질',        'g',    'intake',  'numeric', 0,   500, true),
  ('workout_min',        '운동 시간',      'min',  'workout', 'integer', 0,   600, true),
  ('action_score',       '행동 점수',      '/3',   'score',   'numeric', 0,   3,   false),
  ('goal_weight_loss',   '목표① 체중감량', '%',    'score',   'integer', 0,   100, false),
  ('goal_fitness',       '목표② 체력향상', '%',    'score',   'integer', 0,   100, false),
  ('goal_routine',       '목표③ 루틴완주', '%',    'score',   'integer', 0,   100, false),
  ('routine_check',      'Daily Check 수행', 'count', 'check', 'integer', 0, 7, false),
  ('calorie_balance',    '칼로리 밸런스',  'kcal', 'score',   'integer', -3000, 3000, false);
```

### 4.5 `metrics` (정규화 시계열 — 분석의 핵심)

```sql
create table metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  challenge_id uuid references challenges on delete set null,
  daily_record_id uuid references daily_records on delete cascade,
  -- daily_record에서 derive된 행은 FK 유지, 직접 입력은 null
  date date not null,
  metric_type text not null references metric_definitions,
  value numeric not null,
  source text not null default 'derived'
    check (source in ('derived', 'user_input', 'photo_inferred', 'manual_correction')),
  recorded_at timestamptz default now(),

  unique (user_id, date, metric_type)
  -- 같은 날 같은 metric은 1행. 멀티 입력은 daily_record에서 머지 후 갱신
);

-- 시계열 조회용 핵심 인덱스
create index metrics_user_type_date_idx
  on metrics (user_id, metric_type, date desc);
-- 날짜 범위 쿼리용
create index metrics_user_date_idx
  on metrics (user_id, date desc);
-- 챌린지별 분석
create index metrics_challenge_type_idx
  on metrics (challenge_id, metric_type) where challenge_id is not null;
```

### 4.6 `record_attachments` (사진)

```sql
create table record_attachments (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references daily_records on delete cascade,
  storage_path text not null,
  -- Supabase Storage 'record-photos' 버킷 경로
  mime_type text not null,
  byte_size int,
  width int,
  height int,
  recognized_label text,
  -- LLM이 추정한 음식/기구 라벨 (검색용)
  uploaded_at timestamptz default now()
);

create index record_attachments_record_idx
  on record_attachments (daily_record_id);
```

---

## 5. 집계 뷰 (트렌드 분석)

### 5.1 일별 결측 보정 뷰

```sql
-- 사용자 첫 기록일부터 오늘까지 모든 날짜를 generate, 비어있는 날은 null
create or replace view daily_metrics_view as
with date_range as (
  select
    p.id as user_id,
    generate_series(
      coalesce((select min(date) from metrics m where m.user_id = p.id), current_date),
      current_date,
      interval '1 day'
    )::date as date
  from profiles p
)
select
  d.user_id,
  d.date,
  md.metric_type,
  m.value,
  (m.value is not null) as has_record
from date_range d
cross join metric_definitions md
left join metrics m
  on m.user_id = d.user_id
 and m.date = d.date
 and m.metric_type = md.metric_type;
```

### 5.2 주간/월간/연간 머티리얼라이즈드 뷰

```sql
create materialized view weekly_summary_mv as
select
  user_id,
  metric_type,
  date_trunc('week', date)::date as week_start,
  avg(value) as avg_value,
  min(value) as min_value,
  max(value) as max_value,
  count(*) as days_recorded,
  sum(value) filter (where md.is_cumulative) as cumulative_sum
from metrics m
join metric_definitions md using (metric_type)
group by user_id, metric_type, date_trunc('week', date);

create unique index weekly_summary_mv_idx
  on weekly_summary_mv (user_id, metric_type, week_start);

create materialized view monthly_summary_mv as
select
  user_id,
  metric_type,
  date_trunc('month', date)::date as month_start,
  avg(value) as avg_value,
  min(value) as min_value,
  max(value) as max_value,
  count(*) as days_recorded,
  sum(value) filter (where md.is_cumulative) as cumulative_sum
from metrics m
join metric_definitions md using (metric_type)
group by user_id, metric_type, date_trunc('month', date);

create unique index monthly_summary_mv_idx
  on monthly_summary_mv (user_id, metric_type, month_start);

create materialized view yearly_summary_mv as
select
  user_id,
  metric_type,
  date_trunc('year', date)::date as year_start,
  avg(value) as avg_value,
  min(value) as min_value,
  max(value) as max_value,
  count(*) as days_recorded
from metrics
group by user_id, metric_type, date_trunc('year', date);

create unique index yearly_summary_mv_idx
  on yearly_summary_mv (user_id, metric_type, year_start);
```

**갱신 전략:**
- 매일 새벽 03:00 KST에 `refresh materialized view concurrently ...` 3개
- Supabase Edge Function (cron) 또는 pg_cron extension 사용
- 또는 사용자가 새 기록 입력 시 해당 사용자분만 즉시 부분 갱신 (REFRESH는 전체 = 무거움 → v2에서 incremental view로 교체 검토)

---

## 6. 자주 쓸 쿼리 패턴

### 6.1 최근 30일 체중 추이

```sql
select date, value
from metrics
where user_id = $1
  and metric_type = 'weight_kg'
  and date >= current_date - interval '30 days'
order by date asc;
```

→ `metrics_user_type_date_idx` 인덱스 정확히 hit, O(log N).

### 6.2 월별 평균 수면 (지난 1년)

```sql
select month_start, avg_value, days_recorded
from monthly_summary_mv
where user_id = $1
  and metric_type = 'sleep_hr'
  and month_start >= current_date - interval '12 months'
order by month_start asc;
```

→ MV에서 즉시 조회.

### 6.3 7일 이동평균 (행동 점수)

```sql
select
  date,
  value,
  avg(value) over (
    order by date
    rows between 6 preceding and current row
  ) as moving_avg_7d
from metrics
where user_id = $1
  and metric_type = 'action_score'
  and date >= current_date - interval '60 days'
order by date;
```

### 6.4 챌린지 시작 시점 대비 누적 변화 (체중)

```sql
with baseline as (
  select initial_weight_kg from challenges where id = $1
)
select
  m.date,
  m.value as current_weight,
  m.value - b.initial_weight_kg as delta_kg
from metrics m, baseline b
where m.challenge_id = $1
  and m.metric_type = 'weight_kg'
order by m.date;
```

### 6.5 1차 챌린지 vs 2차 챌린지 평균 점수

```sql
select
  c.id, c.start_date,
  avg(m.value) as avg_action_score
from challenges c
join metrics m on m.challenge_id = c.id
where c.user_id = $1
  and m.metric_type = 'action_score'
group by c.id, c.start_date
order by c.start_date;
```

### 6.6 캘린더 히트맵 (월별 보기)

```sql
-- 한 달 전체, 기록 없는 날도 포함
select date, value
from daily_metrics_view
where user_id = $1
  and metric_type = 'action_score'
  and date >= date_trunc('month', current_date)
  and date < date_trunc('month', current_date) + interval '1 month'
order by date;
```

---

## 7. 데이터 흐름 — payload → metrics 분해

`/api/analyze` 응답에서 daily_records 저장 직후, 트리거로 metrics 자동 분해:

```sql
create or replace function fn_explode_payload_to_metrics()
returns trigger as $$
declare
  p jsonb := new.payload;
begin
  -- 같은 (user, date) 기존 metrics 삭제 후 재삽입 (멱등성)
  delete from metrics where daily_record_id = new.id;

  insert into metrics (user_id, challenge_id, daily_record_id, date, metric_type, value, source)
  values
    (new.user_id, new.challenge_id, new.id, new.date, 'sleep_hr',        (p->>'Sleep (hr)')::numeric, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'water_l',         (p->>'Water (L)')::numeric, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'calories_intake', (p->>'Calories (intake)')::int, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'calories_burn',   (p->>'Workout Calories (burn)')::int, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'protein_g',       (p->>'Protein (g)')::numeric, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'workout_min',     (p->>'Workout Duration (min)')::int, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'action_score',    (p->>'Action Score (/3)')::numeric, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'goal_weight_loss',(p->>'Goal ① Weight Loss (%)')::int, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'goal_fitness',    (p->>'Goal ② Fitness (%)')::int, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'goal_routine',    (p->>'Goal ③ Routine (%)')::int, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'routine_check',   (p->>'Routine Check (count)')::int, 'derived'),
    (new.user_id, new.challenge_id, new.id, new.date, 'calorie_balance', (p->>'Calorie Balance (±kcal)')::int, 'derived')
  on conflict (user_id, date, metric_type) do update
    set value = excluded.value,
        source = excluded.source,
        recorded_at = now();

  return new;
end;
$$ language plpgsql;

create trigger trg_explode_payload
  after insert or update of payload on daily_records
  for each row execute function fn_explode_payload_to_metrics();
```

**왜 `weight_kg`은 빠졌나?** v4.1 #노션용 payload에 체중 키가 없음 → 별도 입력 필요. Phase 5 UI에서 체중계 사진/직접입력 → `metrics`에 직접 INSERT (`source = 'photo_inferred'` 또는 `'user_input'`).

---

## 8. RLS 정책

```sql
alter table profiles            enable row level security;
alter table challenges          enable row level security;
alter table daily_records       enable row level security;
alter table metrics             enable row level security;
alter table record_attachments  enable row level security;

-- 본인 데이터만 R/W
create policy "self read profiles"   on profiles for select using (auth.uid() = id);
create policy "self update profiles" on profiles for update using (auth.uid() = id);

create policy "self crud challenges" on challenges
  for all using (auth.uid() = user_id);

create policy "self crud daily_records" on daily_records
  for all using (auth.uid() = user_id);

create policy "self read metrics" on metrics
  for select using (auth.uid() = user_id);
-- metrics insert/update는 trigger 경유만 (직접 입력은 server route에서 service_role 사용)

create policy "self read attachments" on record_attachments
  for select using (
    auth.uid() = (select user_id from daily_records where id = daily_record_id)
  );
```

---

## 9. 인덱스 전략 요약

| 인덱스 | 목적 | 예상 사용 빈도 |
| --- | --- | --- |
| `metrics_user_type_date_idx` | 단일 metric 시계열 | ⭐⭐⭐ |
| `metrics_user_date_idx` | 특정 날짜 모든 metric | ⭐⭐ |
| `metrics_challenge_type_idx` | 챌린지별 분석 | ⭐ |
| `daily_records_user_date_idx` | 캘린더 뷰 원본 조회 | ⭐⭐⭐ |
| `daily_records_challenge_idx` | 챌린지별 day 정렬 | ⭐⭐ |
| `daily_records_payload_gin` | JSON 키 검색 (디버그용) | ⭐ |

---

## 10. 마이그레이션 / 데이터 무결성

### 10.1 백필 스크립트
기존에 Notion이나 Gemini Gem에서 모은 과거 기록이 있다면:
- CSV/JSON 일괄 import → `daily_records.payload`에 저장
- 트리거가 자동으로 `metrics` 채움
- `source = 'manual_import'`로 표시

### 10.2 metric 추가 시
새 metric (예: `steps`, `heart_rate_avg`) 도입:
1. `insert into metric_definitions ...`
2. payload 분해 트리거 함수에 1줄 추가 (필요 시)
3. 머티리얼라이즈드 뷰는 자동 포함 (group by metric_type)

### 10.3 v4.1 → v4.2/v5 instruction 업그레이드
- payload 키가 추가/이름변경되면, 트리거 함수의 `p->>'...'` 부분만 수정
- 과거 데이터는 그대로 유지 (이전 키로 저장된 것은 새 metric에 매핑되지 않을 뿐)

---

## 11. 확장 후보 (이 MVP 이후)

| 기능 | 추가 테이블/컬럼 |
| --- | --- |
| HealthKit/Google Fit 연동 | `metrics.source = 'healthkit'`, `external_id` 컬럼 |
| 알림/리마인더 | `reminders (user_id, metric_type, schedule_cron, enabled)` |
| 친구·랭킹 | `connections`, `leaderboards_mv` |
| AI 코멘트 히스토리 | `coach_comments` 별도 테이블 (지금은 payload 안) |
| 사진 갤러리 검색 | `record_attachments.recognized_label`에 trigram index |
| 식단 라이브러리 | `food_items` 정규화 (자주 먹는 음식 캐싱) |

---

## 12. 결정 필요 (노바님 컨펌)

| # | 질문 | 제안 |
| --- | --- | --- |
| D1 | 머티리얼라이즈드 뷰 갱신 주기 | 매일 03:00 + 사용자 입력 시 즉시 부분갱신 |
| D2 | `weight_kg` 입력 채널 | 체중계 사진(Vision OCR) + 수동 입력 둘 다 |
| D3 | 챌린지 외 기간 기록 허용? | 허용 (challenge_id null) — 장기 추적 핵심 |
| D4 | `metric_definitions`에 사용자 커스텀 metric 추가 가능? | v2에서. MVP는 시드 13개 고정 |
| D5 | 공휴일/생리주기 같은 컨텍스트 메타 | v2 (`context_tags` 테이블) |

---

**Version:** 1.0 (초안)
**Last Updated:** 2026-05-08
**Owner:** 노바 (Novah)
**Depends on:** [`schemas/notion-output.schema.json`](../schemas/notion-output.schema.json), [`docs/EDGE-CASES.md`](EDGE-CASES.md)
