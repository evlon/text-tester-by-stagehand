"use strict";

import { readFileSync, existsSync, readdirSync ,mkdirSync} from "fs";
import path, { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { StepExecutor } from "./executor/step-executor.js";
import StagehandManager from "../../setup/stagehand-setup.js";
import "../../setup/env-setup.js"; // 加载 .env 与测试凭据，提供 %TEST_*% 变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function shallowStringify(obj, options = {}) {
  const seen = new WeakSet();
  const { maxDepth = 2, maxArrayLength = 10 } = options;
  const helper = (value, depth) => {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      if (depth >= maxDepth) return `[Array(${value.length})]`;
      return value.slice(0, maxArrayLength).map(v => helper(v, depth + 1));
    }
    if (depth >= maxDepth) return `{...}`;
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = helper(v, depth + 1);
    }
    return result;
  };
  return JSON.stringify(helper(obj, 0), null, 2);
}

function determineWorkflow(textFilePath){
  const scenariosDir = resolve(process.env.TEST_CACHE_DIR || "cache");
  let lowFilename = path.basename(textFilePath).replace(/\.txt$/i, "").toLowerCase().toLowerCase();

  let workflow = lowFilename + "-flow";
  let workflowDir = path.join(scenariosDir, workflow);
  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true });
  }

  return workflow;  
}

function generateTestSuite(textFilePath,templateConfig) {
  const runner = new TextTestRunner();
  const workflow = determineWorkflow(textFilePath);
  const testCases = runner.parseTextScenario(textFilePath,workflow);
  const suiteName = `文本测试: ${textFilePath.split("/").pop().replace(".txt", "").replace(/^(.)/, (m) => m.toUpperCase())}`;
  const testContent = [];

  const test_template_each = [];
  testCases.forEach((testCase, index) => {
      const templateEachVal = {testcase: testCase, index: index + 1, "testcase:name": testCase.name, "testcase:jsonstring": JSON.stringify(testCase)};
      test_template_each.push(templateConfig.translation.test_template_each.replace(/\$\{[\w:]+\}/g, (match) => {
        const key = match.replace(/^\$\{|\}$/g, "");
        return templateEachVal[key] || match;
      }));
   });

  const templateVal = {"suite:name": suiteName, test_template_each: test_template_each.join("\n")}

  testContent.push(templateConfig.translation.test_template.replace(/\$\{[\w:]+\}/g, (match) => {
    const key = match.replace(/^\$\{|\}$/g, "");
    return templateVal[key] || match;
  }));
  return testContent.join("\n");
}

class TextTestRunner {
  constructor() {
    this.stagehandManager = new StagehandManager();
    this.executor = new StepExecutor();
  }

  parseTextScenario(filePath, workflow) {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    const testCases = [];
    let current = null;
    let inMultiline = false;
    let multilineContent = [];

    const extractEnv = (text) => text.replace(/%([A-Z_][A-Z0-9_]*)%/g, (_, v) => process.env[v] ?? `%${v}%`);

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith("#")) continue;
      if (line.startsWith("## 测试用例:")) {
        if (current) testCases.push(current);
        current = { name: line.replace(/^## 测试用例:\s*/, ""), steps: [], comments: [] };
        continue;
      }
      if (line.startsWith("+\"\"\"") || line === "+" || line === "\"\"\"") {
        inMultiline = true; multilineContent = []; continue;
      }
      if (line.startsWith("-\"\"\"") || line === "-" || line === "\"\"\"") {
        if (current) {
          current.steps.push({ action: extractEnv(multilineContent.join("\n")), isMultiline: true, comments: [] });
        }
        inMultiline = false; multilineContent = []; continue;
      }
      if (inMultiline) { multilineContent.push(line); continue; }
      if (line.startsWith("# 断言:")) { if (current) current.comments.push(line.replace(/^# 断言:\s*/, "")); continue; }
      if (current) current.steps.push({ action: extractEnv(line), isMultiline: false, comments: [] });
    }
    if (current) testCases.push(current);
    return testCases;
  }

  async executeStep(runnerContext, stepInfo) {
    this.executor.currentWorkflow = this.currentWorkflow;
    return await this.executor.executeStep(runnerContext, stepInfo);
  }

  async runTestCase(runnerContext, testCase) {
    this.currentTestCase = testCase.name;
    const caseResults = { name: testCase.name, steps: [], passed: true, startTime: Date.now(), multilineSteps: 0 };
    console.log(`\n📋 开始测试: ${testCase.name}`);
    if (testCase.comments.length > 0) {
      console.log("   📝 用例说明:");
      testCase.comments.forEach((c) => console.log(`     - ${c}`));
    }
    const multilineSteps = testCase.steps.filter(step => step.isMultiline);
    if (multilineSteps.length > 0) {
      caseResults.multilineSteps = multilineSteps.length;
      console.log(`   📄 包含 ${multilineSteps.length} 个多行步骤`);
    }
    for (const stepInfo of testCase.steps) {
      const stepResult = await this.executeStep(runnerContext, stepInfo);
      caseResults.steps.push(stepResult);
      if (stepInfo.isMultiline) {
        console.log(`   📄 执行多行步骤: ${stepResult.success ? '✅' : '❌'}`);
        if (!stepResult.success) {
          console.log(`     内容: ${stepInfo.action.substring(0, 100)}...`);
        }
      } else {
        console.log(`   ${stepResult.success ? '✅' : '❌'} ${stepInfo.action}`);
      }
      if (!stepResult.success) { 
        caseResults.passed = false; break; 
      }
    }
    caseResults.endTime = Date.now();
    caseResults.duration = caseResults.endTime - caseResults.startTime;
    console.log(`\n✅ 测试完成: ${testCase.name} (${caseResults.duration}ms)`);
    return caseResults;
  }

  getParseStats() { return { currentTestCase: this.currentTestCase, stagehandInstances: this.stagehandManager?.instances?.size || 0 }; }
}

export { generateTestSuite,TextTestRunner ,shallowStringify ,determineWorkflow};