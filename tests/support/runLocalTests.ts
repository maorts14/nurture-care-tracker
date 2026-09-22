import { spawn } from "node:child_process";

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const compose = ["compose", "-p", "feedme-tests", "-f", "docker-compose.test.yml"];

let failure: unknown;

try {
  await run("docker", [...compose, "up", "-d", "--wait"]);
  await run(npx, ["playwright", "install", "chromium"]);
  await run(npm, ["test"]);
} catch (error) {
  failure = error;
} finally {
  try {
    await run("docker", [...compose, "down", "--volumes", "--remove-orphans"]);
  } catch (cleanupError) {
    if (!failure) failure = cleanupError;
  }
}

if (failure) {
  console.error(failure);
  process.exitCode = 1;
}
