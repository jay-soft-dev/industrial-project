renderSlideMenu("present-pm.html");

const todayIso = formatDateISO(new Date());
const presentMonthPrefix = todayIso.slice(0, 7);

let monthTools = [];
let monthBreakdowns = [];
let allMonthDates = true;
let selectedPmDate = todayIso;
let activePresentId = null;
let draftPBefore = "";
let draftPAfter = "";

const headingEl = document.getElementById("present-pm-heading");
if (headingEl) {
    headingEl.textContent = `present month pm plan (${presentMonthPrefix})`;
}

const dateFilterEl = document.getElementById("present-pm-date");
if (dateFilterEl) {
    dateFilterEl.value = todayIso;
}

async function loadPresentPm() {
    const res = await loadAllAppData();
    monthTools = res.tools || [];
    monthBreakdowns = res.breakdowns || [];
    if (typeof syncToolsPhotosToBackup === "function") {
        syncToolsPhotosToBackup(monthTools);
    }
    renderPresentPmRows();
}

function renderPresentPmRows() {
    const tbody = document.getElementById("present-pm-tbody");
    if (!tbody) return;

    const q = (document.getElementById("present-pm-search")?.value || "").trim().toLowerCase();
    let rows = monthTools.filter((t) => (t.scheduledDate || "").startsWith(presentMonthPrefix));

    if (!allMonthDates && selectedPmDate) {
        rows = rows.filter((t) => t.scheduledDate === selectedPmDate);
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
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center font-mono text-xs text-stone-400">No PM plan rows for ${presentMonthPrefix}.</td></tr>`;
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
                        <button type="button" onclick="openPresentModal('${t.id}')" class="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-sky-300">
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

window.openPresentModal = function (id) {
    const item = monthTools.find((t) => t.id === id);
    if (!item) return;
    activePresentId = id;
    draftPBefore = item.beforePhoto || "";
    draftPAfter = item.afterPhoto || "";

    document.getElementById("present-modal-title").textContent = `${item.toolCode} (${item.scheduledDate || ""})`;
    document.getElementById("present-modal-exchange").value = item.exchangeMould || "";
    document.getElementById("present-modal-postpond").value = item.postpondMould || "";
    document.getElementById("present-modal-remark").value = item.remarks || "";

    const bImg = document.getElementById("present-before-preview");
    const bPh = document.getElementById("present-before-placeholder");
    if (draftPBefore) {
        bImg.src = draftPBefore;
        bImg.classList.remove("hidden");
        bPh.classList.add("hidden");
    } else {
        bImg.classList.add("hidden");
        bPh.classList.remove("hidden");
    }

    const aImg = document.getElementById("present-after-preview");
    const aPh = document.getElementById("present-after-placeholder");
    if (draftPAfter) {
        aImg.src = draftPAfter;
        aImg.classList.remove("hidden");
        aPh.classList.add("hidden");
    } else {
        aImg.classList.add("hidden");
        aPh.classList.remove("hidden");
    }

    const modal = document.getElementById("present-pm-photo-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

function closePresentModal() {
    activePresentId = null;
    const modal = document.getElementById("present-pm-photo-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

async function savePresentModal(markDone) {
    if (!activePresentId) return;
    const idx = monthTools.findIndex((t) => t.id === activePresentId);
    if (idx === -1) return;

    const remarkVal = document.getElementById("present-modal-remark").value.trim();
    const updated = {
        ...monthTools[idx],
        beforePhoto: draftPBefore,
        afterPhoto: draftPAfter,
        exchangeMould: document.getElementById("present-modal-exchange").value.trim().toUpperCase(),
        postpondMould: document.getElementById("present-modal-postpond").value.trim().toUpperCase(),
        remarks: remarkVal,
        status: markDone ? "PM Completed" : monthTools[idx].status
    };

    if (typeof savePmPhotoToBackup === "function") {
        if (draftPBefore) {
            savePmPhotoToBackup({
                toolCode: updated.toolCode,
                date: updated.scheduledDate,
                stage: "BEFORE PM",
                dataUrl: draftPBefore,
                remarks: remarkVal
            });
        }
        if (draftPAfter) {
            savePmPhotoToBackup({
                toolCode: updated.toolCode,
                date: updated.scheduledDate,
                stage: "AFTER PM",
                dataUrl: draftPAfter,
                remarks: remarkVal
            });
        }
    }

    monthTools[idx] = updated;
    await putToStore(STORE_TOOLS, updated);
    writeLocalStorageMirror(monthTools, monthBreakdowns);
    closePresentModal();
    renderPresentPmRows();
    showToast(markDone ? "PM marked completed" : "PM saved");
}

document.getElementById("present-pm-search")?.addEventListener("input", renderPresentPmRows);
document.getElementById("present-pm-date")?.addEventListener("change", (e) => {
    selectedPmDate = e.target.value;
    allMonthDates = !selectedPmDate;
    renderPresentPmRows();
});
document.getElementById("present-pm-all-btn")?.addEventListener("click", () => {
    allMonthDates = true;
    if (dateFilterEl) dateFilterEl.value = "";
    renderPresentPmRows();
});

document.getElementById("present-before-input")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    draftPBefore = await compressImageFile(f);
    const img = document.getElementById("present-before-preview");
    img.src = draftPBefore;
    img.classList.remove("hidden");
    document.getElementById("present-before-placeholder")?.classList.add("hidden");
});

document.getElementById("present-after-input")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    draftPAfter = await compressImageFile(f);
    const img = document.getElementById("present-after-preview");
    img.src = draftPAfter;
    img.classList.remove("hidden");
    document.getElementById("present-after-placeholder")?.classList.add("hidden");
});

document.getElementById("close-present-modal-btn")?.addEventListener("click", closePresentModal);
document.getElementById("present-modal-save-btn")?.addEventListener("click", () => savePresentModal(false));
document.getElementById("present-modal-complete-btn")?.addEventListener("click", () => savePresentModal(true));

loadPresentPm();