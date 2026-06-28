const LEGACY_STORAGE_KEY = "wisdom-cards:v1";

export type CardFocus = "灵感" | "判断" | "问题" | "原则";

export interface WisdomCard {
  id: string;
  dateKey: string;
  body: string;
  context: string;
  mdLink: string;
  pdfLink: string;
  parentId: string;
  focus: CardFocus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export const FOCUS_OPTIONS: CardFocus[] = ["灵感", "判断", "问题", "原则"];

type StoredWisdomCard = Omit<WisdomCard, "mdLink" | "pdfLink" | "parentId"> & {
  mdLink?: string;
  pdfLink?: string;
  parentId?: string;
  title?: string;
};

export function getDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function createCardId(): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if ("crypto" in globalThis && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatCardId(cardId: string): string {
  return cardId.slice(0, 8);
}

export function parseTags(rawTags: string): string[] {
  return rawTags
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export interface TreeNode {
  card: WisdomCard;
  children: TreeNode[];
  depth: number;
}

export function buildCardTree(cards: WisdomCard[]): TreeNode[] {
  const childMap = new Map<string, WisdomCard[]>();
  const cardMap = new Map<string, WisdomCard>();
  const parentIds = new Set<string>();

  for (const card of cards) {
    cardMap.set(card.id, card);
    parentIds.add(card.parentId);

    if (card.parentId) {
      const siblings = childMap.get(card.parentId);
      if (siblings) {
        siblings.push(card);
      } else {
        childMap.set(card.parentId, [card]);
      }
    }
  }

  function buildChildren(parentCardId: string, depth: number): TreeNode[] {
    const siblings = childMap.get(parentCardId);
    if (!siblings) return [];

    return siblings
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((card) => ({
        card,
        children: buildChildren(card.id, depth + 1),
        depth,
      }));
  }

  const roots: WisdomCard[] = [];
  const orphans: WisdomCard[] = [];

  for (const card of cards) {
    if (!card.parentId) {
      roots.push(card);
    } else if (!cardMap.has(card.parentId)) {
      orphans.push(card);
    }
  }

  const allRoots = [...roots, ...orphans].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return allRoots.map((card) => ({
    card,
    children: buildChildren(card.id, 1),
    depth: 0,
  }));
}

export function sortCardsNewestFirst(cards: WisdomCard[]): WisdomCard[] {
  return [...cards].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function loadLegacyCards(): WisdomCard[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isStoredWisdomCard).map(normalizeCard);
  } catch {
    return [];
  }
}

export function saveLegacyCards(cards: WisdomCard[]): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(cards));
}

export function clearLegacyCards(): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

function isStoredWisdomCard(value: unknown): value is StoredWisdomCard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredWisdomCard>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.dateKey === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.context === "string" &&
    (typeof candidate.mdLink === "string" || typeof candidate.mdLink === "undefined") &&
    (typeof candidate.pdfLink === "string" || typeof candidate.pdfLink === "undefined") &&
    (typeof candidate.parentId === "string" || typeof candidate.parentId === "undefined") &&
    typeof candidate.focus === "string" &&
    Array.isArray(candidate.tags) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function normalizeCard(card: StoredWisdomCard): WisdomCard {
  const legacyTitle = card.title?.trim();
  const body = legacyTitle ? `${legacyTitle}\n\n${card.body}` : card.body;

  return {
    id: card.id,
    dateKey: card.dateKey,
    body,
    context: card.context,
    mdLink: card.mdLink ?? "",
    pdfLink: card.pdfLink ?? "",
    parentId: card.parentId ?? "",
    focus: card.focus,
    tags: card.tags,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}
