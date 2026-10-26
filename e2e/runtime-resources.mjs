import { availableParallelism, cpus, freemem, loadavg, totalmem } from 'node:os';
import { readFileSync, readdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const limit = path => {
  try { return readFileSync(path, 'utf8').trim().slice(0, 512); }
  catch { return null; }
};
// Linux /proc counters include the browser descendants, not only the Node driver.
// Raw clock ticks are deliberately not converted using an assumed CLK_TCK.
function processTree() {
  try {
    const all = readdirSync('/proc').filter(id => /^\d+$/.test(id)).flatMap(id => {
      try {
        const raw = readFileSync(`/proc/${id}/stat`, 'utf8');
        const end = raw.lastIndexOf(')');
        const fields = raw.slice(end + 2).trim().split(/\s+/);
        const status = readFileSync(`/proc/${id}/status`, 'utf8');
        return [{ pid: Number(id), ppid: Number(fields[1]), command: raw.slice(raw.indexOf('(') + 1, end),
          userCpuTicks: Number(fields[11]), systemCpuTicks: Number(fields[12]),
          residentKiB: status.match(/^VmRSS:\s+(\d+)/m) ? Number(status.match(/^VmRSS:\s+(\d+)/m)[1]) : null }];
      } catch { return []; } // A process may exit between directory and stat reads.
    });
    const descendants = new Set([process.pid]);
    for (let previous = -1; previous !== descendants.size;) {
      previous = descendants.size;
      for (const item of all) if (descendants.has(item.ppid)) descendants.add(item.pid);
    }
    return { rootPid: process.pid, processes: all.filter(item => descendants.has(item.pid)),
      scope: 'Visible Linux process tree rooted at this driver; exited/reparented/inaccessible processes may be absent. CPU is cumulative raw clock ticks, RSS is KiB, not additive unique memory.' };
  } catch (error) { return { unavailable: String(error) }; }
}
// Observations only: host memory/load and cgroup limits are not per-browser usage.
export function runtimeResources() {
  const started = performance.now();
  const resources = { recordedAt: new Date().toISOString(), logicalCpuCount: cpus().length,
    availableParallelism: availableParallelism(), loadAverage: loadavg(),
    totalMemoryBytes: totalmem(), freeMemoryBytes: freemem(),
    cgroupV2: { cpuMax: limit('/sys/fs/cgroup/cpu.max'), memoryMax: limit('/sys/fs/cgroup/memory.max'), memoryCurrent: limit('/sys/fs/cgroup/memory.current') },
    nodeProcessUsage: process.resourceUsage(), processTree: processTree(),
    interpretation: 'Host/load and cgroup observations; Node process usage excludes browser child usage. Null limit means unavailable, not unlimited.' };
  return { ...resources, observationDurationMs: performance.now() - started };
}
