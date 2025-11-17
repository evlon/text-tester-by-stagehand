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
    // 处理非对象类型
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    
    const result = {};
    const {
        maxDepth = 1,
        exclude = [],
        include = null,
        handleFunctions = 'skip', // 'skip', 'stringify', 'replace'
        handleUndefined = 'skip'  // 'skip', 'null'
    } = options;
    
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            // 排除特定属性
            if (exclude.includes(key)) continue;
            
            // 如果指定了包含列表，只包含指定的属性
            if (include && !include.includes(key)) continue;
            
            const value = obj[key];
            
            // 处理不同类型的值
            if (value === undefined) {
                if (handleUndefined === 'null') {
                    result[key] = null;
                }
                // 如果 handleUndefined === 'skip'，则跳过
            } else if (typeof value === 'function') {
                if (handleFunctions === 'stringify') {
                    result[key] = value.toString();
                } else if (handleFunctions === 'replace') {
                    result[key] = '[Function]';
                }
                // 如果 handleFunctions === 'skip'，则跳过
            } else if (typeof value === 'object' && value !== null) {
                if (maxDepth > 1) {
                    // 递归处理，但减少深度
                    result[key] = JSON.parse(shallowStringify(value, {
                        ...options,
                        maxDepth: maxDepth - 1
                    }));
                } else {
                    // 达到最大深度，只显示类型信息
                    if (Array.isArray(value)) {
                        result[key] = `[Array: ${value.length} items]`;
                    } else if (value instanceof Date) {
                        result[key] = value.toISOString();
                    } else {
                        result[key] = `[Object: ${Object.keys(value).length} keys]`;
                    }
                }
            } else {
                // 基本类型直接赋值
                result[key] = value;
            }
        }
    }
    
    return JSON.stringify(result, null, options.space);
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

// function createTestSuite(textFilePath) {
//   const runner = new TextTestRunner();
//   const workflow = determineWorkflow(textFilePath);
//   const testCases = runner.parseTextScenario(textFilePath,workflow);
//   const suiteName = `文本测试: ${textFilePath.split("/").pop().replace(/\.txt$/i, "").replace(/^(.)/, (m) => m.toUpperCase())}`;
//   return {
//     runner,
//     testCases,
//     suiteName,
//     async generateTests() {
//       const { describe, test, beforeAll, afterAll, afterEach } = await import("vitest");
//       describe(this.suiteName, () => {
//         beforeAll(async () => { console.log(`\n🚀 初始化测试套件: ${this.suiteName}`); });
//         afterEach(async () => {});
//         afterAll(async () => { await runner.stagehandManager.closeAll(); });
//         this.testCases.forEach((tc, i) => {
//           test(`TC${i + 1}: ${tc.name}`, async () => {
//             const result = await runner.runTestCase(runnerContext,tc);
//             if (!result.passed) {
//               const failed = result.steps.find((s) => !s.success);
//               throw new Error(`测试失败: ${failed?.error || "未知错误"}\n失败步骤: ${failed?.action}`);
//             }
//           }, 120000);
//         });
//       });
//     },
//   };
// }

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

      // testContent.push(`  test("TC${index + 1}: ${testCase.name}", async () => {`);
      // testContent.push(`    const result = await runner.runTestCase(this,${JSON.stringify(testCase)});`);
      // testContent.push(`    if (!result.passed) {`);
      // testContent.push(`      const failed = result.steps.find((s) => !s.success);`);
      // testContent.push(`      throw new Error(\`测试失败: \${failed?.error || "未知错误"}\\n失败步骤: \${failed?.action}\`);`);
      // testContent.push(`    }`);
      // testContent.push(`  }, 120000);`);


   });

  const templateVal = {"suite:name": suiteName, test_template_each: test_template_each.join("\n")}

  testContent.push(templateConfig.translation.test_template.replace(/\$\{[\w:]+\}/g, (match) => {
    const key = match.replace(/^\$\{|\}$/g, "");
    return templateVal[key] || match;
  }));

  // testContent.push(`import { describe, test, beforeAll, afterAll, afterEach, expect } from "vitest";`);
  // testContent.push(`import { TextTestRunner} from "../../bin/vitest/core/test-runner.js";`);
  // testContent.push(`import fs from "fs";`);
  // testContent.push(`import path from "path";`);
  // testContent.push(`import { z } from "zod";`);
  // testContent.push(`const runner = new TextTestRunner();`);
  // testContent.push(`describe("${suiteName}", () => {`);
  // testContent.push(`  beforeAll(async () => { console.log("\\n🚀 初始化测试套件: ${suiteName}"); });`);
  // testContent.push(`  afterEach(async () => {});`);
  // testContent.push(`  afterAll(async () => { await runner.stagehandManager.closeAll(); });`);
  // testCases.forEach((testCase, index) => {
  //     testContent.push(`  test("TC${index + 1}: ${testCase.name}", async () => {`);
  //     testContent.push(`    const result = await runner.runTestCase(this,${JSON.stringify(testCase)});`);
  //     testContent.push(`    if (!result.passed) {`);
  //     testContent.push(`      const failed = result.steps.find((s) => !s.success);`);
  //     testContent.push(`      throw new Error(\`测试失败: \${failed?.error || "未知错误"}\\n失败步骤: \${failed?.action}\`);`);
  //     testContent.push(`    }`);
  //     testContent.push(`  }, 120000);`);


  //  });
  //  testContent.push(`});`);
   return testContent.join("\n");
}

