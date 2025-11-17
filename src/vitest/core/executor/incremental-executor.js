#!/usr/bin/env node
"use strict";

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import crypto from "crypto";

const SCENARIOS_DIR = join(process.cwd(), "tests", "scenarios");
const CACHE_FILE = join(process.cwd(), "/vitest-cache.json");

export class IncrementalExecutor {
  constructor() {
    this.cache = this.loadCache();
  }

  loadCache() {
    if (!existsSync(CACHE_FILE)) return { files: {} };
    try {
      return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    } catch {
      return { files: {} };
    }
  }

  saveCache() {
    writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
  }

  calculateFileHash(filePath) {
    const content = readFileSync(filePath, "utf-8");
    return crypto.createHash("md5").update(content).digest("hex");
  }

  listScenarioFiles() {
    try {
      const files = readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".txt"));
      return files.map((f) => join(SCENARIOS_DIR, f));
    } catch {
      return [];
    }
  }

  getChangedTests() {
    const files = this.listScenarioFiles();
    const changes = [];
    for (const f of files) {
      const hash = this.calculateFileHash(f);
      if (this.cache.files[f] !== hash) {
        changes.push({ file: f, testCase: "*", changes: ["content"] });
      }
    }
    return changes;
  }

  markRun(files) {
    for (const f of files) {
      this.cache.files[f] = this.calculateFileHash(f);
    }
    this.saveCache();
  }
}

// CLI helper
if (process.argv[1] && process.argv[1].endsWith("incremental-executor.js")) {
  const inc = new IncrementalExecutor();
  const changes = inc.getChangedTests();
  console.log(JSON.stringify(changes, null, 2));
}