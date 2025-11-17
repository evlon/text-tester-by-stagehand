"use strict";

import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { Translator } from "../translator/index.js";
import StagehandManager from "../../../setup/stagehand-setup.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

export class StepExecutor {
  constructor() {
    this.translator = new Translator();
    this.stagehandManager = new StagehandManager();
    this.executionHistory = [];
    this.resultsDir = join(process.cwd(), "results");
    if (!existsSync(this.resultsDir)) mkdirSync(this.resultsDir, { recursive: true });
  }

  async getStagehandForWorkflow(workflow) {
    return await this.stagehandManager.getStagehandForWorkflow(workflow);
  }

  // 将步骤编译为可执行函数，便于在调试中预览“即将执行”的内容
  compileStep(stepInfo) {
    const { action, workflow, comment } = stepInfo;
    // const expandedAction = this.expandEnv(action);
    let translation = this.translator.translate(action);
    const expandedAction = translation.action;
    // 针对 URL 导航类规则，先对 URL 参数进行清洗并重新渲染代码
    // if (translation.engine === "rules" && (translation.matchedRule || "").startsWith("goto_url")) {
    //   const cleanedUrl = this._sanitizeUrlParam(translation.params?.url);
    //   if (cleanedUrl) {
    //     translation.params.url = cleanedUrl;
    //     if (translation.template) {
    //       translation.code = this.translator.renderTemplate(translation.template, translation.params);
    //     }
    //   }
    // }

    // 若非 rules 引擎，切换到“默认规则”以保证统一基于 rules 执行
    if (translation.engine !== "rules") {
      const defaultTemplate = "await stagehand.act('{text}')";
      const params = { text: expandedAction };
      const code = this.translator.renderTemplate(defaultTemplate, params);
      translation = {
        engine: "rules",
        matchedRule: "__default_act__",
        matchedPattern: null,
        params,
        template: defaultTemplate,
        code,
        type: this.translator.inferTypeFromTemplate(defaultTemplate),
      };
    }

    // 生成一个可执行的函数，签名为 (stagehand, z, expect, page)
    const compiled = async (runnerContext,stagehand, params) => {
      const paramsKeys = Object.keys(params);
      let paramsStr = "";
      if(paramsKeys.length>0){
        paramsStr = `const {${paramsKeys.join(",")}} = $params`
      }

      const runnerContextKeys = Object.keys(runnerContext);
      let runnerContextStr = "";
      if(runnerContextKeys.length>0){
        runnerContextStr = `const {${runnerContextKeys.join(",")}} = $runnerContext`
      }

      const runner = new Function(
        "$runnerContext",
        "$stagehand",
        "$params",
        `return (async () => {const $context = $stagehand.context; const $page = $context.activePage(); ${runnerContextStr}; ${paramsStr};   const $title = await $page.title(); const $url = $page.url(); const $result = ${translation.code}; return {title:$title,url:$url, result:$result}; })();`
      );
      return await runner(runnerContext, stagehand, params);
    };

    // 附带元信息，供预览/执行阶段使用
    compiled.__meta = { action, workflow, comment, expandedAction, translation };
    return compiled;
  }

  // 执行已编译的步骤函数，并记录历史与日志
  async executeCompiledStep(runnerContext, compiled) {
    const { action, workflow, comment, expandedAction, translation } = compiled.__meta || {};
    // const stepParams = translation.params;
    const stagehand = await this.getStagehandForWorkflow(workflow);

    // 取活动的页面
    let page = stagehand.context.activePage();
    if(!page){
      if(stagehand.context.pages.length>0){
        page = stagehand.context.pages[0];
        stagehand.context.setActivePage(page);
      }
      else{
        page = await stagehand.context.newPage();
      }
    }

    const pageTitle = await stagehand.context.activePage()?.title()
    console.log(`workflow:${workflow}, pages count:${stagehand.context.pages.length}, active page:${pageTitle}`)

    const start = Date.now();
    try {
      if (comment) console.log(`   💡 ${comment}`);
      console.log(`   🔄 执行 [${translation.type}]: ${expandedAction}`);
      if (translation.engine === "rules") {
        console.log(`      📐 规则: ${translation.matchedRule}`);
        if (translation.matchedPattern) {
          console.log(`      🔎 模式: ${translation.matchedPattern}`);
        }
        console.log(`      🧩 参数: ${JSON.stringify(translation.params || {}, null, 2)}`);
        const codePreview = (translation.code || "").toString();
        console.log(`      🧪 生成代码片段:\n${codePreview}`);
      }

      // 轻量 expect shim，避免在非 Vitest 环境直接导入 Vitest
      // const expectShim = (actual) => ({
      //   toBe(expected) {
      //     if (actual !== expected) throw new Error(`expected ${actual} to be ${expected}`);
      //   },
      //   toEqual(expected) {
      //     const a = JSON.stringify(actual);
      //     const b = JSON.stringify(expected);
      //     if (a !== b) throw new Error(`expected ${a} to equal ${b}`);
      //   },
      // });

      const result = await compiled(runnerContext, stagehand, translation.params);
      const duration = Date.now() - start;
      this.executionHistory.push({ action, type: translation.type, success: true, duration, workflow, timestamp: new Date().toISOString() });
      console.log(`   ✅ 步骤执行成功 (${duration}ms)`);
      return { success: true, action, type: translation.type, result, duration, workflow };
    } catch (error) {
      const duration = Date.now() - start;
      // 增强错误输出，包含规则、模式、参数与代码片段，便于快速定位
      let detailedMessage = error?.message || String(error);
      if (translation?.engine === "rules") {
        const context = [
          `规则: ${translation.matchedRule || "(未知)"}`,
          translation.matchedPattern ? `模式: ${translation.matchedPattern}` : null,
          `参数: ${JSON.stringify(translation.params || {}, null, 2)}`,
          `代码片段:\n${(translation.code || "").toString()}`,
        ].filter(Boolean).join("\n");
        detailedMessage = `规则执行失败:\n${context}\n原始错误: ${detailedMessage}`;
      }
      this.executionHistory.push({ action, type: translation?.type, success: false, error: detailedMessage, duration, workflow, timestamp: new Date().toISOString() });
      console.log(`   ❌ 失败: ${action}`);
      console.log(`      错误: ${detailedMessage}`);
      return { success: false, action, type: translation?.type, error: detailedMessage, duration, workflow };
    }
  }

  async executeStep(runnerContext,stepInfo) {
    const compiled = this.compileStep(stepInfo);
    return await this.executeCompiledStep(runnerContext,compiled);
  }



  // _sanitizeUrlParam(value) {
  //   if (!value || typeof value !== "string") return value;
  //   let v = value.trim();
  //   // 去除反引号或引号包裹
  //   if ((v.startsWith("`") && v.endsWith("`")) || (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
  //     v = v.slice(1, -1).trim();
  //   }
  //   // 从文本中提取第一个 URL（修复“登录页面 https://...”这类混合文本）
  //   const m = v.match(/https?:\/\/[^\s'"\)]+/);
  //   if (m) {
  //     v = m[0];
  //     // 校验格式
  //     try { new URL(v); return v; } catch { /* fallthrough */ }
  //   }
  //   // 若未匹配到 URL，保留原值（可能包含未展开的占位符），供后续环境扩展或报错信息使用
  //   return v;
  // }
}