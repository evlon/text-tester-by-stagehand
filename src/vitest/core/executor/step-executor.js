"use strict";

import fs from "fs";
import path from "path";
import { Translator } from "../translator/index.js";

export class StepExecutor {
  constructor(options = {}) {
    this.strictMode = options.strictMode ?? false;
    this.paramPatterns = options.paramPatterns || {};
    this.translation = new Translator({ strictMode: this.strictMode });
    this.executionHistory = [];
  }

  compileStep(stepInfo) {
    const { action, comments, isMultiline } = stepInfo;
    const translation = this.translation.translate(action);
    return { translation, action, comments, isMultiline };
  }

  async executeCompiledStep(runnerContext, compiled) {
    const { translation, action } = compiled;
    const start = Date.now();
    const workflow = this.currentWorkflow;

    try {
      const stagehand = await this.translation.getStagehand(workflow);
      const result = await translation.code(runnerContext, stagehand, translation.params);
      const duration = Date.now() - start;
      this.executionHistory.push({ action, type: translation.type, success: true, duration, workflow, timestamp: new Date().toISOString() });
      console.log(`   ✅ 步骤执行成功 (${duration}ms)`);
      return { success: true, action, type: translation.type, result, duration, workflow };
    } catch (error) {
      const duration = Date.now() - start;
      let detailedMessage = error?.message || String(error);
      if (translation?.engine === "rules") {
        const context = [
          `规则: ${translation.matchedRule || "(未知)"}`,
          translation.matchedPattern ? `模式: ${translation.matchedPattern}` : null,
          `参数: ${JSON.stringify(translation.params || {}, null, 2)}`,
          `代码片段:\n${(translation.code || "").toString()}`,
        ].filter(Boolean).join("\n");
        detailedMessage += `\n${context}`;
      }
      console.log(`   ❌ 步骤执行失败 (${duration}ms)\n${detailedMessage}`);
      this.executionHistory.push({ action, type: translation.type, success: false, duration, error: detailedMessage, workflow });
      return { success: false, action, type: translation.type, error: detailedMessage, duration, workflow };
    }
  }

  async executeStep(runnerContext,stepInfo) {
    const compiled = this.compileStep(stepInfo);
    return await this.executeCompiledStep(runnerContext,compiled);
  }
}