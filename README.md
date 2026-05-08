# wellness-challenge

> 45일 챌린지 전문 트래킹 코치 — 운동·식단·수면을 꾸준히 기록하고 3가지 핵심 목표를 달성할 수 있도록 돕는 AI 코치.

**컨셉:** Self-Architecture. 기록의 번거로움은 기술에게, 삶의 주도권은 사용자에게.

## 📂 문서

| 문서 | 설명 |
| --- | --- |
| [`docs/PRD-v4.1.md`](docs/PRD-v4.1.md) | 제품 요구사항 문서 (PRD) & User Stories — *왜/무엇* |
| [`prompts/system-instruction-v4.1.md`](prompts/system-instruction-v4.1.md) | Gemini Gem 시스템 프롬프트 v4.1 — *어떻게* |
| [`schemas/notion-output.schema.json`](schemas/notion-output.schema.json) | `#노션용` 출력 JSON Schema — *파서 보호* |
| [`docs/EDGE-CASES.md`](docs/EDGE-CASES.md) | v4.1 미명시 경계 조건 — *결정 대기 4건 포함* |
| [`docs/DB-DESIGN.md`](docs/DB-DESIGN.md) | 시계열 DB 설계 — *년/월/일 트렌드 분석* |
| [`docs/IMPLEMENTATION-ROADMAP.md`](docs/IMPLEMENTATION-ROADMAP.md) | 반응형 웹앱 구현 로드맵 — *2~3주 MVP* |

## 🧱 핵심 기능 (요약)

- 멀티모달 입력 (사진 + 텍스트) → 칼로리·영양소·운동량 자동 분석
- 3대 목표(체중/체력/루틴) 기반 행동 점수 산출
- 듀얼 출력: `#공식용` 마크다운 리포트 / `#노션용` 순수 JSON
- 세션 내 과거 기록 조회 및 통계

## 🛠 상태

- 설계: v4.1 (Gemini 1.5 Pro / 2.0 Flash 최적화)
- 구현: 로드맵 v1.0 — 반응형 웹앱(Next.js) 타겟, 2~3주 MVP
