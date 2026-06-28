<script lang="ts">
  import { ChevronRight, ChevronDown, Sprout } from "@lucide/svelte";
  import {
    buildCardTree,
    formatCardId,
    formatDateKey,
    type TreeNode,
    type WisdomCard,
  } from "./cards";

  export let cards: WisdomCard[] = [];
  export let onSelectCard: (card: WisdomCard) => void = () => {};
  export let onCreateChild: (card: WisdomCard) => void = () => {};

  let expandedIds: Set<string> = new Set();

  $: treeNodes = buildCardTree(cards);

  $: flatNodes = flattenNodes(treeNodes, expandedIds);

  interface FlatNode {
    card: WisdomCard;
    depth: number;
    hasChildren: boolean;
    isExpanded: boolean;
  }

  function flattenNodes(nodes: TreeNode[], expanded: Set<string>): FlatNode[] {
    const result: FlatNode[] = [];
    for (const node of nodes) {
      const nodeExpanded = expanded.has(node.card.id);
      result.push({
        card: node.card,
        depth: node.depth,
        hasChildren: node.children.length > 0,
        isExpanded: nodeExpanded,
      });
      if (nodeExpanded && node.children.length > 0) {
        result.push(...flattenNodes(node.children, expanded));
      }
    }
    return result;
  }

  function toggleExpand(cardId: string) {
    const next = new Set(expandedIds);
    if (next.has(cardId)) {
      next.delete(cardId);
    } else {
      next.add(cardId);
    }
    expandedIds = next;
  }

  function bodyPreview(text: string): string {
    const firstLine = text.split("\n")[0];
    return firstLine.length > 40 ? firstLine.slice(0, 40) + "…" : firstLine;
  }
</script>

<div class="tree-view">
  {#if flatNodes.length === 0}
    <div class="tree-empty">
      <p>暂无卡片。</p>
    </div>
  {:else}
    {#each flatNodes as node}
      <div class="tree-row" style="padding-left: {node.depth * 24}px">
        {#if node.hasChildren}
          <button
            type="button"
            class="tree-toggle"
            on:click={() => toggleExpand(node.card.id)}
            aria-label={node.isExpanded ? "折叠" : "展开"}
          >
            {#if node.isExpanded}
              <ChevronDown size={16} />
            {:else}
              <ChevronRight size={16} />
            {/if}
          </button>
        {:else}
          <span class="tree-toggle tree-toggle--spacer"></span>
        {/if}

        <button
          type="button"
          class="tree-card-summary"
          on:click={() => onSelectCard(node.card)}
        >
          <span class="tree-focus">{node.card.focus}</span>
          <span class="tree-body">{bodyPreview(node.card.body)}</span>
          <span class="tree-date">{formatDateKey(node.card.dateKey)}</span>
        </button>

        {#if node.card.parentId}
          <span class="tree-source" title="源卡 {formatCardId(node.card.parentId)}"
            >S</span
          >
        {/if}

        <button
          type="button"
          class="tree-child-btn"
          title="新生卡片"
          aria-label="新生卡片"
          on:click={() => onCreateChild(node.card)}
        >
          <Sprout size={14} />
        </button>
      </div>
    {/each}
  {/if}
</div>
