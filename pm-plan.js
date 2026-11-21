renderSlideMenu("pm-plan.html");

const todayStr = formatDateISO(new Date());
const [iy, im] = todayStr.split("-").map(Number);

let toolsData = [];
let breakdownsData = [];
let selectedDate = todayStr;
let viewYear = iy;
let viewMonth = im - 1;
let showAllMonths = false;

const datePicker = document.getElementById("pm-date-picker");
datePicker.value = selectedDate;

async function refreshPmPlan() {
    const loaded = await loadAllAppData();
    toolsData = loaded.tools;
    breakdownsData = loaded.breakdowns;
    renderPmPlanPage();
}

function setMonthView(y, m) {
    const dt = new Date(y, m, 1);
    viewYear = dt.getFullYear();
    viewMonth = dt.getMonth();
    const pfx = getYearMonthPrefix(viewYear, viewMonth);
    if (!selectedDate.startsWith(pfx)) {
        selectedDate = `${pfx}-01`;
        datePicker.value = selectedDate;
    }
    renderPmPlanPage();
}

function selectDay(iso) {
    selectedDate = iso;
    datePicker.value = iso;
    const [y, m] = iso.split("-").map(Number);
    viewYear = y;
    viewMonth = m - 1;
    renderPmPlanPage();
}

async function updateExchange(id, val) {
    const item = toolsData.find((t) => t.id === id);
    if (!item) return;
    item.actualMold = String(val || "").trim();
    await putToStore(STORE_TOOLS, item);
    writeLocalStorageMirror(toolsData, breakdownsData);
    showToast("Exchange saved");
    renderPmPlanPage();
}

async function toggleCompletePm(id) {
    const item = toolsData.find((t) => t.id === id);
    if (!item) return;
    item.status = item.status === "PM Completed" ? "Scheduled" : "PM Completed";
    await putToStore(STORE_TOOLS, item);
    writeLocalStorageMirror(toolsData, breakdownsData);
    showToast(`${item.toolCode}: ${item.status}`);
    renderPmPlanPage();
}

async function editPmItem(id) {
    const item = toolsData.find((t) => t.id === id);
    if (!item) return;
    const nextMold = prompt("Mold Name:", item.moldName);
    if (nextMold === null) return;
    const nextExchange = prompt("Exchange Mold:", item.actualMold || "");
    if (nextExchange === null) return;
    const nextDate = prompt("Schedule Date (YYYY-MM-DD):", item.scheduledDate);
    if (nextDate === null) return;

    item.moldName = nextMold.trim() || item.moldName;
    item.actualMold = nextExchange.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate.trim())) item.scheduledDate = nextDate.trim();
    await putToStore(STORE_TOOLS, item);
    writeLocalStorageMirror(toolsData, breakdownsData);
    showToast("Updated");
    renderPmPlanPage();
}

async function deletePmItem(id) {
    const item = toolsData.find((t) => t.id === id);
    if (!item) return;
    if (!confirm(`Delete ${item.toolCode}?`)) return;
    toolsData = toolsData.filter((t) => t.id !== id);
    await deleteByIdFromStore(STORE_TOOLS, id);
    writeLocalStorageMirror(toolsData, breakdownsData);
    showToast("Deleted");
    renderPmPlanPage();
}

function attachPhotoToPm(id) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const item = toolsData.find((t) => t.id === id);
        if (!item) return;
        item.afterPhoto = await compressImageFile(file);
        await putToStore(STORE_TOOLS, item);
        writeLocalStorageMirror(toolsData, breakdownsData);
        showToast("Photo attached");
        renderPmPlanPage();
    };
    input.click();
}

