import test from "node:test";
import assert from "node:assert/strict";
import {
advanceWorldTick,
createDefaultPlayerState,
createDefaultWorldState,
createPlayerId,
createStarterWorld,
FAUCET_BUMP_COOLDOWN_TICKS,
MaterialId,
normalizePlayerInput,
serializeWorldState,
SWING_DURATION_TICKS,
} from "@particle-sim/shared";

const IDLE = normalizePlayerInput({});

function checksum(world) {
return JSON.stringify(serializeWorldState(world));
}

// Deterministic, tick-indexed input pattern (no randomness) so two runs share
// an identical input sequence.
function scriptedInput(tick) {
return normalizePlayerInput({
  left: tick % 7 === 0,
  right: tick % 5 === 0,
  jumpHeld: tick % 11 === 0,
  crouchHeld: tick % 13 === 0,
  lookUpHeld: false,
  mineHeld: tick % 3 === 0,
});
}

function addPlayer(world, id = "player_1", x = 20, y = 20) {
const player = createDefaultPlayerState(createPlayerId(id));
player.x = x;
player.y = y;
world.players[id] = player;
return id;
}

test("same seed + identical input sequence produces identical checksums", () => {
const a = createStarterWorld({ roomId: "det_a", seed: 9182 });
const b = createStarterWorld({ roomId: "det_a", seed: 9182 });
const idA = addPlayer(a);
const idB = addPlayer(b);
assert.equal(idA, idB);

for (let tick = 0; tick < 400; tick += 1) {
  const input = scriptedInput(tick);
  assert.equal(advanceWorldTick(a, { [idA]: input }), true);
  assert.equal(advanceWorldTick(b, { [idB]: input }), true);
}

assert.equal(checksum(a), checksum(b));
});

test("pausing freezes the simulation and unpausing resumes it", () => {
const world = createStarterWorld({ roomId: "pause_room", seed: 33 });
const id = addPlayer(world);
for (let tick = 0; tick < 25; tick += 1) {
  advanceWorldTick(world, { [id]: scriptedInput(tick) });
}

world.paused = true;
const frozen = checksum(world);
const frozenTick = world.tick;
for (let i = 0; i < 50; i += 1) {
  assert.equal(advanceWorldTick(world, { [id]: scriptedInput(i) }), false);
}
assert.equal(checksum(world), frozen, "paused world must not change");
assert.equal(world.tick, frozenTick, "tick counter must not advance while paused");

world.paused = false;
assert.equal(advanceWorldTick(world, { [id]: IDLE }), true);
assert.notEqual(checksum(world), frozen, "unpausing must resume evolution");
assert.equal(world.tick, frozenTick + 1);
});

test("a pickaxe swing spans SWING_DURATION_TICKS before it clears", () => {
const world = createDefaultWorldState("swing_room");
const id = addPlayer(world, "player_1", 20, 20);
const player = world.players[id];

// Start a swing (default hotbar slot 0 is the pickaxe).
advanceWorldTick(world, { [id]: normalizePlayerInput({ mineHeld: true }) });
assert.notEqual(player.swingElapsedTicks, null, "swing should be active after a mine input");

// Release and count ticks until the swing clears, including the initial start tick.
let ticksActive = 1;
while (player.swingElapsedTicks !== null && ticksActive < SWING_DURATION_TICKS * 3) {
  advanceWorldTick(world, { [id]: IDLE });
  ticksActive += 1;
}

assert.equal(player.swingElapsedTicks, null, "swing must eventually clear");
assert.equal(ticksActive, SWING_DURATION_TICKS, "swing should clear on the 15th authoritative tick including the start");
});

test("faucet bump cooldown is honored across exactly FAUCET_BUMP_COOLDOWN_TICKS", () => {
const world = createDefaultWorldState("faucet_room");
// A solid faucet ceiling the player will head-butt from below.
const faucetRow = 10;
for (let gx = 5; gx <= 7; gx += 1) {
  world.grid.set(gx, faucetRow, MaterialId.Faucet);
}
const id = addPlayer(world, "player_1", 5, faucetRow + 1);
const player = world.players[id];

const bumpTicks = [];
let previousFlow = world.grid.getFaucetFlow(5, faucetRow);
for (let i = 0; i < FAUCET_BUMP_COOLDOWN_TICKS * 3; i += 1) {
  // Force an upward head-butt into the faucet ceiling every tick.
  world.players[id].vy = -6;
  world.players[id].y = faucetRow + 1;
  const tickBefore = world.tick;
  advanceWorldTick(world, { [id]: IDLE });
  const flow = world.grid.getFaucetFlow(5, faucetRow);
  if (flow !== previousFlow) {
    bumpTicks.push(tickBefore);
    previousFlow = flow;
  }
}

assert.ok(bumpTicks.length >= 3, "expected several successful bumps over the run");
for (let i = 1; i < bumpTicks.length; i += 1) {
  assert.equal(
    bumpTicks[i] - bumpTicks[i - 1],
    FAUCET_BUMP_COOLDOWN_TICKS,
    "successful bumps must be spaced by exactly the cooldown",
  );
}
// The cooldown field itself is tick-based.
assert.equal(player.faucetCooldownUntilTick % FAUCET_BUMP_COOLDOWN_TICKS, 0);
});

function forceStorm(world) {
const weather = world.weather;
weather.kind = "storm";
weather.episodeElapsed = 0;
weather.episodeDuration = 1_000_000; // stay in storm for the whole test
weather.wind = 2;
weather.rainAccumulator = 0;
weather.lightningFlash = null;
weather.lightningCooldown = 5;
weather.boltX = null;
weather.boltY = null;
}

test("weather is deterministic and storms produce lightning within a bounded window", () => {
const a = createDefaultWorldState("weather_shared");
const b = createDefaultWorldState("weather_shared");
forceStorm(a);
forceStorm(b);

let flashSeen = false;
let ticksToFirstFlash = null;
for (let tick = 0; tick < 400; tick += 1) {
  advanceWorldTick(a, {});
  advanceWorldTick(b, {});
  if (!flashSeen && a.weather.lightningFlash !== null) {
    flashSeen = true;
    ticksToFirstFlash = tick;
    assert.notEqual(a.weather.boltX, null, "a bolt position must accompany a flash");
    assert.notEqual(a.weather.boltY, null, "a bolt position must accompany a flash");
  }
}

assert.ok(flashSeen, "a storm must produce at least one lightning flash");
assert.ok(ticksToFirstFlash !== null && ticksToFirstFlash <= 10, "first flash should fire within the seeded cooldown");
// Two identically-seeded, identically-forced storms evolve identically.
assert.equal(JSON.stringify(a.weather), JSON.stringify(b.weather));
assert.equal(checksum(a), checksum(b));
});

test("rain spawns water droplets into the top row as a gameplay effect", () => {
const world = createDefaultWorldState("rain_room");
world.weather.kind = "rain";
world.weather.episodeElapsed = 0;
world.weather.episodeDuration = 1_000_000;
world.weather.wind = 0;
world.weather.rainAccumulator = 0;

let sawWater = false;
for (let tick = 0; tick < 200 && !sawWater; tick += 1) {
  advanceWorldTick(world, {});
  // Droplets spawn in the top row but settle downward within the same tick's
  // material step, so scan the whole grid for water.
  for (let y = 0; y < world.grid.height && !sawWater; y += 1) {
    for (let x = 0; x < world.grid.width; x += 1) {
      if (world.grid.get(x, y) === MaterialId.Water) {
        sawWater = true;
        break;
      }
    }
  }
}

assert.ok(sawWater, "rain must place water into the world grid");
});
