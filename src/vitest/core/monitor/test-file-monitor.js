#!/usr/bin/env node
"use strict";

import { watch } from "fs";
import { join } from "path";
import { IncrementalExecutor } from "../executor/incremental-executor.js";

const SCENARIOS_DIR = join(process.cwd(), "tests", "scenarios");

export class TestFileMonitor {
  constructor({ debounceDelay = 500 } = {}) {
    this.debounceDelay = debounceDelay;
    this.timer = null;
    this.incremental = new IncrementalExecutor();
  }

  watchTestFiles(onChange) {
    try {
      watch(SCENARIOS_DIR, { recursive: false }, () => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          const changes = this.incremental.getChangedTests();
          if (typeof onChange === "function") onChange(changes);
        }, this.debounceDelay);
      });
      console.log("👀 监控测试文件变更中:", SCENARIOS_DIR);
    } catch (e) {
      console.log("⚠️ 无法监控测试目录:", e.message);
    }
  }
}

// CLI usage
if (process.argv[1] && process.argv[1].endsWith("test-file-monitor.js")) {
  const monitor = new TestFileMonitor();
  monitor.watchTestFiles((changes) => {
    console.log("检测到变更:", JSON.stringify(changes, null, 2));
  });
}