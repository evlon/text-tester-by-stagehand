#!/usr/bin/env node
"use strict";

import { join, dirname, basename } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import readline from "readline";
import http from "http";
import { parse as parseUrl } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import StagehandManager from "../../setup/stagehand-setup.js";
import "../../setup/env-setup.js";
import { TextTestRunner,determineWorkflow, shallowStringify } from "../core/test-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadRunnerContext() {
  const candidate = join(process.cwd(), 'tests', 'debug', 'runner-context.js');
  try {
    if (existsSync(candidate)) {
      const mod = await import(pathToFileURL(candidate).href);
      return mod.default || mod.runnerContext || {};
    }
  } catch {}
  // fallback default
  const { expect } = await import('chai');
  const path = await import('path');
  const fs = await import('fs');
  const { z } = await import('zod');
  return { fs, path, z, expect };
}

export async function debugFile(rel) {
  const runnerContext = await loadRunnerContext();
  if (!rel) {
    console.log("用法: npx text-tester-by-stagehand test:debug <scenario.txt>");
    process.exit(1);
  }
  const scenarioFile = rel.match(/\//) ? rel : join(process.cwd(), "tests", "scenarios", rel);

  const runner = new TextTestRunner();
  const workflow = determineWorkflow(scenarioFile);
  const testCases = runner.parseTextScenario(scenarioFile,workflow);

  // 简化版：逐步执行并在 CLI 中交互
  console.log(`🔍 调试文件: ${scenarioFile}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  for (const tc of testCases) {
    console.log(`\n📋 用例: ${tc.name}`);
    for (const step of tc.steps) {
      await new Promise(res => rl.question(`执行步骤: ${step.isMultiline ? '[多行]' : step.action} (Enter 继续, q 退出): `, ans => {
        if (ans.trim().toLowerCase() === 'q') { console.log('退出调试'); process.exit(0); }
        res();
      }));
      const result = await runner.executeStep(runnerContext, step);
      if (!result.success) {
        console.log('❌ 步骤失败，停止');
        rl.close();
        return;
      }
    }
  }
  rl.close();
  console.log('\n✅ 调试完成');
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("step-debugger.js")) {
  const rel = process.argv[2];
  debugFile(rel).catch((e) => {
    console.error("调试器异常:", e);
    process.exit(1);
  });
}