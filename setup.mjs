#!/usr/bin/env node
/**
 * Interactive setup — no dependencies required, so it can run before
 * `npm install`. Asks for your RepairDesk API key, then wires this server
 * into Claude Code, Claude Desktop, Codex CLI, OpenCode, or prints the
 * config block for anything else.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, appendFileSync, mkdirSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline/promises";
import { homedir, platform } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "server.mjs");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => rl.question(q);

function claudeDesktopConfigPath() {
  const plat = platform();
  if (plat === "darwin") return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (plat === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function opencodeConfigPath() {
  const plat = platform();
  if (plat === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "opencode", "opencode.json");
  return join(homedir(), ".config", "opencode", "opencode.json");
}

function codexConfigPath() {
  return join(homedir(), ".codex", "config.toml");
}

function hasCli(name) {
  const res = spawnSync(name, ["--version"], { shell: true, stdio: "ignore" });
  return res.status === 0;
}

function ensureDependenciesInstalled() {
  if (existsSync(join(__dirname, "node_modules"))) return;
  console.log("\nInstalling dependencies (npm install)...");
  const res = spawnSync("npm", ["install"], { cwd: __dirname, shell: true, stdio: "inherit" });
  if (res.status !== 0) {
    console.error("\n`npm install` failed — install Node.js 18+ and re-run `node setup.mjs`.");
    process.exit(1);
  }
}

function printManualBlock(apiKey, userAgent) {
  console.log(`
Add this to your MCP client's config (merge into "mcpServers" if it already has entries):

{
  "mcpServers": {
    "repairdesk": {
      "command": "node",
      "args": ["${SERVER_PATH.replace(/\\/g, "\\\\")}"],
      "env": {
        "REPAIRDESK_API_KEY": "${apiKey}",
        "REPAIRDESK_USER_AGENT": "${userAgent}"
      }
    }
  }
}
`);
}

/** Shared merge-a-JSON-config-file helper, used by Claude Desktop and OpenCode. */
function mergeJsonConfig(configPath, mutate) {
  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (e) {
      console.log(`\nCouldn't parse your existing config (${e.message}) — showing the manual block instead so nothing gets overwritten.`);
      return false;
    }
    const backupPath = `${configPath}.bak-${Date.now()}`;
    copyFileSync(configPath, backupPath);
    console.log(`\nBacked up your existing config to:\n  ${backupPath}`);
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
  }
  mutate(config);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\nWrote config to:\n  ${configPath}`);
  return true;
}

async function main() {
  console.log("RepairDesk MCP Server — setup\n");
  ensureDependenciesInstalled();

  console.log("You'll need your RepairDesk API key: Settings > API in your RepairDesk admin.");
  console.log("(It'll be visible as you type — this only runs on your own machine.)\n");

  let apiKey = "";
  while (!apiKey) {
    apiKey = (await ask("RepairDesk API key: ")).trim();
    if (!apiKey) console.log("  Can't be empty — paste your key from Settings > API.");
  }

  const shopName = (await ask("Shop/tool name for the API User-Agent (optional, press Enter to skip): ")).trim();
  const userAgent = shopName ? `${shopName.replace(/\s+/g, "")}-MCP/1.0` : "RepairDesk-MCP/1.0";

  console.log(`
Which AI assistant are you setting this up for?
  1) Claude Code
  2) Claude Desktop
  3) Codex CLI (OpenAI)
  4) OpenCode
  5) Something else / just show me the config
