/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { attachCharacterInput, getCharacterInputState, setKeyboardControl, setPointerControl, setTouchControl } from "./character";
import { consumeBufferedInputs, createInputEdgeBuffer, type InputEdgeBuffer } from "./input-buffer";

function resetInputs(buffer: InputEdgeBuffer): void {
  setKeyboardControl("jump", false);
  setKeyboardControl("mine", false);
  setTouchControl("jump", false);
  setTouchControl("mine", false);
  setPointerControl("mine", false);
  consumeBufferedInputs(buffer);
}

describe("character input aggregation", () => {
  let buffer: InputEdgeBuffer;

  beforeEach(() => {
    buffer = createInputEdgeBuffer();
    attachCharacterInput(buffer);
    resetInputs(buffer);
  });

  it("keeps jump true while one mixed-source release leaves the other held", () => {
    setKeyboardControl("jump", true);
    setTouchControl("jump", true);
    setTouchControl("jump", false);

    expect(getCharacterInputState().jump).toBe(true);

    setKeyboardControl("jump", false);
    expect(getCharacterInputState().jump).toBe(false);
  });

  it("keeps jump true when the source order is reversed", () => {
    setTouchControl("jump", true);
    setKeyboardControl("jump", true);
    setKeyboardControl("jump", false);

    expect(getCharacterInputState().jump).toBe(true);

    setTouchControl("jump", false);
    expect(getCharacterInputState().jump).toBe(false);
  });

  it("emits exactly one consumed tick for a fast touch tap", () => {
    setTouchControl("jump", true);
    setTouchControl("jump", false);

    expect(consumeBufferedInputs(buffer).jumpHeld).toBe(true);
    expect(consumeBufferedInputs(buffer).jumpHeld).toBe(false);
  });

  it("keeps held touch jump true across multiple ticks", () => {
    setTouchControl("jump", true);

    expect(consumeBufferedInputs(buffer).jumpHeld).toBe(true);
    expect(consumeBufferedInputs(buffer).jumpHeld).toBe(true);
    expect(consumeBufferedInputs(buffer).jumpHeld).toBe(true);
  });

  it("keeps mine true while touch and pointer overlap and only releases when all sources are cleared", () => {
    setTouchControl("mine", true);
    setPointerControl("mine", true);
    setTouchControl("mine", false);

    expect(getCharacterInputState().mine).toBe(true);

    setPointerControl("mine", false);
    expect(getCharacterInputState().mine).toBe(false);
  });
});