class TextTestRunner {
  constructor() {
    this.stagehandManager = new StagehandManager();
    this.stepExecutor = new StepExecutor();
    this.results = [];
    this.currentTestCase = null;
  }

  parseTextScenario(filePath, workflow) {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const testCases = [];

    let currentTestCase = null;
    let currentComment = null;
    let inMultilineString = false;
    let multilineContent = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 处理多行字符串开始
      if (trimmed === '"+"' && !inMultilineString) {
        inMultilineString = true;
        multilineContent = [];
        continue;
      }
      
      // 处理多行字符串结束
      if (trimmed === '"-"' && inMultilineString) {
        inMultilineString = false;
        if (currentTestCase && multilineContent.length > 0) {
          const multilineStep = multilineContent.join('\n');
          currentTestCase.steps.push({ 
            action: multilineStep, 
            comment: currentComment, 
            workflow: workflow,
            isMultiline: true 
          });
          currentComment = null;
        }
        continue;
      }

      // 如果在多行字符串中，收集内容
      if (inMultilineString) {
        multilineContent.push(line); // 保留原始行（包括缩进）
        continue;
      }

      // 跳过空行
      if (!trimmed) continue;

      // 处理测试用例标题
      if (trimmed.startsWith("## ")) {
        if (currentTestCase) testCases.push(currentTestCase);
        currentTestCase = { 
          name: trimmed.replace("## ", ""), 
          steps: [], 
          comments: [] 
        };
        currentComment = null;
      } 
      // 处理注释行
      else if (trimmed.startsWith("# ") && currentTestCase) {
        currentComment = trimmed.replace("# ", "");
        currentTestCase.comments.push(currentComment);
      } 
      // 处理步骤分隔符
      else if (trimmed.startsWith("---") && currentTestCase) {
        testCases.push(currentTestCase);
        currentTestCase = { 
          name: `未命名用例_${testCases.length + 1}`, 
          steps: [], 
          comments: [] 
        };
        currentComment = null;
      }
      // 处理普通步骤行
      else if (currentTestCase && trimmed) {
        const [step, comment] = this.parseStepLine(trimmed);
        if (step) {
          currentTestCase.steps.push({ 
            action: step, 
            comment: comment || currentComment, 
            workflow: workflow 
          });
          currentComment = null;
        }
      }
    }
    
