import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import type { GroundTruth, Fixture } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');

export async function loadGroundTruth(): Promise<GroundTruth> {
  const path = join(REPO_ROOT, 'tests', 'fixtures', 'ground-truth.json');
  if (!existsSync(path)) {
    throw new Error(
      `ground-truth.json not found at ${path}.\n` +
      `Copy ground-truth.template.json and fill it per tests/fixtures/README.md.`
    );
  }
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as GroundTruth;
}

export async function loadSystemPrompt(): Promise<string> {
  const path = join(REPO_ROOT, 'prompts', 'system-instruction-v4.1.md');
  return readFile(path, 'utf-8');
}

export async function loadFixtureImage(fixture: Fixture): Promise<{
  base64: string;
  mimeType: string;
}> {
  const path = join(REPO_ROOT, 'tests', 'fixtures', fixture.file);
  if (!existsSync(path)) {
    throw new Error(`Fixture image not found: ${path}`);
  }
  const buf = await readFile(path);
  const ext = fixture.file.split('.').pop()?.toLowerCase() ?? 'jpeg';
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { base64: buf.toString('base64'), mimeType };
}
