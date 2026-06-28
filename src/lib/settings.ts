import { invoke } from "@tauri-apps/api/core";

const LEGACY_SETTINGS_KEY = "wisdom-cards:settings:v1";

export type DefaultViewMode = "list" | "tree";
export type CardDensity = "comfortable" | "compact";

export interface AppSettings {
  defaultViewMode: DefaultViewMode;
  cardDensity: CardDensity;
  dailyCardLimit: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultViewMode: "list",
  cardDensity: "comfortable",
  dailyCardLimit: 3,
};

export const MIN_DAILY_CARD_LIMIT = 1;
export const MAX_DAILY_CARD_LIMIT = 9;

export async function loadPersistedSettings(): Promise<AppSettings> {
  const legacySettings = loadLegacySettings();

  try {
    const databaseSettings = await invoke<Partial<AppSettings>>("load_settings");
    const normalizedSettings = normalizeSettings(databaseSettings);

    if (legacySettings) {
      clearLegacySettings();
    }

    return normalizedSettings;
  } catch {
    if (isTauriRuntime()) {
      throw new Error("Failed to load settings from SQLite.");
    }

    return legacySettings ?? DEFAULT_SETTINGS;
  }
}

export async function savePersistedSettings(settings: AppSettings): Promise<void> {
  const normalizedSettings = normalizeSettings(settings);

  try {
    await invoke("save_settings", { settings: normalizedSettings });
    clearLegacySettings();
  } catch {
    if (isTauriRuntime()) {
      throw new Error("Failed to save settings to SQLite.");
    }

    saveLegacySettings(normalizedSettings);
  }
}

function loadLegacySettings(): AppSettings | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!stored) {
      return null;
    }

    return normalizeSettings(JSON.parse(stored));
  } catch {
    return null;
  }
}

function saveLegacySettings(settings: AppSettings): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify(settings));
}

function clearLegacySettings(): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.removeItem(LEGACY_SETTINGS_KEY);
}

function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_SETTINGS;
  }

  const candidate = value as Partial<AppSettings>;

  return {
    defaultViewMode: isDefaultViewMode(candidate.defaultViewMode)
      ? candidate.defaultViewMode
      : DEFAULT_SETTINGS.defaultViewMode,
    cardDensity: isCardDensity(candidate.cardDensity)
      ? candidate.cardDensity
      : DEFAULT_SETTINGS.cardDensity,
    dailyCardLimit: normalizeDailyCardLimit(candidate.dailyCardLimit),
  };
}

function isDefaultViewMode(value: unknown): value is DefaultViewMode {
  return value === "list" || value === "tree";
}

function isCardDensity(value: unknown): value is CardDensity {
  return value === "comfortable" || value === "compact";
}

function normalizeDailyCardLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.dailyCardLimit;
  }

  return Math.min(MAX_DAILY_CARD_LIMIT, Math.max(MIN_DAILY_CARD_LIMIT, Math.round(value)));
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
