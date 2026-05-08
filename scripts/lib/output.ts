import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT } from './fixtures.ts';
import type { PocResult } from './types.ts';

export function resultsDir(model: 'claude' | 'gemini'): string {
  return join(REPO_ROOT, 'tests', 'fixtures', 'results', model);
}

export async function saveResult(result: PocResult): Promise<void> {
  const dir = resultsDir(result.model);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${result.fixture_id}.json`);
  await writeFile(path, JSON.stringify(result, null, 2), 'utf-8');
}

export function formatProgress(i: number, total: number, fixture_id: string, ms: number, ok: boolean): string {
  const pct = ((i / total) * 100).toFixed(0).padStart(3);
  const tag = ok ? '✓' : '✗';
  return `[${pct}%] ${tag} ${fixture_id.padEnd(28)} ${ms}ms`;
}
