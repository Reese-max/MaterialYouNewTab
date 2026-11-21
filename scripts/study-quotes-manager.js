/*
 * MYNT encouragement-line manager: add, edit, tag, hide and delete quotes, and choose
 * which categories the homepage line draws from. All rules live in study-quotes-core.js;
 * this file only renders and writes the validated record (myntStudyQuotesV1) locally.
 */
(function () {
    "use strict";
    const core = typeof MyntStudyQuotesCore !== "undefined" ? MyntStudyQuotesCore : null;
    if (!core || typeof document === "undefined") return;
    const BUILTIN_SOURCE = typeof MYNT_STUDY_QUOTES !== "undefined" ? MYNT_STUDY_QUOTES : [];
    const builtins = core.builtins(BUILTIN_SOURCE);
    const PAGE = 50;
    const lang = () => localStorage.getItem("selectedLanguage") || "zh_TW";
    const isZh = () => ["zh_TW", "zh"].includes(lang());
    const t = (key, fallback) => (typeof translations !== "undefined" && (translations[lang()]?.[key] || translations.en?.[key])) || fallback;
    const fill = (text, values) => Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, value), text);
    const searchKey = value => String(value || "").normalize("NFKC").toLocaleLowerCase();

    let dialog = null, opener = null;
    const ui = {};
    const view = { tab: "mine", query: "", tag: "", status: "all", limit: PAGE, selected: new Set() };
    let state = core.defaultState(), intact = true, baseline = null;
    let undoSnapshot = null, editing = null, editorDirty = false;

    // ----- Storage: validated writes with a freshness check against other tabs -----
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(core.KEY); } catch { raw = undefined; }
        ({ state, intact } = core.read(raw === undefined ? "\u0000" : raw));
        baseline = raw;
    }

    function notifyChanged() {
        document.dispatchEvent(new CustomEvent("mynt:study-quotes-changed"));
    }

    // Returns true when written. The previous record becomes the undo snapshot.
    function commit(next, message, options = {}) {
        if (!intact) { setStatus(t("studyQuotesUnreadable", "Saved encouragement lines could not be read and were left unchanged.")); return false; }
        let current;
        try { current = localStorage.getItem(core.KEY); } catch { current = undefined; }
        if (current !== baseline) {
            load(); render();
            setStatus(t("studyQuotesConflict", "Another tab changed your encouragement lines. The list was refreshed; please try again."));
            return false;
        }
        let text;
        try { text = core.serialize(next); }
        catch (error) { setStatus(errorText(error.code)); return false; }
        try { localStorage.setItem(core.KEY, text); }
        catch { setStatus(t("studyQuotesSaveFailed", "Could not save. Your existing lines were not changed.")); return false; }
        undoSnapshot = options.undoable === false ? null : { raw: baseline, message };
        baseline = text; state = next;
        if (options.render !== false) render();
        setStatus(message, Boolean(undoSnapshot));
        notifyChanged();
        return true;
    }

    function undo() {
        if (!undoSnapshot) return;
        const previous = core.read(undoSnapshot.raw).state;
        const snapshot = undoSnapshot;
        undoSnapshot = null;
        if (commit({ ...previous, revision: state.revision + 1 }, t("studyQuotesUndone", "Undone."), { undoable: false })) ui.status.focus?.();
        else undoSnapshot = snapshot;
    }

    function errorText(code) {
        const messages = {
            empty: t("studyQuotesErrorEmpty", "Enter the encouragement line."),
            tooLong: fill(t("studyQuotesErrorTooLong", "Keep it within {max} characters."), { max: core.LIMITS.text }),
            authorTooLong: fill(t("studyQuotesErrorAuthor", "Author is limited to {max} characters."), { max: core.LIMITS.author }),
            workTooLong: fill(t("studyQuotesErrorWork", "Source is limited to {max} characters."), { max: core.LIMITS.work }),
            tooManyTags: fill(t("studyQuotesErrorTags", "Use at most {max} tags."), { max: core.LIMITS.tags }),
            tagInvalid: fill(t("studyQuotesErrorTag", "Tags are up to {max} characters and cannot start with @ or contain commas."), { max: core.LIMITS.tag }),
            tooManyTagsOverall: fill(t("studyQuotesErrorTagTotal", "You can use at most {max} different tags."), { max: core.LIMITS.distinctTags }),
            duplicate: t("studyQuotesErrorDuplicate", "This line is already in your list."),
            unsafe: t("studyQuotesErrorUnsafe", "Remove control characters from the text."),
            tooMany: fill(t("studyQuotesErrorTooMany", "You can keep up to {max} lines."), { max: core.LIMITS.quotes }),
            tooLarge: t("studyQuotesErrorTooLarge", "Your list is too large to save. Delete some lines first.")
        };
        return messages[code] || t("studyQuotesSaveFailed", "Could not save. Your existing lines were not changed.");
    }

    // ----- Small DOM helpers (text only; user content never becomes markup) -----
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function button(className, text, action, label) {
        const node = el("button", className, text);
        node.type = "button";
        if (label) node.setAttribute("aria-label", label);
        node.addEventListener("click", action);
        return node;
    }
    function setStatus(message, canUndo = false) {
        ui.status.textContent = message || "";
        ui.undo.hidden = !canUndo;
    }

    const categoryLabel = key => key === core.BUILTIN ? t("studyQuotesBuiltinCategory", "Built-in")
        : key === core.UNTAGGED ? t("studyQuotesUntagged", "Untagged") : "#" + key;
    const sourceText = quote => {
        const source = core.formatSource(quote);
        return source ? "— " + source : "";
    };
    const builtinView = quote => isZh() || !quote.en
        ? { text: quote.zh, author: quote.author || "", work: quote.work || "" }
        : { text: quote.en, author: quote.authorEn || quote.author || "", work: quote.workEn || "" };

    // ----- Build the dialog once -----
    function build() {
        dialog = el("dialog", "myntDialog studyQuotesDialog");
        dialog.id = "studyQuotesDialog";
        dialog.setAttribute("aria-labelledby", "studyQuotesTitle");
        const header = el("div", "sqHeader");
        ui.title = el("h2", "sqTitle"); ui.title.id = "studyQuotesTitle";
        ui.close = button("sqClose", "×", () => dialog.close());
        header.append(ui.title, ui.close);

        const body = el("div", "sqBody");
        // Homepage categories
        ui.show = el("section", "sqShow");
        ui.show.setAttribute("aria-labelledby", "studyQuotesShowTitle");
        ui.showTitle = el("h3", "sqSectionTitle"); ui.showTitle.id = "studyQuotesShowTitle";
        ui.showHint = el("p", "sqHint");
        ui.chips = el("div", "sqChips"); ui.chips.setAttribute("role", "group"); ui.chips.setAttribute("aria-labelledby", "studyQuotesShowTitle");
        ui.showWarning = el("p", "sqWarning"); ui.showWarning.hidden = true;
        ui.show.append(ui.showTitle, ui.showHint, ui.chips, ui.showWarning);

        // Tabs
        ui.tabs = el("div", "sqTabs"); ui.tabs.setAttribute("role", "tablist");
        ui.tabMine = button("sqTab", "", () => switchTab("mine"));
        ui.tabBuiltin = button("sqTab", "", () => switchTab("builtin"));
        for (const [tab, id] of [[ui.tabMine, "mine"], [ui.tabBuiltin, "builtin"]]) {
            tab.setAttribute("role", "tab"); tab.id = "studyQuotesTab-" + id; tab.setAttribute("aria-controls", "studyQuotesPanel");
            tab.addEventListener("keydown", event => {
                if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                event.preventDefault();
                switchTab(view.tab === "mine" ? "builtin" : "mine");
                (view.tab === "mine" ? ui.tabMine : ui.tabBuiltin).focus();
            });
        }
        ui.tabs.append(ui.tabMine, ui.tabBuiltin);

        ui.panel = el("div", "sqPanel"); ui.panel.id = "studyQuotesPanel"; ui.panel.setAttribute("role", "tabpanel");
        // Toolbar: search and filters
        const toolbar = el("div", "sqToolbar");
        ui.search = el("input", "sqSearch"); ui.search.type = "search"; ui.search.autocomplete = "off";
        ui.search.addEventListener("input", () => { view.query = ui.search.value; view.limit = PAGE; renderList(); });
        ui.tagFilter = el("select", "sqFilter");
        ui.tagFilter.addEventListener("change", () => { view.tag = ui.tagFilter.value; view.limit = PAGE; renderList(); });
        ui.statusFilter = el("select", "sqFilter");
        ui.statusFilter.addEventListener("change", () => { view.status = ui.statusFilter.value; view.limit = PAGE; renderList(); });
        toolbar.append(ui.search, ui.tagFilter, ui.statusFilter);

        // Actions
        ui.actions = el("div", "sqActions");
        ui.add = button("sqPrimary", "", () => openEditor(null));
        ui.restoreAll = button("sqSecondary", "", () => {
            if (!state.hiddenBuiltins.length) return;
            commit(core.setBuiltinHidden(state, [...state.hiddenBuiltins], false), t("studyQuotesRestoredAll", "All built-in lines are shown again."));
        });
        ui.actions.append(ui.add, ui.restoreAll);

        // Editor
        ui.editor = el("form", "sqEditor"); ui.editor.hidden = true; ui.editor.noValidate = true;
        ui.editorTitle = el("h3", "sqSectionTitle"); ui.editorTitle.id = "studyQuotesEditorTitle";
        ui.editor.setAttribute("aria-labelledby", "studyQuotesEditorTitle");
        const field = (labelKey, input) => { const label = el("label", "sqField"); label.append(el("span", "sqFieldLabel"), input); label.dataset.key = labelKey; return label; };
        ui.text = el("textarea", "sqInput"); ui.text.rows = 3; ui.text.maxLength = core.LIMITS.text * 2; ui.text.required = true;
        ui.counter = el("span", "sqCounter"); ui.counter.setAttribute("aria-live", "off");
        ui.author = el("input", "sqInput"); ui.author.maxLength = core.LIMITS.author * 2;
        ui.work = el("input", "sqInput"); ui.work.maxLength = core.LIMITS.work * 2;
        ui.tags = el("input", "sqInput"); ui.tags.setAttribute("list", "studyQuotesTagList");
        ui.tagList = el("datalist"); ui.tagList.id = "studyQuotesTagList";
        ui.enabled = el("input"); ui.enabled.type = "checkbox";
        const enabledLabel = el("label", "sqCheck"); ui.enabledText = el("span"); enabledLabel.append(ui.enabled, ui.enabledText);
        ui.editorError = el("p", "sqError"); ui.editorError.setAttribute("role", "alert");
        const editorButtons = el("div", "sqEditorButtons");
        ui.save = el("button", "sqPrimary"); ui.save.type = "submit";
        ui.cancel = button("sqSecondary", "", closeEditor);
        editorButtons.append(ui.cancel, ui.save);
        ui.fields = [field("studyQuotesFieldText", ui.text), field("studyQuotesFieldAuthor", ui.author), field("studyQuotesFieldWork", ui.work), field("studyQuotesFieldTags", ui.tags)];
        ui.fields[0].append(ui.counter);
        ui.editor.append(ui.editorTitle, ...ui.fields, ui.tagList, enabledLabel, ui.editorError, editorButtons);
        ui.editor.addEventListener("input", () => { editorDirty = true; updateCounter(); ui.editorError.textContent = ""; });
        ui.editor.addEventListener("submit", event => { event.preventDefault(); saveEditor(); });

        // Batch bar
        ui.batch = el("div", "sqBatch"); ui.batch.hidden = true; ui.batch.setAttribute("role", "toolbar");
        ui.batchCount = el("span", "sqBatchCount");
        ui.batchButtons = el("div", "sqBatchButtons");
        ui.batch.append(ui.batchCount, ui.batchButtons);

        // List
        ui.selectPage = el("input"); ui.selectPage.type = "checkbox";
        ui.selectPage.addEventListener("change", () => {
            for (const id of ui.visibleIds) { if (ui.selectPage.checked) view.selected.add(id); else view.selected.delete(id); }
            renderList();
        });
        ui.selectPageLabel = el("label", "sqSelectPage"); ui.selectPageText = el("span");
        ui.selectPageLabel.append(ui.selectPage, ui.selectPageText);
        ui.count = el("p", "sqCount");
        const listHeader = el("div", "sqListHeader"); listHeader.append(ui.selectPageLabel, ui.count);
        ui.list = el("ul", "sqList");
        ui.empty = el("p", "sqEmpty"); ui.empty.hidden = true;
        ui.more = button("sqSecondary sqMore", "", () => { view.limit += PAGE; renderList(); });
        ui.panel.append(toolbar, ui.actions, ui.editor, ui.batch, listHeader, ui.list, ui.empty, ui.more);

        body.append(ui.show, ui.tabs, ui.panel);
        const footer = el("div", "sqFooter");
        ui.status = el("p", "sqStatus"); ui.status.setAttribute("role", "status"); ui.status.setAttribute("aria-live", "polite"); ui.status.tabIndex = -1;
        ui.undo = button("sqSecondary sqUndo", "", undo); ui.undo.hidden = true;
        footer.append(ui.status, ui.undo);
        dialog.append(header, body, footer);
        document.body.appendChild(dialog);

        // Esc closes an open editor first so a draft is not lost by accident.
        dialog.addEventListener("cancel", event => {
            if (!ui.editor.hidden && editorDirty) { event.preventDefault(); closeEditor(); }
        });
        dialog.addEventListener("close", () => {
            closeEditor(false);
            if (opener?.isConnected) opener.focus();
            opener = null;
        });
        dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
        window.MyntStorageSync?.watch?.([core.KEY], () => { if (dialog.open && ui.editor.hidden) { load(); render(); } });
    }

    function localize() {
        ui.title.textContent = t("studyQuotesTitle", "Encouragement lines");
        ui.close.setAttribute("aria-label", t("menuCloseText", "Close"));
        ui.showTitle.textContent = t("studyQuotesShowTitle", "Show on the home page");
        ui.showHint.textContent = t("studyQuotesShowHint", "Choose which categories the bottom line draws from. A line with several tags shows if any of them is chosen.");
        ui.search.placeholder = t("studyQuotesSearch", "Search text, author, source or tag");
        ui.search.setAttribute("aria-label", t("studyQuotesSearch", "Search text, author, source or tag"));
        ui.tagFilter.setAttribute("aria-label", t("studyQuotesTagFilter", "Filter by tag"));
        ui.statusFilter.setAttribute("aria-label", t("studyQuotesStatusFilter", "Filter by status"));
        ui.add.textContent = "＋ " + t("studyQuotesAdd", "Add a line");
        ui.restoreAll.textContent = t("studyQuotesRestoreAll", "Show all built-in lines");
        const labels = { studyQuotesFieldText: "Encouragement line", studyQuotesFieldAuthor: "Author (optional)", studyQuotesFieldWork: "Source (optional)", studyQuotesFieldTags: "Tags (optional, separate with commas)" };
        for (const label of ui.fields) label.querySelector(".sqFieldLabel").textContent = t(label.dataset.key, labels[label.dataset.key]);
        ui.enabledText.textContent = t("studyQuotesFieldEnabled", "Show on the home page");
        ui.save.textContent = t("studyQuotesSave", "Save");
        ui.cancel.textContent = t("studyQuotesCancel", "Cancel");
        ui.selectPageText.textContent = t("studyQuotesSelectPage", "Select shown");
        ui.more.textContent = t("studyQuotesMore", "Show more");
        ui.undo.textContent = t("studyQuotesUndo", "Undo");
    }

    // ----- Rendering -----
    function render() {
        if (!dialog) return;
        renderShow();
        const mine = view.tab === "mine";
        ui.tabMine.textContent = fill(t("studyQuotesTabMine", "My lines ({count})"), { count: state.quotes.length });
        ui.tabBuiltin.textContent = fill(t("studyQuotesTabBuiltin", "Built-in ({count})"), { count: builtins.length });
        for (const [tab, active] of [[ui.tabMine, mine], [ui.tabBuiltin, !mine]]) { tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; }
        ui.panel.setAttribute("aria-labelledby", mine ? ui.tabMine.id : ui.tabBuiltin.id);
        ui.add.hidden = !mine; ui.add.disabled = !intact || state.quotes.length >= core.LIMITS.quotes;
        ui.restoreAll.hidden = mine; ui.restoreAll.disabled = !state.hiddenBuiltins.length || !intact;
        // Filters depend on the tab.
        const tags = core.categories(state).slice(2).map(item => item.key);
        ui.tagFilter.hidden = !mine;
        ui.tagFilter.replaceChildren(new Option(t("studyQuotesAllTags", "All tags"), ""), new Option(t("studyQuotesUntagged", "Untagged"), core.UNTAGGED), ...tags.map(tag => new Option("#" + tag, tag)));
        if (![...ui.tagFilter.options].some(option => option.value === view.tag)) view.tag = "";
        ui.tagFilter.value = view.tag;
        const statuses = mine
            ? [["all", t("studyQuotesStatusAll", "All")], ["on", t("studyQuotesStatusOn", "Shown")], ["off", t("studyQuotesStatusOff", "Turned off")]]
            : [["all", t("studyQuotesStatusAll", "All")], ["on", t("studyQuotesStatusOn", "Shown")], ["off", t("studyQuotesStatusHidden", "Hidden")]];
        ui.statusFilter.replaceChildren(...statuses.map(([value, label]) => new Option(label, value)));
        ui.statusFilter.value = view.status;
        ui.tagList.replaceChildren(...tags.map(tag => new Option(tag)));
        renderList();
        if (!intact) setStatus(t("studyQuotesUnreadable", "Saved encouragement lines could not be read and were left unchanged."));
    }

    function renderShow() {
        const visibleBuiltins = builtins.filter(quote => !state.hiddenBuiltins.includes(quote.id) && (isZh() || quote.en)).length;
        const categories = core.categories(state, visibleBuiltins);
        const all = state.show === null;
        const chip = (key, label, count, checked, onChange) => {
            const wrapper = el("label", "sqChip");
            const input = el("input"); input.type = "checkbox"; input.checked = checked; input.disabled = !intact;
            input.addEventListener("change", () => onChange(input.checked));
            wrapper.append(input, el("span", "", label), el("span", "sqChipCount", String(count)));
            wrapper.dataset.key = key;
            return wrapper;
        };
        const chips = [chip("*", t("studyQuotesShowAll", "All"), visibleBuiltins + state.quotes.filter(q => q.enabled).length, all, checked => {
            commit(core.setShow(state, checked ? null : []), t("studyQuotesShowSaved", "Home page categories updated."), { undoable: false });
        })];
        for (const { key, count } of categories) {
            const selected = all || state.show.includes(key);
            chips.push(chip(key, categoryLabel(key), count, selected, checked => {
                const current = all ? categories.map(item => item.key) : state.show;
                const next = checked ? [...new Set([...current, key])] : current.filter(item => item !== key);
                commit(core.setShow(state, next.length === categories.length ? null : next), t("studyQuotesShowSaved", "Home page categories updated."), { undoable: false });
            }));
        }
        ui.chips.replaceChildren(...chips);
        const { fallback } = core.pool(state, BUILTIN_SOURCE, { isZh: isZh() });
        ui.showWarning.hidden = !fallback;
        ui.showWarning.textContent = fallback ? t("studyQuotesFallback", "Nothing matches these categories, so the home page shows all available lines.") : "";
    }

    function matches(fields, query) {
        if (!query) return true;
        const needle = searchKey(query).trim();
        return fields.some(value => searchKey(value).includes(needle));
    }

    function filtered() {
        if (view.tab === "mine") {
            return state.quotes.filter(quote =>
                (view.status === "all" || (view.status === "on") === quote.enabled) &&
                (!view.tag || (view.tag === core.UNTAGGED ? !quote.tags.length : quote.tags.includes(view.tag))) &&
                matches([quote.text, quote.author, quote.work, ...quote.tags], view.query));
        }
        const hidden = new Set(state.hiddenBuiltins);
        return builtins.filter(quote => {
            const shown = builtinView(quote);
            return (view.status === "all" || (view.status === "on") === !hidden.has(quote.id)) &&
                matches([shown.text, shown.author, shown.work, quote.zh, quote.en || ""], view.query);
        });
    }

    function renderList() {
        const mine = view.tab === "mine";
        const items = filtered();
        const shown = items.slice(0, view.limit);
        ui.visibleIds = shown.map(item => item.id);
        const known = new Set((mine ? state.quotes : builtins).map(item => item.id));
        for (const id of [...view.selected]) if (!known.has(id)) view.selected.delete(id);
        ui.list.replaceChildren(...shown.map(item => mine ? mineRow(item) : builtinRow(item)));
        ui.count.textContent = fill(t("studyQuotesCount", "{shown} of {total}"), { shown: shown.length, total: items.length });
        ui.empty.hidden = items.length > 0;
        ui.empty.textContent = mine && !state.quotes.length ? t("studyQuotesEmptyMine", "No lines yet. Add one, or paste many at once.") : t("studyQuotesEmpty", "No matching lines.");
        ui.more.hidden = items.length <= shown.length;
        ui.selectPageLabel.hidden = !shown.length || !intact;
        ui.selectPage.checked = shown.length > 0 && shown.every(item => view.selected.has(item.id));
        renderBatch();
    }

    function selectBox(item, text) {
        const box = el("input", "sqSelect"); box.type = "checkbox"; box.checked = view.selected.has(item.id); box.disabled = !intact;
        box.setAttribute("aria-label", fill(t("studyQuotesSelectLabel", "Select: {text}"), { text }));
        box.addEventListener("change", () => { if (box.checked) view.selected.add(item.id); else view.selected.delete(item.id); renderBatch(); ui.selectPage.checked = ui.visibleIds.every(id => view.selected.has(id)); });
        return box;
    }

    function switchBox(checked, label, onChange) {
        const wrapper = el("label", "sqSwitch");
        const input = el("input"); input.type = "checkbox"; input.setAttribute("role", "switch"); input.checked = checked; input.disabled = !intact;
        input.setAttribute("aria-label", label);
        input.addEventListener("change", () => onChange(input.checked));
        wrapper.append(input, el("span", "sqSwitchTrack"));
        return wrapper;
    }

    function mineRow(quote) {
        const row = el("li", "sqRow" + (quote.enabled ? "" : " is-off"));
        row.dataset.id = quote.id;
        const main = el("div", "sqMain");
        main.append(el("p", "sqText", quote.text));
        const meta = el("p", "sqMeta");
        const source = sourceText(quote);
        if (source) meta.append(el("span", "sqSource", source));
        for (const tag of quote.tags) meta.append(el("span", "sqTag", "#" + tag));
        if (meta.childNodes.length) main.append(meta);
        const controls = el("div", "sqRowControls");
        controls.append(
            switchBox(quote.enabled, fill(t("studyQuotesShowLabel", "Show on the home page: {text}"), { text: quote.text }), checked => {
                commit(core.setEnabled(state, [quote.id], checked), checked ? t("studyQuotesTurnedOn", "Shown on the home page.") : t("studyQuotesTurnedOff", "Turned off. It stays in your list."));
            }),
            button("sqIconButton", t("studyQuotesEdit", "Edit"), () => openEditor(quote), fill(t("studyQuotesEditLabel", "Edit: {text}"), { text: quote.text })),
            button("sqIconButton sqDanger", t("studyQuotesDelete", "Delete"), () => {
                const next = core.removeQuotes(state, [quote.id]).state;
                const index = state.quotes.findIndex(item => item.id === quote.id);
                if (commit(next, fill(t("studyQuotesDeleted", "Deleted {count} line(s)."), { count: 1 }))) focusAfterRemoval(index);
            }, fill(t("studyQuotesDeleteLabel", "Delete: {text}"), { text: quote.text }))
        );
        controls.querySelectorAll("button").forEach(node => { node.disabled = !intact; });
        row.append(selectBox(quote, quote.text), main, controls);
        return row;
    }

    function builtinRow(quote) {
        const hidden = state.hiddenBuiltins.includes(quote.id);
        const shown = builtinView(quote);
        const row = el("li", "sqRow" + (hidden ? " is-off" : ""));
        row.dataset.id = quote.id;
        const main = el("div", "sqMain");
        main.append(el("p", "sqText", shown.text));
        const source = sourceText(shown);
        if (source) { const meta = el("p", "sqMeta"); meta.append(el("span", "sqSource", source)); main.append(meta); }
        const controls = el("div", "sqRowControls");
        controls.append(
            switchBox(!hidden, fill(t("studyQuotesShowLabel", "Show on the home page: {text}"), { text: shown.text }), checked => {
                commit(core.setBuiltinHidden(state, [quote.id], !checked), checked ? t("studyQuotesBuiltinShown", "Shown again.") : t("studyQuotesBuiltinHidden", "Hidden. Built-in lines cannot be deleted; show it again any time."));
            }),
            button("sqIconButton", t("studyQuotesCopy", "Copy to my lines"), () => {
                try {
                    commit(core.copyBuiltin(state, quote).state, t("studyQuotesCopied", "Copied to your lines, where you can edit and tag it."));
                } catch (error) { setStatus(errorText(error.code)); }
            }, fill(t("studyQuotesCopyLabel", "Copy to my lines: {text}"), { text: shown.text }))
        );
        controls.querySelectorAll("button").forEach(node => { node.disabled = !intact; });
        row.append(selectBox(quote, shown.text), main, controls);
        return row;
    }

    function focusAfterRemoval(index) {
        const rows = [...ui.list.children];
        const target = rows[Math.min(index, rows.length - 1)];
        (target?.querySelector(".sqSelect") || (view.tab === "mine" ? ui.add : ui.search)).focus();
    }

    // ----- Batch actions on selected lines -----
    function renderBatch() {
        const count = view.selected.size;
        ui.batch.hidden = !count || !intact;
        if (!count) return;
        ui.batchCount.textContent = fill(t("studyQuotesSelected", "{count} selected"), { count });
        const ids = [...view.selected];
        const done = message => { view.selected.clear(); return message; };
        const actions = view.tab === "mine" ? [
            [t("studyQuotesBatchOn", "Show"), () => commit(core.setEnabled(state, ids, true), done(fill(t("studyQuotesBatchDone", "Updated {count} line(s)."), { count })))],
            [t("studyQuotesBatchOff", "Turn off"), () => commit(core.setEnabled(state, ids, false), done(fill(t("studyQuotesBatchDone", "Updated {count} line(s)."), { count })))],
            [t("studyQuotesBatchAddTag", "Add tag"), () => batchTags(ids, true)],
            [t("studyQuotesBatchRemoveTag", "Remove tag"), () => batchTags(ids, false)],
            [t("studyQuotesDelete", "Delete"), () => commit(core.removeQuotes(state, ids).state, done(fill(t("studyQuotesDeleted", "Deleted {count} line(s)."), { count }))), "sqDanger"]
        ] : [
            [t("studyQuotesBatchShow", "Show"), () => commit(core.setBuiltinHidden(state, ids, false), done(fill(t("studyQuotesBatchDone", "Updated {count} line(s)."), { count })))],
            [t("studyQuotesBatchHide", "Hide"), () => commit(core.setBuiltinHidden(state, ids, true), done(fill(t("studyQuotesBatchDone", "Updated {count} line(s)."), { count })))]
        ];
        ui.batchButtons.replaceChildren(
            ...actions.map(([label, action, extra]) => button("sqSecondary" + (extra ? " " + extra : ""), label, action)),
            button("sqLink", t("studyQuotesClearSelection", "Clear selection"), () => { view.selected.clear(); renderList(); })
        );
    }

    async function batchTags(ids, adding) {
        const ask = window.myntDialog?.prompt;
        const answer = ask
            ? await ask(adding ? t("studyQuotesAskAddTag", "Tag to add (separate several with commas)") : t("studyQuotesAskRemoveTag", "Tag to remove"), "", { maxLength: 120 })
            : null;
        if (answer === null || answer === undefined) return;
        const tags = core.splitTags(answer);
        if (!tags.length) return;
        try {
            const next = adding ? core.addTags(state, ids, tags) : core.removeTags(state, ids, tags);
            view.selected.clear();
            commit(next, fill(t("studyQuotesBatchDone", "Updated {count} line(s)."), { count: ids.length }));
        } catch (error) { setStatus(errorText(error.code)); }
    }

    // ----- Editor -----
    function updateCounter() {
        const length = Array.from(ui.text.value.replace(/\s+/gu, " ").trim()).length;
        ui.counter.textContent = `${length} / ${core.LIMITS.text}`;
        ui.counter.classList.toggle("is-over", length > core.LIMITS.text);
    }

    function openEditor(quote) {
        if (!intact) return;
        editing = quote ? quote.id : null;
        ui.editorTitle.textContent = quote ? t("studyQuotesEditTitle", "Edit line") : t("studyQuotesAddTitle", "Add a line");
        ui.text.value = quote?.text || "";
        ui.author.value = quote?.author || "";
        ui.work.value = quote?.work || "";
        ui.tags.value = (quote?.tags || (view.tag && view.tag !== core.UNTAGGED ? [view.tag] : [])).join(", ");
        ui.enabled.checked = quote ? quote.enabled : true;
        ui.editorError.textContent = "";
        ui.editor.hidden = false;
        editorDirty = false;
        updateCounter();
        ui.editor.scrollIntoView?.({ block: "nearest" });
        ui.text.focus();
    }

    function closeEditor(restoreFocus = true) {
        if (!ui.editor || ui.editor.hidden) return;
        const id = editing;
        ui.editor.hidden = true; editing = null; editorDirty = false;
        if (!restoreFocus) return;
        const row = id && [...ui.list.children].find(node => node.dataset.id === id);
        (row?.querySelector(".sqIconButton") || ui.add).focus();
    }

    function saveEditor() {
        const input = { text: ui.text.value, author: ui.author.value, work: ui.work.value, tags: ui.tags.value, enabled: ui.enabled.checked };
        try {
            const id = editing;
            const next = id ? core.updateQuote(state, id, input) : core.addQuote(state, input).state;
            const message = id ? t("studyQuotesUpdated", "Saved.") : t("studyQuotesAdded", "Added to your lines.");
            if (commit(next, message)) {
                closeEditor(false);
                const target = id || next.quotes[next.quotes.length - 1].id;
                if (!id) { view.query = ""; ui.search.value = ""; view.status = "all"; view.tag = ""; view.limit = Math.max(view.limit, next.quotes.length); render(); }
                const row = [...ui.list.children].find(node => node.dataset.id === target);
                row?.scrollIntoView?.({ block: "nearest" });
                (row?.querySelector(".sqIconButton") || ui.add).focus();
            }
        } catch (error) {
            ui.editorError.textContent = errorText(error.code);
            const field = { empty: ui.text, tooLong: ui.text, unsafe: ui.text, duplicate: ui.text, authorTooLong: ui.author, workTooLong: ui.work }[error.code] || (["tooManyTags", "tagInvalid", "tooManyTagsOverall"].includes(error.code) ? ui.tags : ui.text);
            field.focus();
        }
    }

    function switchTab(tab) {
        if (view.tab === tab) return;
        view.tab = tab; view.status = "all"; view.tag = ""; view.limit = PAGE; view.selected.clear();
        closeEditor(false);
        render();
    }

    // ----- Public entry -----
    function open(trigger) {
        if (!dialog) build();
        localize();
        load();
        opener = trigger || document.activeElement;
        undoSnapshot = null;
        setStatus("");
        render();
        if (!dialog.open) dialog.showModal();
        ui.search.focus();
    }

    function wireSettings() {
        const field = document.getElementById("studyQuotesManageField");
        if (!field) return;
        document.getElementById("studyQuotesManageText").textContent = t("studyQuotesManageSetting", "Manage encouragement lines");
        document.getElementById("studyQuotesManageInfo").textContent = t("studyQuotesManageSettingInfo", "Add, paste, import, tag, hide or delete the lines shown at the bottom");
        const trigger = document.getElementById("studyQuotesManageButton");
        trigger.textContent = t("studyQuotesManageButton", "Manage");
        trigger.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); open(trigger); });
    }

    window.myntStudyQuotesManager = { open, close: () => dialog?.close(), isOpen: () => Boolean(dialog?.open) };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireSettings, { once: true });
    else wireSettings();
})();
