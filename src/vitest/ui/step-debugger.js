#!/usr/bin/env node
"use strict";

import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import http from "http";
import { parse as parseUrl } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import StagehandManager from "../../setup/stagehand-setup.js";
import "../../setup/env-setup.js";
import { TextTestRunner,determineWorkflow, shallowStringify } from "../core/test-runner.js";
// import { join } from 'path';
// import { createRequire } from 'module';

// const require = createRequire(import.meta.url);
// const configPath = join(process.cwd(), 'tests/debug/runner-context.js');
// import runnerContext from "../../../tests/debug/runner-context.js"
let runnerContext = undefined;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}



export async function debugFile(scenarioFileArg) {
  runnerContext = await import(join(process.cwd(), 'tests/debug/runner-context.js')).then(m => m.default || m);
  // 解析与创建文件: 支持传入文件名（相对）或绝对路径
  let scenarioFile = scenarioFileArg.match(/\//) ? scenarioFileArg : join(process.cwd(), "tests", "scenarios", scenarioFileArg);
  scenarioFile = scenarioFile.replace(/\.txt$/, "") + ".txt";
  const dir = dirname(scenarioFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(scenarioFile)) {
    const create = await prompt(`⚠️ 未找到测试文件: ${scenarioFile}\n是否创建? (y/n): `);
    if (create.toLowerCase() === "y") {
      const name = basename(scenarioFile).replace(/\.txt$/, "");
      const skeleton = [
        `## 测试用例: ${name}`,
        `# 新建的自动化测试用例，使用工作台添加步骤并保存`,
      ].join("\n");
      writeFileSync(scenarioFile, skeleton, "utf-8");
      console.log(`✅ 已创建测试文件: ${scenarioFile}`);
    } else {
      console.log("已取消创建。");
      return;
    }
  }

  const runner = new TextTestRunner();
  let currentWorkflow = determineWorkflow(scenarioFile);
  let testCases = runner.parseTextScenario(scenarioFile,currentWorkflow);
  if (testCases.length === 0) {
    console.log("当前测试文件没有用例，将初始化一个空用例。");
    const name = basename(scenarioFile).replace(/\.txt$/, "");
    testCases = [{ name: `测试用例: ${name}`, steps: [], comments: ["空用例，使用工作台添加步骤"] }];
  }
  console.log(`🪲 单步调试: ${scenarioFile}`);

  // 启动工作台 Web UI
  // 初始化内存模型与工作台服务（传入供 REST 接口使用）
  const state = {
    file: scenarioFile,
    testCases,
    currentCaseIndex: 0,
    currentStepIndex: 0,
    dirty: false,
    settings: { autoAddOnSuccess: false },
  };
  const wb = await startWorkbenchServer(state, runner);
  console.log(`🧰 工作台已启动: ${wb.url}`);

  // 在独立的浏览器上下文中打开工作台页面，避免影响测试页
  const stagehandMgr = new StagehandManager();
  const wbStagehand = await stagehandMgr.getStagehandForWorkflow("workbench");
  try {
    const p = await wbStagehand.context.newPage();
    await p.goto(wb.url);
  } catch (e) {
    console.log("⚠️ 无法自动打开工作台页面，请手动访问:", wb.url);
  }

  let quitRequested = false;
  outerLoop: for (const tc of testCases) {
    console.log(`\n📋 用例: ${tc.name}`);
    for (let i = 0; i < tc.steps.length; i++) {
      const stepInfo = tc.steps[i];
      state.currentCaseIndex = testCases.indexOf(tc);
      state.currentStepIndex = i;
      console.log(`\n➡️  步骤 ${i + 1}/${tc.steps.length}: ${stepInfo.action}`);
      // 向工作台广播当前步骤信息与规则预览
      try {
        // const expandedAction = runner.stepExecutor.expandEnv(stepInfo.action);
        const translationPreview = runner.stepExecutor.translator.translate(stepInfo.action);
        wb.broadcast({ type: "step", index: i + 1, total: tc.steps.length, action: stepInfo.action, translation: {
          rule: translationPreview.matchedRule,
          pattern: translationPreview.matchedPattern,
          params: translationPreview.params,
          code: translationPreview.code,
        }});
      } catch {}

      // 仅从工作台获取下一动作（移除 CLI 回退）
      const action = await wb.nextAction();
      if (action === "q") { quitRequested = true; break outerLoop; }
      if (action === "s") {
        console.log("⏭️ 已跳过该步骤");
        wb.broadcast({ type: "log", level: "info", message: `已跳过步骤 ${i + 1}` });
        continue;
      }
      // if (action === "c") {
      //   console.log("▶️ 连续运行剩余步骤...");
      //   for (let j = i; j < tc.steps.length; j++) {
      //     const r = await runner.executeStep(tc.steps[j]);
      //     if (!r.success) {
      //       console.log("❌ 失败:", r.error);
      //       wb.broadcast({ type: "error", message: r.error });
      //       return;
      //     }
      //     wb.broadcast({ type: "result", step: tc.steps[j].action, result: r.result ?? true });
      //   }
      //   break;
      // }
      if (typeof action === "object") {
        // 工作台扩展动作：自然语言或脚本 → 封装为 stepInfo 并走统一执行逻辑
        if (action && typeof action.text === "string" && action.text.trim()) {
          const text = action.text.trim();
          wb.broadcast({ type: "script", script: text });
          const newStep = { action: text, comment: null, workflow: currentWorkflow};
          const r = await runner.executeStep(runnerContext,newStep);
          if (!r.success) {
            wb.broadcast({ type: "error", message: r.error });
          } else {
            wb.broadcast({ type: "result", step: newStep.action, result: r.result ?? undefined });
            if (state.settings?.autoAddOnSuccess) {
              const idx = Number.isInteger(state.currentStepIndex) ? state.currentStepIndex + 1 : tc.steps.length;
              tc.steps.splice(idx, 0, { action: text, comment: null, workflow: newStep.workflow });
              state.dirty = true;
              wb.broadcast({ type: "log", level: "info", message: `已自动添加步骤: ${text}` });
              wb.broadcast({ type: "steps", steps: tc.steps.map((s) => s.action) });
            }
          }
          // 回到当前 i 继续等待下一动作
          i--; // 不推进步骤索引
          continue;
        }
        // 未识别，退回 e
        action = "e";
      }
      const result = await runner.executeStep(runnerContext,stepInfo);
      if (!result.success) {
        console.log("❌ 失败:", result.error);
        wb.broadcast({ type: "error", message: result.error });
        // 工作台模式，CLI 不再自动重试；可通过再次点击“执行”实现重试
      } else {
        console.log("✅ 成功");
        wb.broadcast({ type: "result", step: stepInfo.action, result: result.result ?? undefined, continueRunning: i !== tc.steps.length - 1 });
      }
    }
  }
  // 所有步骤执行完毕后，不自动退出，提示已到最后一步并继续等待用户操作
  try {
    wb.broadcast({ type: "log", level: "info", message: "已到最后一步，可继续在工作台执行脚本或添加步骤。点击\"退出\"结束。" });
  } catch {}

  // 等待用户后续动作：
  // - 点击“退出”才结束
  // - 发送自然语言/脚本：执行并可按设置自动追加为新步骤
  // - 点击“执行”：默认重跑最后一步（便于复验）
  while (true) {
    const action = await wb.nextAction();
    if (action === "q") break; // 用户明确退出
    const tc = state.testCases[state.currentCaseIndex] || { name: "", steps: [], comments: [] };
    const lastIndex = Math.max(0, Math.min(tc.steps.length - 1, Number.isInteger(state.currentStepIndex) ? state.currentStepIndex : tc.steps.length - 1));
    const lastStep = tc.steps[lastIndex];
    if (!lastStep && typeof action !== "object") {
      // 没有可执行的步骤且不是脚本/自然语言，忽略
      wb.broadcast({ type: "log", level: "info", message: "当前无可执行步骤，请添加步骤或发送脚本/自然语言。" });
      continue;
    }
    else if (action === "e" && lastStep) {
      const result = await runner.executeStep(runnerContext,lastStep);
      if (!result.success) {
        wb.broadcast({ type: "error", message: result.error });
      } else {
        wb.broadcast({ type: "result", step: lastStep.action, result: result.result ?? true });
      }
      continue;
    }
    else if (typeof action === "object") {
       
      if (action && typeof action.text === "string" && action.text.trim()) {
        const text = action.text.trim();
        // wb.broadcast({ type: "script", script: text });
        const newStep = { action: text, comment: null, workflow: currentWorkflow };
        wb.broadcast({ type: "script", script: newStep.action });
        const r = await runner.executeStep(runnerContext,newStep);
        if (!r.success) {
          wb.broadcast({ type: "error", message: r.error });
        } else {
          wb.broadcast({ type: "result", step: newStep.action, result: r.result ?? true });
          if (state.settings?.autoAddOnSuccess) {
            const idx = Number.isInteger(state.currentStepIndex) ? state.currentStepIndex + 1 : tc.steps.length;
            tc.steps.splice(idx, 0, { action: text, comment: null, workflow: newStep.workflow });
            state.dirty = true;
            wb.broadcast({ type: "log", level: "info", message: `已自动添加步骤: ${text}` });
            wb.broadcast({ type: "steps", steps: tc.steps.map((s) => s.action) });
          }
        }
        continue;
      }
      

    }
    // 其它动作（如 s/c）在最后一步时无特殊含义，保持等待
  }

  // 退出清理（仅在用户点击“退出”后执行）
  try {
    wb.broadcast({ type: "quit" });
  } catch {}
  try {
    await stagehandMgr.closeAll();
  } catch {}
  try { wb.close(); } catch {}
  // 确保退出：避免文件监听等保持事件循环
  try { setTimeout(() => { try { process.exit(0); } catch {} }, 50); } catch {}
}

// CLI
// if (process.argv[1] && process.argv[1].endsWith("step-debugger.js")) {
//   const rel = process.argv[2];
//   if (!rel) {
//     console.log("用法: pnpm test:debug <scenario.txt>");
//     process.exit(1);
//   }

//   (async () => {
//     runnerContext = await import(join(process.cwd(), 'tests/debug/runner-context.js')).then(m => m.default || m);
//     const scenarioFile = rel.match(/\//) ? rel : join(process.cwd(), "tests", "scenarios", rel);
//     debugFile(scenarioFile).catch((e) => {
//       console.error("调试器异常:", e);
//       process.exit(1);
//     });
//   })();
// }

// 简易工作台服务（HTTP + SSE）
function startWorkbenchServer(state, runner) {

  const currentWorkflow = determineWorkflow(state.file)
  return new Promise((resolve) => {
    let clients = [];
    let pendingActionResolver = null;
    let actionQueue = [];
    const lastEvents = [];
    const watchers = [];
    const port = Number(process.env.WORKBENCH_PORT || 5175);
    const emit = (evt) => {
      try {
        lastEvents.push(evt);
        if (lastEvents.length > 50) lastEvents.shift();
        const data = `data: ${JSON.stringify(evt)}\n\n`;
        clients.forEach((c) => c.write(data));
      } catch {}
    };


    const server = http.createServer((req, res) => {
      const { pathname } = parseUrl(req.url || "");
      if (req.method === "GET" && pathname === "/") {
        const html = readFileSync(join(__dirname, "workbench.html"), "utf-8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (req.method === "GET" && pathname === "/client.js") {
        const js = readFileSync(join(__dirname,  "workbench.js"), "utf-8");
        res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
        res.end(js);
        return;
      }
      if (req.method === "GET" && pathname === "/state") {
        const tc = state.testCases[state.currentCaseIndex] || { name: "", steps: [], comments: [] };
        const versions = listVersions(state.file);
        const payload = {
          file: state.file,
          dirty: state.dirty,
          caseName: tc.name,
          steps: tc.steps.map((s) => ({ action: s.action, comment: s.comment })),
          index: state.currentStepIndex,
          versions,
          settings: state.settings,
        };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
        return;
      }
      if (req.method === "GET" && pathname === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        clients.push(res);
        // 刷新后回放最近事件，恢复 UI 状态
        try {
          for (const evt of lastEvents) {
            res.write(`data: ${JSON.stringify(evt)}\n\n`);
          }
        } catch {}
        req.on("close", () => {
          clients = clients.filter((c) => c !== res);
        });
        return;
      }

      
       // 翻译预览：实时解析输入文本并返回规则匹配信息与代码片段
      if (req.method === "POST" && pathname === "/translate_preview") {
        jsonBody(req, res, (payload) => {
          const text = (payload?.text || "").trim();
          if (!text) return sendJson(res, 400, { ok: false, error: "text 不能为空" });
          try {
            /*
            return {
        engine: "rules",
        matchedRule: rule.name,
        matchedPattern: pattern,
        params: groups,
        template: rule.template,
        code,
        type: this.inferTypeFromTemplate(rule.template),
      };
            */
           const translateAction = runner.stepExecutor.translator.translate(text);
            return sendJson(res, 200, {
              ok: true,
              ...translateAction
            });
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: e.message });
          }
        });
        return;
      }
      if (req.method === "POST" && pathname === "/action") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const payload = JSON.parse(body || "{}");
            const incoming = payload.type || payload;
            if (pendingActionResolver) {
              pendingActionResolver(incoming);
              pendingActionResolver = null;
            } else {
              // 当前未等待交互，进入动作队列，下一次等待时立即消费
              actionQueue.push(incoming);
            }
            emit({ type: "log", level: "info", message: `收到动作: ${typeof incoming === "string" ? incoming : incoming?.kind || "unknown"}` });
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }
      if (req.method === "POST" && pathname === "/steps/add") {
        jsonBody(req, res, (payload) => {

          const tc = state.testCases[state.currentCaseIndex] || { steps: [] };
          const text = (payload?.text || "").trim();
          if (!text) return sendJson(res, 400, { ok: false, error: "text 不能为空" });
          const idx = Number.isInteger(payload?.index) ? payload.index : tc.steps.length;
          tc.steps.splice(idx, 0, { action: text, comment: payload?.comment || null, workflow: currentWorkflow});
          state.dirty = true;
          emit({ type: "log", level: "info", message: `添加步骤: ${text}` });
          emit({ type: "steps", steps: tc.steps.map((s) => s.action) });
          return sendJson(res, 200, { ok: true, steps: tc.steps.map((s) => ({ action: s.action, comment: s.comment })) });
        });
        return;
      }
     
      if (req.method === "POST" && pathname === "/steps/update") {
        jsonBody(req, res, (payload) => {
          const tc = state.testCases[state.currentCaseIndex] || { steps: [] };
          const idx = payload?.index;
          const text = (payload?.text || "").trim();
          if (!Number.isInteger(idx) || idx < 0 || idx >= tc.steps.length) return sendJson(res, 400, { ok: false, error: "index 无效" });
          if (!text) return sendJson(res, 400, { ok: false, error: "text 不能为空" });
          tc.steps[idx].action = text;
          tc.steps[idx].workflow = currentWorkflow;
          state.dirty = true;
          emit({ type: "log", level: "info", message: `更新步骤[${idx}]: ${text}` });
          emit({ type: "steps", steps: tc.steps.map((s) => s.action) });
          return sendJson(res, 200, { ok: true });
        });
        return;
      }
      if (req.method === "POST" && pathname === "/steps/delete") {
        jsonBody(req, res, (payload) => {
          const tc = state.testCases[state.currentCaseIndex] || { steps: [] };
          const idx = payload?.index;
          if (!Number.isInteger(idx) || idx < 0 || idx >= tc.steps.length) return sendJson(res, 400, { ok: false, error: "index 无效" });
          const removed = tc.steps.splice(idx, 1);
          state.dirty = true;
          emit({ type: "log", level: "info", message: `删除步骤[${idx}]: ${removed?.[0]?.action || ""}` });
          emit({ type: "steps", steps: tc.steps.map((s) => s.action) });
          return sendJson(res, 200, { ok: true });
        });
        return;
      }
      if (req.method === "POST" && pathname === "/steps/reorder") {
        jsonBody(req, res, (payload) => {
          const tc = state.testCases[state.currentCaseIndex] || { steps: [] };
          const from = payload?.from, to = payload?.to;
          if (![from, to].every((n) => Number.isInteger(n))) return sendJson(res, 400, { ok: false, error: "from/to 无效" });
          if (from < 0 || from >= tc.steps.length || to < 0 || to >= tc.steps.length) return sendJson(res, 400, { ok: false, error: "索引越界" });
          const [m] = tc.steps.splice(from, 1);
          tc.steps.splice(to, 0, m);
          state.dirty = true;
          emit({ type: "log", level: "info", message: `重排步骤: ${from} → ${to}` });
          emit({ type: "steps", steps: tc.steps.map((s) => s.action) });
          return sendJson(res, 200, { ok: true });
        });
        return;
      }
      if (req.method === "POST" && pathname === "/save") {
        jsonBody(req, res, (payload) => {
          const tc = state.testCases[state.currentCaseIndex] || { name: "", steps: [], comments: [] };
          // 尝试保留原文件中位于首个用例标题(## )之前的顶层说明(# )与空行
          let leading = [];
          try {
            if (existsSync(state.file)) {
              const content = readFileSync(state.file, "utf-8").split("\n");
              let beforeCase = true;
              for (const line of content) {
                const trimmed = line.trim();
                if (trimmed.startsWith("## ")) { beforeCase = false; break; }
                if (trimmed === "") { leading.push(""); continue; }
                if (trimmed.startsWith("# ")) { leading.push(line); }
              }
            }
          } catch {}
          const caseHeader = `## ${tc.name || "测试用例"}`;
          const commentLines = (tc.comments || []).filter((c) => c && String(c).trim()).map((c) => `# ${String(c).trim()}`);
          const stepLines = tc.steps.map((s) => {const lines = s.action.split("\n"); if(lines.length > 1){ return '\n"+"\n' + s.action + '\n"-"\n'} else {return s.action;} } );
          const lines = [
            ...leading,
            leading.length > 0 ? "" : undefined,
            caseHeader,
            ...commentLines,
            ...stepLines,
          ].filter((x) => x !== undefined);
          const dir = dirname(state.file);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          // 生成备份版本号
          const nextVer = nextVersionNumber(state.file);
          const backupFile = versionFilePath(state.file, nextVer);
          if (existsSync(state.file)) copyFileSync(state.file, backupFile);
          writeFileSync(state.file, lines.join("\n"), "utf-8");
          state.dirty = false;
          emit({ type: "log", level: "info", message: `已保存并生成备份: v${nextVer}` });
          return sendJson(res, 200, { ok: true, version: nextVer });
        });
        return;
      }
      if (req.method === "GET" && pathname === "/settings") {
        return sendJson(res, 200, { ok: true, settings: state.settings });
      }
      if (req.method === "POST" && pathname === "/settings/set") {
        jsonBody(req, res, (payload) => {
          const key = payload?.key;
          const value = payload?.value;
          if (key !== "autoAddOnSuccess") return sendJson(res, 400, { ok: false, error: "不支持的设置项" });
          state.settings.autoAddOnSuccess = !!value;
          emit({ type: "log", level: "info", message: `设置已更新: autoAddOnSuccess=${state.settings.autoAddOnSuccess}` });
          return sendJson(res, 200, { ok: true, settings: state.settings });
        });
        return;
      }
      if (req.method === "GET" && pathname === "/versions") {
        const versions = listVersions(state.file);
        return sendJson(res, 200, { ok: true, versions });
      }
      if (req.method === "POST" && pathname === "/versions/checkout") {
        jsonBody(req, res, (payload) => {
          const v = payload?.version;
          if (!Number.isInteger(v)) return sendJson(res, 400, { ok: false, error: "version 无效" });
          const file = versionFilePath(state.file, v);
          if (!existsSync(file)) return sendJson(res, 404, { ok: false, error: "版本文件不存在" });
          const content = readFileSync(file, "utf-8");
          const newCases = new TextTestRunner().parseTextScenario(file);
          state.testCases = newCases.length > 0 ? newCases : state.testCases;
          state.currentCaseIndex = 0;
          state.currentStepIndex = 0;
          state.dirty = true; // 加载到内存，待手动保存覆盖主文件
          emit({ type: "log", level: "info", message: `已加载版本 v${v} 到内存（未覆盖主文件）` });
          emit({ type: "steps", steps: (state.testCases[0]?.steps || []).map((s) => s.action) });
          return sendJson(res, 200, { ok: true });
        });
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });
    server.listen(port, () => {
      // 规则与核心配置文件热重载监听
      try {
        const rulesPath = join(process.cwd(), "config", "translation-rules.yaml");
        const corePath = join(process.cwd(), "config", "core.yaml");
        if (existsSync(rulesPath)) {
          import('fs').then(({ watch }) => {
            const w = watch(rulesPath, { persistent: true }, () => {
              try { 
                runner.stepExecutor.translator.reload(); emit({ type: 'rules_updated', file: 'translation-rules.yaml' }); 
                console.log("规则重载成功");
              }
              catch (e) { emit({ type: 'error', message: `规则重载失败: ${e.message}` }); }
            });
            try { watchers.push(w); } catch {}
          });
        }
        if (existsSync(corePath)) {
          import('fs').then(({ watch }) => {
            const w = watch(corePath, { persistent: true }, () => {
              try { 
                runner.stepExecutor.translator.reload(); emit({ type: 'rules_updated', file: 'core.yaml' }); 
              }
              catch (e) { 
               
                emit({ type: 'error', message: `核心配置重载失败: ${e.message}` }); 
              }
            });
            try { watchers.push(w); } catch {}
          });
        }
      } catch {}
      const api = {
        url: `http://localhost:${port}/`,
        broadcast(evt) {
          emit(evt);
        },
        nextAction(timeoutMs = 0) {
          // 若已有排队动作，立即消费
          if (actionQueue.length > 0) {
            const next = actionQueue.shift();
            return Promise.resolve(next);
          }
          return new Promise((resolveAction) => {
            // 默认无限等待直到收到动作（工作台主控）
            pendingActionResolver = resolveAction;
          });
        },
        close() { try { server.close(); } catch {} },
        // 扩展关闭：终止 SSE 客户端并关闭文件监听
        shutdown() {
          try { clients.forEach((c) => { try { c.end(); } catch {} }); clients = []; } catch {}
          try { watchers.forEach((w) => { try { w.close(); } catch {} }); } catch {}
          try { server.close(); } catch {}
        },
      };
      resolve(api);
    });
  });
}

function jsonBody(req, res, handler) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try { handler(JSON.parse(body || "{}")); }
    catch (e) { sendJson(res, 400, { ok: false, error: e.message }); }
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

function nextVersionNumber(mainFile) {
  const dir = dirname(mainFile);
  const base = basename(mainFile).replace(/\.txt$/, "");
  const prefix = `${base}-v`;
  let max = 0;
  try {
    for (const f of readdirSync(dir)) {
      const m = f.match(new RegExp(`^${prefix}(\\d+)\\.txt$`));
      if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    }
  } catch {}
  return max + 1;
}

function versionFilePath(mainFile, v) {
  const dir = dirname(mainFile);
  const base = basename(mainFile).replace(/\.txt$/, "");
  return join(dir, `${base}.txt-v${v}`);
}

function listVersions(mainFile) {
  const dir = dirname(mainFile);
  const base = basename(mainFile).replace(/\.txt$/, "");
  const prefix = `${base}.txt-v`;
  const versions = [];
  try {
    for (const f of readdirSync(dir)) {
      const m = f.match(new RegExp(`^${prefix}(\\d+)$`));
      if (m) versions.push(parseInt(m[1], 10));
    }
  } catch {}
  return versions.sort((a, b) => b - a);
}