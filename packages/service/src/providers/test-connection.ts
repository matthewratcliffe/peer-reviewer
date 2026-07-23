import { spawn } from "node:child_process";
import type { Config } from "../config.js";

function testCliCommand(command: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // See cli-runner.ts: npm-installed CLIs are typically .cmd shims on Windows, which
    // spawn() can't resolve without shell:true (reports ENOENT even when on PATH).
    const child = spawn(command, ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
    child.on("error", (error) => reject(new Error(`Failed to launch "${command}": ${error.message}`)));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"${command} --version" exited with code ${code}`));
    });
  });
}

export async function testProviderConnection(config: Config): Promise<void> {
  switch (config.activeProvider) {
    case "claude":
      return testCliCommand(config.providers.claude.command);
    case "llama-cpp": {
      const { baseUrl } = config.providers.llamaCpp;
      const response = await fetch(`${baseUrl}/v1/models`);
      if (!response.ok) {
        throw new Error(`llama.cpp server at ${baseUrl} responded ${response.status}`);
      }
      return;
    }
    case "codex":
      return testCliCommand(config.providers.codex.command);
    case "opencode":
      return testCliCommand(config.providers.opencode.command);
    case "kiro":
      return testCliCommand(config.providers.kiro.command);
  }
}
