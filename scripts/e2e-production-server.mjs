import { spawn } from "node:child_process";
import { resolve } from "node:path";

const nextCli = resolve("node_modules/next/dist/bin/next");

function runNext(args) {
  return spawn(process.execPath, [nextCli, ...args], { stdio: "inherit", env: process.env });
}

const build = runNext(["build", "--webpack"]);
let server;

build.once("error", error => {
  console.error("Unable to start the isolated E2E webpack build:", error);
  process.exitCode = 1;
});

build.once("exit", (code, signal) => {
  if (code !== 0) {
    console.error(`Isolated E2E build failed${signal ? ` (${signal})` : ` with exit code ${code}`}.`);
    process.exitCode = code || 1;
    return;
  }

  server = runNext(["start", "--hostname", "127.0.0.1", "--port", "3100"]);
  server.once("error", error => {
    console.error("Unable to start the isolated E2E production server:", error);
    process.exitCode = 1;
  });
  server.once("exit", (serverCode, serverSignal) => {
    process.exitCode = serverCode ?? (serverSignal ? 1 : 0);
  });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    build.kill(signal);
    server?.kill(signal);
  });
}
