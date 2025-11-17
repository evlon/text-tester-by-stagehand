// ESM CLI runner module

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";
import fs from "fs";
import yaml from "js-yaml";
import { generateTestSuite } from '../core/test-runner.js';

function tryRunVitest(args) {
  const candidates = [
    `pnpm vitest ${args}`,
    `npx vitest ${args}`,
    `vitest ${args}`,
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

function usage() {
  console.log(`
text-tester-by-stagehand CLI：

  npx text-tester-by-stagehand test                    运行所有测试
  npx text-tester-by-stagehand test:file <name>.txt    运行单个文件（模糊匹配）
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

export async function runCLI(argv = process.argv.slice(2)) {
  const args = argv;
  const cmd = args[0];

  try {
    switch (cmd) {
      case undefined:
      case "test":
        tryRunVitest("run");
        break;

      case "test:file": {
        const file = args[1];
        if (!file) { usage(); process.exit(1); }
        const base = file.replace(/\.txt$/, "").toLowerCase();
        const path = `tests/vitest/${base}.test.js`;
        if(existsSync(path)){
          tryRunVitest(`run ${path}`);
        } else {
          console.log(`未找到文件 ${path}`);
        }
        break;
      }

      case "test:case": {
        const name = args.slice(1).join(" ");
        if (!name) { usage(); process.exit(1); }
        tryRunVitest(`run --grep "${name}"`);
        break;
      }

      case "test:watch": {
        const corePath = join(process.cwd(), "config", "core.yaml");
        const coreConfig = yaml.load(readFileSync(corePath, "utf-8"));

        console.log(`监听目录: ${join("tests", "scenarios")}`);
        console.log('按 q 或 Ctrl-C 退出\n');

        const buildTestSuite = (file) => {
          const base = file.split("/").pop().replace(/\.txt$/, "");
          const testContent = generateTestSuite(file,coreConfig);
          const testFile = join(process.cwd(), "tests", "vitest", base + ".test.js");
          fs.writeFileSync(testFile, testContent); 
          console.log(`生成测试文件 ${testFile}`);
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
            if(fs.existsSync(join(process.cwd(), "tests", "vitest", p.split("/").pop().replace(/\.txt$/, "") + ".test.js"))) return;
            buildTestSuite(p);
          })
          .on('change',  p => {
            if(!p.toLowerCase().endsWith('.txt')) return;
            console.log(`[*] ${p}`)
            buildTestSuite(p);
          })
          .on('unlink',  p => {
            if(!p.toLowerCase().endsWith('.txt')) return;
            console.log(`[-] ${p}`)
            fs.unlinkSync(join(process.cwd(), "tests", "vitest", p.split("/").pop().replace(/\.txt$/, "") + ".test.js"));
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
        break;
      }

      case "test:build": {
        const file = args[1];
        if (!file) { usage(); process.exit(1); }
        const base = file.replace(/\.txt$/, "").toLowerCase();
        const scenarioFile = join(process.cwd(), "tests", "scenarios", base + ".txt");
        const corePath = join(process.cwd(), "config", "core.yaml");
        const coreConfig = yaml.load(readFileSync(corePath, "utf-8"));
        const testContent = generateTestSuite(scenarioFile,coreConfig);
        const testFile = join(process.cwd(), "tests", "vitest", base + ".test.js");
        fs.writeFileSync(testFile, testContent); 
        console.log(`生成测试文件 ${testFile}`);
        break;
      }

      case "test:debug": {
        const file = args[1];
        if (!file) { usage(); process.exit(1); }
        const { debugFile } = await import('../ui/step-debugger.js');
        await debugFile(file);
        break;
      }

      case "test:step": {
        const name = args.slice(1).join(" ");
        if (!name) { usage(); process.exit(1); }
        tryRunVitest(`run --grep "${name}"`);
        break;
      }

      case "config:view": {
        const corePath = join(process.cwd(), "config", "core.yaml");
        const rulesPath = join(process.cwd(), "config", "translation-rules.yaml");
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
        break;
      }

      case "config:validate": {
        const baseConfigDir = process.env.TEXT_TESTER_CONFIG_DIR
          ? join(process.cwd(), process.env.TEXT_TESTER_CONFIG_DIR)
          : join(process.cwd(), "config");
        const corePath = join(baseConfigDir, "core.yaml");
        const rulesPath = join(baseConfigDir, "translation-rules.yaml");

        const validateRulesYaml = (obj) => {
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
        break;
      }

      case "init": {
        const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
        ensureDir(join(process.cwd(), 'config'));
        ensureDir(join(process.cwd(), 'tests', 'scenarios'));
        ensureDir(join(process.cwd(), 'tests', 'vitest'));
        ensureDir(join(process.cwd(), 'tests', 'debug'));
        ensureDir(join(process.cwd(), 'test-data'));
        ensureDir(join(process.cwd(), 'results'));

        const selfPackageJsonPath = fileURLToPath(new URL("../../../package.json",import.meta.url));
        const selfPackageJson = JSON.parse(fs.readFileSync(selfPackageJsonPath, 'utf-8'));

        const tpl = (rel) => fileURLToPath(new URL('../../../templates/' + rel, import.meta.url));
        const copy = (srcRel, destRel) => {
          const src = tpl(srcRel);
          const dest = join(process.cwd(), destRel);
          fs.copyFileSync(src, dest);
          console.log(`生成: ${dest}`);
        };

        copy('config/core.yaml', 'config/core.yaml');
        copy('config/translation-rules.yaml', 'config/translation-rules.yaml');
        copy('tests/debug/runner-context.js', 'tests/debug/runner-context.js');
        copy('tests/scenarios/test.txt', 'tests/scenarios/test.txt');
        copy('vitest.config.js', 'vitest.config.js');
        copy('test-data/credentials.env.example', 'test-data/credentials.env.example');
        // 添加  vitest @vitest/ui 到 devDependencies
        console.log('   pnpm add -D vitest @vitest/ui');
        // 添加 test:watch 到 scripts
        /*
          pnpm test                    运行所有测试
  pnpm test:file <name>.txt    运行单个文件（模糊匹配）
  pnpm test:case "用例名"      运行单个测试用例 (grep)
  pnpm test:changed            只运行变化的测试
  pnpm test:watch              监控模式，文件变化自动运行
  pnpm test:debug <file.txt>   交互式调试单个文件
  pnpm test:step "用例名"     单步调试测试用例 (近似)

  pnpm config:view             查看当前配置
  pnpm config:validate         验证配置有效性
        */
        const packageJson = JSON.parse(fs.readFileSync("./package.json", 'utf-8'));
        packageJson.scripts = packageJson.scripts || {};
        packageJson.scripts['test'] = 'npx text-tester-by-stagehand test';
        packageJson.scripts['test:file'] = 'npx text-tester-by-stagehand test:file';
        packageJson.scripts['test:changed'] = 'npx text-tester-by-stagehand test:changed';
        packageJson.scripts['test:watch'] = 'npx text-tester-by-stagehand test:watch';
        packageJson.scripts['test:build'] = 'npx text-tester-by-stagehand test:build';
        packageJson.scripts['test:debug'] = 'npx text-tester-by-stagehand test:debug';
        packageJson.scripts['test:step'] = 'npx text-tester-by-stagehand test:step';
        packageJson.scripts['test:ui'] = 'npx text-tester-by-stagehand test:ui';
        packageJson.scripts['config:view'] = 'npx text-tester-by-stagehand config:view';
        packageJson.scripts['config:validate'] = 'npx text-tester-by-stagehand config:validate';
        
        // 添加 dependencies
        packageJson.dependencies = {...packageJson.dependencies, ...selfPackageJson.dependencies};
        packageJson.devDependencies = {...packageJson.devDependencies, ...selfPackageJson.devDependencies}

        fs.writeFileSync("./package.json", JSON.stringify(packageJson, null, 2));

        console.log('   添加 "test:watch": "vitest --watch" 到 package.json scripts');

        console.log('\n✅ 初始化完成，请复制凭据示例并编辑:');
        console.log('   cp test-data/credentials.env.example test-data/credentials.env');
        console.log('   编辑 test-data/credentials.env 并添加您的 OpenAI API 密钥');  

        break;
      }

      default:
        usage();
    }
  } catch (e) {
    console.error("运行失败:", e.message);
    process.exit(1);
  }
}

export default runCLI;