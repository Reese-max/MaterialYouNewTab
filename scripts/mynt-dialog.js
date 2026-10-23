/*
 * In-app replacement for window.alert/confirm/prompt.
 * Native <dialog> + showModal() gives an inert background (focus stays inside),
 * Esc cancels, Enter submits. All methods return Promises.
 */
(function () {
    const lang = () => localStorage.getItem("selectedLanguage") || "zh_TW";
    const t = (key, fallback) => (typeof translations !== "undefined" && (translations[lang()]?.[key] || translations.en?.[key])) || fallback;
    let seq = 0;

    function open({ kind, message, title, defaultValue = "", okText, cancelText, danger = false, maxLength }) {
        return new Promise(resolve => {
            const id = `myntDialog${++seq}`;
            const dialog = document.createElement("dialog");
            dialog.className = "myntDialog myntAppDialog";
            dialog.setAttribute("aria-labelledby", `${id}-title`);
            dialog.setAttribute("aria-describedby", `${id}-msg`);
            if (kind !== "prompt") dialog.setAttribute("role", kind === "alert" ? "alertdialog" : "dialog");
            const form = document.createElement("form");
            form.method = "dialog";
            const heading = document.createElement("h2");
            heading.id = `${id}-title`;
            heading.className = "myntAppDialogTitle";
            heading.textContent = title || (kind === "alert" ? t("dialogNotice", "Notice") : kind === "prompt" ? t("dialogInput", "Input") : t("dialogConfirm", "Please confirm"));
            const msg = document.createElement("p");
            msg.id = `${id}-msg`;
            msg.className = "myntAppDialogMessage";
            msg.textContent = String(message ?? "");
            form.append(heading, msg);
            let input = null;
            if (kind === "prompt") {
                input = document.createElement("input");
                input.type = "text";
                input.className = "myntAppDialogInput";
                input.value = defaultValue ?? "";
                input.setAttribute("aria-labelledby", `${id}-msg`);
                if (maxLength) input.maxLength = maxLength;
                input.autocomplete = "off";
                form.append(input);
            }
            const row = document.createElement("div");
            row.className = "myntAppDialogActions";
            const ok = document.createElement("button");
            ok.type = "submit";
            ok.value = "ok";
            ok.className = danger ? "myntAppDialogOk is-danger" : "myntAppDialogOk";
            ok.textContent = okText || t("dialogOk", "OK");
            // OK first in DOM so Enter (implicit submit) accepts; CSS row-reverse keeps Cancel on the left.
            row.append(ok);
            if (kind !== "alert") {
                const cancel = document.createElement("button");
                cancel.type = "submit";
                cancel.value = "cancel";
                cancel.formNoValidate = true;
                cancel.className = "myntAppDialogCancel";
                cancel.textContent = cancelText || t("dialogCancel", "Cancel");
                row.append(cancel);
            }
            form.append(row);
            dialog.append(form);
            const previous = document.activeElement;
            dialog.addEventListener("close", () => {
                const accepted = dialog.returnValue === "ok";
                dialog.remove();
                if (previous && typeof previous.focus === "function" && document.contains(previous)) {
                    try { previous.focus({ preventScroll: true }); } catch {}
                }
                if (kind === "alert") resolve();
                else if (kind === "confirm") resolve(accepted);
                else resolve(accepted ? input.value : null);
            });
            dialog.addEventListener("cancel", () => { dialog.returnValue = "cancel"; });
            document.body.append(dialog);
            dialog.showModal();
            (input || (kind === "alert" ? ok : ok)).focus();
            if (input) input.select();
        });
    }

    window.myntDialog = {
        alert: (message, options = {}) => open({ ...options, kind: "alert", message }),
        confirm: (message, options = {}) => open({ ...options, kind: "confirm", message }),
        prompt: (message, defaultValue = "", options = {}) => open({ ...options, kind: "prompt", message, defaultValue })
    };
})();
