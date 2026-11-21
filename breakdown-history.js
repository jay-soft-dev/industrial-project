renderSlideMenu("breakdown-history.html");
(async function () {
    const { breakdowns } = await loadAllAppData();
    const rows = [...breakdowns].sort((a, b) => b.date.localeCompare(a.date));
    document.getElementById("bd-history-tbody").innerHTML = rows.length
        ? rows.map((b) => `
            <tr class="hover:bg-stone-900/50 font-mono text-xs">
                <td class="py-2.5 px-3">${b.date}</td>
                <td class="py-2.5 px-3 font-bold text-rose-300">${b.toolCode}</td>
                <td class="py-2.5 px-3 font-sans text-stone-200">${b.issue}</td>
                <td class="py-2.5 px-3">${b.bdStatus || "—"}</td>
                <td class="py-2.5 px-3">${b.machineNo}</td>
                <td class="py-2.5 px-3">${b.duration || "—"}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="6" class="py-6 text-center text-xs font-mono text-stone-500">No breakdown history saved yet.</td></tr>`;
})();