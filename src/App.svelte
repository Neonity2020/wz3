<script lang="ts">
  import { onMount } from "svelte";
  import {
    BookOpen,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Edit3,
    FileText,
    FileUp,
    FolderOpen,
    Paperclip,
    Plus,
    RotateCcw,
    Save,
    Search,
    Sprout,
    Trash2,
    Unlink,
    X,
  } from "@lucide/svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { confirm as confirmDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
  import {
    DAILY_CARD_LIMIT,
    FOCUS_OPTIONS,
    createCardId,
    formatCardId,
    formatDateKey,
    getDateKey,
    parseTags,
    sortCardsNewestFirst,
    type CardFocus,
    type WisdomCard,
  } from "./lib/cards";
  import { loadPersistedCards, savePersistedCards } from "./lib/database";

  const todayKey = getDateKey();

  let cards: WisdomCard[] = [];
  let selectedDate = todayKey;
  let searchText = "";
  let editingId: string | null = null;
  let isEditorOpen = false;
  let isLoadingCards = true;
  let isSaving = false;
  let body = "";
  let context = "";
  let mdLink = "";
  let pdfLink = "";
  let parentId = "";
  let focus: CardFocus = "灵感";
  let tagText = "";
  let errorMessage = "";

  onMount(() => {
    void initializeCards();
  });

  $: todayCards = sortCardsNewestFirst(cards.filter((card) => card.dateKey === todayKey));
  $: selectedCards = sortCardsNewestFirst(cards.filter((card) => card.dateKey === selectedDate));
  $: visibleCards = selectedCards.filter(matchesSearch);
  $: selectedRemaining = Math.max(DAILY_CARD_LIMIT - selectedCards.length, 0);
  $: isSelectedDayAtLimit = selectedRemaining === 0 && !editingId;
  $: isAtLimit = isSelectedDayAtLimit;
  $: isFormDisabled = isAtLimit || isLoadingCards || isSaving;
  $: dateKeys = Array.from(new Set([todayKey, selectedDate, ...cards.map((card) => card.dateKey)])).sort((a, b) =>
    b.localeCompare(a),
  );
  $: todaySlotStates = Array.from({ length: DAILY_CARD_LIMIT }, (_, index) => index < todayCards.length);
  $: selectedSlotStates = Array.from({ length: DAILY_CARD_LIMIT }, (_, index) => index < selectedCards.length);
  $: dayWord = selectedDate === todayKey ? "今天" : formatDateKey(selectedDate);
  $: isNextDayDisabled = selectedDate >= todayKey;

  async function initializeCards() {
    try {
      cards = await loadPersistedCards();
    } catch {
      errorMessage = "读取本地数据库失败。";
    } finally {
      isLoadingCards = false;
    }
  }

  async function persist(nextCards: WisdomCard[]): Promise<boolean> {
    const previousCards = cards;
    cards = nextCards;
    isSaving = true;

    try {
      await savePersistedCards(nextCards);
      return true;
    } catch {
      cards = previousCards;
      errorMessage = "保存失败，请稍后再试。";
      return false;
    } finally {
      isSaving = false;
    }
  }

  async function handleSubmit() {
    if (isFormDisabled) {
      return;
    }

    errorMessage = "";
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      errorMessage = "正文要留下来。";
      return;
    }

    const now = new Date().toISOString();
    const tags = parseTags(tagText);
    const trimmedMdLink = mdLink.trim();
    const trimmedPdfLink = pdfLink.trim();

    if (editingId) {
      const saved = await persist(
        cards.map((card) =>
          card.id === editingId
            ? {
                ...card,
                body: trimmedBody,
                context: context.trim(),
                mdLink: trimmedMdLink,
                pdfLink: trimmedPdfLink,
                parentId,
                focus,
                tags,
                updatedAt: now,
              }
            : card,
        ),
      );
      if (saved) {
        resetForm();
      }
      return;
    }

    if (selectedCards.length >= DAILY_CARD_LIMIT) {
      errorMessage = `${dayWord}的三张已经写满。`;
      return;
    }

    const nextCard: WisdomCard = {
      id: createCardId(),
      dateKey: selectedDate,
      body: trimmedBody,
      context: context.trim(),
      mdLink: trimmedMdLink,
      pdfLink: trimmedPdfLink,
      parentId,
      focus,
      tags,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await persist([nextCard, ...cards]);
    if (saved) {
      resetForm();
    }
  }

  function editCard(card: WisdomCard) {
    editingId = card.id;
    body = card.body;
    context = card.context;
    mdLink = card.mdLink;
    pdfLink = card.pdfLink;
    parentId = card.parentId;
    focus = card.focus;
    tagText = card.tags.join(" ");
    errorMessage = "";
    isEditorOpen = true;
  }

  async function confirmCardDeletion(cardId: string) {
    const childCount = cards.filter((card) => card.parentId === cardId).length;
    const message = [
      "确定删除这张智慧卡吗？",
      childCount > 0 ? `它已有 ${childCount} 张新生卡片；这些卡片会保留源卡标记。` : "",
      "此操作无法撤销。",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      return await confirmDialog(message, {
        title: "删除智慧卡",
        kind: "warning",
        okLabel: "删除",
        cancelLabel: "取消",
      });
    } catch {
      return window.confirm(message);
    }
  }

  async function deleteCard(cardId: string) {
    const confirmed = await confirmCardDeletion(cardId);

    if (!confirmed) {
      return;
    }

    if (editingId === cardId) {
      resetForm();
    }

    await persist(cards.filter((card) => card.id !== cardId));
  }

  function resetForm() {
    editingId = null;
    isEditorOpen = false;
    body = "";
    context = "";
    mdLink = "";
    pdfLink = "";
    parentId = "";
    focus = "灵感";
    tagText = "";
    errorMessage = "";
  }

  function openNewCardEditor() {
    editingId = null;
    body = "";
    context = "";
    mdLink = "";
    pdfLink = "";
    parentId = "";
    focus = "灵感";
    tagText = "";
    errorMessage = "";
    isEditorOpen = true;
  }

  function openChildCardEditor(parentCard: WisdomCard) {
    if (isAtLimit) {
      errorMessage = `${dayWord}的三张已经写满。`;
      return;
    }

    editingId = null;
    body = "";
    context = `源卡 ${formatCardId(parentCard.id)}`;
    mdLink = "";
    pdfLink = "";
    parentId = parentCard.id;
    focus = parentCard.focus;
    tagText = parentCard.tags.join(" ");
    errorMessage = "";
    isEditorOpen = true;
  }

  function closeEditor() {
    if (isSaving) {
      return;
    }

    resetForm();
  }

  function selectDate(dateKey: string) {
    selectedDate = dateKey;
  }

  function goToPreviousDay() {
    selectedDate = shiftDateKey(selectedDate, -1);
  }

  function goToNextDay() {
    if (isNextDayDisabled) {
      return;
    }

    selectedDate = shiftDateKey(selectedDate, 1);
  }

  function matchesSearch(card: WisdomCard) {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [card.id, card.body, card.context, card.mdLink, card.pdfLink, card.parentId, card.focus, ...card.tags]
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  function findCard(cardId: string): WisdomCard | undefined {
    return cards.find((card) => card.id === cardId);
  }

  function viewParentCard(cardId: string) {
    const parentCard = findCard(cardId);
    if (!parentCard) {
      return;
    }

    selectedDate = parentCard.dateKey;
  }

  function getMarkdownLabel(link: string): string {
    return getFileLabel(link, "Markdown");
  }

  function getPdfLabel(link: string): string {
    return getFileLabel(link, "PDF");
  }

  function getFileLabel(link: string, fallbackLabel: string): string {
    const segments = link.trim().replace(/^file:\/\//, "").split(/[\\/]/);
    return segments.at(-1) || fallbackLabel;
  }

  function removeMarkdownLink() {
    mdLink = "";
  }

  function removePdfAttachment() {
    pdfLink = "";
  }

  async function chooseMarkdownFile() {
    errorMessage = "";

    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: "Markdown",
            extensions: ["md", "markdown", "mdown"],
          },
        ],
      });

      if (typeof selected === "string") {
        mdLink = selected;
      }
    } catch {
      errorMessage = "请在桌面应用中选择 Markdown 文件。";
    }
  }

  async function choosePdfFile() {
    errorMessage = "";

    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: "PDF",
            extensions: ["pdf"],
          },
        ],
      });

      if (typeof selected === "string") {
        pdfLink = selected;
      }
    } catch {
      errorMessage = "请在桌面应用中选择 PDF 文件。";
    }
  }

  async function openMarkdownFolder(link: string) {
    errorMessage = "";

    try {
      await invoke("open_markdown_folder", { link });
    } catch {
      errorMessage = "无法打开 Markdown 文件夹。";
    }
  }

  async function openPdfAttachment(link: string) {
    errorMessage = "";

    try {
      await invoke("open_pdf_attachment", { link });
    } catch {
      errorMessage = "无法打开 PDF 附件。";
    }
  }

  function handleModalBackdropClick(event: MouseEvent) {
    if (event.currentTarget === event.target) {
      closeEditor();
    }
  }

  function shiftDateKey(dateKey: string, dayOffset: number): string {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + dayOffset);

    return getDateKey(date);
  }
