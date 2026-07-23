"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCliCommand = runCliCommand;
const node_child_process_1 = require("node:child_process");
/**
 * Spawns a local CLI, writes `input` to its stdin, and resolves with stdout.
 * On Windows, npm-installed CLIs are typically .cmd shims; spawn() only resolves
 * .exe/.com directly and reports ENOENT for .cmd/.bat unless shell:true is set.
 */
function runCliCommand(command, args, input, debug = false) {
    return new Promise((resolve, reject) => {
        if (debug) {
            console.log(`[DEBUG] CLI request: ${command} ${args.join(" ")}`);
            console.log(`[DEBUG] CLI stdin (${input.length} chars): ${input.substring(0, 500)}${input.length > 500 ? "..." : ""}`);
        }
        const child = (0, node_child_process_1.spawn)(command, args, {
            stdio: ["pipe", "pipe", "pipe"],
            shell: process.platform === "win32",
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", (err) => {
            if (debug)
                console.log(`[DEBUG] CLI error: ${err.message}`);
            reject(err);
        });
        child.on("close", (code) => {
            if (debug) {
                console.log(`[DEBUG] CLI exit code: ${code}`);
                console.log(`[DEBUG] CLI stdout (${stdout.length} chars): ${stdout.substring(0, 1000)}${stdout.length > 1000 ? "..." : ""}`);
                if (stderr)
                    console.log(`[DEBUG] CLI stderr: ${stderr}`);
            }
            if (code !== 0) {
                reject(new Error(`${command} exited ${code}: ${stderr}`));
                return;
            }
            resolve(stdout);
        });
        child.stdin.write(input);
        child.stdin.end();
    });
}
