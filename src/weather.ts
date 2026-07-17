import { Grid } from "./grid";
import { MaterialId } from "./materials";

export type WeatherKind = "clear" | "rain" | "wind" | "thunderstorm";
export type RandomSource = () => number;

export const WEATHER_EPISODE_MIN_SECONDS = 45;
export const WEATHER_EPISODE_MAX_SECONDS = 120;
export const LIGHTNING_COOLDOWN_MIN_SECONDS = 6;
export const LIGHTNING_COOLDOWN_MAX_SECONDS = 12;
export const LIGHTNING_FLASH_SECONDS = 0.12;

const DIRT_MAX_MOISTURE = 12;
const WEATHER_KINDS: readonly WeatherKind[] = ["clear", "rain", "wind", "thunderstorm"];
const TIME_EPSILON = 1e-9;

export interface WeatherSnapshot {
  kind: WeatherKind;
  episodeElapsed: number;
  episodeDuration: number;
  wind: number;
  visualTime: number;
  lightningFlashRemaining: number;
  lightningCooldownRemaining: number;
  lightningBoltX: number;
  lightningBoltSeed: number;
}

export interface WeatherSystemOptions {
  rng?: RandomSource;
  initialKind?: WeatherKind;
  episodeDuration?: number;
}

export type RainEffect = "moisture" | "water" | "none";

function randomBetween(rng: RandomSource, min: number, max: number): number {
  return min + Math.min(0.999999999, Math.max(0, rng())) * (max - min);
}

function windFor(kind: WeatherKind, rng: RandomSource): number {
  if (kind === "clear") return 0;
  const direction = rng() < 0.5 ? -1 : 1;
  const [min, max] =
    kind === "rain" ? [0.08, 0.24] :
    kind === "wind" ? [0.42, 0.82] :
    [0.65, 0.98];
  return direction * randomBetween(rng, min, max);
}

export function isWindAffectedMaterial(id: MaterialId): boolean {
  return id === MaterialId.Water || id === MaterialId.Sand || id === MaterialId.Seed;
}

/**
 * Returns a weather-driven direction, or zero when normal simulation behavior
 * should decide. Static and grown materials are never eligible.
 */
export function weatherWindDirection(
  id: MaterialId,
  wind: number,
  rng: RandomSource = Math.random,
): -1 | 0 | 1 {
  if (!isWindAffectedMaterial(id) || Math.abs(wind) < 0.01) return 0;
  if (rng() >= Math.min(1, Math.abs(wind))) return 0;
  return wind < 0 ? -1 : 1;
}

export function chooseWindBiasedDirection(
  id: MaterialId,
  wind: number,
  rng: RandomSource = Math.random,
): -1 | 1 {
  const weatherDirection = weatherWindDirection(id, wind, rng);
  return weatherDirection || (rng() < 0.5 ? -1 : 1);
}

/**
 * Applies one gameplay rain sample to a sky-exposed column. Soil is moistened
 * directly when possible; otherwise a single water cell is placed above the
 * first obstruction.
 */
export function applyRainDrop(
  grid: Grid,
  rng: RandomSource = Math.random,
  strength: "rain" | "thunderstorm" = "rain",
): RainEffect {
  if (grid.width <= 0 || grid.height <= 0) return "none";
  const x = Math.min(grid.width - 1, Math.floor(Math.max(0, rng()) * grid.width));
  let surfaceY = grid.height;

  for (let y = 0; y < grid.height; y++) {
    if (grid.get(x, y) !== MaterialId.Empty) {
      surfaceY = y;
      break;
    }
  }

  if (surfaceY < grid.height) {
    const surface = grid.get(x, surfaceY);
    if (surface === MaterialId.Dirt) {
      const gain = strength === "thunderstorm" ? 6 : 3;
      const moisture = grid.getVx(x, surfaceY);
      const nextMoisture = Math.min(DIRT_MAX_MOISTURE, moisture + gain);
      if (nextMoisture > moisture) {
        grid.setVx(x, surfaceY, nextMoisture);
        return "moisture";
      }
    }

    if (surface === MaterialId.Grass) {
      for (let y = surfaceY + 1; y < Math.min(grid.height, surfaceY + 5); y++) {
        if (grid.get(x, y) === MaterialId.Dirt) {
          const gain = strength === "thunderstorm" ? 6 : 3;
          const moisture = grid.getVx(x, y);
          const nextMoisture = Math.min(DIRT_MAX_MOISTURE, moisture + gain);
          if (nextMoisture > moisture) {
            grid.setVx(x, y, nextMoisture);
            return "moisture";
          }
          break;
        }
        if (grid.get(x, y) !== MaterialId.Grass) break;
      }
    }
  }

  const waterY = surfaceY === grid.height ? 0 : surfaceY - 1;
  if (waterY >= 0 && grid.get(x, waterY) === MaterialId.Empty) {
    grid.set(x, waterY, MaterialId.Water, 0);
    return "water";
  }
  return "none";
}

