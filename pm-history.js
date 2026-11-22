renderSlideMenu("pm-history.html");

let allTools = [];

function renderPmHistoryRows() {
    const q = (document.getElementById("pm-hist-search")?.value || "").trim().toLowerCase();
    const dateVal = (document.getElementById("pm-hist-date")?.value || "").trim();

    let rows = allTools.filter(
        (t) => t.status === "PM Completed" || Boolean(t.beforePhoto || t.afterPhoto)
    );

    if (dateVal) {
        rows = rows.filter((t) => t.scheduledDate === dateVal);
    }

    if (q) {
        rows = rows.filter((t) =>
            [t.toolCode, t.status, t.remarks, t.scheduledDate, t.exchangeMould, t.postpondMould]
                .join(" ")
                .toLowerCase()
                .includes(q)
        );
    }

    rows.sort((a, b) => (b.scheduledDate || "").localeCompare(a.scheduledDate || ""));

    const tbody = document.getElementById("pm-history-tbody");
    if (!tbody) return;

    tbody.innerHTML = rows.length
        ? rows
              .map((t, idx) => {
                  const thumbs = [
                      t.beforePhoto
                          ? `<img src="${t.beforePhoto}" alt="Before PM" class="w-12 h-12 object-cover rounded-lg border border-stone-700" />`
                          : "",
                      t.afterPhoto
                          ? `<img src="${t.afterPhoto}" alt="After PM" class="w-12 h-12 object-cover rounded-lg border border-emerald-600/50" />`
                          : ""
                  ]
                      .filter(Boolean)
                      .join("");

                  return `
                    <tr class="hover:bg-stone-900/50 align-top">
                        <td class="py-3 px-3 border-r border-stone-800/80 font-mono text-xs">${idx + 1}</td>
                        <td class="py-3 px-3 border-r border-stone-800/80 font-mono text-xs">
                            <div class="font-bold text-white">${t.toolCode || "—"}</div>
                            <div class="text-[10px] text-amber-300">${t.scheduledDate || "—"}</div>
                        </td>
                        <td class="py-3 px-3 border-r border-stone-800/80">${getStatusBadge(t.status || "PM Completed")}</td>
                        <td class="py-3 px-3 border-r border-stone-800/80 text-xs text-stone-200">${t.remarks || "—"}</td>
                        <td class="py-3 px-3">
                            <div class="flex items-center gap-2 flex-wrap">
                                ${thumbs || `<span class="text-xs font-mono text-stone-500">No photo</span>`}
                            </div>
                        </td>
                    </tr>
                `;
              })
              .join("")
        : `<tr><td colspan="5" class="py-6 text-center text-xs font-mono text-stone-500">No PM history records found.</td></tr>`;
}

(async function () {
    const { tools } = await loadAllAppData();
    allTools = tools || [];
    if (typeof syncToolsPhotosToBackup === "function") {
        syncToolsPhotosToBackup(allTools);
    }
    renderPmHistoryRows();
})();

document.getElementById("pm-hist-search")?.addEventListener("input", renderPmHistoryRows);
document.getElementById("pm-hist-date")?.addEventListener("change", renderPmHistoryRows);
document.getElementById("pm-hist-all-btn")?.addEventListener("click", () => {
    const dateEl = document.getElementById("pm-hist-date");
    const searchEl = document.getElementById("pm-hist-search");
    if (dateEl) dateEl.value = "";
    if (searchEl) searchEl.value = "";
    renderPmHistoryRows();
});