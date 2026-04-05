#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const BRAIN_DIR = path.join(HOME, '.claude', 'brain');
const PFC_CORTEX = path.join(BRAIN_DIR, 'prefrontal-cortex.md');
const PFC_SIZE_FILE = path.join(BRAIN_DIR, '.pfc-loaded-size');
const THEBRAIN_DIR = path.resolve(__dirname, '..');

function runStep(label, scriptPath) {
  if (!fs.existsSync(scriptPath)) return;
  console.log(label);
  try {
    execFileSync('node', [scriptPath], { stdio: 'inherit', cwd: THEBRAIN_DIR });
  } catch (err) {
    console.error(`  Warning: ${path.basename(scriptPath)} failed: ${err.message}`);
  }
}

function ensureDeps() {
  const nm = path.join(THEBRAIN_DIR, 'node_modules', 'better-sqlite3');
  if (!fs.existsSync(nm)) {
    console.log('Installing dependencies...');
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], { stdio: 'inherit', cwd: THEBRAIN_DIR });
  }
}

function runCleanup() {
  const claudeDir = path.join(HOME, '.claude');
  const now = Date.now();
  try {
    for (const f of fs.readdirSync(claudeDir)) {
      if (f.startsWith('git_briefing_state_') && f.endsWith('.json')) {
        const fp = path.join(claudeDir, f);
        try {
          const stat = fs.statSync(fp);
          if (now - stat.mtimeMs > 86400000) fs.unlinkSync(fp);
        } catch {}
      }
    }
  } catch {}
}

function updateSizeMarker() {
  try {
    const size = fs.existsSync(PFC_CORTEX) ? fs.statSync(PFC_CORTEX).size : 0;
    fs.writeFileSync(PFC_SIZE_FILE, String(size));
    console.log(`Done. Size marker: ${size} bytes`);
  } catch (err) {
    console.error(`Warning: PFC size marker update failed: ${err.message}`);
  }
}

function main() {
  ensureDeps();

  // 0a. Re-scan hippocampus DIR files
  runStep('Scanning hippocampus...', path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'scan.js'));

  // 0b. Incremental term index scan
  runStep('Updating term index...', path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'term-scan-cli.js'));

  // 0c. CC2 window scan + metadata extraction
  runStep('Scanning CC2 windows...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'scan.js'));
  runStep('Extracting CC2 metadata...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'extract.js'));

  // 0d. dlPFC working memory — decay, reconcile references, generate output
  runStep('Updating working memory (dlPFC)...', path.join(THEBRAIN_DIR, 'dlpfc', 'scripts', 'wrapup-step.js'));

  // 1. Trim PFC entries and migrate overflow to CC2 recall.db
  runStep('Trimming PFC...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'pfc-trim.js'));

  // 2. Regenerate prefrontal decision gates from signals.db
  runStep('Regenerating prefrontal...', path.join(THEBRAIN_DIR, 'scripts', 'generate-prefrontal.js'));

  // 3. Clean up stale git briefing state files (older than 24 hours)
  runCleanup();

  // 4. Update PFC size marker
  updateSizeMarker();
}

main();
