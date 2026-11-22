renderSlideMenu("breakdown-history.html");

let allBreakdowns = [];

function renderBreakdownHistoryRows() {
    const q = (document.getElementById("bd-hist-search")?.value || "").trim().toLowerCase();
    const dateVal = (document.getElementById("bd-hist-date")?.value || "").trim();

    let rows = [...allBreakdowns].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    if (dateVal) {
        rows = rows.filter((b) => b.date === dateVal);
    }

    if (q) {
        rows = rows.filter((b) =>
            [b.toolCode, b.issue, b.remarks, b.duration, b.machineNo, b.bdStatus, b.date]
                .join(" ")
                .toLowerCase()
                .includes(q)
        );
    }

    const tbody = document.getElementById("bd-history-tbody");
    if (!tbody) return;

    tbody.innerHTML = rows.length
        ? rows
              .map(
                  (b, idx) => `
            <tr class="hover:bg-stone-900/50 font-mono text-xs">
                <td class="py-2.5 px-3 border-r border-stone-800/80">${idx + 1}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 text-rose-300 whitespace-nowrap">${b.date || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-bold text-white">${b.toolCode || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-sans text-stone-200">${b.issue || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-sans text-stone-300">${b.remarks || b.duration || "—"}</td>
                <td class="py-2.5 px-3 text-sky-300">${b.machineNo || "—"}</td>
            </tr>
        `
              )
              .join("")
        : `<tr><td colspan="6" class="py-6 text-center text-xs font-mono text-stone-500">No breakdown history saved yet.</td></tr>`;
}

(async function () {
    const { breakdowns } = await loadAllAppData();
    allBreakdowns = breakdowns || [];
    renderBreakdownHistoryRows();
})();

document.getElementById("bd-hist-search")?.addEventListener("input", renderBreakdownHistoryRows);
document.getElementById("bd-hist-date")?.addEventListener("change", renderBreakdownHistoryRows);
document.getElementById("bd-hist-all-dates-btn")?.addEventListener("click", () => {
    const dateEl = document.getElementById("bd-hist-date");
    const searchEl = document.getElementById("bd-hist-search");
    if (dateEl) dateEl.value = "";
    if (searchEl) searchEl.value = "";
    renderBreakdownHistoryRows();
});