function renderPmPlanPage() {
    document.getElementById("pm-cal-heading").textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    document.getElementById("daily-pm-title").textContent = `Daily PM Plan — ${selectedDate}`;

    document.getElementById("pm-month-pills").innerHTML = MONTH_SHORT.map((sm, idx) => {
        const cnt = toolsData.filter((t) => t.scheduledDate.startsWith(getYearMonthPrefix(viewYear, idx))).length;
        return `<button type="button" onclick="setMonthView(${viewYear}, ${idx})" class="shrink-0 px-2.5 py-1 rounded-lg border ${idx === viewMonth ? "border-amber-400 bg-amber-400/15 text-amber-300 font-bold" : "border-stone-800 bg-[#0b0d11] text-stone-400"}">${sm} (${cnt})</button>`;
    }).join("");

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysCount = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(`<div class="h-14 rounded-xl bg-[#0a0c10]/50"></div>`);
    for (let d = 1; d <= daysCount; d++) {
        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const list = toolsData.filter((t) => t.scheduledDate === iso);
        cells.push(`
            <button type="button" onclick="selectDay('${iso}')" class="h-14 rounded-xl border p-1.5 text-left flex flex-col justify-between font-mono text-xs ${iso === selectedDate ? "border-amber-400 bg-[#171c26] text-amber-300 font-bold" : "border-stone-800 bg-[#0b0d11] text-stone-300"}">
                <span>${d}</span>
                <span class="text-[10px] truncate text-amber-400">${list.map((x) => x.toolCode).join(", ") || "—"}</span>
            </button>
        `);
    }
    document.getElementById("pm-days-grid").innerHTML = cells.join("");

    const dailyList = toolsData.filter((t) => t.scheduledDate === selectedDate);
    document.getElementById("daily-pm-cards").innerHTML = dailyList.length
        ? dailyList.map((t) => `
            <div class="rounded-2xl border border-stone-800 bg-[#11151d] p-4 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-mono text-xs font-bold text-amber-400">${t.toolCode}</span>
                    ${getStatusBadge(t.status)}
                </div>
                <div class="font-bold text-sm">${t.moldName}</div>
                <div class="text-xs font-mono text-stone-400">${t.machineNo} • ${t.scheduledDate}</div>
                ${t.actualMold ? `<div class="text-xs font-mono text-emerald-300">Exchange: ${t.actualMold}</div>` : ""}
                <div class="flex gap-2 pt-2 font-mono text-xs">
                    <button type="button" onclick="toggleCompletePm('${t.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Done</button>
                    <button type="button" onclick="editPmItem('${t.id}')" class="px-2.5 py-1 rounded-lg bg-stone-800 text-sky-300">Edit</button>
                    <button type="button" onclick="deletePmItem('${t.id}')" class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300">Delete</button>
                </div>
            </div>
        `).join("")
        : `<div class="col-span-full rounded-xl border border-dashed border-stone-800 p-4 text-xs font-mono text-stone-500 text-center">No Daily PM on ${selectedDate}</div>`;

    const prefix = getYearMonthPrefix(viewYear, viewMonth);
    const rows = (showAllMonths ? [...toolsData] : toolsData.filter((t) => t.scheduledDate.startsWith(prefix)))
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    document.getElementById("month-pm-table-title").textContent = showAllMonths ? `All 12 Months PM Plan (${rows.length})` : `Month PM Plan — ${MONTH_NAMES[viewMonth]} (${rows.length})`;

    document.getElementById("pm-plan-tbody").innerHTML = rows.length
        ? rows.map((t) => `
            <tr class="hover:bg-stone-900/50">
                <td class="py-2.5 px-3.5 font-mono text-xs">
                    <div class="font-bold text-amber-400">${t.toolCode} • ${t.scheduledDate}</div>
                    <div class="text-stone-200">${t.moldName} (${t.machineNo})</div>
                </td>
                <td class="py-2.5 px-3.5">
                    <input type="text" value="${escapeHtmlAttr(t.actualMold || "")}" placeholder="Exchange..." onchange="updateExchange('${t.id}', this.value)" class="w-32 bg-[#0b0d11] border border-emerald-500/35 rounded-lg px-2 py-1 text-xs font-mono text-emerald-200" />
                </td>
                <td class="py-2.5 px-3.5 whitespace-nowrap">
                    <button type="button" onclick="toggleCompletePm('${t.id}')">${getStatusBadge(t.status)}</button>
                </td>
                <td class="py-2.5 px-3.5 whitespace-nowrap font-mono text-xs">
                    <button type="button" onclick="attachPhotoToPm('${t.id}')" class="underline text-amber-300">${t.afterPhoto ? "Photo Saved" : "Add Photo"}</button>
                </td>
                <td class="py-2.5 px-3.5 whitespace-nowrap font-mono text-xs">
                    <button type="button" onclick="editPmItem('${t.id}')" class="underline text-sky-300 mr-2">Edit</button>
                    <button type="button" onclick="deletePmItem('${t.id}')" class="underline text-rose-300">Delete</button>
                </td>
            </tr>
        `).join("")
        : `<tr><td colspan="5" class="py-4 text-center text-xs font-mono text-stone-500">No PM plan rows</td></tr>`;
}

document.getElementById("toggle-add-pm-btn").addEventListener("click", () => {
    document.getElementById("new-pm-date").value = selectedDate;
    document.getElementById("add-pm-box").classList.toggle("hidden");
});
document.getElementById("add-pm-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const sched = fd.get("scheduledDate") || selectedDate;
    const item = {
        id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        toolCode: String(fd.get("toolCode")).trim().toUpperCase(),
        moldName: String(fd.get("moldName")).trim(),
        actualMold: "",
        machineNo: String(fd.get("machineNo")).trim().toUpperCase(),
        scheduledDate: sched,
        status: "Scheduled",
        afterPhoto: null
    };
    toolsData.push(item);
    await putToStore(STORE_TOOLS, item);
    writeLocalStorageMirror(toolsData, breakdownsData);
    e.target.reset();
    document.getElementById("add-pm-box").classList.add("hidden");
    selectDay(sched);
    showToast("PM added");
});
datePicker.addEventListener("change", (e) => selectDay(e.target.value || todayStr));
document.getElementById("pm-prev-m").addEventListener("click", () => setMonthView(viewYear, viewMonth - 1));
document.getElementById("pm-next-m").addEventListener("click", () => setMonthView(viewYear, viewMonth + 1));
document.getElementById("btn-running-month").addEventListener("click", () => { showAllMonths = false; renderPmPlanPage(); });
document.getElementById("btn-all-12-months").addEventListener("click", () => { showAllMonths = true; renderPmPlanPage(); });

refreshPmPlan();