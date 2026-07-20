import { createCommandId, createPlayerId, parseCommandId, parseObjectId, parsePlayerId, type CommandId, type ObjectId, type PlayerId } from "./ids.js";
import { cloneHotbar, type HotbarItem, type InventoryCounts } from "./inventory.js";
import { Grid } from "./grid.js";
import { MATERIALS, MaterialId } from "./materials.js";
import { harvestFlowerCluster } from "./harvest.js";
import type { PersistedPlayerInputState, PlayerState, WorldState } from "./world-state.js";

export type GameplayCommandType =
  | "set_input_state"
  | "mine_start"
  | "mine_stop"
  | "select_slot"
  | "place"
  | "harvest"
  | "cycle_faucet"
  | "pause_world"
  | "resume_world";

export interface SetInputStateCommand {
  type: "set_input_state";
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  crouchHeld: boolean;
  lookUpHeld: boolean;
}

export interface MineCommand {
  type: "mine_start" | "mine_stop";
}

export interface SelectSlotCommand {
  type: "select_slot";
  slot: number;
  expectedInventoryRevision: number;
}

export interface PlaceCommand {
  type: "place";
  x: number;
  y: number;
  brushRadius: number;
  expectedInventoryRevision: number;
  expectedAnchorRevision: number;
}

export interface HarvestCommand {
  type: "harvest";
  x: number;
  y: number;
  expectedTargetRevision: number;
}

export interface CycleFaucetCommand {
  type: "cycle_faucet";
  x: number;
  y: number;
  objectId: ObjectId;
  expectedTargetRevision: number;
}

export interface PauseWorldCommand {
  type: "pause_world";
  expectedWorldRevision: number;
}

export interface ResumeWorldCommand {
  type: "resume_world";
  expectedWorldRevision: number;
}

export type GameplayCommand =
  | SetInputStateCommand
  | MineCommand
  | SelectSlotCommand
  | PlaceCommand
  | HarvestCommand
  | CycleFaucetCommand
  | PauseWorldCommand
  | ResumeWorldCommand;

export interface CommandEnvelope {
  commandId: CommandId;
  actorId: PlayerId;
  actorSequence: number;
  issuedTick: number;
  command: GameplayCommand;
}

export type CommandResultCode =
  | "accepted"
  | "unknown_actor"
  | "paused"
  | "not_owner"
  | "already_state"
  | "future_tick"
  | "stale"
  | "conflict"
  | "slot"
  | "tool"
  | "revision"
  | "inventory"
  | "target"
  | "bounds"
  | "range"
  | "collision"
  | "footprint"
  | "work_limit"
  | "invalid_command";

export interface CommandReceipt {
  commandId: CommandId;
  actorId: PlayerId;
  actorSequence: number;
  authorityOrder: number | null;
  issuedTick: number;
  processedTick: number;
  commandType: GameplayCommandType;
  code: CommandResultCode;
  accepted: boolean;
  beforeWorldRevision: number;
  afterWorldRevision: number;
  beforeInventoryRevision: number;
  afterInventoryRevision: number;
  beforeTargetRevision: number;
  afterTargetRevision: number;
  acceptedEffect: string | null;
  fingerprint: string;
}

export interface CommandResult {
  kind: "accepted" | "rejected";
  code: CommandResultCode;
  command: GameplayCommand;
  actor: PlayerId;
  actorSequence: number;
  type: GameplayCommandType;
  authorityOrder: number | null;
  issuedTick: number;
  processedTick: number;
  beforeWorldRevision: number;
  afterWorldRevision: number;
  beforeInventoryRevision: number;
  afterInventoryRevision: number;
  beforeTargetRevision: number;
  afterTargetRevision: number;
  acceptedEffect: string | null;
}

export interface CommandGridWrite {
  x: number;
  y: number;
  id: MaterialId;
  shade: number;
  auxiliary: number;
  objectId: ObjectId | null;
}

export interface CommandPlayerPatch {
  id: PlayerId;
  input?: PersistedPlayerInputState;
  activeHotbarSlot?: number;
  inventory?: InventoryCounts;
  hotbar?: HotbarItem[];
  inventoryRevision?: number;
  pendingRefunds?: Record<string, number>;
}

