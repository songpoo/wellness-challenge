# Fixture Photo Capture Guide — Phase 1 PoC

> **목표:** Claude Sonnet 4.6 vs Gemini 2.5 Pro 멀티모달 정확도 비교용 사진 18장 촬영.
> **소요:** 1.5~2시간 (실제 식사·운동 시간 활용).
> **결과물:** `tests/fixtures/{meals,workouts,scales}/*.jpg` + `ground-truth.json` 채우기.

---

## 1. 촬영 원칙 (모든 사진 공통)

| 항목 | 기준 |
| --- | --- |
| **포맷** | JPEG (HEIC는 변환 후 커밋) |
| **해상도** | 가로 1024px 이상, 4096px 이하 (너무 크면 클라이언트 리사이즈 단계 검증 안 됨) |
| **용량** | 장당 5MB 이하 |
| **EXIF GPS** | **반드시 strip** (촬영 후 [exiftool](https://exiftool.org/) 또는 Sharp.js로 제거. AI-PRODUCT-SPEC §5 보안 요구) |
| **얼굴/타인** | 절대 포함 금지 (privacy + 검증 프로세스 단순화) |
| **파일명** | `<카테고리>-<번호>-<짧은영문라벨>.jpg`, 예: `meal-01-bibimbap.jpg` |

### EXIF strip 한 줄 명령

```bash
# 단일 파일
exiftool -all= meal-01-bibimbap.jpg

# 폴더 일괄
exiftool -all= -r tests/fixtures/
```

---

## 2. 식단 사진 10장 (`meals/`)

**다양성 매트릭스** — 카테고리 1장씩 + 어려운 케이스 3장. 한 카테고리에 몰리지 않도록.

| # | 카테고리 | 예시 | 의도 |
| --- | --- | --- | --- |
| 01 | 한식 정식 (밥+국+반찬) | 비빔밥, 백반 | 다중 식기 기본기 |
| 02 | 한식 면류 | 잔치국수, 비빔국수, 칼국수 | 면 양 추정 |
| 03 | 한식 국/탕 | 김치찌개, 된장찌개 | 국물 vs 건더기 분리 |
| 04 | 분식 | 떡볶이, 김밥, 라면 | 가공식품 칼로리 |
| 05 | 양식 | 파스타, 샐러드, 피자 한 조각 | 서양식 라벨링 |
| 06 | 단백질 중심 | 닭가슴살 + 채소, 스테이크 | 단백질 g 추정 (목표 정확도 ±10g) |
| 07 | 디저트/간식 | 빵 1개, 케이크 1조각, 그릭 요거트 | 고칼로리 소량 |
| 08 | **다중 음식 한 상** | 회식 테이블, 한식당 백반세트 | 합산 능력 검증 |
| 09 | **부분 가림** | 그릇 일부가 다른 그릇에 가려짐 | 추론 안정성 |
| 10 | **흐림/저조도** | 일부러 약간 흔들림 또는 어두운 조명 | 실사용 환경 |

**촬영 조건:**
- 거리 30~50cm (식탁 위에서 자연스러운 각도)
- 각도 45도 (탑뷰만 말고 측면도 1~2장 섞기 — 실사용 그대로)
- 배경: 식탁 그대로 OK, 이상한 잡음만 피함
- 자연광 1~2장 + 형광등 1~2장 + 식당 조명 1~2장 (조도 다양성)

---

## 3. 운동 사진 5장 (`workouts/`)

| # | 카테고리 | 의도 |
| --- | --- | --- |
| 01 | 헬스장 기구 (예: 스쿼트랙, 벤치프레스) | 기구 종류 추론 |
| 02 | 야외 러닝 (스마트워치 화면 또는 노상) | 거리/시간 텍스트 OCR |
| 03 | 홈트 (요가매트 + 덤벨) | 배경+소품 추론 |
| 04 | 그룹 클래스 (필라테스/요가 — 사람 빼고 기구만) | 운동 종류 추론 |
| 05 | **모호한 케이스** (걸음수만 보이는 폰 화면) | 활동량 입력 검증 |

**촬영 조건:**
- 운동 직후/직전 상태 그대로 (땀·물병 등 컨텍스트 살림)
- 사람 신체 부위 정면 노출 안 되게 (얼굴 절대 X, 손/발 정도 OK)

---

## 4. 체중계 사진 3장 (`scales/`)

| # | 케이스 | 의도 |
| --- | --- | --- |
| 01 | 디지털 체중계 정상 (선명한 숫자) | OCR 기본 정확도 |
| 02 | 약간 비스듬한 각도 | 각도 robust |
| 03 | 가정용 + 추가 정보(체지방·근육량) 표시 | 다중 숫자 분리 능력 |

**촬영 조건:**
- 숫자가 똑바로 보이도록 발 닿은 상태로 위에서
- 욕실 등 사적 공간 — 변기/세면대 등 식별 가능 사물 최소화

---

## 5. Ground Truth 작성

촬영 후 `tests/fixtures/ground-truth.json`을 채워야 PoC가 정답과 비교 가능합니다.
템플릿: `ground-truth.template.json` 참조.

각 fixture별로 채울 필드:

```json
{
  "id": "meal-01-bibimbap",
  "file": "meals/meal-01-bibimbap.jpg",
  "category": "meal",
  "user_text": "Day 1. 비빔밥 먹었어. #노션용",
  "expected": {
    "labels": ["비빔밥"],
    "kcal_min": 550,
    "kcal_max": 750,
    "protein_g_min": 15,
    "protein_g_max": 25,
    "notes": "보통 한 그릇 600~700kcal"
  }
}
```

**칼로리 범위는 보수적으로** (±20% 폭) 잡으세요. 타이트한 정답은 라벨 자체가 정확해도 실패시키므로 의미 없음.

체중계 사진은 다른 키:

```json
{
  "id": "scale-01-clear",
  "file": "scales/scale-01-clear.jpg",
  "category": "scale",
  "user_text": "오늘 체중 기록.",
  "expected": {
    "weight_kg": 72.4
  }
}
```

운동 사진:

```json
{
  "id": "workout-01-squat-rack",
  "file": "workouts/workout-01-squat-rack.jpg",
  "category": "workout",
  "user_text": "Day 5. 헬스장에서 30분 운동. #노션용",
  "expected": {
    "workout_type_keywords": ["스쿼트", "근력", "헬스"],
    "duration_min": 30
  }
}
```

---

## 6. 평가 지표 (`scripts/compare.ts`가 자동 계산)

| 지표 | 측정 방법 | 통과 기준 |
| --- | --- | --- |
| **JSON Schema 통과율** | Ajv 검증 | ≥ 95% |
| **음식 라벨 정확도** | ground-truth.expected.labels 중 하나라도 응답에 포함 | ≥ 80% |
| **칼로리 추정 적중률** | response.kcal ∈ [min, max] 범위 안 | ≥ 70% |
| **체중 OCR 정확도** | abs(predicted - actual) ≤ 0.3kg | ≥ 90% |
| **운동 키워드 적중률** | workout_type_keywords 중 하나라도 매칭 | ≥ 75% |
| **TTFT** | API 호출~첫 토큰 (스트리밍 시) 또는 총 응답 시간 | < 2.0s / 8.0s |
| **호출당 비용** | 입출력 토큰 수 × 모델 단가 | < $0.015 |

**→ 두 모델 매트릭스 출력 후, 7개 지표 중 5개 이상에서 우세한 모델을 픽스.**

---

## 7. 실행 순서

```bash
# 1. 의존성 설치
npm install

# 2. .env 파일 생성 + API 키 입력
cp .env.example .env
# 편집기로 ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY 채우기

# 3. 사진 18장 촬영 + EXIF strip
exiftool -all= -r tests/fixtures/

# 4. ground-truth.json 작성
cp tests/fixtures/ground-truth.template.json tests/fixtures/ground-truth.json
# 편집기로 18개 entry 채우기

# 5. PoC 실행
npm run poc:claude    # 결과는 tests/fixtures/results/claude/
npm run poc:gemini    # 결과는 tests/fixtures/results/gemini/

# 6. 비교 매트릭스 생성
npm run poc:compare   # tests/fixtures/results/MATRIX.md 자동 생성
```

각 PoC 스크립트는 fixture 1장당 **최대 30초** 대기. 18장 × 2모델 ≈ **18분** 안에 끝남.

---

## 8. 주의사항

- 사진은 **비공개**로 유지 (개인 식단/운동 노출). 배포 시 fixtures 디렉터리는 별도 private repo 또는 .gitignore 처리 검토
- 현재 `.gitignore`에는 결과만 제외 — 사진 자체는 커밋되도록 두어 PoC 재현성 확보. **개인정보 우려 시 fixtures/도 .gitignore에 추가**
- ground truth 작성 시 칼로리는 [Naver 식품 DB](https://terms.naver.com/) 또는 [농식품종합정보시스템](https://koreanfood.rda.go.kr/) 참고
- 라벨 모호한 사진(찌개+밥+여러 반찬)은 main dish 기준으로 1~2개만 expected.labels에 적기

---

## 관련 문서

- [`docs/AI-PRODUCT-SPEC.md`](../../docs/AI-PRODUCT-SPEC.md) — 성공 지표 (한식 80%, JSON Schema 98%)
- [`docs/IMPLEMENTATION-ROADMAP.md`](../../docs/IMPLEMENTATION-ROADMAP.md) — Phase 1 위치
- [`prompts/system-instruction-v4.1.md`](../../prompts/system-instruction-v4.1.md) — PoC가 호출할 system prompt
- [`schemas/notion-output.schema.json`](../../schemas/notion-output.schema.json) — JSON Schema 검증 대상
