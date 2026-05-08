import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { REPO_ROOT } from './fixtures.ts';

let cached: ValidateFunction | null = null;

export async function getNotionOutputValidator(): Promise<ValidateFunction> {
  if (cached) return cached;
  const schemaPath = join(REPO_ROOT, 'schemas', 'notion-output.schema.json');
  const schema = JSON.parse(await readFile(schemaPath, 'utf-8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  cached = ajv.compile(schema);
  return cached;
}

export function tryExtractJson(raw: string): unknown {
  // 1. 순수 JSON
  try { return JSON.parse(raw); } catch {}

  // 2. ```json ... ``` 블록 (instruction은 금지하지만 모델이 따를지 측정)
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]+?)\n?\s*```/);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }

  // 3. 첫 { 부터 마지막 } 까지 (모델이 설명문구 섞어 출력한 경우)
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }

  return null;
}
