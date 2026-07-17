import { describe, expect, it } from "vitest";
import { Grid } from "./grid";
import { MaterialId } from "./materials";
import { step } from "./simulation";
import {
  applyRainDrop,
  LIGHTNING_FLASH_SECONDS,
  WeatherSystem,
  weatherWindDirection,
} from "./weather";

describe("weather system", () => {
  it("transitions after a deterministic episode duration", () => {
    const weather = new WeatherSystem({
      rng: () => 0,
      initialKind: "clear",
      episodeDuration: 45,
    });

    weather.update(44.99);
    expect(weather.snapshot.kind).toBe("clear");
    expect(weather.snapshot.episodeElapsed).toBeCloseTo(44.99);

    weather.update(0.01);
    expect(weather.snapshot.kind).toBe("rain");
    expect(weather.snapshot.episodeDuration).toBe(45);
    expect(weather.snapshot.episodeElapsed).toBe(0);
  });

  it("wets exposed soil before adding excess surface water", () => {
    const grid = new Grid(5, 6);
    grid.set(2, 4, MaterialId.Dirt, 0);

    expect(applyRainDrop(grid, () => 0.5, "rain")).toBe("moisture");
    expect(grid.getVx(2, 4)).toBe(3);
    expect(grid.get(2, 3)).toBe(MaterialId.Empty);

    grid.setVx(2, 4, 12);
    expect(applyRainDrop(grid, () => 0.5, "thunderstorm")).toBe("water");
    expect(grid.get(2, 3)).toBe(MaterialId.Water);
    expect(grid.getVx(2, 4)).toBe(12);
  });

  it("respects lightning cooldown and flash lifecycle", () => {
    const weather = new WeatherSystem({
      rng: () => 0,
      initialKind: "thunderstorm",
      episodeDuration: 120,
    });

    weather.update(5.999);
    expect(weather.snapshot.lightningFlashRemaining).toBe(0);

    weather.update(0.001);
    expect(weather.snapshot.lightningFlashRemaining).toBeCloseTo(LIGHTNING_FLASH_SECONDS);
    expect(weather.snapshot.lightningBoltX).toBeCloseTo(0.12);

    weather.update(LIGHTNING_FLASH_SECONDS + 0.001);
    expect(weather.snapshot.lightningFlashRemaining).toBe(0);
    expect(weather.snapshot.lightningCooldownRemaining).toBeGreaterThan(5);
  });

  it("biases loose materials without moving static structures", () => {
    expect(weatherWindDirection(MaterialId.Sand, 1, () => 0)).toBe(1);
    expect(weatherWindDirection(MaterialId.Water, -1, () => 0)).toBe(-1);
    expect(weatherWindDirection(MaterialId.Stone, 1, () => 0)).toBe(0);
    expect(weatherWindDirection(MaterialId.Wall, -1, () => 0)).toBe(0);

    const grid = new Grid(5, 5);
    grid.set(2, 1, MaterialId.Sand, 0);
    grid.set(2, 2, MaterialId.Stone, 0);
    grid.set(0, 2, MaterialId.Wall, 0);

    step(grid, 1);

    expect(grid.get(3, 2)).toBe(MaterialId.Sand);
    expect(grid.get(2, 2)).toBe(MaterialId.Stone);
    expect(grid.get(0, 2)).toBe(MaterialId.Wall);
  });

  it("keeps progression frozen across paused frames", () => {
    const weather = new WeatherSystem({
      rng: () => 0,
      initialKind: "clear",
      episodeDuration: 45,
    });
    const grid = new Grid(3, 3);
    const updateFrame = (paused: boolean, dt: number) => {
      if (!paused) weather.update(dt, grid);
    };

    updateFrame(true, 20);
    expect(weather.snapshot.episodeElapsed).toBe(0);
    expect(weather.snapshot.visualTime).toBe(0);

    updateFrame(false, 2);
    expect(weather.snapshot.episodeElapsed).toBe(2);
    expect(weather.snapshot.visualTime).toBe(2);
  });
});
