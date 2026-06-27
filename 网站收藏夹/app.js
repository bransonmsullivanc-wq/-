(function () {
  "use strict";

  const STORAGE = {
    custom: "qiguang_custom_links_v1",
    overrides: "qiguang_link_overrides_v1",
    hidden: "qiguang_hidden_links_v1",
    categories: "qiguang_category_settings_v1",
    recent: "qiguang_recent_links_v1",
    visits: "qiguang_visit_log_v1",
    theme: "qiguang_theme_v1"
  };

  const COLORS = {
    violet: "#765cf2",
    blue: "#4f7fe8",
    cyan: "#32a8ba",
    green: "#45a97f",
    orange: "#e88b45",
    rose: "#e45f82",
    red: "#ec5361",
    ink: "#353641"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let customLinks = readJSON(STORAGE.custom, []);
  let linkOverrides = readObject(STORAGE.overrides, {});
  let hiddenDefaultIds = new Set(readJSON(STORAGE.hidden, []));
  let categorySettings = readObject(STORAGE.categories, { order: [], custom: [], meta: {} });
  let recentLinks = readJSON(STORAGE.recent, []);
  let visitLog = readJSON(STORAGE.visits, []);
  let editingId = null;
  let toastTimer;

  if (!Array.isArray(categorySettings.order)) categorySettings.order = [];
  if (!Array.isArray(categorySettings.custom)) categorySettings.custom = [];
  if (!categorySettings.meta || typeof categorySettings.meta !== "object") categorySettings.meta = {};

  function readJSON(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readObject(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      showToast("浏览器没有允许本地存储，请检查隐私设置");
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  function normalizeURL(value) {
    let url = String(value || "").trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("invalid protocol");
    return parsed.href;
  }

  function colorValue(color) {
    return COLORS[color] || COLORS.violet;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
    }
  }

  function faviconURL(url) {
    try {
      return `${new URL(url).origin}/favicon.ico`;
    } catch (_) {
      return "";
    }
  }

  function faviconFallbackURL(url) {
    try {
      return `https://icon.horse/icon/${encodeURIComponent(new URL(url).hostname)}`;
    } catch (_) {
      return "";
    }
  }

  function iconHTML(link) {
    const src = faviconURL(link.url);
    const secondary = faviconFallbackURL(link.url);
    const fallback = escapeHTML(link.icon || String(link.title || "?").slice(0, 1));
    return `<span class="site-icon" style="--card-color:${colorValue(link.color)}">
      <span class="fallback">${fallback}</span>
      ${src ? `<img src="${escapeHTML(src)}" data-favicon-fallback="${escapeHTML(secondary)}" alt="" loading="lazy">` : ""}
    </span>`;
  }

  function getLibrary() {
    const sectionMeta = new Map();
    const effectiveLinks = [];

    (window.LINK_LIBRARY || []).forEach((section) => {
      sectionMeta.set(section.category, section);
      (section.links || []).forEach((link, index) => {
        const id = `default-${section.category}-${index}`;
        if (hiddenDefaultIds.has(id)) return;
        effectiveLinks.push({
          ...link,
          ...(linkOverrides[id] || {}),
          id,
          category: linkOverrides[id]?.category || section.category,
          color: linkOverrides[id]?.color || link.color || section.color || "violet",
          custom: false
        });
      });
    });

    effectiveLinks.push(...customLinks.map((link) => ({ ...link, custom: true })));

    const library = [];
    effectiveLinks.forEach((link) => {
      let section = library.find((item) => item.category === link.category);
      if (!section) {
        const meta = sectionMeta.get(link.category) || categorySettings.meta[link.category];
        section = {
          category: link.category,
          icon: meta?.icon || link.sectionIcon || "◇",
          description: meta?.description || "你亲手整理的网络坐标",
          color: meta?.color || link.color || "violet",
          links: []
        };
        library.push(section);
      }
      section.links.push(link);
    });

    categorySettings.custom.forEach((category) => {
      if (!category || library.some((section) => section.category === category)) return;
      const meta = categorySettings.meta[category] || {};
      library.push({
        category,
        icon: meta.icon || "◇",
        description: meta.description || "等待你放入新的网络坐标",
        color: meta.color || "violet",
        links: []
      });
    });

    if (categorySettings.order.length) {
      const orderIndex = new Map(categorySettings.order.map((category, index) => [category, index]));
      library.sort((a, b) => (orderIndex.get(a.category) ?? 9999) - (orderIndex.get(b.category) ?? 9999));
    }
    return library;
  }

  function allLinks() {
    return getLibrary().flatMap((section) => section.links);
  }

  function favoriteCard(link) {
    return `<a class="favorite-card tracked-link" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer"
      data-id="${escapeHTML(link.id)}" style="--card-color:${colorValue(link.color)}" aria-label="打开 ${escapeHTML(link.title)}">
      <div class="favorite-top">
        ${iconHTML(link)}
        <i class="external-arrow" data-lucide="arrow-up-right" aria-hidden="true"></i>
      </div>
      <div>
        <h3>${escapeHTML(link.title)}</h3>
        <p>${escapeHTML(link.description || link.category)}</p>
      </div>
      ${link.custom ? '<span class="custom-badge" title="你添加的网站"></span>' : ""}
    </a>`;
  }

  function linkCard(link) {
    return `<a class="link-card tracked-link" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer"
      data-id="${escapeHTML(link.id)}" style="--card-color:${colorValue(link.color)}" aria-label="打开 ${escapeHTML(link.title)}">
      ${iconHTML(link)}
      <div class="link-info">
        <h3>${escapeHTML(link.title)}</h3>
        <p>${escapeHTML(link.description || link.url)}</p>
      </div>
      <i class="external-arrow" data-lucide="arrow-up-right" aria-hidden="true"></i>
      ${link.custom ? '<span class="custom-badge" title="你添加的网站"></span>' : ""}
    </a>`;
  }

  function render(query = "") {
    const library = getLibrary();
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const matches = (link, category) => !normalized || [link.title, link.description, category]
      .filter(Boolean)
      .some((text) => String(text).toLocaleLowerCase("zh-CN").includes(normalized));

    const filteredSections = library.map((section) => ({
      ...section,
      links: section.links.filter((link) => matches(link, section.category))
    })).filter((section) => normalized ? section.links.length : true);

    const favorites = filteredSections.flatMap((section) => section.links).filter((link) => link.pinned);
    $("#favoriteGrid").innerHTML = favorites.map(favoriteCard).join("");
    $("#favoritesSection").hidden = favorites.length === 0;

    $("#sectionsContainer").innerHTML = filteredSections.map((section, index) => `
      <section class="link-section" id="category-${slug(section.category)}" data-category="${escapeHTML(section.category)}">
        <div class="section-heading">
          <div>
            <span class="section-kicker">COLLECTION ${String(index + 1).padStart(2, "0")}</span>
            <h2>${escapeHTML(section.category)}</h2>
            <p>${escapeHTML(section.description || "")}</p>
          </div>
          <span class="section-link">${section.links.length} 个网站</span>
        </div>
        <div class="link-grid">${section.links.length ? section.links.map(linkCard).join("") : '<div class="category-empty">这个分类还是空的，可在“管理与备份”中把网站移动到这里</div>'}</div>
      </section>
    `).join("");

    const resultCount = filteredSections.reduce((sum, section) => sum + section.links.length, 0);
    $("#emptyState").hidden = resultCount > 0;
    $("#sectionsContainer").hidden = resultCount === 0;
    bindTrackedLinks();
    refreshIcons();
  }

  function renderNavigation() {
    const library = getLibrary();
    const total = library.reduce((sum, item) => sum + item.links.length, 0);
    $("#categoryNav").innerHTML = `
      <button class="nav-item active" type="button" data-scroll="top">
        <span class="nav-symbol" style="--nav-color:${COLORS.violet}">⌂</span>
        <span>全部网站</span><small>${total}</small>
      </button>
      ${library.map((section) => `
        <button class="nav-item" type="button" data-scroll="category-${slug(section.category)}">
          <span class="nav-symbol" style="--nav-color:${colorValue(section.color)}">${escapeHTML(section.icon || "◇")}</span>
          <span>${escapeHTML(section.category)}</span><small>${section.links.length}</small>
        </button>
      `).join("")}`;

    $$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.scroll === "top") {
          $(".main-content").scrollTop = 0;
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        } else {
          const target = document.getElementById(button.dataset.scroll);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        $$(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
      });
    });

    $("#categoryOptions").innerHTML = library
      .map((section) => `<option value="${escapeHTML(section.category)}"></option>`).join("");
  }

  function slug(value) {
    return encodeURIComponent(String(value)).replace(/%/g, "-");
  }

  function bindTrackedLinks() {
    $$(".tracked-link").forEach((anchor) => {
      anchor.addEventListener("click", () => {
        const link = allLinks().find((item) => item.id === anchor.dataset.id);
        if (link) trackVisit(link);
      });
    });
  }

  function trackVisit(link) {
    const now = Date.now();
    visitLog = [...visitLog.filter((time) => now - Number(time) < 30 * 86400000), now];
    recentLinks = [
      { id: link.id, title: link.title, url: link.url, category: link.category, icon: link.icon, color: link.color, time: now },
      ...recentLinks.filter((item) => item.url !== link.url)
    ].slice(0, 4);
    saveJSON(STORAGE.visits, visitLog);
    saveJSON(STORAGE.recent, recentLinks);
    renderStats();
    renderRecent();
  }

  function renderRecent() {
    const valid = recentLinks.filter((item) => item && item.url).slice(0, 4);
    $("#recentList").innerHTML = valid.length ? valid.map((link) => `
      <a class="recent-item" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">
        ${iconHTML(link)}
        <div><strong>${escapeHTML(link.title)}</strong><span>${relativeTime(link.time)} · ${escapeHTML(link.category || "未分类")}</span></div>
        <i data-lucide="chevron-right" aria-hidden="true"></i>
      </a>
    `).join("") : '<div class="recent-empty">这里还很安静。<br>打开一个网站后，它会出现在这里。</div>';

    $$(".recent-item", $("#recentList")).forEach((anchor, index) => {
      anchor.addEventListener("click", () => trackVisit(valid[index]));
    });
    refreshIcons();
  }

  function relativeTime(time) {
    const minutes = Math.max(0, Math.floor((Date.now() - Number(time || 0)) / 60000));
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  }

  function renderStats() {
    const library = getLibrary();
    const now = Date.now();
    visitLog = visitLog.filter((time) => now - Number(time) < 30 * 86400000);
    const weeklyVisits = visitLog.filter((time) => now - Number(time) < 7 * 86400000).length;
    $("#totalCount").textContent = String(library.reduce((sum, section) => sum + section.links.length, 0)).padStart(2, "0");
    $("#categoryCount").textContent = library.length;
    $("#visitCount").textContent = weeklyVisits;
    $("#customCount").textContent = customLinks.length;
  }

  function renderCustomList() {
    const links = allLinks();
    $("#customListCount").textContent = `${links.length} 个`;
    $("#customList").innerHTML = links.length ? links.map((link) => `
      <div class="custom-row">
        ${iconHTML(link)}
        <div>
          <strong>${escapeHTML(link.title)}<span class="origin-badge">${link.custom ? "我的" : "预置"}</span></strong>
          <small>${escapeHTML(link.category)} · ${escapeHTML(new URL(link.url).hostname)}</small>
        </div>
        <div class="row-actions">
          <button class="edit-button" type="button" data-edit-id="${escapeHTML(link.id)}" aria-label="编辑 ${escapeHTML(link.title)}" title="编辑与设计">
            <i data-lucide="pencil" aria-hidden="true"></i>
          </button>
          <button class="delete-button" type="button" data-delete-id="${escapeHTML(link.id)}" aria-label="删除 ${escapeHTML(link.title)}" title="删除">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `).join("") : '<div class="custom-empty">链接库还是空的<br>点击“添加网站”开始收藏</div>';

    $$("[data-edit-id]", $("#customList")).forEach((button) => {
      button.addEventListener("click", () => {
        const link = allLinks().find((item) => item.id === button.dataset.editId);
        if (!link) return;
        closeModal($("#manageModal"));
        openLinkForm(link);
      });
    });

    $$("[data-delete-id]", $("#customList")).forEach((button) => {
      button.addEventListener("click", () => {
        const link = allLinks().find((item) => item.id === button.dataset.deleteId);
        if (!link || !window.confirm(`确定删除“${link.title}”吗？`)) return;
        if (link.custom) {
          customLinks = customLinks.filter((item) => item.id !== link.id);
          saveJSON(STORAGE.custom, customLinks);
        } else {
          hiddenDefaultIds.add(link.id);
          saveJSON(STORAGE.hidden, Array.from(hiddenDefaultIds));
        }
        renderAll();
        renderCustomList();
        showToast("已从收藏中移除");
      });
    });
    refreshIcons();
  }

  function saveCategorySettings() {
    saveJSON(STORAGE.categories, categorySettings);
  }

  function renderCategoryManager() {
    const library = getLibrary();
    $("#categoryManageList").innerHTML = library.map((section, index) => `
      <div class="category-row" data-category-row="${escapeHTML(section.category)}">
        <span class="category-handle" style="--category-color:${colorValue(section.color)}">${escapeHTML(section.icon || "◇")}</span>
        <input class="category-name-input" type="text" maxlength="12" value="${escapeHTML(section.category)}" aria-label="分类名称 ${escapeHTML(section.category)}">
        <span class="category-count">${section.links.length} 个网站</span>
        <div class="category-row-actions">
          <button class="category-small-button" type="button" data-category-save="${escapeHTML(section.category)}" aria-label="保存分类名称 ${escapeHTML(section.category)}" title="保存名称"><i data-lucide="check" aria-hidden="true"></i></button>
          <button class="category-small-button" type="button" data-category-up="${escapeHTML(section.category)}" aria-label="上移 ${escapeHTML(section.category)}" title="上移" ${index === 0 ? "disabled" : ""}><i data-lucide="arrow-up" aria-hidden="true"></i></button>
          <button class="category-small-button" type="button" data-category-down="${escapeHTML(section.category)}" aria-label="下移 ${escapeHTML(section.category)}" title="下移" ${index === library.length - 1 ? "disabled" : ""}><i data-lucide="arrow-down" aria-hidden="true"></i></button>
          <button class="category-small-button danger" type="button" data-category-delete="${escapeHTML(section.category)}" aria-label="删除分类 ${escapeHTML(section.category)}" title="删除空分类"><i data-lucide="trash-2" aria-hidden="true"></i></button>
        </div>
      </div>
    `).join("");

    $$("[data-category-save]", $("#categoryManageList")).forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest(".category-row");
        renameCategory(button.dataset.categorySave, $(".category-name-input", row).value);
      });
    });
    $$(".category-name-input", $("#categoryManageList")).forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        $("[data-category-save]", input.closest(".category-row")).click();
      });
    });
    $$("[data-category-up]", $("#categoryManageList")).forEach((button) => button.addEventListener("click", () => moveCategory(button.dataset.categoryUp, -1)));
    $$("[data-category-down]", $("#categoryManageList")).forEach((button) => button.addEventListener("click", () => moveCategory(button.dataset.categoryDown, 1)));
    $$("[data-category-delete]", $("#categoryManageList")).forEach((button) => button.addEventListener("click", () => removeCategory(button.dataset.categoryDelete)));
    refreshIcons();
  }

  function addCategory(name) {
    const category = String(name || "").trim();
    if (!category) return;
    if (getLibrary().some((section) => section.category === category)) {
      showToast("已经有同名分类了");
      return;
    }
    const currentOrder = getLibrary().map((section) => section.category);
    categorySettings.custom.push(category);
    categorySettings.order = [...currentOrder, category];
    const colorKeys = ["violet", "blue", "cyan", "green", "orange", "rose"];
    categorySettings.meta[category] = {
      icon: "◇",
      color: colorKeys[categorySettings.custom.length % colorKeys.length],
      description: "你创建的自定义分类"
    };
    saveCategorySettings();
    renderAll();
    renderCategoryManager();
    showToast(`已创建分类「${category}」`);
  }

  function renameCategory(oldName, nextName) {
    const category = String(nextName || "").trim();
    if (!category || category === oldName) return;
    if (getLibrary().some((section) => section.category === category)) {
      showToast("已经有同名分类了");
      return;
    }

    const library = getLibrary();
    const section = library.find((item) => item.category === oldName);
    const affected = allLinks().filter((link) => link.category === oldName);
    customLinks = customLinks.map((link) => link.category === oldName ? { ...link, category } : link);
    affected.filter((link) => !link.custom).forEach((link) => {
      linkOverrides[link.id] = { ...(linkOverrides[link.id] || {}), category };
    });
    recentLinks = recentLinks.map((link) => link.category === oldName ? { ...link, category } : link);
    categorySettings.order = library.map((item) => item.category === oldName ? category : item.category);
    categorySettings.custom = categorySettings.custom.map((item) => item === oldName ? category : item);
    categorySettings.meta[category] = {
      icon: section?.icon || categorySettings.meta[oldName]?.icon || "◇",
      color: section?.color || categorySettings.meta[oldName]?.color || "violet",
      description: section?.description || categorySettings.meta[oldName]?.description || "自定义分类"
    };
    delete categorySettings.meta[oldName];

    saveJSON(STORAGE.custom, customLinks);
    saveJSON(STORAGE.overrides, linkOverrides);
    saveJSON(STORAGE.recent, recentLinks);
    saveCategorySettings();
    renderAll();
    renderCategoryManager();
    showToast(`分类已改名为「${category}」`);
  }

  function moveCategory(category, direction) {
    const order = getLibrary().map((section) => section.category);
    const index = order.indexOf(category);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    categorySettings.order = order;
    saveCategorySettings();
    renderAll();
    renderCategoryManager();
  }

  function removeCategory(category) {
    const section = getLibrary().find((item) => item.category === category);
    if (!section) return;
    if (section.links.length) {
      showToast(`请先把该分类中的 ${section.links.length} 个网站移动到其他分类`);
      return;
    }
    if (!window.confirm(`确定删除空分类“${category}”吗？`)) return;
    categorySettings.custom = categorySettings.custom.filter((item) => item !== category);
    categorySettings.order = categorySettings.order.filter((item) => item !== category);
    delete categorySettings.meta[category];
    saveCategorySettings();
    renderAll();
    renderCategoryManager();
    showToast("空分类已删除");
  }

  function renderAll() {
    renderNavigation();
    render($("#searchInput").value);
    renderStats();
    renderRecent();
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function openModal(modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    window.setTimeout(() => $("input", modal)?.focus(), 80);
  }

  function closeModal(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (!$(".modal.open")) document.body.style.overflow = "";
  }

  function initModals() {
    $$('[data-open-add]').forEach((button) => button.addEventListener("click", () => openLinkForm()));
    $$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".modal"))));
    $("#categoryManageButton").addEventListener("click", () => {
      renderCategoryManager();
      openModal($("#categoryModal"));
    });
    $("#categoryAddForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.categoryName;
      addCategory(input.value);
      input.value = "";
    });
    window.openQiguangManager = () => {
      renderCustomList();
      openModal($("#manageModal"));
    };
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") $$(".modal.open").forEach(closeModal);
    });
  }

  function openLinkForm(link = null) {
    const form = $("#addForm");
    form.reset();
    editingId = link?.id || null;
    form.elements.editingId.value = editingId || "";
    $("#formKicker").textContent = link ? "EDIT BOOKMARK" : "NEW BOOKMARK";
    $("#addModalTitle").textContent = link ? "修改网站与卡片" : "收藏一个新网站";
    $("#formSubmitText").textContent = link ? "保存修改" : "保存网站";

    if (link) {
      form.elements.title.value = link.title || "";
      form.elements.url.value = link.url || "";
      form.elements.category.value = link.category || "";
      form.elements.icon.value = link.icon || "";
      form.elements.description.value = link.description || "";
      form.elements.pinned.checked = Boolean(link.pinned);
      const color = COLORS[link.color] ? link.color : "violet";
      const colorInput = form.querySelector(`[name="color"][value="${color}"]`);
      if (colorInput) colorInput.checked = true;
    }
    updateFaviconPreview();
    openModal($("#addModal"));
  }

  function updateFaviconPreview() {
    const form = $("#addForm");
    const title = form.elements.title.value.trim() || "网站";
    const icon = form.elements.icon.value.trim() || title.slice(0, 1);
    const color = form.elements.color.value || "violet";
    let url = "";
    try { url = normalizeURL(form.elements.url.value); } catch (_) { /* 等待输入完整网址 */ }
    const preview = $("#faviconPreview");
    if (!url) {
      preview.textContent = icon;
      preview.style.color = colorValue(color);
      return;
    }
    preview.innerHTML = iconHTML({ title, icon, color, url });
  }

  function initForm() {
    const form = $("#addForm");
    [form.elements.url, form.elements.title, form.elements.icon].forEach((input) => {
      input.addEventListener("input", updateFaviconPreview);
      input.addEventListener("blur", updateFaviconPreview);
    });
    $$("[name=\"color\"]", form).forEach((input) => input.addEventListener("change", updateFaviconPreview));

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      let url;
      try {
        url = normalizeURL(data.get("url"));
      } catch (_) {
        showToast("网址格式不正确，请再检查一下");
        return;
      }
      const title = String(data.get("title") || "").trim();
      const category = String(data.get("category") || "").trim();
      const values = {
        title,
        url,
        category,
        description: String(data.get("description") || "").trim() || "我收藏的常用网站",
        icon: String(data.get("icon") || "").trim() || title.slice(0, 1),
        color: COLORS[data.get("color")] ? data.get("color") : "violet",
        pinned: data.get("pinned") === "on"
      };

      if (editingId) {
        const original = allLinks().find((item) => item.id === editingId);
        if (original?.custom) {
          customLinks = customLinks.map((item) => item.id === editingId ? { ...item, ...values } : item);
          saveJSON(STORAGE.custom, customLinks);
        } else if (original) {
          linkOverrides[editingId] = values;
          saveJSON(STORAGE.overrides, linkOverrides);
        }
      } else {
        customLinks.push({
          ...values,
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          custom: true,
          createdAt: Date.now()
        });
        saveJSON(STORAGE.custom, customLinks);
      }

      const wasEditing = Boolean(editingId);
      editingId = null;
      event.currentTarget.reset();
      closeModal($("#addModal"));
      renderAll();
      showToast(wasEditing ? `已保存「${title}」的修改` : `已收藏「${title}」`);
    });
  }

  function initBackup() {
    $("#exportButton").addEventListener("click", () => {
      const content = JSON.stringify({
        app: "栖光网址收藏夹",
        version: 2,
        exportedAt: new Date().toISOString(),
        links: customLinks,
        overrides: linkOverrides,
        hidden: Array.from(hiddenDefaultIds),
        categories: categorySettings
      }, null, 2);
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `栖光网址备份-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("备份文件已导出");
    });

    $("#importInput").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const source = Array.isArray(parsed) ? parsed : parsed.links;
        if (!Array.isArray(source)) throw new Error("invalid file");
        const imported = source.slice(0, 500).map((item, index) => ({
          id: `custom-${Date.now()}-${index}`,
          title: String(item.title || "未命名网站").slice(0, 24),
          url: normalizeURL(item.url),
          category: String(item.category || "我的收藏").slice(0, 12),
          description: String(item.description || "我收藏的常用网站").slice(0, 40),
          icon: String(item.icon || String(item.title || "网").slice(0, 1)).slice(0, 4),
          color: COLORS[item.color] ? item.color : "violet",
          pinned: Boolean(item.pinned),
          custom: true,
          createdAt: Date.now()
        }));
        const existingURLs = new Set(customLinks.map((item) => item.url));
        customLinks.push(...imported.filter((item) => !existingURLs.has(item.url)));
        if (parsed && typeof parsed.overrides === "object" && !Array.isArray(parsed.overrides)) {
          linkOverrides = { ...linkOverrides, ...parsed.overrides };
        }
        if (Array.isArray(parsed.hidden)) {
          hiddenDefaultIds = new Set([...hiddenDefaultIds, ...parsed.hidden]);
        }
        if (parsed && parsed.categories && typeof parsed.categories === "object") {
          categorySettings = {
            order: Array.isArray(parsed.categories.order) ? parsed.categories.order : categorySettings.order,
            custom: Array.isArray(parsed.categories.custom) ? parsed.categories.custom : categorySettings.custom,
            meta: parsed.categories.meta && typeof parsed.categories.meta === "object" ? parsed.categories.meta : categorySettings.meta
          };
        }
        saveJSON(STORAGE.custom, customLinks);
        saveJSON(STORAGE.overrides, linkOverrides);
        saveJSON(STORAGE.hidden, Array.from(hiddenDefaultIds));
        saveCategorySettings();
        renderAll();
        renderCustomList();
        showToast(`成功导入 ${imported.length} 个网站`);
      } catch (_) {
        showToast("这个备份文件无法识别");
      } finally {
        event.target.value = "";
      }
    });
  }

  function initTheme() {
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const saved = localStorage.getItem(STORAGE.theme) || preferred;
    applyTheme(saved);
    $("#themeButton").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(STORAGE.theme, next);
    });
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#111218" : "#f4f6fa";
    $("#themeButton").innerHTML = `<i data-lucide="${theme === "dark" ? "moon" : "sun"}" aria-hidden="true"></i>`;
    refreshIcons();
  }

  function updateClock() {
    const now = new Date();
    $("#clockTime").textContent = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    $("#clockDate").textContent = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(now);
    const hour = now.getHours();
    const greeting = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
    $("#greetingTitle").innerHTML = `${greeting}，<br><em>今天想去哪里？</em>`;
  }

  function initEvents() {
    let composing = false;
    const search = $("#searchInput");
    document.addEventListener("error", (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.dataset.faviconFallback) return;
      if (!image.dataset.faviconTried) {
        image.dataset.faviconTried = "true";
        image.src = image.dataset.faviconFallback;
      } else {
        image.remove();
      }
    }, true);
    search.addEventListener("compositionstart", () => { composing = true; });
    search.addEventListener("compositionend", () => { composing = false; render(search.value); });
    search.addEventListener("input", () => { if (!composing) render(search.value); });
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search.focus();
      }
    });
    $("#randomButton").addEventListener("click", () => {
      const links = allLinks();
      const link = links[Math.floor(Math.random() * links.length)];
      if (!link) return;
      trackVisit(link);
      window.open(link.url, "_blank", "noopener,noreferrer");
    });
    $("#clearRecentButton").addEventListener("click", () => {
      recentLinks = [];
      saveJSON(STORAGE.recent, recentLinks);
      renderRecent();
      showToast("最近访问已清空");
    });
  }

  function init() {
    initTheme();
    updateClock();
    window.setInterval(updateClock, 30000);
    renderAll();
    initModals();
    initForm();
    initBackup();
    initEvents();
    refreshIcons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