export interface ValidatedCommandPlan {
  kind: "plan";
  envelope: CommandEnvelope;
  accepted: boolean;
  resultCode: CommandResultCode;
  authorityOrder: number | null;
  beforeWorldRevision: number;
  afterWorldRevision: number;
  beforeInventoryRevision: number;
  afterInventoryRevision: number;
  beforeTargetRevision: number;
  afterTargetRevision: number;
  acceptedEffect: string | null;
  playerPatch?: CommandPlayerPatch;
  gridWrites: CommandGridWrite[];
  paused?: boolean;
  worldRevisionDelta: number;
  inventoryRevisionDelta: number;
  targetRevisionDelta: number;
}

export interface CommandRejection {
  kind: "rejection";
  envelope: CommandEnvelope;
  code: CommandResultCode;
  admitted: boolean;
  authorityOrder: number | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be a safe integer`);
  }
  return value;
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean`);
  }
  return value;
}

function cloneInventoryCounts(inventory: InventoryCounts): InventoryCounts {
  const normalized: InventoryCounts = { flowers: inventory.flowers };
  for (const [key, amount] of Object.entries(inventory)) {
    if (key === "flowers") continue;
    normalized[key] = amount;
  }
  return normalized;
}

function clonePersistedInput(input: PersistedPlayerInputState): PersistedPlayerInputState {
  return {
    left: input.left,
    right: input.right,
    jumpHeld: input.jumpHeld,
    crouchHeld: input.crouchHeld,
    lookUpHeld: input.lookUpHeld,
    mineHeld: input.mineHeld,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sanitizeCommandFingerprint(command: GameplayCommand): string {
  return stableStringify(command);
}

function createRejection(envelope: CommandEnvelope, code: CommandResultCode, admitted = false, authorityOrder: number | null = null): CommandRejection {
  return { kind: "rejection", envelope, code, admitted, authorityOrder };
}

function createCommandResult(planOrRejection: ValidatedCommandPlan | CommandRejection, world: WorldState): CommandResult {
  if (planOrRejection.kind === "plan") {
    return {
      kind: "accepted",
      code: planOrRejection.resultCode,
      command: planOrRejection.envelope.command,
      actor: planOrRejection.envelope.actorId,
      actorSequence: planOrRejection.envelope.actorSequence,
      type: planOrRejection.envelope.command.type,
      authorityOrder: planOrRejection.authorityOrder,
      issuedTick: planOrRejection.envelope.issuedTick,
      processedTick: world.tick,
      beforeWorldRevision: planOrRejection.beforeWorldRevision,
      afterWorldRevision: planOrRejection.afterWorldRevision,
      beforeInventoryRevision: planOrRejection.beforeInventoryRevision,
      afterInventoryRevision: planOrRejection.afterInventoryRevision,
      beforeTargetRevision: planOrRejection.beforeTargetRevision,
      afterTargetRevision: planOrRejection.afterTargetRevision,
      acceptedEffect: planOrRejection.acceptedEffect,
    };
  }
  const actor = world.players[planOrRejection.envelope.actorId];
  return {
    kind: "rejected",
    code: planOrRejection.code,
    command: planOrRejection.envelope.command,
    actor: planOrRejection.envelope.actorId,
    actorSequence: planOrRejection.envelope.actorSequence,
    type: planOrRejection.envelope.command.type,
    authorityOrder: planOrRejection.authorityOrder,
    issuedTick: planOrRejection.envelope.issuedTick,
    processedTick: world.tick,
    beforeWorldRevision: world.worldRevision,
    afterWorldRevision: world.worldRevision,
    beforeInventoryRevision: actor?.inventoryRevision ?? 0,
    afterInventoryRevision: actor?.inventoryRevision ?? 0,
    beforeTargetRevision: world.worldRevision,
    afterTargetRevision: world.worldRevision,
    acceptedEffect: null,
  };
}

function getCommandFingerprint(envelope: CommandEnvelope): string {
  return sanitizeCommandFingerprint(envelope.command);
}

function createResultFromReceipt(receipt: CommandReceipt, envelope: CommandEnvelope): CommandResult {
  return {
    kind: receipt.accepted ? "accepted" : "rejected",
    code: receipt.code,
    command: envelope.command,
    actor: receipt.actorId,
    actorSequence: receipt.actorSequence,
    type: receipt.commandType,
    authorityOrder: receipt.authorityOrder,
    issuedTick: receipt.issuedTick,
    processedTick: receipt.processedTick,
    beforeWorldRevision: receipt.beforeWorldRevision,
    afterWorldRevision: receipt.afterWorldRevision,
    beforeInventoryRevision: receipt.beforeInventoryRevision,
    afterInventoryRevision: receipt.afterInventoryRevision,
    beforeTargetRevision: receipt.beforeTargetRevision,
    afterTargetRevision: receipt.afterTargetRevision,
    acceptedEffect: receipt.acceptedEffect,
  };
}

function findDuplicateReceipt(world: WorldState, envelope: CommandEnvelope): CommandReceipt | undefined {
  return world.commandLedger.recent.find((receipt) => receipt.actorId === envelope.actorId && receipt.actorSequence === envelope.actorSequence && receipt.commandId === envelope.commandId && receipt.fingerprint === sanitizeCommandFingerprint(envelope.command));
}

function findConflictingReceipt(world: WorldState, envelope: CommandEnvelope): CommandReceipt | undefined {
  return world.commandLedger.recent.find((receipt) => receipt.actorId === envelope.actorId && receipt.actorSequence === envelope.actorSequence && receipt.commandId !== envelope.commandId);
}

function recordReceipt(world: WorldState, envelope: CommandEnvelope, result: CommandResult, authorityOrder: number | null): void {
  const receipt: CommandReceipt = {
    commandId: envelope.commandId,
    actorId: envelope.actorId,
    actorSequence: envelope.actorSequence,
    authorityOrder,
    issuedTick: envelope.issuedTick,
    processedTick: world.tick,
    commandType: envelope.command.type,
    code: result.code,
    accepted: result.kind === "accepted",
    beforeWorldRevision: result.beforeWorldRevision,
    afterWorldRevision: result.afterWorldRevision,
    beforeInventoryRevision: result.beforeInventoryRevision,
    afterInventoryRevision: result.afterInventoryRevision,
    beforeTargetRevision: result.beforeTargetRevision,
    afterTargetRevision: result.afterTargetRevision,
    acceptedEffect: result.acceptedEffect,
    fingerprint: getCommandFingerprint(envelope),
  };
  world.commandLedger.recent.push(receipt);
  if (world.commandLedger.recent.length > 256) {
    world.commandLedger.recent.splice(0, world.commandLedger.recent.length - 256);
  }
}

function parseGameplayCommand(value: unknown): GameplayCommand | null {
  if (!isPlainObject(value)) return null;
  const type = value["type"];
  if (typeof type !== "string") return null;
  switch (type) {
    case "set_input_state": {
      return {
        type,
        left: assertBoolean(value["left"], "left"),
        right: assertBoolean(value["right"], "right"),
        jumpHeld: assertBoolean(value["jumpHeld"], "jumpHeld"),
        crouchHeld: assertBoolean(value["crouchHeld"], "crouchHeld"),
        lookUpHeld: assertBoolean(value["lookUpHeld"], "lookUpHeld"),
      };
    }
    case "mine_start":
    case "mine_stop":
      return { type };
    case "select_slot": {
      return {
        type,
        slot: assertSafeInteger(value["slot"], "slot"),
        expectedInventoryRevision: assertSafeInteger(value["expectedInventoryRevision"], "expectedInventoryRevision"),
      };
    }
    case "place": {
      return {
        type,
        x: assertSafeInteger(value["x"], "x"),
        y: assertSafeInteger(value["y"], "y"),
        brushRadius: assertSafeInteger(value["brushRadius"], "brushRadius"),
        expectedInventoryRevision: assertSafeInteger(value["expectedInventoryRevision"], "expectedInventoryRevision"),
        expectedAnchorRevision: assertSafeInteger(value["expectedAnchorRevision"], "expectedAnchorRevision"),
      };
    }
    case "harvest": {
      return {
        type,
        x: assertSafeInteger(value["x"], "x"),
        y: assertSafeInteger(value["y"], "y"),
        expectedTargetRevision: assertSafeInteger(value["expectedTargetRevision"], "expectedTargetRevision"),
      };
    }
    case "cycle_faucet": {
      return {
        type,
        x: assertSafeInteger(value["x"], "x"),
        y: assertSafeInteger(value["y"], "y"),
        objectId: parseObjectId(value["objectId"]),
        expectedTargetRevision: assertSafeInteger(value["expectedTargetRevision"], "expectedTargetRevision"),
      };
    }
    case "pause_world":
    case "resume_world": {
      return {
        type,
        expectedWorldRevision: assertSafeInteger(value["expectedWorldRevision"], "expectedWorldRevision"),
      };
    }
    default:
      return null;
  }
}

function parseEnvelope(value: unknown): CommandEnvelope | null {
  if (!isPlainObject(value)) return null;
  try {
    const commandId = parseCommandId(value["commandId"]);
    const actorId = parsePlayerId(value["actorId"]);
    const actorSequence = assertSafeInteger(value["actorSequence"], "actorSequence");
    const issuedTick = assertSafeInteger(value["issuedTick"], "issuedTick");
    const command = parseGameplayCommand(value["command"]);
    if (!command) return null;
    return { commandId, actorId, actorSequence, issuedTick, command };
  } catch {
    return null;
  }
}

function getTargetRevision(grid: Grid, x: number, y: number): number {
  const index = grid.index(x, y);
  return grid.cellRevisions[index] ?? 0;
}

function createPlan(envelope: CommandEnvelope, resultCode: CommandResultCode, accepted: boolean, beforeWorldRevision: number, afterWorldRevision: number, beforeInventoryRevision: number, afterInventoryRevision: number, beforeTargetRevision: number, afterTargetRevision: number, acceptedEffect: string | null, playerPatch?: CommandPlayerPatch, gridWrites: CommandGridWrite[] = [], paused?: boolean, worldRevisionDelta = 0, inventoryRevisionDelta = 0, targetRevisionDelta = 0): ValidatedCommandPlan {
  return {
    kind: "plan",
    envelope,
    accepted,
    resultCode,
    authorityOrder: null,
    beforeWorldRevision,
    afterWorldRevision,
    beforeInventoryRevision,
    afterInventoryRevision,
    beforeTargetRevision,
    afterTargetRevision,
    acceptedEffect,
    playerPatch,
    gridWrites,
    paused,
    worldRevisionDelta,
    inventoryRevisionDelta,
    targetRevisionDelta,
  };
}

function clonePlayerStateForPatch(player: PlayerState): CommandPlayerPatch {
  return {
    id: player.id,
    input: clonePersistedInput(player.input),
    activeHotbarSlot: player.activeHotbarSlot,
    inventory: cloneInventoryCounts(player.inventory),
    hotbar: cloneHotbar(player.hotbar),
    inventoryRevision: player.inventoryRevision,
    pendingRefunds: { ...(player.pendingRefunds ?? {}) },
  };
}

export function validateCommand(world: WorldState, envelopeInput: unknown): ValidatedCommandPlan | CommandRejection {
  const envelope = parseEnvelope(envelopeInput);
  if (!envelope) {
    return createRejection({ commandId: createCommandId("command_invalid"), actorId: createPlayerId("player_invalid"), actorSequence: 0, issuedTick: 0, command: { type: "set_input_state", left: false, right: false, jumpHeld: false, crouchHeld: false, lookUpHeld: false } }, "invalid_command", false);
  }

  const ledger = world.commandLedger;
  const actorHighWater = ledger.actorHighWater[envelope.actorId] ?? 0;
  const fingerprint = getCommandFingerprint(envelope);
  const existingReceipt = ledger.recent.find((receipt) => receipt.actorId === envelope.actorId && receipt.actorSequence === envelope.actorSequence && receipt.commandId === envelope.commandId && receipt.fingerprint === fingerprint);
  if (existingReceipt) {
    return createRejection(envelope, "accepted", false);
  }
  const conflictingReceipt = ledger.recent.find((receipt) => receipt.actorId === envelope.actorId && receipt.actorSequence === envelope.actorSequence && receipt.commandId !== envelope.commandId);
  if (conflictingReceipt) {
    return createRejection(envelope, "conflict", false);
  }
  if (envelope.actorSequence > actorHighWater + 1) {
    return createRejection(envelope, "future_tick", false);
  }
  if (envelope.actorSequence <= actorHighWater) {
    return createRejection(envelope, "stale", false);
  }
  if (envelope.issuedTick > world.tick + 1) {
    return createRejection(envelope, "future_tick", false);
  }

  const actor = world.players[envelope.actorId];
  if (!actor) {
    return createRejection(envelope, "unknown_actor", false);
  }

  if (world.paused && envelope.command.type !== "pause_world" && envelope.command.type !== "resume_world") {
    return createRejection(envelope, "paused", true);
  }

  const beforeWorldRevision = world.worldRevision;
  const beforeInventoryRevision = actor.inventoryRevision;
  const beforeTargetRevision = world.worldRevision;
  let playerPatch: CommandPlayerPatch | undefined;
  let gridWrites: CommandGridWrite[] = [];
  let paused: boolean | undefined;
  let worldRevisionDelta = 0;
  let inventoryRevisionDelta = 0;
  let targetRevisionDelta = 0;
  let acceptedEffect: string | null = null;
  let resultCode: CommandResultCode = "accepted";

  switch (envelope.command.type) {
    case "set_input_state": {
      playerPatch = clonePlayerStateForPatch(actor);
      playerPatch.input = {
        ...playerPatch.input!,
        left: envelope.command.left,
        right: envelope.command.right,
        jumpHeld: envelope.command.jumpHeld,
        crouchHeld: envelope.command.crouchHeld,
        lookUpHeld: envelope.command.lookUpHeld,
      };
      acceptedEffect = "input";
      break;
    }
    case "mine_start": {
      playerPatch = clonePlayerStateForPatch(actor);
      playerPatch.input = { ...playerPatch.input!, mineHeld: true };
      acceptedEffect = "input";
      break;
    }
    case "mine_stop": {
      playerPatch = clonePlayerStateForPatch(actor);
      playerPatch.input = { ...playerPatch.input!, mineHeld: false };
      acceptedEffect = "input";
      break;
    }
    case "select_slot": {
      if (envelope.command.slot < 0 || envelope.command.slot > 9) {
        resultCode = "slot";
        break;
      }
      if (envelope.command.expectedInventoryRevision !== actor.inventoryRevision) {
        resultCode = "revision";
        break;
      }
      playerPatch = clonePlayerStateForPatch(actor);
      playerPatch.activeHotbarSlot = envelope.command.slot;
      acceptedEffect = "hotbar";
      break;
    }
    case "place": {
      const slot = actor.activeHotbarSlot;
      const hotbarEntry = actor.hotbar[slot];
      if (hotbarEntry?.kind !== "material") {
        resultCode = "tool";
        break;
      }
      if (envelope.command.expectedInventoryRevision !== actor.inventoryRevision) {
        resultCode = "revision";
        break;
      }
      if (envelope.command.brushRadius < 1 || envelope.command.brushRadius > 16) {
        resultCode = "range";
        break;
      }
      const anchorIndex = world.grid.index(envelope.command.x, envelope.command.y);
      if (envelope.command.expectedAnchorRevision !== (world.grid.cellRevisions[anchorIndex] ?? 0)) {
        resultCode = "revision";
        break;
      }
      const candidates: Array<[number, number]> = [];
      for (let dy = -envelope.command.brushRadius; dy <= envelope.command.brushRadius; dy += 1) {
        for (let dx = -envelope.command.brushRadius; dx <= envelope.command.brushRadius; dx += 1) {
          if (dx * dx + dy * dy > envelope.command.brushRadius * envelope.command.brushRadius) continue;
          const px = envelope.command.x + dx;
          const py = envelope.command.y + dy;
          if (!world.grid.inBounds(px, py)) continue;
          if (world.grid.get(px, py) !== MaterialId.Empty) continue;
          candidates.push([px, py]);
        }
      }
      if (candidates.length === 0) {
        resultCode = "bounds";
        break;
      }
      if (hotbarEntry.count < candidates.length) {
        resultCode = "inventory";
        break;
      }
      const materialId = hotbarEntry.materialId;
      if (MATERIALS[materialId].placement.kind === "object") {
        for (const [px, py] of candidates) {
          const cellObjectId = world.grid.getObjectId(px, py);
          if (cellObjectId !== null) {
            resultCode = "collision";
            break;
          }
        }
        if (resultCode === "collision") break;
      }
      if (resultCode !== "accepted") break;
      gridWrites = candidates.map(([px, py]) => ({ x: px, y: py, id: materialId, shade: 0, auxiliary: 0, objectId: null }));
      playerPatch = clonePlayerStateForPatch(actor);
      playerPatch.hotbar = cloneHotbar(actor.hotbar);
      playerPatch.hotbar[slot] = { kind: "material", materialId: hotbarEntry.materialId, count: hotbarEntry.count - candidates.length };
      playerPatch.inventoryRevision = actor.inventoryRevision + 1;
      acceptedEffect = "inventory";
      inventoryRevisionDelta = 1;
      worldRevisionDelta = 1;
      break;
    }
    case "harvest": {
      const index = world.grid.index(envelope.command.x, envelope.command.y);
      if (envelope.command.expectedTargetRevision !== (world.grid.cellRevisions[index] ?? 0)) {
        resultCode = "revision";
        break;
      }
      const harvested = harvestFlowerCluster(world.grid, envelope.command.x, envelope.command.y);
      if (harvested <= 0) {
        resultCode = "target";
        break;
      }
      playerPatch = clonePlayerStateForPatch(actor);
      playerPatch.inventory = cloneInventoryCounts(actor.inventory);
      playerPatch.inventory.flowers = (playerPatch.inventory.flowers ?? 0) + harvested;
      playerPatch.inventoryRevision = actor.inventoryRevision + 1;
      acceptedEffect = "inventory";
      inventoryRevisionDelta = 1;
      worldRevisionDelta = 1;
      break;
    }
    case "cycle_faucet": {
      const cell = world.grid.get(envelope.command.x, envelope.command.y);
      if (cell !== MaterialId.Faucet) {
        resultCode = "target";
        break;
      }
      if (envelope.command.objectId !== world.grid.getObjectId(envelope.command.x, envelope.command.y)) {
        resultCode = "target";
        break;
      }
      const revision = getTargetRevision(world.grid, envelope.command.x, envelope.command.y);
      if (envelope.command.expectedTargetRevision !== revision) {
        resultCode = "revision";
        break;
      }
      const nextAux = (world.grid.getAuxiliaryValue(envelope.command.x, envelope.command.y) + 1) % 3;
      gridWrites = [{ x: envelope.command.x, y: envelope.command.y, id: MaterialId.Faucet, shade: world.grid.shade[world.grid.index(envelope.command.x, envelope.command.y)] ?? 0, auxiliary: nextAux, objectId: world.grid.getObjectId(envelope.command.x, envelope.command.y) }];
      acceptedEffect = "target";
      worldRevisionDelta = 1;
      break;
    }
    case "pause_world": {
      if (world.ownerPlayerId !== null && world.ownerPlayerId !== envelope.actorId) {
        resultCode = "not_owner";
        break;
      }
      if (world.paused) {
        resultCode = "already_state";
        break;
      }
      if (envelope.command.expectedWorldRevision !== world.worldRevision) {
        resultCode = "revision";
        break;
      }
      paused = true;
      acceptedEffect = "pause";
      worldRevisionDelta = 1;
      break;
    }
    case "resume_world": {
      if (world.ownerPlayerId !== null && world.ownerPlayerId !== envelope.actorId) {
        resultCode = "not_owner";
        break;
      }
      if (!world.paused) {
        resultCode = "already_state";
        break;
      }
      if (envelope.command.expectedWorldRevision !== world.worldRevision) {
        resultCode = "revision";
        break;
      }
      paused = false;
      acceptedEffect = "resume";
      worldRevisionDelta = 1;
      break;
    }
    default:
      resultCode = "invalid_command";
      break;
  }

  if (resultCode !== "accepted") {
    return createRejection(envelope, resultCode, true);
  }

  return createPlan(
    envelope,
    resultCode,
    true,
    beforeWorldRevision,
    beforeWorldRevision + worldRevisionDelta,
    beforeInventoryRevision,
    beforeInventoryRevision + inventoryRevisionDelta,
    beforeTargetRevision,
    beforeTargetRevision + targetRevisionDelta,
    acceptedEffect,
    playerPatch,
    gridWrites,
    paused,
    worldRevisionDelta,
    inventoryRevisionDelta,
    targetRevisionDelta,
  );
}

export function commitValidatedPlan(world: WorldState, plan: ValidatedCommandPlan): void {
  if (plan.playerPatch) {
    const player = world.players[plan.playerPatch.id];
    if (player) {
      if (plan.playerPatch.input) player.input = plan.playerPatch.input;
      if (plan.playerPatch.activeHotbarSlot !== undefined) player.activeHotbarSlot = plan.playerPatch.activeHotbarSlot;
      if (plan.playerPatch.inventory) player.inventory = plan.playerPatch.inventory;
      if (plan.playerPatch.hotbar) player.hotbar = plan.playerPatch.hotbar;
      if (plan.playerPatch.inventoryRevision !== undefined) player.inventoryRevision = plan.playerPatch.inventoryRevision;
      if (plan.playerPatch.pendingRefunds) player.pendingRefunds = plan.playerPatch.pendingRefunds;
    }
  }
  for (const write of plan.gridWrites) {
    world.grid.set(write.x, write.y, write.id, { shade: write.shade, objectId: write.objectId });
  }
  if (plan.paused !== undefined) {
    world.paused = plan.paused;
  }
  world.worldRevision += plan.worldRevisionDelta;
}

export function processCommand(world: WorldState, envelopeInput: unknown): CommandResult {
  const envelope = parseEnvelope(envelopeInput);
  if (!envelope) {
    const rejection = createRejection({ commandId: createCommandId("command_invalid"), actorId: createPlayerId("player_invalid"), actorSequence: 0, issuedTick: 0, command: { type: "set_input_state", left: false, right: false, jumpHeld: false, crouchHeld: false, lookUpHeld: false } }, "invalid_command", false);
    const result = createCommandResult(rejection, world);
    recordReceipt(world, rejection.envelope, result, null);
    return result;
  }

  const duplicateReceipt = findDuplicateReceipt(world, envelope);
  if (duplicateReceipt) {
    return createResultFromReceipt(duplicateReceipt, envelope);
  }

  const conflictingReceipt = findConflictingReceipt(world, envelope);
  if (conflictingReceipt) {
    const rejection = createRejection(envelope, "conflict", false);
    const result = createCommandResult(rejection, world);
    recordReceipt(world, envelope, result, null);
    return result;
  }

  const validation = validateCommand(world, envelope);
  if (validation.kind === "rejection") {
    const authorityOrder = validation.admitted ? world.nextAuthorityOrder + 1 : null;
    if (authorityOrder !== null) {
      validation.authorityOrder = authorityOrder;
      world.nextAuthorityOrder = authorityOrder;
      world.commandLedger.actorHighWater[envelope.actorId] = envelope.actorSequence;
    }
    const result = createCommandResult(validation, world);
    recordReceipt(world, envelope, result, authorityOrder);
    return result;
  }

  const authorityOrder = world.nextAuthorityOrder + 1;
  validation.authorityOrder = authorityOrder;
  world.nextAuthorityOrder = authorityOrder;
  world.commandLedger.actorHighWater[envelope.actorId] = envelope.actorSequence;
  const result = createCommandResult(validation, world);
  commitValidatedPlan(world, validation);
  recordReceipt(world, validation.envelope, result, authorityOrder);
  return result;
}

export function processPendingCommands(world: WorldState, inbox: Array<unknown> = world.commandInbox as Array<unknown>): CommandResult[] {
  const results: CommandResult[] = [];
  for (const envelope of inbox) {
    results.push(processCommand(world, envelope));
  }
  if (world.commandInbox === inbox) {
    world.commandInbox = [];
  }
  return results;
}

export function createCommandEnvelope(actorId: PlayerId, actorSequence: number, issuedTick: number, command: GameplayCommand): CommandEnvelope {
  return {
    commandId: parseCommandId(`command_${actorId}_${actorSequence}`),
    actorId,
    actorSequence,
    issuedTick,
    command,
  };
}

export function createCommandIdValue(actorId: PlayerId, actorSequence: number): CommandId {
  return createCommandId(`command_${actorId}_${actorSequence}`);
}

export function enqueueCommand(world: WorldState, envelope: CommandEnvelope): void {
  world.commandInbox = [...(world.commandInbox ?? []), envelope];
}

export function advanceSimulationTick(world: WorldState, inputs: Readonly<Record<string, PlayerInputState>> = {}): boolean {
  if (world.paused) return false;
  const playerIds = Object.keys(world.players).sort((left, right) => left < right ? -1 : left > right ? 1 : 0) as PlayerId[];
  for (const playerId of playerIds) {
    const player = world.players[playerId];
    if (!player) continue;
    const input = inputs?.[playerId] ?? player.input;
    if (input) {
      player.input.left = Boolean(input.left);
      player.input.right = Boolean(input.right);
      player.input.jumpHeld = Boolean(input.jumpHeld);
      player.input.crouchHeld = Boolean(input.crouchHeld);
      player.input.lookUpHeld = Boolean(input.lookUpHeld);
      player.input.mineHeld = Boolean(input.mineHeld);
    }
  }
  world.tick += 1;
  return true;
}

interface PlayerInputState {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  crouchHeld: boolean;
  lookUpHeld: boolean;
  mineHeld: boolean;
}
