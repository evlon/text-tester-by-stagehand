# text-tester-by-stagehand

一个基于 Stagehand 的零代码文本驱动 UI 测试工具，提供 CLI 初始化与 Vitest 集成。

## 安装

```bash
npm i -D text-tester-by-stagehand
```

或使用 pnpm：

```bash
pnpm add -D text-tester-by-stagehand
```

## 快速开始

1. 初始化测试项目结构：
```bash
npx text-tester-by-stagehand init
```

2. 配置环境变量：
```bash
cp test-data/credentials.env.example test-data/credentials.env
```
编辑 `test-data/credentials.env`，设置 `TEST_BASE_URL`、测试账号与模型配置。

3. 编写测试：在 `tests/scenarios/` 目录编写 `.txt` 场景文件。

4. 运行测试：
```bash
npx text-tester-by-stagehand test
npx text-tester-by-stagehand test:file login.txt
npx text-tester-by-stagehand test:watch
npx text-tester-by-stagehand test:debug tests/scenarios/login.txt
```

## 兼容性与路径
- CLI 命令与原项目保持一致（test、test:file、test:case、test:watch、test:build、test:debug、config:view、config:validate）。
- 生成的测试模板会从包路径导入运行器：`import { TextTestRunner } from "text-tester-by-stagehand"`。
- 调试器会优先从你的项目加载 `tests/debug/runner-context.js`，若不存在则回退到内置默认上下文。

## 发布与版本管理
- 预置 `prepublishOnly` 脚本确保发布前测试通过。
- 提供 `release:*` 脚本进行语义化版本升级与发布。
- 建议在 CI 中设置 `NPM_TOKEN` 并执行 `npm publish`。

## 迁移指南
- 将原 `bin/*` 功能改为依赖此包。
- 使用 `npx text-tester-by-stagehand init` 生成新的 `config/*.yaml` 与 `vitest.config.js` 模板。
- 将原测试场景、凭据示例等复制到新项目结构。

## 许可证
MIT