import { invoke } from "@tauri-apps/api/core";
import { clearLegacyCards, loadLegacyCards, saveLegacyCards, type WisdomCard } from "./cards";

export async function loadPersistedCards(): Promise<WisdomCard[]> {
  const legacyCards = loadLegacyCards();

  try {
    const databaseCards = await invoke<WisdomCard[]>("load_cards");

    if (databaseCards.length === 0 && legacyCards.length > 0) {
      await saveCardsToDatabase(legacyCards);
      clearLegacyCards();
      return legacyCards;
    }

    if (legacyCards.length > 0) {
      clearLegacyCards();
    }

    return databaseCards;
  } catch {
    if (isTauriRuntime()) {
      throw new Error("Failed to load cards from SQLite.");
    }

    return legacyCards;
  }
}

export async function savePersistedCards(cards: WisdomCard[]): Promise<void> {
  try {
    await saveCardsToDatabase(cards);
    clearLegacyCards();
  } catch {
    if (isTauriRuntime()) {
      throw new Error("Failed to save cards to SQLite.");
    }

    saveLegacyCards(cards);
  }
}

function saveCardsToDatabase(cards: WisdomCard[]): Promise<void> {
  return invoke("save_cards", { cards });
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
