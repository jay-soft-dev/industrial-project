renderSlideMenu("present-pm.html");
(async function () {
    const { tools } = await loadAllAppData();
    const now = new Date();
    const pfx = getYearMonthPrefix(now.getFullYear(), now.getMonth());
    document.getElementById("present-pm-heading").textContent = `Present PM Plan — ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    const list = tools.filter((t) => t.scheduledDate.startsWith(pfx)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    document.getElementById("present-pm-list").innerHTML = list.length
        ? list.map((t) => `
            <div class="rounded-xl border border-stone-800 bg-[#0b0d11] p-3.5 space-y-1.5">
                <div class="flex items-center justify-between font-mono text-xs">
                    <span class="font-bold text-amber-400">${t.toolCode}</span>
                    ${getStatusBadge(t.status)}
                </div>
                <div class="font-bold text-sm">${t.moldName}</div>
                <div class="text-xs font-mono text-stone-400">Date: ${t.scheduledDate} • ${t.machineNo}</div>
                ${t.actualMold ? `<div class="text-xs font-mono text-emerald-300">Exchange: ${t.actualMold}</div>` : ""}
            </div>
        `).join("")
        : `<div class="col-span-full text-xs font-mono text-stone-500 py-6 text-center">No Present PM Plan items this month.</div>`;
})();