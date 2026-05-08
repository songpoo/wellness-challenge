import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadGroundTruth, REPO_ROOT } from './lib/fixtures.ts';
import { resultsDir } from './lib/output.ts';
import type { PocResult, Fixture } from './lib/types.ts';

interface ModelStats {
  model: string;
  model_id: string;
  total: number;
  schema_valid: number;
  meal_label_hit: number;
  meal_label_total: number;
  kcal_hit: number;
  kcal_total: number;
  workout_kw_hit: number;
  workout_kw_total: number;
  scale_hit: number;
  scale_total: number;
  avg_ttft_ms: number;
  avg_total_ms: number;
  total_cost_usd: number;
  errors: number;
}

async function loadResults(model: 'claude' | 'gemini'): Promise<PocResult[]> {
  const dir = resultsDir(model);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  const out: PocResult[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const raw = await readFile(join(dir, f), 'utf-8');
    out.push(JSON.parse(raw) as PocResult);
  }
  return out;
}

function evaluateMeal(parsed: Record<string, unknown> | null, fixture: Fixture): { label: boolean; kcal: boolean } {
  if (!parsed || !fixture.expected.labels?.length) return { label: false, kcal: false };
  const meals = ['Meal - Breakfast', 'Meal - Lunch', 'Meal - Snack', 'Meal - Dinner']
    .map((k) => String(parsed[k] ?? ''))
    .join(' ');
  const label = fixture.expected.labels.some((l) => meals.includes(l));

  const kcalRaw = parsed['Calories (intake)'];
  const kcal = typeof kcalRaw === 'number' ? kcalRaw : Number(kcalRaw);
  const min = fixture.expected.kcal_min ?? 0;
  const max = fixture.expected.kcal_max ?? 0;
  const kcalHit = max > 0 && kcal >= min && kcal <= max;

  return { label, kcal: kcalHit };
}

function evaluateWorkout(parsed: Record<string, unknown> | null, fixture: Fixture): boolean {
  if (!parsed || !fixture.expected.workout_type_keywords?.length) return false;
  const wtype = String(parsed['Workout Type'] ?? '');
  return fixture.expected.workout_type_keywords.some((k) => wtype.includes(k));
}

function evaluateScale(parsed: Record<string, unknown> | null, fixture: Fixture): boolean {
  // 체중계는 v4.1 schema에 weight 키가 없음 — Memo/Insight 안에 숫자가 있는지 정도 검증
  if (!parsed || !fixture.expected.weight_kg) return false;
  const haystack = ['Memo', 'Insight', 'Coach Comment']
    .map((k) => String(parsed[k] ?? ''))
    .join(' ');
  const target = fixture.expected.weight_kg;
  const m = haystack.match(/(\d{2,3}(?:\.\d{1,2})?)\s*kg/);
  if (!m?.[1]) return false;
  const reported = Number(m[1]);
  return Math.abs(reported - target) <= 0.3;
}

function aggregate(results: PocResult[], fixtures: Fixture[]): ModelStats {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const stats: ModelStats = {
    model: results[0]?.model ?? '',
    model_id: results[0]?.model_id ?? '',
    total: results.length,
    schema_valid: 0,
    meal_label_hit: 0,
    meal_label_total: 0,
    kcal_hit: 0,
    kcal_total: 0,
    workout_kw_hit: 0,
    workout_kw_total: 0,
    scale_hit: 0,
    scale_total: 0,
    avg_ttft_ms: 0,
    avg_total_ms: 0,
    total_cost_usd: 0,
    errors: 0,
  };

  let ttftSum = 0, ttftCount = 0, totalSum = 0;

  for (const r of results) {
    if (r.error) stats.errors++;
    if (r.schema_valid) stats.schema_valid++;
    stats.total_cost_usd += r.estimated_cost_usd;
    totalSum += r.total_ms;
    if (r.ttft_ms !== null) {
      ttftSum += r.ttft_ms;
      ttftCount++;
    }

    const fixture = byId.get(r.fixture_id);
    if (!fixture) continue;
    const parsed = r.parsed_json as Record<string, unknown> | null;

    if (fixture.category === 'meal') {
      stats.meal_label_total++;
      stats.kcal_total++;
      const e = evaluateMeal(parsed, fixture);
      if (e.label) stats.meal_label_hit++;
      if (e.kcal) stats.kcal_hit++;
    } else if (fixture.category === 'workout') {
      stats.workout_kw_total++;
      if (evaluateWorkout(parsed, fixture)) stats.workout_kw_hit++;
    } else if (fixture.category === 'scale') {
      stats.scale_total++;
      if (evaluateScale(parsed, fixture)) stats.scale_hit++;
    }
  }

  stats.avg_ttft_ms = ttftCount ? Math.round(ttftSum / ttftCount) : 0;
  stats.avg_total_ms = stats.total ? Math.round(totalSum / stats.total) : 0;
  return stats;
}

function pct(a: number, b: number): string {
  if (b === 0) return '—';
  return `${((a / b) * 100).toFixed(1)}%`;
}

