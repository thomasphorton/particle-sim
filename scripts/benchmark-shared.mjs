import { advanceWorldTick, createDefaultWorldState, createStarterWorld, normalizePlayerInput, serializeWorldState } from "../packages/shared/dist/index.js";

// 60 Hz is the single authoritative gameplay rate. 30 Hz is modelled as a
// benchmark-only scheduling shape: two ordered authoritative substeps per outer
// frame. Total authoritative ticks are held constant across both shapes so the
// per-tick percentiles are directly comparable.
const TOTAL_TICKS = 1200;
const WARMUP_TICKS = 120;

const SCHEDULES = [
  { hz: 60, substepsPerFrame: 1 },
  { hz: 30, substepsPerFrame: 2 },
];

const IDLE_INPUTS = {
  ["player_1"]: normalizePlayerInput({
    left: false,
    right: false,
    jumpHeld: false,
    crouchHeld: false,
    lookUpHeld: false,
    mineHeld: false,
  }),
};

function createScenario(name) {
  if (name === "starter") {
    // The starter world is a 320x200 room — the size called for by the benchmark.
    return createStarterWorld({ roomId: "bench_starter", seed: 4242 });
  }
  const world = createDefaultWorldState("bench_stress");
  for (let y = 0; y < world.grid.height; y += 1) {
    for (let x = 0; x < world.grid.width; x += 1) {
      if ((x + y) % 7 === 0) {
        world.grid.set(x, y, 1);
      }
    }
  }
  return world;
}

function percentile(sortedAsc, q) {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length));
  return sortedAsc[index];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    mean,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

function runScenario(name, schedule) {
  const world = createScenario(name);

  for (let i = 0; i < WARMUP_TICKS; i += 1) {
    advanceWorldTick(world, IDLE_INPUTS);
  }

  const tickSamplesMs = [];
  const frameSamplesMs = [];
  const frames = Math.ceil(TOTAL_TICKS / schedule.substepsPerFrame);

  for (let frame = 0; frame < frames; frame += 1) {
    const frameStart = process.hrtime.bigint();
    for (let substep = 0; substep < schedule.substepsPerFrame; substep += 1) {
      const tickStart = process.hrtime.bigint();
      advanceWorldTick(world, IDLE_INPUTS);
      tickSamplesMs.push(Number(process.hrtime.bigint() - tickStart) / 1e6);
    }
    frameSamplesMs.push(Number(process.hrtime.bigint() - frameStart) / 1e6);
  }

  if (typeof global.gc === "function") global.gc();
  const memory = process.memoryUsage();
  const finalBytes = Buffer.byteLength(JSON.stringify(serializeWorldState(world)));

  const perTick = summarize(tickSamplesMs);
  const perFrame = summarize(frameSamplesMs);

  return {
    scenario: name,
    hz: schedule.hz,
    substepsPerFrame: schedule.substepsPerFrame,
    ticks: tickSamplesMs.length,
    frames: frameSamplesMs.length,
    perTickMs: perTick,
    perFrameMs: perFrame,
    tickThroughputPerSec: 1000 / perTick.mean,
    // Fraction of the frame budget consumed at this Hz (frame budget = 1000/hz ms).
    frameBudgetUtilization: perFrame.mean / (1000 / schedule.hz),
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      serializedStateBytes: finalBytes,
    },
  };
}

const results = [];
for (const scenario of ["starter", "stress"]) {
  for (const schedule of SCHEDULES) {
    results.push(runScenario(scenario, schedule));
  }
}

// Machine-readable output (one JSON object per line).
for (const result of results) {
  console.log(JSON.stringify(result));
}

// Human-readable summary.
const toMs = (value) => value.toFixed(4);
const toMb = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
console.error("\nBenchmark summary (per-tick latency, ms):");
console.error(
  ["scenario", "hz", "p50", "p95", "p99", "mean", "max", "frameUtil", "rssMB", "heapMB"]
    .map((header) => header.padStart(10))
    .join(" "),
);
for (const result of results) {
  console.error(
    [
      result.scenario,
      String(result.hz),
      toMs(result.perTickMs.p50),
      toMs(result.perTickMs.p95),
      toMs(result.perTickMs.p99),
      toMs(result.perTickMs.mean),
      toMs(result.perTickMs.max),
      `${(result.frameBudgetUtilization * 100).toFixed(1)}%`,
      toMb(result.memory.rssBytes),
      toMb(result.memory.heapUsedBytes),
    ]
      .map((cell) => cell.padStart(10))
      .join(" "),
  );
}
