// tests/setup/env-setup.js
import { config } from 'dotenv';
import { resolve } from 'path';

// 先加载项目根目录 .env（如 STAGEHAND/DeepSeek 等密钥）
config({ path: resolve(process.cwd(), '.env') });
// 再加载测试凭据文件（覆盖同名变量）
config({ path: resolve(process.cwd(), 'test-data/credentials.env') });