function row(label: string, claude: string, gemini: string, target: string): string {
  return `| ${label} | ${claude} | ${gemini} | ${target} |`;
}

function buildMatrix(claude: ModelStats, gemini: ModelStats): string {
  const lines: string[] = [];
  lines.push('# Phase 1 PoC — Model Comparison Matrix');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- **Claude:** \`${claude.model_id}\` (${claude.total} fixtures)`);
  lines.push(`- **Gemini:** \`${gemini.model_id}\` (${gemini.total} fixtures)`);
  lines.push('');
  lines.push('| 지표 | Claude | Gemini | 통과 기준 |');
  lines.push('| --- | --- | --- | --- |');
  lines.push(row('JSON Schema 통과율', pct(claude.schema_valid, claude.total), pct(gemini.schema_valid, gemini.total), '≥ 95%'));
  lines.push(row('음식 라벨 정확도', pct(claude.meal_label_hit, claude.meal_label_total), pct(gemini.meal_label_hit, gemini.meal_label_total), '≥ 80%'));
  lines.push(row('칼로리 추정 적중률', pct(claude.kcal_hit, claude.kcal_total), pct(gemini.kcal_hit, gemini.kcal_total), '≥ 70%'));
  lines.push(row('운동 키워드 적중률', pct(claude.workout_kw_hit, claude.workout_kw_total), pct(gemini.workout_kw_hit, gemini.workout_kw_total), '≥ 75%'));
  lines.push(row('체중 OCR 정확도 (±0.3kg)', pct(claude.scale_hit, claude.scale_total), pct(gemini.scale_hit, gemini.scale_total), '≥ 90%'));
  lines.push(row('평균 TTFT', `${claude.avg_ttft_ms}ms`, `${gemini.avg_ttft_ms}ms`, '< 2,000ms'));
  lines.push(row('평균 전체 응답', `${claude.avg_total_ms}ms`, `${gemini.avg_total_ms}ms`, '< 8,000ms'));
  lines.push(row('총 비용 (18장)', `$${claude.total_cost_usd.toFixed(4)}`, `$${gemini.total_cost_usd.toFixed(4)}`, '< $0.27'));
  lines.push(row('호출당 비용', `$${(claude.total_cost_usd / claude.total).toFixed(4)}`, `$${(gemini.total_cost_usd / gemini.total).toFixed(4)}`, '< $0.015'));
  lines.push(row('오류 수', String(claude.errors), String(gemini.errors), '0'));
  lines.push('');
  lines.push('## 권장 결정');
  lines.push('');

  // 7개 핵심 지표 중 우세한 모델 카운트
  const wins = { claude: 0, gemini: 0 };
  const cmp = (c: number, g: number, higher = true) => {
    if (c === g) return;
    if (higher ? c > g : c < g) wins.claude++;
    else wins.gemini++;
  };
  cmp(claude.schema_valid / Math.max(1, claude.total), gemini.schema_valid / Math.max(1, gemini.total));
  cmp(claude.meal_label_hit / Math.max(1, claude.meal_label_total), gemini.meal_label_hit / Math.max(1, gemini.meal_label_total));
  cmp(claude.kcal_hit / Math.max(1, claude.kcal_total), gemini.kcal_hit / Math.max(1, gemini.kcal_total));
  cmp(claude.workout_kw_hit / Math.max(1, claude.workout_kw_total), gemini.workout_kw_hit / Math.max(1, gemini.workout_kw_total));
  cmp(claude.scale_hit / Math.max(1, claude.scale_total), gemini.scale_hit / Math.max(1, gemini.scale_total));
  cmp(claude.avg_total_ms, gemini.avg_total_ms, false);
  cmp(claude.total_cost_usd, gemini.total_cost_usd, false);

  const winner = wins.claude > wins.gemini ? 'Claude' : wins.gemini > wins.claude ? 'Gemini' : 'TIE';
  lines.push(`**7개 지표 우세 카운트:** Claude ${wins.claude} : Gemini ${wins.gemini} → **${winner}**`);
  lines.push('');
  lines.push('> 결과를 보고 노바님이 최종 결정. 정확도가 비슷하면 **Claude** (포트폴리오 + Prompt Caching), 비용 차이 크면 **Gemini**.');

  return lines.join('\n') + '\n';
}

async function main(): Promise<void> {
  const [{ fixtures }, claudeResults, geminiResults] = await Promise.all([
    loadGroundTruth(),
    loadResults('claude'),
    loadResults('gemini'),
  ]);

  if (claudeResults.length === 0 || geminiResults.length === 0) {
    console.error('Run npm run poc:claude && npm run poc:gemini first.');
    process.exit(1);
  }

  const claude = aggregate(claudeResults, fixtures);
  const gemini = aggregate(geminiResults, fixtures);
  const matrix = buildMatrix(claude, gemini);

  const path = join(REPO_ROOT, 'tests', 'fixtures', 'results', 'MATRIX.md');
  await writeFile(path, matrix, 'utf-8');
  console.log(matrix);
  console.log(`\nMatrix saved: ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
