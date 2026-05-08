# AI Product Spec — 45Days Challenge Coach

> AI Native 프로덕트 기획 시 필수 확인 항목 6영역을 본 서비스에 적용한 문서.
> 결정된 항목은 ✅, 결정 대기는 ❓로 표시.
> 상위 PRD([`PRD-v4.1.md`](PRD-v4.1.md))의 부속 문서.

---

## 1. 프로덕트 기본 정보

| 항목 | 결정 |
| --- | --- |
| **AI 유형** | ✅ **AI Native** — 멀티모달 분석·점수 산출·코칭이 빠지면 단순 수기 트래커. AI가 핵심 가치 |
| **핵심 AI 기능** | (1) 식단/운동/체중계 사진 인식 (Vision), (2) 자연어에서 Day·식단·운동·수면 추출, (3) 칼로리·영양소 추정, (4) 행동 점수·목표 기여도 산출, (5) 한국어 코치 코멘트 생성, (6) 구조화 JSON 출력 (DB·Notion 적재) |
| **사용자 시나리오** | 사진 1~5장 + 텍스트 한 줄 → AI 분석 → ① 마크다운 리포트 화면 표시 ② JSON으로 DB 저장 ③ 트렌드 차트에 자동 반영 |
| **성공 지표 (MVP)** | • 한식 라벨 정확도 ≥ 80% (사용자 정정 비율로 측정)<br>• 칼로리 추정 오차 ±15% (식단 일지 대조)<br>• JSON Schema 통과율 ≥ 98%<br>• TTFT < 2s, 전체 응답 < 8s<br>• 7일 리텐션 ≥ 50% (본인 + 베타 친구 5명 기준) |

---

## 2. 프론트엔드

| 항목 | 결정 |
| --- | --- |
| **AI 응답 표시** | ✅ **스트리밍** — 마크다운 리포트는 토큰 단위 점진 렌더 (Vercel AI SDK `useChat`). JSON 출력은 완료 후 일괄 (스트리밍 중 partial JSON은 표시하지 않음) |
| **로딩/대기 UX** | • 사진 업로드: progress bar (실제 byte 진행)<br>• AI 분석: 4단계 스피너 텍스트 ("사진 인식 중 → 영양소 계산 → 점수 산정 → 코멘트 작성")<br>• Skeleton: ReportCard 골격을 미리 렌더 |
| **오류/폴백 UI** | • Schema 검증 실패: "분석에 일부 정보가 부족합니다" + 재시도 버튼 + 수동 입력 폴백<br>• 네트워크 오류: 입력 내용 localStorage 보존 + 자동 재시도 1회<br>• Rate limit: "오늘 분석 횟수가 초과되었습니다 (50/일)" |
| **사용자 피드백 루프** | • 모든 분석 카드에 👍/👎 + 정정 폼<br>• 음식 라벨 클릭 → 직접 수정 (사용자 정정은 `metrics.source = 'manual_correction'`로 기록)<br>• 주간 리포트 끝에 "이번 주 코치가 도움 됐나요?" Likert 5점 |
| **AI 라벨링** | ✅ 모든 AI 생성물에 🤖 아이콘 + "AI 분석 결과" 캡션 (EU AI Act 대비) |
| **입력 제한** | • 텍스트 1,000자<br>• 사진 최대 5장, 장당 5MB (클라이언트 1024px 리사이즈 후 업로드)<br>• 지원 포맷: jpg, png, heic, webp |

---

## 3. 백엔드

