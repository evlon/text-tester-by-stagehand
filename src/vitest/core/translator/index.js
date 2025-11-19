#!/usr/bin/env node
"use strict";

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

// ============================================================================
// 使用示例 - 使用 ~ 分隔符
// ============================================================================

/*
配置文件 (translation-rules.yaml):

rules:
  - name: "goto_url"
    patterns:
      - "打开~{url}"
      - "访问~{url}"
      - "打开~{label}~{url}"
    template: |
      await $context.newPage('{url}');
    validation:
      required: ["url"]

  - name: "screenshot"
    patterns:
      - "截图~保存为~{imagefilename}"
      - "截屏~{imagefilename}"
    template: |
      await $page.screenshot({ path: 'results/screenshots/{imagefilename}.png' });
    validation:
      required: ["imagefilename"]
      
  - name: "input_action"
    patterns:
      - "在{field}中输入~{value}"
      - "输入~{value}~到{field}"
      - "填充~{selector}~{value}"
    template: |
      await $stagehand.act('在 {field} 中输入 {value}', $page)
    validation:
      required: ["field", "value"]

  - name: "assert_text"
    patterns:
      - "断言包含文本~{selector}~{text}"
      - "断言文本等于~{selector}~{text}"
    template: |
      await (async () => {
        const actualText = await $page.locator('{selector}').textContent();
        expect(actualText).to.include('{text}');
      })()
    validation:
      required: ["selector", "text"]

测试用例示例:

1. 打开~https://example.com
2. 在用户名中输入~admin
3. 填充~#password~secret123
4. 点击~登录按钮
5. 等待~2000~毫秒
6. 断言包含文本~.message~登录成功
7. 截图~保存为~dashboard
8. 摘录~提取用户信息

解析结果:

步骤1: 
  匹配规则: goto_url
  参数: {url: "https://example.com"}
  生成代码: await $context.newPage('https://example.com');
  
步骤2:
  匹配规则: input_action  
  参数: {field: "用户名", value: "admin"}
  生成代码: await $stagehand.act('在 用户名 中输入 admin', $page)
  
步骤3:
  匹配规则: input_action
  参数: {selector: "#password", value: "secret123"}
  生成代码: await $stagehand.act('在 #password 中输入 secret123', $page)
  
步骤4:
  匹配规则: default_act (AI fallback)
  AI模式执行: "点击~登录按钮" -> "点击登录按钮"
  
步骤6:
  匹配规则: assert_text
  参数: {selector: ".message", text: "登录成功"}
  
步骤7:
  匹配规则: screenshot
  参数: {imagefilename: "dashboard"}

优势总结:
✅ 简洁：单字符 ~
✅ 清晰：视觉上明显与文字区分
✅ 无歧义：无中英文混淆
✅ 易输入：标准键盘都有
✅ 兼容性：不与正则冲突
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
        patterns: (Array.isArray(r.patterns) ? r.patterns : []).map((pat) => ({pat, re: this._compilePatternToRegex(pat)})),
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
      for (const {pat, re} of rule.patterns) {
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
  // 使用 ~ 作为分隔符
  // 支持波浪号分隔语法：token1~token2~token3
  const DELIMITER = "~";
  
  if (pattern.includes(DELIMITER)) {
    // 按 ~ 分割
    const segments = pattern.split(DELIMITER);
    const compiledSegments = segments.map((seg) => this._compileSegment(seg.trim()));
    
    // 段之间允许可选空白
    const body = compiledSegments.join("\\s*");
    return new RegExp(`^${body}$`);
  }
  
  // 非分隔符规则，支持自然语言占位符
  return new RegExp(`^${this._compileSegment(pattern)}$`);
}


_compileSegment(segment) {
  const parts = [];
  let lastIndex = 0;
  const placeholderRe = /\{(\w+)\}/g;
  let match;
  
  while ((match = placeholderRe.exec(segment)) !== null) {
    const [full, name] = match;
    
    // 添加占位符前的字面文本
    const literal = segment.slice(lastIndex, match.index);
    parts.push(this._escapeRegex(literal));
    
    // 查找自定义参数正则（如 url, email 等）
    const custom = this.paramPatterns?.[name];
    if (custom && typeof custom === "string" && custom.length > 0) {
      // 使用预定义的正则模式
      parts.push(`(?<${name}>${custom})`);
    } else {
      // 默认非贪婪匹配
      parts.push(`(?<${name}>.+?)`);
    }
    
    lastIndex = match.index + full.length;
  }
  
  // 添加剩余的字面文本
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
    
    // 验证必需参数
    const required = rule.validation?.required || [];
    const validation = this._validateParams(groups, required);
    
    if (!validation.valid) {
      console.warn(`⚠️ 规则 [${rule.name}] 缺少必需参数: ${validation.missing.join(', ')}`);
      if (this.strictMode) {
        throw new Error(`参数验证失败: 缺少 ${validation.missing.join(', ')}`);
      }
    }
    
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
      validation: validation.valid
    };
  }
  
  // Fallback: agent mode
  return {
    engine: "agent",
    action: stepTextEnv,
    actionRaw: stepText,
    matchedRule: null,
    params: {},
    code: stepTextEnv,
    type: "agent"
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
  _validateParams(params, required = []) {
  const missing = required.filter(key => !params[key] || params[key].trim() === '');
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  return { valid: true, missing: [] };
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