#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadAllDIR, matchProject } = require('../../hippocampus/lib/dir-loader');
const { WorkingMemoryDB } = require('../lib/db');
const { bumpFile } = require('../lib/tracker');

if (require.main === module) {
  let inputData;
  try { inputData = JSON.parse(fs.readFileSync(0, 'utf-8')); }
  catch { process.exit(0); }

  const toolInput = inputData.tool_input || {};
  const sessionId = inputData.session_id || 'default';
  const filePath = toolInput.file_path || '';
  if (!filePath) process.exit(0);

  const cwd = inputData.cwd || process.cwd();
  const hippocampusDir = path.join(os.homedir(), '.claude/brain/hippocampus');

  // Skip if hippocampus data doesn't exist yet
  if (!fs.existsSync(hippocampusDir)) process.exit(0);

  const dirs = loadAllDIR(hippocampusDir);
  const match = matchProject(dirs, filePath);
  if (!match) process.exit(0);

  const matchedProject = match.project;
  const dirData = match.dir;
  const relativeToProject = match.relativeToProject;

  let db;
  try {
    db = new WorkingMemoryDB();
    const reengagement = bumpFile(db, matchedProject, relativeToProject, 'read', sessionId, dirData);

    if (reengagement) {
      const { checkGitChanges, hasBeenBriefed } = require('../lib/git-briefing');
      if (!hasBeenBriefed(sessionId, matchedProject, relativeToProject)) {
        const projectRoot = match.projectRoot;
        const briefing = checkGitChanges(projectRoot, relativeToProject, reengagement.lastTouchedAt);
        if (briefing) {
          process.stderr.write('[git-briefing] ' + relativeToProject + ' changed while cold: ' + briefing + '\n');
        }
      }
    }
  } catch (err) {
    process.stderr.write(`[dlpfc-read] ${err.message}\n`);
  } finally {
    if (db) db.close();
  }

  process.exit(0);
}
