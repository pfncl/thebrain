'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.claude', 'brain');
const DEFAULT_CONFIG_PATH = path.join(BRAIN_DIR, 'config.json');

function getConfigPath() {
  return process.env.THEBRAIN_CONFIG || DEFAULT_CONFIG_PATH;
}

/**
 * Auto-discover workspaces from ~/.claude/projects/ directory names.
 * Each project dir encodes an absolute path with "/" replaced by "-".
 * Since project names can contain "-" (e.g. "pefen-stack"), we can't
 * decode by simple split. Instead, we try progressively longer path
 * prefixes and check which ones exist on disk.
 */
function discoverWorkspaces() {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsDir)) return { workspaces: [], conversationDirs: [] };

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  const parentCounts = {};
  const convDirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('-') || entry.name.length < 4) continue;

    // Decode by trying path prefixes: "-home-github-pefen-stack"
    // Try: /home, /home/github, /home/github/pefen, /home/github/pefen-stack, ...
    // Pick the deepest existing directory that still leaves a remainder.
    const encoded = entry.name.slice(1); // strip leading "-"
    const parts = encoded.split('-');
    let bestParent = null;

    for (let i = 1; i < parts.length; i++) {
      const candidate = '/' + parts.slice(0, i).join('/');
      const remainder = parts.slice(i).join('-');
      // The candidate must be a directory, and the full decoded path must also exist
      const fullPath = path.join(candidate, remainder);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        bestParent = candidate;
      }
    }

    if (!bestParent) continue;

    parentCounts[bestParent] = (parentCounts[bestParent] || 0) + 1;
    convDirs.push(path.join(projectsDir, entry.name));
  }

  // Use parent dirs that contain 2+ projects as workspaces, or fall back to any with 1+
  const threshold = Object.values(parentCounts).some(c => c >= 2) ? 2 : 1;
  const workspaces = Object.entries(parentCounts)
    .filter(([, count]) => count >= threshold)
    .map(([wsPath]) => ({ name: path.basename(wsPath), path: wsPath }));

  return { workspaces, conversationDirs: convDirs };
}

function loadConfig(configPath) {
  const resolved = configPath || getConfigPath();
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  } catch {
    // No config file — will auto-discover below
  }

  let workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : [];
  let conversationDirs = Array.isArray(raw.conversationDirs)
    ? raw.conversationDirs.map(d => d.replace(/^~/, os.homedir()))
    : [];

  // Filter to workspaces that actually exist on this machine
  const validWorkspaces = workspaces.filter(w => fs.existsSync(w.path));

  // Auto-discover if no configured workspaces exist on this machine
  if (validWorkspaces.length === 0) {
    const discovered = discoverWorkspaces();
    if (discovered.workspaces.length > 0) {
      workspaces = discovered.workspaces;
      if (conversationDirs.length === 0) {
        conversationDirs = discovered.conversationDirs;
      }
    }
  } else {
    workspaces = validWorkspaces;
  }

  // Also auto-discover conversationDirs if configured ones don't exist
  if (conversationDirs.length > 0) {
    const validConvDirs = conversationDirs.filter(d => fs.existsSync(d));
    if (validConvDirs.length === 0) {
      const discovered = discoverWorkspaces();
      conversationDirs = discovered.conversationDirs;
    } else {
      conversationDirs = validConvDirs;
    }
  }

  return { workspaces, conversationDirs };
}

function deriveConversationDir(workspacePath) {
  const resolved = path.resolve(workspacePath);
  const encoded = resolved.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

function saveConfig(config, configPath) {
  const resolved = configPath || getConfigPath();
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(config, null, 2) + '\n');
}

module.exports = {
  BRAIN_DIR, DEFAULT_CONFIG_PATH,
  loadConfig, deriveConversationDir, saveConfig, getConfigPath,
};