export class WeatherSystem {
  private readonly rng: RandomSource;
  private kindValue: WeatherKind;
  private episodeElapsedValue = 0;
  private episodeDurationValue: number;
  private windValue = 0;
  private visualTimeValue = 0;
  private rainAccumulator = 0;
  private lightningFlashRemainingValue = 0;
  private lightningCooldownRemainingValue = Infinity;
  private lightningBoltXValue = 0.5;
  private lightningBoltSeedValue = 0;

  constructor(options: WeatherSystemOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.kindValue = options.initialKind ?? "clear";
    this.episodeDurationValue = options.episodeDuration ?? this.randomEpisodeDuration();
    this.configureKind();
  }

  get snapshot(): WeatherSnapshot {
    return {
      kind: this.kindValue,
      episodeElapsed: this.episodeElapsedValue,
      episodeDuration: this.episodeDurationValue,
      wind: this.windValue,
      visualTime: this.visualTimeValue,
      lightningFlashRemaining: this.lightningFlashRemainingValue,
      lightningCooldownRemaining: this.lightningCooldownRemainingValue,
      lightningBoltX: this.lightningBoltXValue,
      lightningBoltSeed: this.lightningBoltSeedValue,
    };
  }

  setWeather(kind: WeatherKind, episodeDuration?: number): void {
    this.kindValue = kind;
    this.episodeElapsedValue = 0;
    this.episodeDurationValue = episodeDuration ?? this.randomEpisodeDuration();
    this.rainAccumulator = 0;
    this.configureKind();
  }

  update(dt: number, grid?: Grid): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = dt;

    while (remaining > 0) {
      const untilTransition = Math.max(0, this.episodeDurationValue - this.episodeElapsedValue);
      if (untilTransition === 0) {
        this.transition();
        continue;
      }

      const slice = Math.min(remaining, untilTransition);
      this.advanceCurrentWeather(slice, grid);
      this.episodeElapsedValue += slice;
      this.visualTimeValue += slice;
      remaining -= slice;
      if (remaining < TIME_EPSILON) remaining = 0;

      if (this.episodeDurationValue - this.episodeElapsedValue < TIME_EPSILON) {
        this.episodeElapsedValue = this.episodeDurationValue;
        this.transition();
      }
    }
  }

  private randomEpisodeDuration(): number {
    return randomBetween(
      this.rng,
      WEATHER_EPISODE_MIN_SECONDS,
      WEATHER_EPISODE_MAX_SECONDS,
    );
  }

  private configureKind(): void {
    this.windValue = windFor(this.kindValue, this.rng);
    this.lightningFlashRemainingValue = 0;
    if (this.kindValue === "thunderstorm") {
      this.lightningCooldownRemainingValue = randomBetween(
        this.rng,
        LIGHTNING_COOLDOWN_MIN_SECONDS,
        LIGHTNING_COOLDOWN_MAX_SECONDS,
      );
    } else {
      this.lightningCooldownRemainingValue = Infinity;
    }
  }

  private transition(): void {
    const candidates = WEATHER_KINDS.filter((kind) => kind !== this.kindValue);
    const index = Math.min(candidates.length - 1, Math.floor(Math.max(0, this.rng()) * candidates.length));
    this.setWeather(candidates[index]);
  }

  private advanceCurrentWeather(dt: number, grid?: Grid): void {
    if ((this.kindValue === "rain" || this.kindValue === "thunderstorm") && grid) {
      const samplesPerSecond = grid.width * (this.kindValue === "thunderstorm" ? 0.025 : 0.0125);
      this.rainAccumulator += dt * samplesPerSecond;
      while (this.rainAccumulator >= 1) {
        applyRainDrop(grid, this.rng, this.kindValue);
        this.rainAccumulator -= 1;
      }
    }

    if (this.kindValue === "thunderstorm") this.advanceLightning(dt);
  }

  private advanceLightning(dt: number): void {
    this.lightningFlashRemainingValue = Math.max(0, this.lightningFlashRemainingValue - dt);
    this.lightningCooldownRemainingValue -= dt;

    while (this.lightningCooldownRemainingValue <= TIME_EPSILON) {
      const overshoot = Math.max(0, -this.lightningCooldownRemainingValue);
      this.lightningBoltXValue = randomBetween(this.rng, 0.12, 0.88);
      this.lightningBoltSeedValue = this.rng();
      this.lightningFlashRemainingValue = Math.max(0, LIGHTNING_FLASH_SECONDS - overshoot);
      this.lightningCooldownRemainingValue =
        randomBetween(
          this.rng,
          LIGHTNING_COOLDOWN_MIN_SECONDS,
          LIGHTNING_COOLDOWN_MAX_SECONDS,
        ) - overshoot;
    }
  }
}

export const weather = new WeatherSystem();
