renderSlideMenu("pm-plan.html");

const todayIso = formatDateISO(new Date());
let toolsList = [];
let breakdownsList = [];
let showAllDates = true;
let selectedFilterDate = todayIso;
let editingId = null;
let tempBefore = "";
let tempAfter = "";

const dateInputEl = document.getElementById("pm-date-input");
const filterDateEl = document.getElementById("pm-filter-date");
if (dateInputEl) dateInputEl.value = todayIso;
if (filterDateEl) filterDateEl.value = todayIso;

async function loadPmData() {
    const res = await loadAllAppData();
    toolsList = res.tools || [];
    breakdownsList = res.breakdowns || [];
    if (typeof syncToolsPhotosToBackup === "function") {
        syncToolsPhotosToBackup(toolsList);
    }
    renderPmRows();
}

function renderPmRows() {
    const tbody = document.getElementById("pm-plan-tbody");
    if (!tbody) return;

    const q = (document.getElementById("pm-search-input")?.value || "").trim().toLowerCase();
    let rows = [...toolsList];

    if (!showAllDates && selectedFilterDate) {
        rows = rows.filter((t) => t.scheduledDate === selectedFilterDate);
    }

    if (q) {
        rows = rows.filter((t) =>
            [t.toolCode, t.exchangeMould, t.status, t.remarks, t.postpondMould, t.scheduledDate]
                .join(" ")
                .toLowerCase()
                .includes(q)
        );
    }

    rows.sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center font-mono text-xs text-stone-400">No PM plan rows found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows
        .map((t, idx) => {
            const pCount = (t.beforePhoto ? 1 : 0) + (t.afterPhoto ? 1 : 0);
            return `
                <tr class="hover:bg-stone-900/60 align-top">
                    <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-amber-300 whitespace-nowrap">${t.scheduledDate || "—"}</td>
                    <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs">${idx + 1}</td>
                    <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono font-bold text-white">${t.toolCode || "—"}</td>
                    <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-sky-300">${t.exchangeMould || "—"}</td>
                    <td class="py-2.5 px-3 border-r border-stone-800/80">${getStatusBadge(t.status || "Scheduled")}</td>
                    <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs">
                        <button type="button" onclick="openPmPlanModal('${t.id}')" class="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-sky-300">
                            ${pCount ? `Photo (${pCount})` : "+ Photo"}
                        </button>
                    </td>
                    <td class="py-2.5 px-3 border-r border-stone-800/80 text-xs text-stone-200">${t.remarks || "—"}</td>
                    <td class="py-2.5 px-3 font-mono text-xs text-rose-300">${t.postpondMould || "—"}</td>
                </tr>
            `;
        })
        .join("");
}