</script>

<main class="app-shell">
  <section class="topbar" aria-label="今日状态">
    <div class="brand-block">
      <div class="brand-mark" aria-hidden="true">
        <BookOpen size={22} strokeWidth={2.2} />
      </div>
      <div>
        <h1>三张智慧卡</h1>
        <p>{formatDateKey(todayKey)}</p>
      </div>
    </div>

    <div class="day-meter" aria-label={`今日已写 ${todayCards.length} 张`}>
      {#each todaySlotStates as filled, index}
        <span class:filled aria-label={`第 ${index + 1} 张`}></span>
      {/each}
      <strong>{todayCards.length}/{DAILY_CARD_LIMIT}</strong>
    </div>
  </section>

  <section class="workspace">
    <section class="cards-panel" aria-label="卡片列表">
      <div class="panel-toolbar">
        <div>
          <span class="eyebrow">{dayWord}</span>
          <h2>智慧卡</h2>
        </div>

        <div class="toolbar-actions">
          <label class="search-field">
            <Search size={17} aria-hidden="true" />
            <input bind:value={searchText} placeholder="搜索" autocomplete="off" />
          </label>

          <button
            type="button"
            class="new-card-button"
            disabled={isLoadingCards || isSaving || isAtLimit}
            on:click={openNewCardEditor}
          >
            <Plus size={18} />
            <span>{selectedDate === todayKey ? "今日写卡" : "写这日卡"}</span>
          </button>
        </div>
      </div>

      {#if errorMessage && !isEditorOpen}
        <p class="panel-message" role="alert">{errorMessage}</p>
      {/if}

      <div class="day-browser" aria-label="每日卡片翻看">
        <button type="button" on:click={goToPreviousDay}>
          <ChevronLeft size={17} aria-hidden="true" />
          <span>前一日</span>
        </button>

        <div class="selected-day-summary">
          <CalendarDays size={17} aria-hidden="true" />
          <strong>{selectedDate}</strong>
          <span>{selectedCards.length}/{DAILY_CARD_LIMIT}</span>
        </div>

        <button type="button" disabled={isNextDayDisabled} on:click={goToNextDay}>
          <span>后一日</span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>

      <div class="date-strip" aria-label="日期">
        {#each dateKeys as dateKey}
          <button class:active={selectedDate === dateKey} type="button" on:click={() => selectDate(dateKey)}>
            <CalendarDays size={15} aria-hidden="true" />
            <span>{dateKey === todayKey ? "今天" : dateKey.slice(5)}</span>
          </button>
        {/each}
      </div>

      <div class="slot-grid" aria-label={`${dayWord}卡片位置`}>
        {#each selectedSlotStates as filled, index}
          <div class:filled class="slot">
            {#if filled}
              <Check size={16} aria-hidden="true" />
              <span>第 {index + 1} 张</span>
            {:else}
              <span>空位 {index + 1}</span>
            {/if}
          </div>
        {/each}
      </div>

      <div class="cards-list">
        {#if isLoadingCards}
          <div class="empty-state">
            <RotateCcw size={24} aria-hidden="true" />
            <p>正在读取本地数据库。</p>
          </div>
        {:else if visibleCards.length}
          {#each visibleCards as card}
            <article class="wisdom-card">
              <header>
                <div class="card-identity">
                  <span>{card.focus}</span>
                  <code aria-label={`UUID ${card.id}`}>{formatCardId(card.id)}</code>
                </div>
                <time datetime={card.createdAt}>
                  {new Date(card.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </time>
              </header>

              <p class="card-body">{card.body}</p>

              {#if card.parentId || card.context || card.mdLink || card.pdfLink || card.tags.length}
                <footer>
                  <div class="card-meta">
                    {#if card.parentId}
                      <button
                        type="button"
                        class="source-link"
                        title="查看源卡"
                        aria-label="查看源卡"
                        on:click={() => viewParentCard(card.parentId)}
                      >
                        <Sprout size={14} aria-hidden="true" />
                        <span>源卡 {formatCardId(card.parentId)}</span>
                      </button>
                    {/if}

                    {#if card.context}
                      <small>{card.context}</small>
                    {/if}

                    {#if card.mdLink}
                      <button
                        type="button"
                        class="markdown-link"
                        title="打开 Markdown 所在文件夹"
                        aria-label="打开 Markdown 所在文件夹"
                        on:click={() => openMarkdownFolder(card.mdLink)}
                      >
                        <FileText size={14} aria-hidden="true" />
                        <span>{getMarkdownLabel(card.mdLink)}</span>
                      </button>
                    {/if}

                    {#if card.pdfLink}
                      <button
                        type="button"
                        class="pdf-link"
                        title="打开 PDF 附件"
                        aria-label="打开 PDF 附件"
                        on:click={() => openPdfAttachment(card.pdfLink)}
                      >
                        <Paperclip size={14} aria-hidden="true" />
                        <span>{getPdfLabel(card.pdfLink)}</span>
                      </button>
                    {/if}
                  </div>

                  {#if card.tags.length}
                    <div class="tags">
                      {#each card.tags as tag}
                        <span>{tag}</span>
                      {/each}
                    </div>
                  {/if}
                </footer>
              {/if}

              <div class="card-actions">
                <button
                  type="button"
                  title="新生卡片"
                  aria-label="新生卡片"
                  disabled={isSaving || isAtLimit}
                  on:click={() => openChildCardEditor(card)}
                >
                  <Sprout size={17} />
                </button>
                <button type="button" title="编辑" aria-label="编辑" disabled={isSaving} on:click={() => editCard(card)}>
                  <Edit3 size={17} />
                </button>
                <button
                  type="button"
                  title="删除"
                  aria-label="删除"
                  disabled={isSaving}
                  on:click={() => deleteCard(card.id)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          {/each}
        {:else}
          <div class="empty-state">
            <RotateCcw size={24} aria-hidden="true" />
            <p>{searchText ? "没有匹配的卡片。" : "这一天还没有卡片。"}</p>
          </div>
        {/if}
      </div>
    </section>
  </section>

  {#if isEditorOpen}
    <div class="modal-backdrop" role="presentation" on:click={handleModalBackdropClick}>
      <div class="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <form class="editor-form" on:submit|preventDefault={handleSubmit}>
          <div class="composer-head">
            <div>
              <span class="eyebrow">{editingId ? "修订" : parentId ? "新生" : "今日"}</span>
              <h2 id="editor-title">{editingId ? "打磨这张卡" : "写下一张卡"}</h2>
            </div>

            <button type="button" class="icon-button" title="关闭" aria-label="关闭" on:click={closeEditor}>
              <X size={18} />
            </button>
          </div>

          {#if parentId}
            <div class="source-callout">
              <Sprout size={16} aria-hidden="true" />
              <span>源卡 {formatCardId(parentId)}</span>
            </div>
          {/if}

          <fieldset class="focus-group" disabled={isFormDisabled}>
            <legend>类型</legend>
            <div class="segmented">
              {#each FOCUS_OPTIONS as option}
                <button
                  type="button"
                  class:active={focus === option}
                  aria-pressed={focus === option}
                  on:click={() => (focus = option)}
                >
                  {option}
                </button>
              {/each}
            </div>
          </fieldset>

          <label>
            <span>正文</span>
            <textarea
              bind:value={body}
              disabled={isFormDisabled}
              maxlength="700"
              placeholder="只写这张卡真正承载的想法"
            ></textarea>
          </label>

          <label>
            <span>触发点</span>
            <input
              bind:value={context}
              disabled={isFormDisabled}
              maxlength="90"
              placeholder="来自阅读、谈话、工作或独处"
              autocomplete="off"
            />
          </label>

          <div class="attachment-field">
            <span>Markdown 链接</span>
            <div class="attachment-picker-row">
              <button
                type="button"
                class="secondary-action"
                disabled={isFormDisabled}
                on:click={chooseMarkdownFile}
              >
                {#if mdLink}
                  <FileText size={17} />
                  <span>{getMarkdownLabel(mdLink)}</span>
                {:else}
                  <FolderOpen size={17} />
                  <span>选择 Markdown 文件</span>
                {/if}
              </button>

              {#if mdLink}
                <button
                  type="button"
                  class="icon-button"
                  title="移除 Markdown 链接"
                  aria-label="移除 Markdown 链接"
                  disabled={isFormDisabled}
                  on:click={removeMarkdownLink}
                >
                  <Unlink size={18} />
                </button>
              {/if}
            </div>
          </div>

          <div class="attachment-field">
            <span>PDF 附件</span>
            <div class="attachment-picker-row">
              <button type="button" class="secondary-action" disabled={isFormDisabled} on:click={choosePdfFile}>
                {#if pdfLink}
                  <Paperclip size={17} />
                  <span>{getPdfLabel(pdfLink)}</span>
                {:else}
                  <FileUp size={17} />
                  <span>选择 PDF 文件</span>
                {/if}
              </button>

              {#if pdfLink}
                <button
                  type="button"
                  class="icon-button"
                  title="移除 PDF 附件"
                  aria-label="移除 PDF 附件"
                  disabled={isFormDisabled}
                  on:click={removePdfAttachment}
                >
                  <Unlink size={18} />
                </button>
              {/if}
            </div>
          </div>

          <label>
            <span>标签</span>
            <input
              bind:value={tagText}
              disabled={isFormDisabled}
              maxlength="60"
              placeholder="成长 决策 创作"
              autocomplete="off"
            />
          </label>

          {#if errorMessage}
            <p class="form-message" role="alert">{errorMessage}</p>
          {:else if isAtLimit}
            <p class="form-message muted">{dayWord}的三个位置已经用完。</p>
          {:else if isLoadingCards}
            <p class="form-message muted">正在读取本地数据库。</p>
          {/if}

          <button class="primary-action" type="submit" disabled={isFormDisabled}>
            {#if editingId}
              <Save size={18} />
              {isSaving ? "保存中" : "保存"}
            {:else}
              <Plus size={18} />
              {isSaving ? "写入中" : "写入"}
            {/if}
          </button>
        </form>
      </div>
    </div>
  {/if}
</main>
