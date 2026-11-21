renderSlideMenu("breakdown.html");

const todayIso = formatDateISO(new Date());
const [by, bm] = todayIso.split("-").map(Number);

let toolsArr = [];
let bdArr = [];
let selBdDate = todayIso;
let bdYear = by;
let bdMonth = bm - 1;

document.getElementById("bd-date").value = selBdDate;

async function refreshBd() {
    const res = await loadAllAppData();
    toolsArr = res.tools;
    bdArr = res.breakdowns;
    renderBdCalendar();
}

function setBdMonth(y, m) {
    const dt = new Date(y, m, 1);
    bdYear = dt.getFullYear();
    bdMonth = dt.getMonth();
    const pfx = getYearMonthPrefix(bdYear, bdMonth);
    if (!selBdDate.startsWith(pfx)) {
        selBdDate = `${pfx}-01`;
        document.getElementById("bd-date").value = selBdDate;
    }
    renderBdCalendar();
}

function pickBdDate(iso) {
    selBdDate = iso;
    document.getElementById("bd-date").value = iso;
    const [y, m] = iso.split("-").map(Number);
    bdYear = y;
    bdMonth = m - 1;
    renderBdCalendar();
}

function renderBdCalendar() {
    document.getElementById("bd-month-heading").textContent = `${MONTH_NAMES[bdMonth]} ${bdYear} — Breakdown Calendar`;
    document.getElementById("bd-month-pills").innerHTML = MONTH_SHORT.map((sm, idx) => {
        const cnt = bdArr.filter((b) => (b.date || "").startsWith(getYearMonthPrefix(bdYear, idx))).length;
        return `<button type="button" onclick="setBdMonth(${bdYear}, ${idx})" class="shrink-0 px-2.5 py-1 rounded-lg border ${idx === bdMonth ? "border-rose-400 bg-rose-500/20 text-rose-200 font-bold" : "border-stone-800 bg-[#0b0d11] text-stone-400"}">${sm} (${cnt})</button>`;
    }).join("");

    const firstDay = new Date(bdYear, bdMonth, 1).getDay();
    const totalDays = new Date(bdYear, bdMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(`<div class="h-14 rounded-xl bg-[#0a0c10]/50"></div>`);
    for (let d = 1; d <= totalDays; d++) {
        const iso = `${bdYear}-${String(bdMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dayItems = bdArr.filter((b) => b.date === iso);
        cells.push(`
            <button type="button" onclick="pickBdDate('${iso}')" class="h-14 rounded-xl border p-1.5 text-left flex flex-col justify-between font-mono text-xs ${iso === selBdDate ? "border-rose-400 bg-rose-500/20 text-white font-bold" : "border-stone-800 bg-[#0b0d11] text-stone-300"}">
                <span>${d}</span>
                <span class="text-[10px] truncate text-rose-300">${dayItems.map((x) => x.toolCode).join(", ") || "—"}</span>
            </button>
        `);
    }
    document.getElementById("bd-days-grid").innerHTML = cells.join("");
}

document.getElementById("enter-bd-btn").addEventListener("click", () => {
    document.getElementById("bd-mould").focus();
});
document.getElementById("bd-prev-m").addEventListener("click", () => setBdMonth(bdYear, bdMonth - 1));
document.getElementById("bd-next-m").addEventListener("click", () => setBdMonth(bdYear, bdMonth + 1));

document.getElementById("bd-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const dVal = document.getElementById("bd-date").value || selBdDate;
    const item = {
        id: `bd_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        date: dVal,
        toolCode: document.getElementById("bd-mould").value.trim().toUpperCase(),
        issue: document.getElementById("bd-reason").value.trim(),
        bdStatus: document.getElementById("bd-status").value.trim(),
        machineNo: document.getElementById("bd-mc").value.trim().toUpperCase(),
        duration: document.getElementById("bd-time").value.trim()
    };
    bdArr.push(item);
    await putToStore(STORE_BREAKDOWNS, item);
    writeLocalStorageMirror(toolsArr, bdArr);
    document.getElementById("bd-mould").value = "";
    document.getElementById("bd-reason").value = "";
    document.getElementById("bd-status").value = "";
    document.getElementById("bd-mc").value = "";
    document.getElementById("bd-time").value = "";
    pickBdDate(dVal);
    showToast("Breakdown saved");
});

refreshBd();