    // 添加最后一个测试用例
    if (currentTestCase) testCases.push(currentTestCase);
    return testCases;
  }

  parseStepLine(line) {
    if (line.startsWith("#")) return [null, null];
    const commentMatch = line.match(/^(.*?)\s*#\s*(.+)$/);
    if (commentMatch) return [commentMatch[1].trim(), commentMatch[2].trim()];
    return [line.trim(), null];
  }

  async executeStep(runnerContext, stepInfo) { 
    const r = await this.stepExecutor.executeStep(runnerContext, stepInfo); 
    
    // 处理执行结果
    if (r.result) {
      r.result = shallowStringify(r.result, {
        maxDepth: 2,
        exclude: [],
        include: null,
        handleFunctions: 'skip',
        handleUndefined: 'skip'
      });
    }
    
    // 记录多行步骤信息
    if (stepInfo.isMultiline) {
      r.isMultiline = true;
      r.multilineContent = stepInfo.action;
    }
    
    return r;
  }

  async runTestCase(runnerContext, testCase) {
    this.currentTestCase = testCase.name;
    const caseResults = { 
      name: testCase.name, 
      steps: [], 
      passed: true, 
      startTime: Date.now(),
      multilineSteps: 0
    };

    console.log(`\n📋 开始测试: ${testCase.name}`);
    
    // 输出用例说明
    if (testCase.comments.length > 0) {
      console.log("   📝 用例说明:");
      testCase.comments.forEach((c) => console.log(`     - ${c}`));
    }

    // 统计多行步骤
    const multilineSteps = testCase.steps.filter(step => step.isMultiline);
    if (multilineSteps.length > 0) {
      caseResults.multilineSteps = multilineSteps.length;
      console.log(`   📄 包含 ${multilineSteps.length} 个多行步骤`);
    }

    // 执行每个步骤
    for (const stepInfo of testCase.steps) {
      const stepResult = await this.executeStep(runnerContext, stepInfo);
      caseResults.steps.push(stepResult);
      
      // 输出步骤执行信息（特别标记多行步骤）
      if (stepInfo.isMultiline) {
        console.log(`   📄 执行多行步骤: ${stepResult.success ? '✅' : '❌'}`);
        if (!stepResult.success) {
          console.log(`     内容: ${stepInfo.action.substring(0, 100)}...`);
        }
      } else {
        console.log(`   ${stepResult.success ? '✅' : '❌'} ${stepInfo.action}`);
      }
      
      // 步骤失败时停止执行
      if (!stepResult.success) { 
        caseResults.passed = false;
        caseResults.error = stepResult.error; 
        break; 
      }
    }

    caseResults.endTime = Date.now();
    caseResults.duration = caseResults.endTime - caseResults.startTime;
    
    // 输出测试结果
    const statusIcon = caseResults.passed ? '✅' : '❌';
    const statusText = caseResults.passed ? '通过' : '失败';
    console.log(`   ${statusIcon} 测试${statusText} (${caseResults.duration}ms)`);
    
    // 如果有失败，显示错误信息
    if (!caseResults.passed && caseResults.error) {
      console.log(`   💥 错误: ${caseResults.error}`);
    }

    this.results.push(caseResults);
    return caseResults;
  }

  // 获取解析统计信息
  getParseStats() {
    const totalSteps = this.results.reduce((sum, testCase) => sum + testCase.steps.length, 0);
    const totalMultilineSteps = this.results.reduce((sum, testCase) => sum + (testCase.multilineSteps || 0), 0);
    
    return {
      totalTestCases: this.results.length,
      totalSteps: totalSteps,
      totalMultilineSteps: totalMultilineSteps,
      passedTestCases: this.results.filter(tc => tc.passed).length,
      failedTestCases: this.results.filter(tc => !tc.passed).length
    };
  }
}

export { generateTestSuite,TextTestRunner ,shallowStringify ,determineWorkflow};