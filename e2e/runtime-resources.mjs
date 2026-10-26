import { availableParallelism, cpus, freemem, loadavg, totalmem } from 'node:os';
import { readFileSync } from 'node:fs';
const limit = path => {
  try { return readFileSync(path, 'utf8').trim().slice(0, 512); }
  catch { return null; }
};
// Observations only: host memory/load and cgroup limits are not per-browser usage.
export function runtimeResources() {
  return { recordedAt: new Date().toISOString(), logicalCpuCount: cpus().length,
    availableParallelism: availableParallelism(), loadAverage: loadavg(),
    totalMemoryBytes: totalmem(), freeMemoryBytes: freemem(),
    cgroupV2: { cpuMax: limit('/sys/fs/cgroup/cpu.max'), memoryMax: limit('/sys/fs/cgroup/memory.max'), memoryCurrent: limit('/sys/fs/cgroup/memory.current') },
    nodeProcessUsage: process.resourceUsage(),
    interpretation: 'Host/load and cgroup observations; Node process usage excludes browser child usage. Null limit means unavailable, not unlimited.' };
}
