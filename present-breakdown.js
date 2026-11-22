renderSlideMenu("present-breakdown.html");

const todayIso = formatDateISO(new Date());
const presentMonthPrefix = todayIso.slice(0, 7);

let monthBreakdowns = [];

function renderPresentBreakdownRows() {
    const q = (document.getElementById("present-bd-search")?.value || "").trim().toLowerCase();
    const dateVal = (document.getElementById("present-bd-date")?.value || "").trim();

    let rows = monthBreakdowns.filter((b) => (b.date || "").startsWith(presentMonthPrefix));

    if (dateVal) {
        rows = rows.filter((b) => b.date === dateVal);
    }

    if (q) {
        rows = rows.filter((b) =>
            [b.toolCode, b.bdStatus, b.issue, b.machineNo, b.remarks, b.duration, b.date]
                .join(" ")
                .toLowerCase()
                .includes(q)
        );
    }

    rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const tbody = document.getElementById("present-bd-tbody");
    if (!tbody) return;

    tbody.innerHTML = rows.length
        ? rows
              .map(
                  (b, idx) => `
            <tr class="hover:bg-stone-900/50 font-mono text-xs">
                <td class="py-2.5 px-3 border-r border-stone-800/80">${idx + 1}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 text-rose-300 whitespace-nowrap">${b.date || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-bold text-white">${b.toolCode || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 text-amber-300">${b.bdStatus || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-sans text-stone-200">${b.issue || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 text-sky-300">${b.machineNo || "—"}</td>
                <td class="py-2.5 px-3 font-sans text-stone-300">${b.remarks || b.duration || "—"}</td>
            </tr>
        `
              )
              .join("")
        : `<tr><td colspan="7" class="py-6 text-center text-xs font-mono text-stone-500">No breakdowns recorded in ${presentMonthPrefix}.</td></tr>`;
}

(async function () {
    const titleEl = document.getElementById("present-bd-title");
    if (titleEl) {
        titleEl.textContent = `PRESENT MONTH BRECK DOWN PAGE FORMAT (${presentMonthPrefix})`;
    }
    const { breakdowns } = await loadAllAppData();
    monthBreakdowns = breakdowns || [];
    renderPresentBreakdownRows();
})();

document.getElementById("present-bd-search")?.addEventListener("input", renderPresentBreakdownRows);
document.getElementById("present-bd-date")?.addEventListener("change", renderPresentBreakdownRows);
document.getElementById("present-bd-all-btn")?.addEventListener("click", () => {
    const dateEl = document.getElementById("present-bd-date");
    const searchEl = document.getElementById("present-bd-search");
    if (dateEl) dateEl.value = "";
    if (searchEl) searchEl.value = "";
    renderPresentBreakdownRows();
});