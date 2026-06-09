#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultPort = "2004";
const binPath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(binPath), "..");
const packageJsonPath = path.join(packageRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const packageName = packageJson.name || "@apoorvdarshan/crossposter";

function readArg(name, shortName) {
  const args = process.argv.slice(2);
  const index = args.findIndex((arg) => arg === name || (shortName && arg === shortName));

  if (index >= 0) {
    return args[index + 1] || "";
  }

  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  return inline?.split("=").slice(1).join("=") || "";
}

function hasArg(name) {
  return process.argv.slice(2).includes(name);
}

function withoutArgValue(args, name, shortName) {
  const next = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === name || (shortName && arg === shortName)) {
      index += 1;
      continue;
    }

    if (arg.startsWith(`${name}=`)) {
      continue;
    }

    next.push(arg);
  }

  return next;
}

function help() {
  return `Crossposter ${packageJson.version}

Usage:
  npx ${packageName}@latest
  crossposter [--port 2004] [--data-dir .] [--no-open] [--no-update]

Commands:
  crossposter --version
  crossposter install-service
  crossposter uninstall-service
  crossposter install-instagram-deps
  crossposter install-instagram-browser-deps
  crossposter install-pinterest-deps

The app code runs from the installed package. Local config, uploads, sessions,
and .env are read from the current folder unless --data-dir is provided.`;
}

function normalizePort(value) {
  const port = String(value || "").trim();

  if (!/^\d+$/.test(port)) {
    return "";
  }

  const numeric = Number(port);

  return numeric > 0 && numeric <= 65535 ? String(numeric) : "";
}

function parseDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const values = {};
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

    if (!match) {
      continue;
    }

    const raw = match[2].replace(/\s+#.*$/, "").trim();
    values[match[1]] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }

  return values;
}

function readLocalConfig(configPath) {
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));

    return config && typeof config === "object" ? config : {};
  } catch {
    return {};
  }
}

function readConfigValue(config, name) {
  const values = config.values && typeof config.values === "object" ? config.values : {};
  const value = values[name] ?? config[name];

  return typeof value === "string" ? value.trim() : "";
}

function compareVersions(a, b) {
  const left = String(a || "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b || "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);

    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}

function shouldOpenBrowser() {
  if (hasArg("--no-open")) {
    return false;
  }

  if (process.env.CROSSPOSTER_NO_OPEN === "true") {
    return false;
  }

  return process.stdout.isTTY;
}

function openBrowser(url) {
  const commands =
    process.platform === "darwin"
      ? [["open", [url]]]
      : process.platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : [["xdg-open", [url]]];

  for (const [command, args] of commands) {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore"
      });

      child.unref();
      return;
    } catch {}
  }
}

async function waitForServer(url, timeoutMs = 25000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (response.ok) {
        return true;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  return false;
}

async function latestNpmVersion() {
  const { stdout } = await execFileAsync("npm", ["view", packageName, "version"], {
    timeout: 7000
  });

  return stdout.trim();
}

async function maybeRelaunchLatest(dataRoot, config) {
  if (hasArg("--no-update") || process.env.CROSSPOSTER_NO_UPDATE === "true") {
    return false;
  }

  if (readConfigValue(config, "POSTER_AUTO_UPDATE") === "false") {
    return false;
  }

  try {
    const latest = await latestNpmVersion();

    if (!latest || compareVersions(latest, packageJson.version) <= 0) {
      return false;
    }

    console.log(`Crossposter ${latest} is available. Launching latest package...`);

    const forwardedArgs = withoutArgValue(process.argv.slice(2), "--data-dir");
    const child = spawn(
      "npm",
      ["exec", "--yes", `${packageName}@latest`, "--", ...forwardedArgs, "--no-update"],
      {
        env: {
          ...process.env,
          CROSSPOSTER_DATA_DIR: dataRoot
        },
        stdio: "inherit",
        shell: process.platform === "win32"
      }
    );

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      process.exit(code ?? 0);
    });

    return true;
  } catch {
    return false;
  }
}

