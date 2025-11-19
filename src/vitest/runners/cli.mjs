// ESM CLI runner module

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";
import fs from "fs";
import yaml from "js-yaml";
import { generateTestSuite } from '../core/test-runner.js';

// --- 路径和配置工具函数 ---

/**
 * 获取项目根路径下的完整路径。
 * @param {...string} segments - 路径片段。
 * @returns {string} 完整的绝对路径。
 */
const getProjectPath = (...segments) => join(process.cwd(), ...segments);

/**
 * 加载核心配置 (core.yaml)。
 * @returns {object} 解析后的核心配置对象。
 * @throws {Error} 如果文件不存在或解析失败。
 */
function loadCoreConfig() {
  const corePath = getProjectPath("config", "core.yaml");
  if (!existsSync(corePath)) {
    throw new Error(`配置缺失: ${corePath}`);
  }
  return yaml.load(readFileSync(corePath, "utf-8"));
}

// --- Vitest 运行器 ---

function tryRunVitest(args) {
  const candidates = [
    `pnpm vitest ${args}`
  ];
  for (const c of candidates) {
    try {
      execSync(c, { stdio: "inherit" });
      return;
    } catch (e) {
      // try next
    }
  }
  console.error("未能找到可用的 vitest 命令，请安装 vitest 或 pnpm。");
  process.exit(1);
}

// --- 核心逻辑提取：构建测试文件 ---

/**
 * 构建测试文件。这是 test:build 和 test:file 的核心逻辑。
 * @param {string} scenarioFileName - 场景文件名 (e.g., "my_test.txt")。
 * @returns {string} 生成的 vitest 测试文件路径。
 * @throws {Error} 如果场景文件或配置缺失。
 */
function buildTestFile(scenarioFileName) {
  const base = scenarioFileName.replace(/\.txt$/, "").toLowerCase();
  const scenarioFile = getProjectPath("tests", "scenarios", base + ".txt");
  
  if (!existsSync(scenarioFile)) {
    throw new Error(`场景文件未找到: ${scenarioFile}`);
  }

  const coreConfig = loadCoreConfig(); // 使用提取的加载函数
  
  const testContent = generateTestSuite(scenarioFile, coreConfig);
  const testFile = getProjectPath("tests", "vitest", base + ".test.js");
  
  fs.writeFileSync(testFile, testContent);
  console.log(`✅ 生成测试文件 ${testFile}`);
  
  return testFile;
}

// --- 命令处理函数 ---

function handleUsage() {
  console.log(`
text-tester-by-stagehand CLI：

  npx text-tester-by-stagehand test                    运行所有测试
  npx text-tester-by-stagehand test:file <name>.txt    运行单个文件 (先build，再运行)
  npx text-tester-by-stagehand test:case "用例名"      运行单个测试用例 (grep)
  npx text-tester-by-stagehand test:changed            只运行变化的测试
  npx text-tester-by-stagehand test:watch              监控模式，文件变化自动运行
  npx text-tester-by-stagehand test:debug <file.txt>   交互式调试单个文件
  npx text-tester-by-stagehand test:step "用例名"     近似单步调试

  npx text-tester-by-stagehand config:view             查看当前配置
  npx text-tester-by-stagehand config:validate         验证配置有效性
  npx text-tester-by-stagehand init                    初始化标准项目结构
`);
}

function handleTestAll() {
  tryRunVitest("run");
}

function handleTestFile(args) {
  const file = args[1];
  if (!file) { handleUsage(); process.exit(1); }
  
  try {
    // 1. 先构建最新的测试文件
    const testFilePath = buildTestFile(file);
    // 2. 再运行构建好的测试文件
    tryRunVitest(`run ${testFilePath}`);
  } catch (error) {
    console.error(`运行 ${file} 失败: ${error.message}`);
    process.exit(1);
  }
}

function handleTestCase(args) {
  const name = args.slice(1).join(" ");
  if (!name) { handleUsage(); process.exit(1); }
  tryRunVitest(`run --grep "${name}"`);
}

