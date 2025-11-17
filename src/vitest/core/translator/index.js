#!/usr/bin/env node
"use strict";

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import StagehandManager from "../../../setup/stagehand-setup.js";

export class Translator {
  constructor(options = {}) {
    const baseConfigDir = options.configDir || (process.env.TEXT_TESTER_CONFIG_DIR 
      ? join(process.cwd(), process.env.TEXT_TESTER_CONFIG_DIR)
      : join(process.cwd(), "config"));
    this.rulesPath = options.rulesPath || join(baseConfigDir, "translation-rules.yaml");
    this.strictMode = options.strictMode ?? false;
    this.corePath = options.corePath || join(baseConfigDir, "core.yaml");
    this.paramPatterns = this.loadParamPatterns();
    this.rules = this.loadRules();
  }

  loadParamPatterns() {
    try {
      const core = yaml.load(readFileSync(this.corePath, "utf-8"));
      return core?.paramPatterns || core?.translation?.paramPatterns || {};
    } catch {
      return {};
    }
  }

  loadRules() {
    try {
      if (!existsSync(this.rulesPath)) return [];
      const data = yaml.load(readFileSync(this.rulesPath, "utf-8"));
      if (!data || typeof data !== "object") return [];
      const rules = Array.isArray(data.rules) ? data.rules : [];
      const errors = [];
      if (!rules.length) {
        errors.push("缺少 rules 数组，或为空");
      }
      rules.forEach((r, i) => {
        if (!r || typeof r !== "object") { errors.push(`第 ${i} 个规则格式错误`); return; }
        if (typeof r.name !== "string" || !r.name.trim()) errors.push(`规则 ${i}: name 必须为非空字符串`);
        if (!Array.isArray(r.patterns) || r.patterns.length === 0) errors.push(`规则 ${i}: patterns 必须为非空数组`);
      });
      if (errors.length) {
        console.log("⚠️ translation-rules.yaml 校验警告:\n - " + errors.join("\n - "));
      }
      return rules;
    } catch (e) {
      console.log("translation-rules.yaml 解析失败:", e?.message || String(e));
      return [];
    }
  }

  async getStagehand(workflow) {
    const manager = this.stagehandManager || (this.stagehandManager = new StagehandManager());
    return await manager.getStagehandForWorkflow(workflow);
  }

  translate(action) {
    // Simple placeholder: return an executable function
    // In real code, this uses rules or agent fallback
    const matchedRule = this.rules.find(r => r?.patterns?.some(p => typeof p === 'string' && action.includes(p.replace(/\{.*?\}/g, '').trim())));
    const engine = matchedRule ? 'rules' : 'agent';
    const params = {};
    const code = async (runnerContext, $stagehand) => {
      if (engine === 'rules') {
        // For demo purpose, just log
        return await $stagehand.act(action, runnerContext?.$page || undefined);
      }
      return await $stagehand.agent(action);
    };
    return { type: 'step', engine, matchedRule: matchedRule?.name, matchedPattern: matchedRule?.patterns?.[0], params, code };
  }
}

export default Translator;