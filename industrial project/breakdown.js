renderSlideMenu("breakdown.html");

const todayIso = formatDateISO(new Date());
const [by, bm] = todayIso.split("-").map(Number);

let toolsArr = [];
let bdArr = [];
let selBdDate = todayIso;
let bdYear = by;
let bdMonth = bm - 1;

const bdDateEl = document.getElementById("bd-date");
if (bdDateEl) bdDateEl.value = selBdDate;

async function refreshBd() {
    const res = await loadAllAppData();
    toolsArr = res.tools || [];
    bdArr = res.breakdowns || [];
    renderBdCalendar();
}

window.setBdMonth = function (y, m) {
    const dt = new Date(y, m, 1);
    bdYear = dt.getFullYear();
    bdMonth = dt.getMonth();
    const pfx = getYearMonthPrefix(bdYear, bdMonth);
    if (!selBdDate.startsWith(pfx)) {
        selBdDate = `${pfx}-01`;
        if (bdDateEl) bdDateEl.value = selBdDate;
    }
    renderBdCalendar();
};

window.pickBdDate = function (iso) {
    selBdDate = iso;
    if (bdDateEl) bdDateEl.value = iso;
    const [y, m] = iso.split("-").map(Number);
    bdYear = y;
    bdMonth = m - 1;
    renderBdCalendar();
};

function renderBdCalendar() {
    const headingEl = document.getElementById("bd-month-heading");
    const pillsEl = document.getElementById("bd-month-pills");
    const gridEl = document.getElementById("bd-days-grid");
    if (!headingEl || !pillsEl || !gridEl) return;

    headingEl.textContent = `${MONTH_NAMES[bdMonth]} ${bdYear} — Breakdown Calendar`;

    pillsEl.innerHTML = MONTH_SHORT.map((sm, idx) => {
        const cnt = bdArr.filter((b) => (b.date || "").startsWith(getYearMonthPrefix(bdYear, idx))).length;
        const activeCls =
            idx === bdMonth
                ? "border-rose-400 bg-rose-500/20 text-rose-200 font-bold"
                : "border-stone-800 bg-[#0b0d11] text-stone-400";
        return `<button type="button" onclick="setBdMonth(${bdYear}, ${idx})" class="shrink-0 px-2.5 py-1 rounded-lg border ${activeCls}">${sm} (${cnt})</button>`;
    }).join("");

    const firstDay = new Date(bdYear, bdMonth, 1).getDay();
    const totalDays = new Date(bdYear, bdMonth + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDay; i++) {
        cells.push(`<div class="h-14 rounded-xl bg-[#0a0c10]/50"></div>`);
    }

    for (let d = 1; d <= totalDays; d++) {
        const iso = `${bdYear}-${String(bdMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dayItems = bdArr.filter((b) => b.date === iso);
        const selCls =
            iso === selBdDate
                ? "border-rose-400 bg-rose-500/20 text-white font-bold"
                : "border-stone-800 bg-[#0b0d11] text-stone-300";

        cells.push(`
            <button type="button" onclick="pickBdDate('${iso}')" class="h-14 rounded-xl border p-1.5 text-left flex flex-col justify-between font-mono text-xs ${selCls}">
                <span>${d}</span>
                <span class="text-[10px] truncate text-rose-300">${dayItems.map((x) => x.toolCode).join(", ") || "—"}</span>
            </button>
        `);
    }

    gridEl.innerHTML = cells.join("");
}

const enterBdBtn = document.getElementById("enter-bd-btn");
if (enterBdBtn) {
    enterBdBtn.addEventListener("click", () => {
        document.getElementById("bd-mould")?.focus();
    });
}

document.getElementById("bd-prev-m")?.addEventListener("click", () => setBdMonth(bdYear, bdMonth - 1));
document.getElementById("bd-next-m")?.addEventListener("click", () => setBdMonth(bdYear, bdMonth + 1));

const formEl = document.getElementById("bd-form");
if (formEl) {
    formEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        const dVal = document.getElementById("bd-date").value || selBdDate;
        const timeVal = document.getElementById("bd-time").value.trim();
        const remarkInput = document.getElementById("bd-remark");
        const remarkVal = remarkInput ? remarkInput.value.trim() : "";

        const item = {
            id: `bd_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            date: dVal,
            toolCode: document.getElementById("bd-mould").value.trim().toUpperCase(),
            issue: document.getElementById("bd-reason").value.trim(),
            bdStatus: document.getElementById("bd-status").value.trim(),
            machineNo: document.getElementById("bd-mc").value.trim().toUpperCase(),
            duration: timeVal,
            remarks: remarkVal || timeVal
        };

        bdArr.push(item);
        await putToStore(STORE_BREAKDOWNS, item);
        writeLocalStorageMirror(toolsArr, bdArr);
        e.target.reset();
        document.getElementById("bd-date").value = dVal;
        pickBdDate(dVal);
        showToast("Breakdown saved");
    });
}

refreshBd();