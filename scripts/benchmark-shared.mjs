import { advanceWorldTick, createDefaultWorldState, createStarterWorld, normalizePlayerInput, serializeWorldState } from "../packages/shared/dist/index.js";

const TICK_COUNT = 600;
const WARMUP_TICKS = 120;
const REPEATS = 5;

function createScenario(name) {
  if (name === "starter") {
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

function runScenario(name) {
  const world = createScenario(name);
  const inputs = {
    ["player_1"]: normalizePlayerInput({
      left: false,
      right: false,
      jumpHeld: false,
      crouchHeld: false,
      lookUpHeld: false,
      mineHeld: false,
    }),
  };
  for (let i = 0; i < WARMUP_TICKS; i += 1) {
    advanceWorldTick(world, inputs);
  }
  const samples = [];
  for (let rep = 0; rep < REPEATS; rep += 1) {
    const snapshot = createScenario(name);
    const start = process.hrtime.bigint();
    for (let i = 0; i < TICK_COUNT; i += 1) {
      advanceWorldTick(snapshot, inputs);
    }
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    samples.push(durationMs);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const max = sorted[sorted.length - 1];
  const finalBytes = Buffer.byteLength(JSON.stringify(serializeWorldState(world)));
  return { name, mean, p50, p95, p99, max, throughput: (TICK_COUNT / mean) * 1000, finalBytes };
}

const results = [runScenario("starter"), runScenario("stress")];
for (const result of results) {
  console.log(JSON.stringify(result));
}