function handleTestWatch() {
  const coreConfig = loadCoreConfig(); // 加载配置

  console.log(`监听目录: ${getProjectPath("tests", "scenarios")}`);
  console.log('按 q 或 Ctrl-C 退出\n');

  // 构建逻辑直接调用 buildTestFile
  const watcherBuild = (p) => {
    try {
      const baseName = p.split("/").pop(); 
      buildTestFile(baseName); // 使用提取的函数
    } catch (e) {
      console.error(`构建 ${p} 失败: ${e.message}`);
    }
  }

  chokidar
    .watch( "./tests/scenarios/", {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
    })
    .on('add',    p => {
      if(!p.toLowerCase().endsWith('.txt')) return;
      console.log(`[+] ${p}`)
      // 如果已存在对应的 .test.js 文件，则跳过 add 事件的构建
      if(existsSync(getProjectPath("tests", "vitest", p.split("/").pop().replace(/\.txt$/, "") + ".test.js"))) return;
      watcherBuild(p);
    })
    .on('change',  p => {
      if(!p.toLowerCase().endsWith('.txt')) return;
      console.log(`[*] ${p}`)
      watcherBuild(p);
    })
    .on('unlink',  p => {
      if(!p.toLowerCase().endsWith('.txt')) return;
      console.log(`[-] ${p}`)
      fs.unlinkSync(getProjectPath("tests", "vitest", p.split("/").pop().replace(/\.txt$/, "") + ".test.js"));
    })
    .on('error',  e => console.error('监听出错:', e));

  process.stdin.setRawMode(true);
  process.stdin.on('data', c => {
    if (c.toString() === 'q' || c[0] === 3) {
      console.log('\nbye');
      process.exit(0);
    }
  });
  process.stdin.resume();
}

function handleTestBuild(args) {
  const file = args[1];
  if (!file) { handleUsage(); process.exit(1); }
  
  try {
    buildTestFile(file); // 直接调用提取的函数
  } catch (error) {
    console.error(`构建 ${file} 失败: ${error.message}`);
    process.exit(1);
  }
}

async function handleTestDebug(args) {
  const file = args[1];
  if (!file) { handleUsage(); process.exit(1); }
  const { debugFile } = await import('../ui/step-debugger.js');
  await debugFile(file);
}

function handleTestStep(args) {
  const name = args.slice(1).join(" ");
  if (!name) { handleUsage(); process.exit(1); }
  tryRunVitest(`run --grep "${name}"`);
}

function handleConfigView() {
  const corePath = getProjectPath("config", "core.yaml");
  const rulesPath = getProjectPath("config", "translation-rules.yaml");
  
  if (existsSync(corePath)) {
    console.log("\n# config/core.yaml\n" + readFileSync(corePath, "utf-8"));
  } else {
    console.log("缺少 config/core.yaml");
  }
  if (existsSync(rulesPath)) {
    console.log("\n# config/translation-rules.yaml\n" + readFileSync(rulesPath, "utf-8"));
  } else {
    console.log("缺少 translation-rules.yaml");
  }
}

function handleConfigValidate() {
  const baseConfigDir = process.env.TEXT_TESTER_CONFIG_DIR
    ? getProjectPath(process.env.TEXT_TESTER_CONFIG_DIR)
    : getProjectPath("config");
  const corePath = join(baseConfigDir, "core.yaml");
  const rulesPath = join(baseConfigDir, "translation-rules.yaml");

  const validateRulesYaml = (obj) => {
    // ... (保持不变)
    const errors = [];
    if (!obj || typeof obj !== "object") { errors.push("文件内容不是对象"); return errors; }
    const rules = Array.isArray(obj.rules) ? obj.rules : [];
    if (!rules.length) errors.push("缺少 rules 数组或为空");
    rules.forEach((r, i) => {
      if (!r || typeof r !== "object") { errors.push(`第 ${i} 个规则格式错误`); return; }
      if (typeof r.name !== "string" || !r.name.trim()) errors.push(`规则 ${i}: name 必须为非空字符串`);
      if (!Array.isArray(r.patterns) || r.patterns.length === 0) errors.push(`规则 ${i}: patterns 必须为非空数组`);
    });
    return errors;
  };

  let ok = true;
  try {
    if (existsSync(corePath)) yaml.load(readFileSync(corePath, "utf-8"));
    else { ok = false; console.log("缺少 core.yaml"); }
  } catch (e) { ok = false; console.log("core.yaml 无效:", e.message); }
  try {
    if (existsSync(rulesPath)) {
      const content = yaml.load(readFileSync(rulesPath, "utf-8"));
      const errs = validateRulesYaml(content);
      if (errs.length) { ok = false; console.log("translation-rules.yaml 结构校验失败:\n - " + errs.join("\n - ")); }
    } else { ok = false; console.log("缺少 translation-rules.yaml"); }
  } catch (e) { ok = false; console.log("translation-rules.yaml 无效:", e.message); }
  console.log(ok ? "✅ 配置文件有效" : "❌ 配置存在问题");
}

