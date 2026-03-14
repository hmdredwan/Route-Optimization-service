// src/solver/vrp.solver.ts

import { spawn } from "child_process";

interface SolverInput {
  durations: number[][];
  time_windows: [number, number][];
  service_times: number[];
  time_limit_s: number;
}

interface SolverOutput {
  sequence: number[];
  arrival_times: number[];
  total_duration_s: number;
  solver_time_ms: number;
}

export async function solveVRP(
  durations: number[][],
  timeWindows: [number, number][],
  serviceTimes: number[],
  timeLimitMs: number = 5000
): Promise<SolverOutput> {

  const input: SolverInput = {
    durations,
    time_windows: timeWindows,
    service_times: serviceTimes,
    time_limit_s: Math.floor(timeLimitMs / 1000),
  };

  return new Promise((resolve, reject) => {

    const python = spawn("python3", ["src/solver/vrp_solver.py"]);

    let stdout = "";
    let stderr = "";

    // Read stdout
    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    // Read stderr
    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    // Process finished
    python.on("close", (code) => {

      if (code !== 0) {
        console.error("Python solver error:", stderr);
        return reject(new Error(stderr || "VRP solver failed"));
      }

      try {
        const result = JSON.parse(stdout) as SolverOutput | { error: string };

        if ("error" in result) {
          return reject(new Error(result.error));
        }

        resolve(result);

      } catch (err) {
        reject(new Error("Failed to parse solver output: " + stdout));
      }

    });

    // Send JSON input to Python
    python.stdin.write(JSON.stringify(input));
    python.stdin.end();

  });
}