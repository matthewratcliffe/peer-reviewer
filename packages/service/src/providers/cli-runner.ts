import { spawn, type SpawnOptions } from "node:child_process";

/**
 * Spawns a local CLI, writes `input` to its stdin, and resolves with stdout.
 * On Windows, npm-installed CLIs are typically .cmd shims; spawn() only resolves
 * .exe/.com directly and reports ENOENT for .cmd/.bat unless shell:true is set.
 * We use CREATE_NO_WINDOW (0x08000000) to prevent a conhost.exe per process.
 */
export function runCliCommand(command: string, args: string[], input: string, debug = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (debug) {
      console.log(`[DEBUG] CLI request: ${command} ${args.join(" ")}`);
      console.log(`[DEBUG] CLI stdin (${input.length} chars): ${input.substring(0, 500)}${input.length > 500 ? "..." : ""}`);
    }
    const isWin = process.platform === "win32";
    const options: SpawnOptions = {
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWin,
      windowsHide: true,
    };
    if (isWin) {
      // CREATE_NO_WINDOW prevents allocation of a console (and conhost.exe)
      // for each spawned process when running headlessly.
      const CREATE_NO_WINDOW = 0x08000000;
      options.windowsVerbatimArguments = true;
      (options as Record<string, unknown>).creationFlags = CREATE_NO_WINDOW;
    }
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout!.on("data", (chunk) => (stdout += chunk));
    child.stderr!.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err) => {
      if (debug) console.log(`[DEBUG] CLI error: ${err.message}`);
      reject(err);
    });
    child.on("close", (code) => {
      if (debug) {
        console.log(`[DEBUG] CLI exit code: ${code}`);
        console.log(`[DEBUG] CLI stdout (${stdout.length} chars): ${stdout.substring(0, 1000)}${stdout.length > 1000 ? "..." : ""}`);
        if (stderr) console.log(`[DEBUG] CLI stderr: ${stderr}`);
      }
      if (code !== 0) {
        reject(new Error(`${command} exited ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin!.write(input);
    child.stdin!.end();
  });
}