`);
  let choice = (await ask("Enter 1-5: ")).trim();
  while (!["1", "2", "3", "4", "5"].includes(choice)) {
    choice = (await ask("Please enter 1, 2, 3, 4, or 5: ")).trim();
  }

  const testPrompt = 'Using RepairDesk, list my 5 most recent tickets.';

  if (choice === "1") {
    // Claude Code
    if (!hasCli("claude")) {
      console.log("\nCouldn't find the `claude` command on your PATH. Falling back to the manual config:");
      printManualBlock(apiKey, userAgent);
    } else {
      const args = [
        "mcp", "add", "repairdesk",
        "--env", `REPAIRDESK_API_KEY=${apiKey}`,
        "--env", `REPAIRDESK_USER_AGENT=${userAgent}`,
        "--", "node", SERVER_PATH,
      ];
      const res = spawnSync("claude", args, { shell: true, stdio: "inherit" });
      if (res.status !== 0) {
        console.log("\n`claude mcp add` didn't succeed — here's the config to add by hand instead:");
        printManualBlock(apiKey, userAgent);
      } else {
        console.log(`\nDone. Try asking Claude Code: "${testPrompt}"`);
      }
    }
  } else if (choice === "2") {
    // Claude Desktop
    const ok = mergeJsonConfig(claudeDesktopConfigPath(), (config) => {
      config.mcpServers ||= {};
      config.mcpServers.repairdesk = {
        command: "node",
        args: [SERVER_PATH],
        env: { REPAIRDESK_API_KEY: apiKey, REPAIRDESK_USER_AGENT: userAgent },
      };
    });
    if (!ok) printManualBlock(apiKey, userAgent);
    else {
      console.log("\nNow fully quit and reopen Claude Desktop (not just close the window), then try:");
      console.log(`  "${testPrompt}"`);
    }
  } else if (choice === "3") {
    // Codex CLI — config.toml, no JSON. Append rather than parse (no TOML
    // parser in the standard library), skip if it looks already configured.
    const configPath = codexConfigPath();
    const block = `\n[mcp_servers.repairdesk]\ncommand = "node"\nargs = ["${SERVER_PATH.replace(/\\/g, "\\\\")}"]\n\n[mcp_servers.repairdesk.env]\nREPAIRDESK_API_KEY = "${apiKey}"\nREPAIRDESK_USER_AGENT = "${userAgent}"\n`;
    let existing = "";
    if (existsSync(configPath)) {
      existing = readFileSync(configPath, "utf8");
      if (existing.includes("[mcp_servers.repairdesk]")) {
        console.log(`\n${configPath} already has a [mcp_servers.repairdesk] section — not touching it automatically.`);
        console.log("Edit it by hand, or remove that section and re-run this script. Here's the block to use:");
        console.log(block);
        await rl.close();
        return;
      }
      const backupPath = `${configPath}.bak-${Date.now()}`;
      copyFileSync(configPath, backupPath);
      console.log(`\nBacked up your existing config to:\n  ${backupPath}`);
    } else {
      mkdirSync(dirname(configPath), { recursive: true });
    }
    appendFileSync(configPath, block);
    console.log(`\nAppended config to:\n  ${configPath}`);
    console.log(`\nStart a new Codex session, run /mcp to confirm it's connected, then try:\n  "${testPrompt}"`);
  } else if (choice === "4") {
    // OpenCode
    const ok = mergeJsonConfig(opencodeConfigPath(), (config) => {
      config.$schema ||= "https://opencode.ai/config.json";
      config.mcp ||= {};
      config.mcp.repairdesk = {
        type: "local",
        command: ["node", SERVER_PATH],
        enabled: true,
        environment: { REPAIRDESK_API_KEY: apiKey, REPAIRDESK_USER_AGENT: userAgent },
      };
    });
    if (!ok) {
      console.log("Manual OpenCode config block:");
      console.log(JSON.stringify({ mcp: { repairdesk: {
        type: "local", command: ["node", SERVER_PATH], enabled: true,
        environment: { REPAIRDESK_API_KEY: apiKey, REPAIRDESK_USER_AGENT: userAgent },
      } } }, null, 2));
    } else {
      console.log(`\nRestart OpenCode, then try:\n  "${testPrompt}"`);
    }
  } else {
    printManualBlock(apiKey, userAgent);
  }

  await rl.close();
}

main().catch((e) => {
  console.error("\nSetup failed:", e.message);
  process.exit(1);
});
