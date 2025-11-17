import { describe, it, expect } from 'vitest';
import { determineWorkflow } from '../../src/vitest/core/test-runner.js';
import { existsSync } from 'fs';
import { join } from 'path';

describe('determineWorkflow', () => {
  it('creates cache directory and returns workflow name', () => {
    const wf = determineWorkflow('tests/scenarios/login.txt');
    expect(wf).toMatch(/login-flow$/);
    expect(existsSync(join(process.cwd(), 'cache', wf))).toBe(true);
  });
});