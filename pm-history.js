renderSlideMenu("pm-history.html");
(async function () {
    const { tools } = await loadAllAppData();
    const done = tools.filter((t) => t.status === "PM Completed").sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
    document.getElementById("pm-history-tbody").innerHTML = done.length
        ? done.map((t) => `
            <tr class="hover:bg-stone-900/50 font-mono text-xs">
                <td class="py-2.5 px-3">${t.scheduledDate}</td>
                <td class="py-2.5 px-3 font-bold text-emerald-300">${t.toolCode}</td>
                <td class="py-2.5 px-3 font-sans text-stone-200">${t.moldName}</td>
                <td class="py-2.5 px-3 text-amber-300">${t.actualMold || "—"}</td>
                <td class="py-2.5 px-3">${t.machineNo}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="5" class="py-6 text-center text-xs font-mono text-stone-500">No completed PM history yet.</td></tr>`;
})();