function handleInit() {
  const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
  ensureDir(getProjectPath('config'));
  ensureDir(getProjectPath('tests', 'scenarios'));
  ensureDir(getProjectPath('tests', 'vitest'));
  ensureDir(getProjectPath('tests', 'debug'));
  ensureDir(getProjectPath('test-data'));
  ensureDir(getProjectPath('results'));

  const selfPackageJsonPath = fileURLToPath(new URL("../../../package.json",import.meta.url));
  const selfPackageJson = JSON.parse(fs.readFileSync(selfPackageJsonPath, 'utf-8'));

  const tpl = (rel) => fileURLToPath(new URL('../../../templates/' + rel, import.meta.url));
  const copy = (srcRel, destRel) => {
    const src = tpl(srcRel);
    const dest = getProjectPath(destRel);
    fs.copyFileSync(src, dest);
    console.log(`生成: ${dest}`);
  };

  copy('config/core.yaml', 'config/core.yaml');
  copy('config/translation-rules.yaml', 'config/translation-rules.yaml');
  copy('tests/debug/runner-context.js', 'tests/debug/runner-context.js');
  copy('tests/scenarios/test.txt', 'tests/scenarios/test.txt');
  copy('vitest.config.js', 'vitest.config.js');
  copy('test-data/credentials.env.example', 'test-data/credentials.env.example');
  copy('README.md', 'README.md');
  copy('.gitignore', '.gitignore');

  // ... (Package.json 逻辑保持不变)
  console.log('   pnpm add -D vitest @vitest/ui');
  const packageJson = JSON.parse(fs.readFileSync("./package.json", 'utf-8'));
  packageJson.scripts = packageJson.scripts || {};
  packageJson.scripts['test'] = 'pnpx exec text-tester-by-stagehand test';
  packageJson.scripts['test:file'] = 'pnpx exec text-tester-by-stagehand test:file';
  packageJson.scripts['test:changed'] = 'pnpx exec text-tester-by-stagehand test:changed';
  packageJson.scripts['test:watch'] = 'pnpx exec text-tester-by-stagehand test:watch';
  packageJson.scripts['test:build'] = 'pnpx exec text-tester-by-stagehand test:build';
  packageJson.scripts['test:debug'] = 'pnpx exec text-tester-by-stagehand test:debug';
  packageJson.scripts['test:step'] = 'pnpx exec text-tester-by-stagehand test:step';
  packageJson.scripts['test:ui'] = 'pnpx exec text-tester-by-stagehand test:ui';
  packageJson.scripts['config:view'] = 'pnpx exec text-tester-by-stagehand config:view';
  packageJson.scripts['config:validate'] = 'pnpx exec text-tester-by-stagehand config:validate';
  
  packageJson.dependencies = {...packageJson.dependencies, ...selfPackageJson.dependencies};
  packageJson.devDependencies = {...packageJson.devDependencies, ...selfPackageJson.devDependencies}

  fs.writeFileSync("./package.json", JSON.stringify(packageJson, null, 2));

  console.log('   添加 "test:watch": "vitest --watch" 到 package.json scripts');

  console.log('\n✅ 初始化完成，请复制凭据示例并编辑:');
  console.log('   cp test-data/credentials.env.example test-data/credentials.env');
  console.log('   编辑 test-data/credentials.env 并添加您的 OpenAI API 密钥');  
}


// --- CLI 入口点 ---

export async function runCLI(argv = process.argv.slice(2)) {
  const args = argv;
  const cmd = args[0];

  try {
    switch (cmd) {
      case undefined:
      case "test":
        handleTestAll();
        break;

      case "test:file":
        handleTestFile(args);
        break;

      case "test:case":
        handleTestCase(args);
        break;
      
      case "test:changed":
        tryRunVitest("run --changed"); // 保持原有逻辑，但可以考虑提取 if 复杂逻辑
        break;

      case "test:watch":
        handleTestWatch();
        break;
      
      case "test:build":
        handleTestBuild(args);
        break;

      case "test:debug":
        await handleTestDebug(args);
        break;

      case "test:step":
        handleTestStep(args);
        break;

      case "config:view":
        handleConfigView();
        break;

      case "config:validate":
        handleConfigValidate();
        break;

      case "init":
        handleInit();
        break;

      default:
        handleUsage();
    }
  } catch (e) {
    console.error("运行失败:", e.message);
    process.exit(1);
  }
}

export default runCLI;