| 항목 | 결정 |
| --- | --- |
| **모델 선택** | ❓ Phase 1 PoC 후 결정. 후보:<br>**Claude Sonnet 4.6** (포트폴리오 가산점, 한국어·지시 준수 강점, Prompt Caching) vs<br>**Gemini 2.5 Pro** (Vision 멀티모달 정확도 좋음, 컨텍스트 1M, 비용 저렴) |
| **API 방식** | ✅ 외부 API 호출 (서버 라우트 경유). Self-hosted 모델 검토 안 함 (비용·운영 ROI 음수) |
| **토큰 한도** | • 입력: 시스템 프롬프트 ~3K + 사진 토큰(장당 ~1K) + 사용자 텍스트 < 1K → **상한 8K**<br>• 출력: #공식용 ~1.5K, #노션용 ~0.8K → **상한 2K**<br>• 컨텍스트 윈도우: Sonnet 4.6 200K, Gemini 2.5 Pro 1M (둘 다 충분) |
| **레이턴시 목표** | • TTFT (첫 토큰): **< 2.0s**<br>• 전체 응답 (사진 분석 포함): **< 8.0s**<br>• 측정: Vercel Speed Insights + 자체 server timing 헤더 |
| **비용 구조** | • 분석 1건당 추정: $0.008 ~ $0.015 (모델 따라)<br>• 사용자당 일평균 1.2회 분석 가정 → **사용자당 월 ~$0.45**<br>• 월 예산 상한 **$50** = 약 100명 베타 가능<br>• 초과 시 알림 + 자동 호출 차단 (Vercel Edge Config 토글) |
| **모델 라우팅** | MVP는 단일 모델. **v2** 검토:<br>• 간단한 Q&A (예: "Day 5 기록 보여줘") → Haiku/Flash<br>• 멀티모달 분석 → Sonnet/Pro<br>예상 비용 30~40% 절감 |
| **캐싱 전략** | ✅ **Anthropic Prompt Caching** 적극 사용 — 시스템 프롬프트(~3K 토큰) 캐싱하면 호출당 75% 비용 절감 + TTFT 단축. Gemini 채택 시 Context Caching 동등 기능<br>❌ 응답 캐싱: 각 입력이 unique → 효과 없음<br>✅ 사진 임베딩 캐싱: 같은 사진 재분석 시 재사용 (해시 기반) |
| **프롬프트 관리** | ✅ Git 버전 관리 ([`prompts/system-instruction-v4.1.md`](../prompts/system-instruction-v4.1.md))<br>v4.2 작업 시 별도 파일로 분리, A/B 테스트는 **사용자별 hash로 50:50 분기** + 분석 결과(점수·정확도) 비교 |
| **Rate Limiting** | • 사용자당 **일 50회** 분석 호출<br>• 사용자당 **분당 5회** (스팸·실수 방지)<br>• 전체 시스템 분당 60회 (모델 API rate limit 여유)<br>• 구현: Upstash Redis sliding window |

---

## 4. 인프라

| 항목 | 결정 |
| --- | --- |
| **호스팅** | ✅ **Vercel** (Next.js 프론트+서버) + **Supabase** (DB+Auth+Storage). 둘 다 Seoul/Tokyo 리전 |
| **리전** | • Vercel: `icn1` (Seoul) primary, edge functions auto<br>• Supabase: Seoul (`ap-northeast-2`) — 한국 사용자 latency 우선 |
| **스케일링** | • Vercel: 자동 (Hobby/Pro tier 자동 스케일)<br>• Supabase: 무료 티어 → 사용자 100명 도달 시 Pro ($25/월) 검토<br>• AI API 호출은 외부 → 인프라 부담 없음 |
| **GPU** | ❌ 외부 API라 불필요 |
| **모니터링** | • **Vercel Analytics**: 페이지 성능, Web Vitals<br>• **Sentry**: 에러 트래킹 (프론트+서버)<br>• **Supabase Logs**: DB 슬로우 쿼리<br>• **자체 대시보드** (`/admin/metrics`): JSON Schema 통과율, 평균 TTFT, 일일 호출량/비용 |
| **로깅** | • 프롬프트/응답 로그: **30일 보존**, 사용자 ID 해싱<br>• 사진은 별도 Storage(privacy bucket), URL만 로그<br>• PII 마스킹: 체중·식단 텍스트는 사용자 ID 분리 후 30일 후 익명화 |
| **벡터 DB** | ❌ MVP 불필요. 과거 기록 검색은 Postgres FTS(`tsvector`)로 충분. **v2** 후보: pgvector로 식단 유사도(임베딩) — 같은 음식 재분석 시 캐시 hit율 ↑ |
| **CI/CD** | ✅ **GitHub Actions** → Vercel preview/prod<br>• PR 열면 preview URL 자동 생성<br>• 프롬프트 변경 시 회귀 테스트 자동 실행 ([`prompts/`](../prompts/) 변경 감지 → fixture 15장 PoC 재실행) |