function runHelperScript(name, dataRoot, scriptArgs = []) {
  const script = path.join(packageRoot, "scripts", name);
  const child = spawn(script, scriptArgs, {
    cwd: dataRoot,
    env: {
      ...process.env,
      CROSSPOSTER_APP_ROOT: packageRoot,
      CROSSPOSTER_DATA_DIR: dataRoot
    },
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function startNext(port, dataRoot, dotEnvValues) {
  const nextBin = path.join(
    packageRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next"
  );
  const command = existsSync(nextBin) ? nextBin : "next";
  const host = readArg("--host") || process.env.HOSTNAME || "0.0.0.0";
  const child = spawn(command, ["dev", "--hostname", host, "--port", port], {
    cwd: packageRoot,
    env: {
      ...dotEnvValues,
      ...process.env,
      CROSSPOSTER_APP_ROOT: packageRoot,
      CROSSPOSTER_DATA_DIR: dataRoot,
      PORT: port,
      POSTER_LOCAL_PORT: port
    },
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  return child;
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    console.log(help());
    return;
  }

  if (hasArg("--version") || hasArg("-v")) {
    console.log(packageJson.version);
    return;
  }

  const rawDataDir = readArg("--data-dir") || process.env.CROSSPOSTER_DATA_DIR || process.cwd();
  const dataRoot = path.resolve(rawDataDir);
  const configPath = path.join(dataRoot, "poster.config.local.json");
  const envPath = path.join(dataRoot, ".env");

  mkdirSync(dataRoot, { recursive: true });

  const localConfig = readLocalConfig(configPath);
  const dotEnvValues = parseDotEnv(envPath);
  const command = process.argv.slice(2).find((arg) => !arg.startsWith("-"));

  if (command === "install-instagram-deps") {
    runHelperScript("install-instagram-deps.sh", dataRoot);
    return;
  }

  if (command === "install-instagram-browser-deps") {
    runHelperScript("install-instagram-browser-deps.sh", dataRoot);
    return;
  }

  if (command === "install-pinterest-deps") {
    runHelperScript("install-pinterest-deps.sh", dataRoot);
    return;
  }

  if (command === "install-service") {
    const servicePort =
      normalizePort(readArg("--port", "-p")) ||
      normalizePort(process.env.POSTER_PORT) ||
      normalizePort(process.env.POSTER_LOCAL_PORT) ||
      normalizePort(readConfigValue(localConfig, "POSTER_LOCAL_PORT")) ||
      defaultPort;

    runHelperScript("install-local-service.sh", dataRoot, [servicePort]);
    return;
  }

  if (command === "uninstall-service") {
    runHelperScript("uninstall-local-service.sh", dataRoot);
    return;
  }

  if (await maybeRelaunchLatest(dataRoot, localConfig)) {
    return;
  }

  const port =
    normalizePort(readArg("--port", "-p")) ||
    normalizePort(process.env.POSTER_PORT) ||
    normalizePort(process.env.POSTER_LOCAL_PORT) ||
    normalizePort(readConfigValue(localConfig, "POSTER_LOCAL_PORT")) ||
    normalizePort(process.env.PORT) ||
    normalizePort(dotEnvValues.POSTER_LOCAL_PORT) ||
    normalizePort(dotEnvValues.POSTER_PORT) ||
    normalizePort(dotEnvValues.PORT) ||
    defaultPort;
  const localUrl = `http://localhost:${port}`;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  const child = startNext(port, dataRoot, dotEnvValues);

  console.log(`Crossposter local URL: ${localUrl}`);
  console.log(`Crossposter data folder: ${dataRoot}`);

  if (shouldOpenBrowser()) {
    void waitForServer(healthUrl).then((ready) => {
      if (ready) {
        openBrowser(localUrl);
      }
    });
  }

  async function pingScheduler() {
    try {
      await fetch(`http://127.0.0.1:${port}/api/scheduled/tick`, {
        method: "POST"
      });
    } catch {}
  }

  const schedulerWarmup = setTimeout(() => {
    void pingScheduler();
  }, 5000);
  const schedulerInterval = setInterval(() => {
    void pingScheduler();
  }, 30000);

  schedulerWarmup.unref?.();
  schedulerInterval.unref?.();

  function stopChild(signal) {
    child.kill(signal);
  }

  process.on("SIGINT", () => stopChild("SIGINT"));
  process.on("SIGTERM", () => stopChild("SIGTERM"));

  child.on("exit", (code, signal) => {
    clearTimeout(schedulerWarmup);
    clearInterval(schedulerInterval);

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
