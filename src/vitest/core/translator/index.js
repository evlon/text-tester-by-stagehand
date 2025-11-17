#!/usr/bin/env node
"use strict";

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

/**
 * Translator: map natural language steps to executable actions using
 * config/translation-rules.yaml. 若无规则匹配则切换到 agent 模式。
 */
export class Translator {
  constructor(options = {}) {
    this.rulesPath = options.rulesPath || join(process.cwd(), "config", "translation-rules.yaml");
    this.strictMode = options.strictMode ?? false;
    this.corePath = options.corePath || join(process.cwd(), "config", "core.yaml");
    this.paramPatterns = this.loadParamPatterns();
    this.rules = this.loadRules();
    // No legacy parser fallback; stick to rules or agent mode
  }

  loadRules() {
    if (!existsSync(this.rulesPath)) {
      return [];
    }
    try {
      const content = readFileSync(this.rulesPath, "utf-8");
      const cfg = yaml.load(content);
      const rules = Array.isArray(cfg?.rules) ? cfg.rules : [];
      return rules.map((r) => ({
        name: r.name,
        patterns: Array.isArray(r.patterns) ? r.patterns : [],
        template: r.template,
        validation: r.validation || {},
      }));
    } catch (e) {
      console.error("❌ 加载转义规则失败:", e.message);
      process.exit(1);
      return [];
    }
  }

  loadParamPatterns() {
    try {
      if (!existsSync(this.corePath)) return {};
      const content = readFileSync(this.corePath, "utf-8");
      const cfg = yaml.load(content) || {};
      const patterns = cfg?.translation?.paramPatterns || {};
      // 预处理：剥离 ^ 和 $ 锚点，避免嵌入到整体 ^...$ 时冲突
      const stripAnchors = (s) => {
        if (typeof s !== "string") return "";
        return s.replace(/^\^/, "").replace(/\$$/, "");
      };
      const normalized = {};
      for (const [k, v] of Object.entries(patterns)) {
        normalized[k] = stripAnchors(v);
      }
      return normalized;
    } catch (e) {
      console.error("⚠️ 加载参数正则失败:", e.message);
      return {};
    }
  }

  matchRule(text) {
    const normalized = text.trim();
    for (const rule of this.rules) {
      for (const pat of rule.patterns) {
        const re = this._compilePatternToRegex(pat);
        const m = normalized.match(re);
        if (m) {
          const rawGroups = m.groups || {};
          const groups = Object.fromEntries(
            Object.entries(rawGroups).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
          );
          return { rule, groups, pattern: pat };
        }
      }
    }
    return null;
  }

  // Safely compile pattern with placeholders to a regex that captures named groups
  _compilePatternToRegex(pattern) {
    // 支持管道分隔语法：token1|token2|token3
    // 对管道分隔的规则，默认允许管道两侧存在可选空格（无需在 patterns 中专门配置空格变体）
    if (pattern.includes("|")) {
      const segments = pattern.split("|").map((s) => s.trim());
      const compiledSegments = segments.map((seg) => this._compileSegment(seg));
      const body = compiledSegments.join("\\.*?");
      return new RegExp(`^${body}$`);
    }
    // 非管道规则，按原逻辑处理（精确匹配字面与占位符）
    return new RegExp(`^${this._compileSegment(pattern)}$`);
  }

  _compileSegment(segment) {
    const parts = [];
    let lastIndex = 0;
    const placeholderRe = /\{(\w+)\}/g;
    let match;
    while ((match = placeholderRe.exec(segment)) !== null) {
      const [full, name] = match;
      const literal = segment.slice(lastIndex, match.index);
      parts.push(this._escapeRegex(literal));
      const custom = this.paramPatterns?.[name];
      if (custom && typeof custom === "string" && custom.length > 0) {
        parts.push(`(?<${name}>${custom})`);
      } else {
        parts.push(`(?<${name}>.+?)`);
      }
      lastIndex = match.index + full.length;
    }
    parts.push(this._escapeRegex(segment.slice(lastIndex)));
    return parts.join("");
  }

  _escapeRegex(s) {
    return s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  }

  _expandEnv(text) {
    return text.replace(/%(\w+)%/g, (_, name) => {
      const v = process.env[name];
      return typeof v === "string" && v.length > 0 ? v : `%${name}%`;
    });
  }

  translate(stepText) {
    const stepTextEnv = this._expandEnv(stepText);
    const match = this.matchRule(stepTextEnv);
    if (match) {
      const { rule, groups, pattern } = match;
      const code = this.renderTemplate(rule.template, groups);
      return {
        engine: "rules",
        action: stepTextEnv,
        actionRaw: stepText,
        matchedRule: rule.name,
        matchedPattern: pattern,
        params: groups,
        template: rule.template,
        code,
        type: this.inferTypeFromTemplate(rule.template),
      };
    }
    // Fallback: agent mode executes natural language with Stagehand agent
    return {
      engine: "agent",
      matchedRule: null,
      params: {},
      code: stepText,
      type: "agent",
    };
  }

  renderTemplate(template, params) {
    if (!template) return "";
    return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`);
  }

  inferTypeFromTemplate(template) {
    if (!template) return "act";
    if (template.includes("stagehand.extract")) return "extract";
    if (template.includes("stagehand.act")) return "act";
    return "act";
  }

  reload() {
    // 重新加载参数模式与规则集，用于热重载
    this.paramPatterns = this.loadParamPatterns();
    this.rules = this.loadRules();
    return { rules: this.rules?.length || 0 };
  }
}

// CLI usage (optional)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  const text = process.argv.slice(2).join(" ");
  if (!text) {
    console.log("用法: translator \"步骤文本\"");
    process.exit(0);
  }
  const t = new Translator();
  console.log(`规则数量: ${t.rules?.length ?? 0}`);
  // 调试：输出可能匹配的规则模式
  for (const rule of t.rules) {
    for (const pat of rule.patterns || []) {
      const re = t._compilePatternToRegex(pat);
      const ok = re.test(text.trim());
      if (ok) {
        console.log(`可能匹配: [${rule.name}] 模式: ${pat}`);
      }
    }
  }
  const res = t.translate(text);
  console.log(JSON.stringify(res, null, 2));
}