---

## 5. 보안

| 항목 | 결정 |
| --- | --- |
| **데이터 전송** | ✅ TLS 1.3 (Vercel/Supabase 기본). API 키는 모두 서버 환경변수, 클라이언트 노출 0건 |
| **PII 처리** | ⚠️ **민감정보**: 체중·식단·수면·사진(때로 얼굴) 모두 PII<br>• Anthropic: 기본 학습 opt-out (Workspace 설정 확인 필요)<br>• Google AI Studio: **opt-out 필수** (Vertex AI는 기본 opt-out)<br>• 사진의 EXIF GPS 메타: 업로드 시 서버에서 strip<br>• 마스킹: 사진에 타인 얼굴 감지 시 사용자에게 경고 (v2 — MediaPipe Face Detection) |
| **프롬프트 인젝션 방어** | ✅ **시스템 프롬프트 ↔ 사용자 입력 엄격 분리**:<br>• 시스템 프롬프트는 system role로만 전송<br>• 사용자 입력은 user role, 추가로 `<user_input>...</user_input>` 태그로 wrap<br>• 의심 패턴 차단: `"ignore previous instructions"`, `"system:"`, base64 디코드 시도 등 정규식 1차 필터<br>• 출력은 항상 JSON Schema 검증 — 인젝션 성공해도 schema 통과 어렵게 |
| **출력 필터링** | • JSON Schema 1차 (구조 검증)<br>• 의심 수치 (EDGE-CASES §6) 자동 클램프<br>• 코치 코멘트는 toxicity 분류기 통과 (Perspective API 또는 자체 키워드 필터)<br>• 의료 조언 패턴 차단: "약 처방", "진단" 등 → 면책 문구 강제 추가 |
| **API 키 보안** | ✅ Vercel 환경변수만 사용. `NEXT_PUBLIC_` prefix 절대 금지. 클라이언트→서버→AI API 3단 호출 |
| **데이터 보존** | • LLM 제공자 학습 사용: **opt-out 필수** (Anthropic Console + Google Vertex AI 둘 다 확인)<br>• 사용자 데이터: 탈퇴 시 30일 grace 후 hard delete (RTBF 대응)<br>• 백업: Supabase PITR (Point-in-Time Recovery, 7일 보관) |
| **접근 제어** | ✅ Supabase RLS — 모든 테이블에 user_id 기반 정책. Admin 뷰는 service_role 키로만 (서버 라우트 경유) |
| **감사 로그** | `audit_logs` 테이블 — AI 호출, 데이터 수정, 로그인/탈퇴 모두 기록. 30일 보존 |

---

## 6. 윤리 / 규제

| 항목 | 결정 |
| --- | --- |
| **AI 고지** | ✅ **3곳에 명시**: (1) 랜딩 페이지 hero 섹션, (2) 온보딩 STEP 1 첫 화면, (3) 모든 AI 응답 카드 상단 🤖 라벨. **EU AI Act Art.50 (2026.8 시행)** 의무 대비 |
| **편향성 검토** | • 한식 위주 사용자 → **서양식·할랄·채식 fixture 각 5장 추가** 로 라벨 정확도 검증<br>• 성별/연령 편향: 코치 코멘트가 "남자다움", "여자라면" 같은 표현 안 하도록 instruction §톤가이드에 명시 (이미 반영됨)<br>• 분기별 toxicity 샘플 검사 (랜덤 100건) |
| **인간 감독 (HITL)** | ✅ **모든 분석 결과는 사용자 정정 가능** — AI는 제안, 최종 결정은 사용자. 점수·칼로리·라벨 모두 클릭 한 번으로 수정 + DB 반영 |
| **투명성 (Explainability)** | ✅ 점수 산출 공식이 [`prompts/system-instruction-v4.1.md`](../prompts/system-instruction-v4.1.md) §2 에 명시<br>• 리포트 카드에 "왜 이 점수?" 토글 → 해당 항목 배점·기여도 표시<br>• "왜 단백질 부족이라 판단?" → 입력값 70g vs 목표 80g 표시 |
| **데이터 동의** | • 가입 시 명시 동의 3건: ① 헬스 데이터 수집·처리, ② AI 분석 위한 외부 LLM 전송, ③ 익명화된 통계 활용<br>• 동의 철회: 마이페이지에서 1클릭 |
| **EU AI Act 위험 등급** | ✅ **제한적 위험 (Limited Risk)** — 코칭/추적 도구이며 의료기기 아님. 의무사항:<br>• AI 사용 사실 고지 (Art.50) ← 위 §AI 고지로 대응<br>• 인간 감독 가능 (Art.14) ← HITL로 대응<br>• 시스템 정보 제공 (모델·데이터셋 정보) ← `/about/ai` 페이지<br>• 한국 미시행이지만 글로벌 사용자 대비 |
| **미성년자 보호** | ✅ MVP는 **만 19세 이상**. 가입 시 생년월일 확인. 미성년자 가입 시도 시 차단 + 보호자 동의 절차 (v2) |
| **건강/의료 면책** | ✅ **모든 코치 코멘트 하단**: *"이 정보는 일반적 가이드이며 의학적 조언이 아닙니다. 건강 문제는 의사와 상담하세요."* 인스트럭션에 강제 |

