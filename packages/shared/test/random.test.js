import test from "node:test";
import assert from "node:assert/strict";
import { createGameplayRandomState, createStarterWorld, deserializeWorldState, nextBool, nextFloat, nextInt, nextUint32, serializeWorldState } from "../dist/index.js";

test("mulberry32 golden vector and strict validation", () => {
  const random = createGameplayRandomState(0);
  const vector = [nextUint32(random), nextUint32(random), nextUint32(random), nextUint32(random), nextUint32(random)];
  assert.deepEqual(vector, [1144304738, 1416247, 958946056, 627933444, 2007157716]);

  const float = nextFloat(random);
  assert.ok(float >= 0 && float <= 1);
  const int = nextInt(random, 100);
  assert.ok(int >= 0 && int < 100);
  const bool = nextBool(random, 0.5);
  assert.equal(typeof bool, "boolean");
  const zeroProb = createGameplayRandomState(0);
  assert.equal(nextBool(zeroProb, 0), false);
  const oneProb = createGameplayRandomState(0);
  assert.equal(nextBool(oneProb, 1), true);

  assert.throws(() => createGameplayRandomState(-1), /range/i);
  assert.throws(() => createGameplayRandomState(0x1_0000_0000), /range/i);
  assert.throws(() => nextInt(random, 0), /range/i);
  assert.throws(() => nextInt(random, 0x1_0000_0001), /range/i);
  assert.throws(() => nextBool(random, 1.1), /range/i);
  assert.throws(() => nextBool(random, Number.NaN), /finite/i);
});

test("starter worlds are deterministic per seed and round-trip through serialization", () => {
  const first = createStarterWorld({ roomId: "room_seed_test", seed: 12345 });
  const second = createStarterWorld({ roomId: "room_seed_test", seed: 12345 });
  const third = createStarterWorld({ roomId: "room_seed_test", seed: 12346 });

  const dtoA = serializeWorldState(first);
  const dtoB = serializeWorldState(second);
  const dtoC = serializeWorldState(third);

  assert.deepEqual(dtoA, dtoB);
  assert.notDeepEqual(dtoA.grid.shade, dtoC.grid.shade);
  assert.notEqual(dtoA.random.seed, dtoC.random.seed);
  assert.deepEqual(deserializeWorldState(dtoA).random, dtoA.random);
});
