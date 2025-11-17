import { Stagehand } from "@browserbasehq/stagehand";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { DeepseekAIClient } from "./deepseek-safe-client.js";
import { ChatUAIClient } from "./chatu-client.js";
import { JiuTianAIClient } from "./jiutian-client.js";  
// import { DeepseekAIClient } from "../deepseek-ai-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class StagehandManager {
  constructor() {
    this.instances = new Map();
    this.cacheBaseDir = join(process.cwd(), process.env.STAGEHAND_CACHE_DIR || "cache");
    this.ensureCacheDirs();
  }

  ensureCacheDirs() {
    // const scenariosDir = join(process.cwd(), "tests", "scenarios");

    // // 自动从 scenarios 目录获取文件名并生成缓存目录名
    // const cacheDirs = [];

    // if (existsSync(scenariosDir)) {
    //   const files = readdirSync(scenariosDir);
    //   files.forEach((file) => {
    //     if (file.endsWith(".txt")) {
    //       // 将文件名转换为缓存目录名，例如：dashboard.txt -> dashboard-flow
    //       const baseName = file.replace(".txt", "");
    //       cacheDirs.push(`${baseName}-flow`);
    //     }
    //   });
    // }

    // // 确保至少包含 shared-actions 目录
    // if (!cacheDirs.includes("shared-actions")) {
    //   cacheDirs.push("shared-actions");
    // }

    // console.log(`📁 自动生成的缓存目录: ${cacheDirs.join(", ")}`);

    if (!existsSync(this.cacheBaseDir)) {
      mkdirSync(this.cacheBaseDir, { recursive: true });
    }

    // cacheDirs.forEach((dir) => {
    //   const dirPath = join(this.cacheBaseDir, dir);
    //   if (!existsSync(dirPath)) {
    //     mkdirSync(dirPath, { recursive: true });
    //   }
    // });
  }

  async getStagehandForWorkflow(workflowName, options = {}) {
    if (this.instances.has(workflowName)) {
      return this.instances.get(workflowName);
    }

    const cacheDir = join(this.cacheBaseDir, workflowName);
    const modelConfig = {
        modelName: process.env.STAGEHAND_MODEL_NAME || "deepseek/deepseek-chat",
        // apiKey: process.env.OPENAI_API_KEY, // auto load from env
        baseURL:
          process.env.STAGEHAND_MODEL_BASE_URL || "https://api.deepseek.com/v1",
      };

    console.log(`🔄 初始化 Stagehand 实例: ${workflowName}`);
    let stagehand = null;
    if (modelConfig.modelName.indexOf("deepseek/") != -1) {

      stagehand = new Stagehand({
        env: process.env.STAGEHAND_ENV || "LOCAL",
        cacheDir: cacheDir,
        modelName: modelConfig.modelName,

        llmClient: new DeepseekAIClient({
          modelName: modelConfig.modelName,
          logger: options.logger || function(msg){console.log(msg.category, msg.message, msg.level, msg.auxiliary)},
          clientOptions: {
            apiKey: process.env.DEEPSEEK_API_KEY || '',
            baseURL: modelConfig.baseURL
          }
        }),
      });
    } else if (modelConfig.modelName.indexOf("chatu/") != -1) {

      stagehand = new Stagehand({
        env: process.env.STAGEHAND_ENV || "LOCAL",
        cacheDir: cacheDir,
        modelName: modelConfig.modelName,

        llmClient: new ChatUAIClient({
          modelName: modelConfig.modelName,
          logger: options.logger || function(msg){console.log(msg.category, msg.message, msg.level, msg.auxiliary)},
          clientOptions: {
            apiKey: process.env.CHATU_API_KEY || '',
            baseURL: modelConfig.baseURL
          }
        }),
      });
    }else if (modelConfig.modelName.indexOf("jiutian/") != -1) {

      stagehand = new Stagehand({
        env: process.env.STAGEHAND_ENV || "LOCAL",
        cacheDir: cacheDir,
        modelName: modelConfig.modelName,

        llmClient: new JiuTianAIClient({
          modelName: modelConfig.modelName,
          logger: options.logger || function(msg){console.log(msg.category, msg.message, msg.level, msg.auxiliary)},
          clientOptions: {
            apiKey: process.env.JIUTIAN_API_KEY || '',
            baseURL: modelConfig.baseURL
          }
        }),
      });
    }else {    

      const stagehandConfig = {
        env: process.env.STAGEHAND_ENV || "LOCAL",
        cacheDir: cacheDir,
        model: modelConfig,
        ...options,
      };
      stagehand = new Stagehand(stagehandConfig);
    }

    await stagehand.init();

    this.instances.set(workflowName, stagehand);
    console.log(`✅ Stagehand 实例就绪: ${workflowName}`);

    return stagehand;
  }

  clearCache(workflowName) {
    const cacheDir = join(this.cacheBaseDir, workflowName);
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
      console.log(`🗑️  已清除缓存: ${workflowName}`);
    }

    if (this.instances.has(workflowName)) {
      this.instances.delete(workflowName);
    }
  }

  clearAllCache() {
    if (existsSync(this.cacheBaseDir)) {
      rmSync(this.cacheBaseDir, { recursive: true, force: true });
      this.ensureCacheDirs();
      this.instances.clear();
      console.log("🗑️  已清除所有缓存");
    }
  }

  getCacheStats() {
    const stats = {};

    if (!existsSync(this.cacheBaseDir)) {
      return stats;
    }

    const workflows = readdirSync(this.cacheBaseDir);

    workflows.forEach((workflow) => {
      const workflowDir = join(this.cacheBaseDir, workflow);
      if (statSync(workflowDir).isDirectory()) {
        try {
          const files = readdirSync(workflowDir);
          stats[workflow] = {
            cachedActions: files.length,
            totalSize: this.getDirectorySize(workflowDir),
          };
        } catch (error) {
          stats[workflow] = {
            cachedActions: 0,
            totalSize: "0 MB",
            error: error.message,
          };
        }
      }
    });

    return stats;
  }

  getDirectorySize(dir) {
    try {
      const files = readdirSync(dir, { recursive: true });
      let totalSize = 0;

      files.forEach((file) => {
        const filePath = join(dir, file);
        if (statSync(filePath).isFile()) {
          totalSize += statSync(filePath).size;
        }
      });

      return (totalSize / 1024 / 1024).toFixed(2) + " MB";
    } catch (error) {
      return "0 MB";
    }
  }

  async closeAll() {
    for (const [name, stagehand] of this.instances) {
      try {
        await stagehand.close();
        console.log(`✅ 已关闭 Stagehand 实例: ${name}`);
      } catch (error) {
        console.error(`❌ 关闭实例失败 ${name}:`, error);
      }
    }
    this.instances.clear();
  }
}

export default StagehandManager;