---

## Top 10 결정 체크리스트

| # | 항목 | 결정 | 상태 |
| --- | --- | --- | --- |
| 1 | 모델 선택 | Sonnet 4.6 vs Gemini 2.5 Pro | ❓ Phase 1 PoC 후 |
| 2 | 토큰 한도 | 입력 8K / 출력 2K | ✅ |
| 3 | 레이턴시 목표 | TTFT 2s, 전체 8s | ✅ |
| 4 | 스트리밍 | 마크다운 yes, JSON no | ✅ |
| 5 | PII가 LLM에 전달 | yes (opt-out 필수) | ✅ |
| 6 | 프롬프트 인젝션 방어 | role 분리 + 정규식 + Schema 검증 | ✅ |
| 7 | 폴백 시나리오 | Schema 실패 시 재시도→`{"error":"invalid_format"}`+수동입력 | ✅ |
| 8 | 월 비용 상한 | $50 (≈ 100명 베타) | ✅ |
| 9 | EU AI Act 등급 | 제한적 위험 (Limited Risk) | ✅ |
| 10 | AI 라벨링 정책 | 🤖 + "AI 분석 결과" 모든 응답 표시 | ✅ |

---

## 결정 대기 (노바님 컨펌 필요)

| # | 질문 | 제안 |
| --- | --- | --- |
| AI-1 | LLM 모델 — Claude Sonnet 4.6 / Gemini 2.5 Pro | **Sonnet 4.6 권장** (포트폴리오 + Prompt Caching + 한국어 강함). PoC 결과 기반 |
| AI-2 | LLM 학습 opt-out 처리 시점 | 가입 약관에 명시 + Vertex AI 사용 시 자동 |
| AI-3 | toxicity 필터 — Perspective API vs 자체 키워드 | MVP는 자체(무료), v2에서 Perspective |
| AI-4 | 사진 EXIF GPS strip 시점 | 클라이언트(Sharp.js) — 서버 도달 전 제거 |
| AI-5 | 미성년자 정책 — 만 19세 vs 14세+보호자동의 | MVP는 만 19세 (단순) |
| AI-6 | 건강 면책 문구 위치 — 모든 카드 vs 약관만 | 모든 카드 (보수적) |

---

## 관련 문서

- [`PRD-v4.1.md`](PRD-v4.1.md) — 제품 요구사항 (왜/무엇)
- [`../prompts/system-instruction-v4.1.md`](../prompts/system-instruction-v4.1.md) — 시스템 프롬프트
- [`../schemas/notion-output.schema.json`](../schemas/notion-output.schema.json) — JSON Schema
- [`EDGE-CASES.md`](EDGE-CASES.md) — 경계 조건
- [`DB-DESIGN.md`](DB-DESIGN.md) — 시계열 DB 설계
- [`IMPLEMENTATION-ROADMAP.md`](IMPLEMENTATION-ROADMAP.md) — 구현 로드맵

---

**Version:** 1.0 (초안)
**Last Updated:** 2026-05-08
**Owner:** 노바 (Novah)
**Reviewed by:** —
