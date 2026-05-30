#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const defaultPort = "2004";
const configPath = path.join(process.cwd(), "poster.config.local.json");
const envPath = path.join(process.cwd(), ".env");

function readJsonPort() {
  if (!existsSync(configPath)) {
    return "";
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    return typeof config?.values?.POSTER_LOCAL_PORT === "string"
      ? config.values.POSTER_LOCAL_PORT
      : "";
  } catch {
    return "";
  }
}

function readDotEnvPort() {
  if (!existsSync(envPath)) {
    return "";
  }

  const env = readFileSync(envPath, "utf8");
  const match = env.match(/^\s*(?:POSTER_LOCAL_PORT|POSTER_PORT|PORT)\s*=\s*["']?([^"'\n#]+)["']?/m);

  return match?.[1]?.trim() || "";
}

function readCliPort() {
  const portIndex = process.argv.findIndex((arg) => arg === "--port" || arg === "-p");

  if (portIndex >= 0) {
    return process.argv[portIndex + 1] || "";
  }

  const inline = process.argv.find((arg) => arg.startsWith("--port="));

  return inline?.split("=")[1] || "";
}

function normalizePort(value) {
  const port = String(value || "").trim();

  if (!/^\d+$/.test(port)) {
    return "";
  }

  const numeric = Number(port);

  return numeric > 0 && numeric <= 65535 ? String(numeric) : "";
}

const port =
  normalizePort(readCliPort()) ||
  normalizePort(process.env.POSTER_PORT) ||
  normalizePort(process.env.POSTER_LOCAL_PORT) ||
  normalizePort(readJsonPort()) ||
  normalizePort(process.env.PORT) ||
  normalizePort(readDotEnvPort()) ||
  defaultPort;
const nextBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);
const command = existsSync(nextBin) ? nextBin : "next";
const child = spawn(command, ["dev", "--port", port], {
  env: {
    ...process.env,
    PORT: port,
    POSTER_LOCAL_PORT: port
  },
  stdio: "inherit",
  shell: process.platform === "win32"
});

console.log(`Personal Crossposter local URL: http://localhost:${port}`);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