window.openPmPlanModal = function (id) {
    const item = toolsList.find((t) => t.id === id);
    if (!item) return;
    editingId = id;
    tempBefore = item.beforePhoto || "";
    tempAfter = item.afterPhoto || "";

    document.getElementById("pm-modal-title").textContent = `${item.toolCode} (${item.scheduledDate || ""})`;
    document.getElementById("pm-modal-exchange").value = item.exchangeMould || "";
    document.getElementById("pm-modal-postpond").value = item.postpondMould || "";
    document.getElementById("pm-modal-remark").value = item.remarks || "";

    const bImg = document.getElementById("pm-before-preview");
    const bPh = document.getElementById("pm-before-placeholder");
    if (tempBefore) {
        bImg.src = tempBefore;
        bImg.classList.remove("hidden");
        bPh.classList.add("hidden");
    } else {
        bImg.classList.add("hidden");
        bPh.classList.remove("hidden");
    }

    const aImg = document.getElementById("pm-after-preview");
    const aPh = document.getElementById("pm-after-placeholder");
    if (tempAfter) {
        aImg.src = tempAfter;
        aImg.classList.remove("hidden");
        aPh.classList.add("hidden");
    } else {
        aImg.classList.add("hidden");
        aPh.classList.remove("hidden");
    }

    const modal = document.getElementById("pm-photo-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

function closePmPlanModal() {
    editingId = null;
    const modal = document.getElementById("pm-photo-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

async function savePmPlanModal(markDone) {
    if (!editingId) return;
    const idx = toolsList.findIndex((t) => t.id === editingId);
    if (idx === -1) return;

    const remarkVal = document.getElementById("pm-modal-remark").value.trim();
    const updated = {
        ...toolsList[idx],
        beforePhoto: tempBefore,
        afterPhoto: tempAfter,
        exchangeMould: document.getElementById("pm-modal-exchange").value.trim().toUpperCase(),
        postpondMould: document.getElementById("pm-modal-postpond").value.trim().toUpperCase(),
        remarks: remarkVal,
        status: markDone ? "PM Completed" : toolsList[idx].status
    };

    if (typeof savePmPhotoToBackup === "function") {
        if (tempBefore) {
            savePmPhotoToBackup({
                toolCode: updated.toolCode,
                date: updated.scheduledDate,
                stage: "BEFORE PM",
                dataUrl: tempBefore,
                remarks: remarkVal
            });
        }
        if (tempAfter) {
            savePmPhotoToBackup({
                toolCode: updated.toolCode,
                date: updated.scheduledDate,
                stage: "AFTER PM",
                dataUrl: tempAfter,
                remarks: remarkVal
            });
        }
    }

    toolsList[idx] = updated;
    await putToStore(STORE_TOOLS, updated);
    writeLocalStorageMirror(toolsList, breakdownsList);
    closePmPlanModal();
    renderPmRows();
    showToast(markDone ? "PM marked completed" : "PM saved");
}

document.getElementById("toggle-add-pm-btn")?.addEventListener("click", () => {
    document.getElementById("add-pm-section")?.classList.toggle("hidden");
});

document.getElementById("add-pm-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rec = {
        id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        scheduledDate: document.getElementById("pm-date-input").value || todayIso,
        toolCode: document.getElementById("pm-mould-input").value.trim().toUpperCase(),
        exchangeMould: document.getElementById("pm-exchange-input").value.trim().toUpperCase(),
        postpondMould: document.getElementById("pm-postpond-input").value.trim().toUpperCase(),
        remarks: document.getElementById("pm-remark-input").value.trim(),
        status: "Scheduled",
        beforePhoto: "",
        afterPhoto: ""
    };
    toolsList.push(rec);
    await putToStore(STORE_TOOLS, rec);
    writeLocalStorageMirror(toolsList, breakdownsList);
    e.target.reset();
    if (dateInputEl) dateInputEl.value = todayIso;
    renderPmRows();
    showToast("Mould added to PM plan");
});

document.getElementById("pm-search-input")?.addEventListener("input", renderPmRows);
document.getElementById("pm-filter-date")?.addEventListener("change", (e) => {
    selectedFilterDate = e.target.value;
    showAllDates = !selectedFilterDate;
    renderPmRows();
});
document.getElementById("pm-all-dates-btn")?.addEventListener("click", () => {
    showAllDates = true;
    if (filterDateEl) filterDateEl.value = "";
    renderPmRows();
});

document.getElementById("pm-before-input")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    tempBefore = await compressImageFile(f);
    const img = document.getElementById("pm-before-preview");
    img.src = tempBefore;
    img.classList.remove("hidden");
    document.getElementById("pm-before-placeholder")?.classList.add("hidden");
});

document.getElementById("pm-after-input")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    tempAfter = await compressImageFile(f);
    const img = document.getElementById("pm-after-preview");
    img.src = tempAfter;
    img.classList.remove("hidden");
    document.getElementById("pm-after-placeholder")?.classList.add("hidden");
});

document.getElementById("close-pm-modal-btn")?.addEventListener("click", closePmPlanModal);
document.getElementById("pm-modal-save-btn")?.addEventListener("click", () => savePmPlanModal(false));
document.getElementById("pm-modal-complete-btn")?.addEventListener("click", () => savePmPlanModal(true));

loadPmData();