const TODAY_ISO = formatDateISO(new Date());
const PRESENT_MONTH_PREFIX = TODAY_ISO.slice(0, 7);

let toolsData = [];
let breakdownsData = [];
let currentView = "present-pm";
let selectedDate = TODAY_ISO;
let allDatesMode = true;
let pmHistAllDates = true;
let presentBdAllMonth = true;
let activeModalToolId = null;
let draftBeforePhoto = "";
let draftAfterPhoto = "";

async function safeClearStore(storeName) {
    if (typeof clearStore === "function") {
        await clearStore(storeName);
        return;
    }
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Ignore storage errors
    }
}

function getAllSavedPhotos() {
    if (typeof readPhotoBackupStore === "function") {
        return readPhotoBackupStore();
    }
    return toolsData
        .filter((t) => Boolean(t.beforePhoto || t.afterPhoto))
        .flatMap((t) => {
            const out = [];
            if (t.beforePhoto) {
                out.push({
                    id: `${t.id}_before`,
                    toolCode: t.toolCode,
                    date: t.scheduledDate,
                    stage: "BEFORE PM",
                    photo: t.beforePhoto,
                    remarks: t.remarks || ""
                });
            }
            if (t.afterPhoto) {
                out.push({
                    id: `${t.id}_after`,
                    toolCode: t.toolCode,
                    date: t.scheduledDate,
                    stage: "AFTER PM",
                    photo: t.afterPhoto,
                    remarks: t.remarks || ""
                });
            }
            return out;
        });
}

function setActiveView(viewName) {
    currentView = viewName;

    document.querySelectorAll(".view-section").forEach((sec) => {
        sec.classList.add("hidden");
    });
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove("hidden");

    const titles = {
        "present-pm": "present month pm plan",
        "pm-history": "PM PLAN HISTORY PAGE FORMAT",
        "present-breakdown": "PRESENT MONTH BRECK DOWN PAGE FORMAT",
        "breakdown-history": "ALL MONTH BRACK DOWN PAGE FORMAT",
        "photos-history": "ALL PM MOULD PHOTOS HISTORY",
        "settings": "SETTINGS"
    };
    document.getElementById("top-page-title").textContent = titles[viewName] || "Main Page Format";

    document.querySelectorAll(".nav-item").forEach((btn) => {
        const isActive = btn.dataset.view === viewName;
        btn.className = `nav-item w-full text-left px-3 py-2.5 rounded-xl border font-semibold transition flex items-center justify-between ${
            isActive
                ? "border-amber-400 bg-amber-400/15 text-amber-300"
                : "border-stone-800 bg-[#0b0d11] text-stone-300 hover:border-stone-600"
        }`;
    });

    renderCurrentView();
}

function updateBadges() {
    const presentPmCount = toolsData.filter((t) => (t.scheduledDate || "").startsWith(PRESENT_MONTH_PREFIX)).length;
    const pmHistCount = toolsData.filter((t) => t.status === "PM Completed" || t.beforePhoto || t.afterPhoto).length;
    const presentBdCount = breakdownsData.filter((b) => (b.date || "").startsWith(PRESENT_MONTH_PREFIX)).length;
    const allBdCount = breakdownsData.length;
    const photosCount = getAllSavedPhotos().length;

    document.getElementById("badge-present-pm").textContent = String(presentPmCount);
    document.getElementById("badge-pm-history").textContent = String(pmHistCount);
    document.getElementById("badge-present-bd").textContent = String(presentBdCount);
    document.getElementById("badge-all-bd").textContent = String(allBdCount);
    document.getElementById("badge-photos").textContent = String(photosCount);
    document.getElementById("active-date-badge").textContent = allDatesMode ? `ALL DATES (${TODAY_ISO})` : selectedDate;
}

function renderPresentPmTable() {
    const tbody = document.getElementById("present-pm-tbody");
    const q = document.getElementById("global-mould-search").value.trim().toLowerCase();
    const dateQ = document.getElementById("global-date-search").value.trim();

    let rows = toolsData.filter((t) => (t.scheduledDate || "").startsWith(PRESENT_MONTH_PREFIX));

    if (dateQ) {
        rows = rows.filter((t) => t.scheduledDate === dateQ);
    } else if (!allDatesMode && selectedDate) {
        rows = rows.filter((t) => t.scheduledDate === selectedDate);
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
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center font-mono text-xs text-stone-400">No PM plan rows for selected filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((t, idx) => {
        const photoCount = (t.beforePhoto ? 1 : 0) + (t.afterPhoto ? 1 : 0);
        const statusColor = t.status === "PM Completed" ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/40" : "text-amber-300 bg-amber-500/15 border-amber-500/40";
        return `
            <tr class="hover:bg-stone-900/60 align-top">
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-amber-300 whitespace-nowrap">${t.scheduledDate || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs">${idx + 1}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono font-bold text-white">${t.toolCode || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-sky-300">${t.exchangeMould || "—"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80">
                    <button type="button" onclick="openPmModal('${t.id}')" class="px-2 py-0.5 rounded border font-mono text-[11px] ${statusColor}">
                        ${t.status || "Scheduled"}
                    </button>
                </td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs">
                    <button type="button" onclick="openPmModal('${t.id}')" class="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-sky-300">
                        ${photoCount ? `Photo (${photoCount})` : "+ Photo"}
                    </button>
                </td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 text-xs text-stone-200">${t.remarks || "—"}</td>
                <td class="py-2.5 px-3 font-mono text-xs text-rose-300">${t.postpondMould || "—"}</td>
            </tr>
        `;
    }).join("");
}

function renderPmHistoryTable() {
    const tbody = document.getElementById("pm-history-tbody");
    const q = document.getElementById("global-mould-search").value.trim().toLowerCase();
    const filterDate = document.getElementById("pm-hist-date-filter").value.trim();

    let rows = toolsData.filter((t) => t.status === "PM Completed" || t.beforePhoto || t.afterPhoto);
    if (!pmHistAllDates && filterDate) {
        rows = rows.filter((t) => t.scheduledDate === filterDate);
    }
    if (q) {
        rows = rows.filter((t) =>
            [t.toolCode, t.status, t.remarks, t.scheduledDate].join(" ").toLowerCase().includes(q)
        );
    }

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center font-mono text-xs text-stone-400">No PM history records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((t, idx) => {
        const thumbs = [
            t.beforePhoto ? `<img src="${t.beforePhoto}" alt="Before" class="w-11 h-11 object-cover rounded border border-stone-700" />` : "",
            t.afterPhoto ? `<img src="${t.afterPhoto}" alt="After" class="w-11 h-11 object-cover rounded border border-emerald-600/50" />` : ""
        ].filter(Boolean).join("");

        return `
            <tr class="hover:bg-stone-900/60 align-top">
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs">${idx + 1}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono font-bold text-white">
                    <div>${t.toolCode || "—"}</div>
                    <div class="text-[10px] text-stone-400">${t.scheduledDate || ""}</div>
                </td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-emerald-300">${t.status || "PM Completed"}</td>
                <td class="py-2.5 px-3 border-r border-stone-800/80 text-xs text-stone-200">${t.remarks || "—"}</td>
                <td class="py-2.5 px-3">
                    <div class="flex items-center gap-1.5">
                        ${thumbs || `<span class="text-xs font-mono text-stone-500">No photo</span>`}
                        <button type="button" onclick="openPmModal('${t.id}')" class="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 font-mono text-[11px] text-amber-300">
                            Edit
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function renderPresentBreakdownTable() {
    const tbody = document.getElementById("present-bd-tbody");
    const q = document.getElementById("global-mould-search").value.trim().toLowerCase();
    const dateQ = document.getElementById("global-date-search").value.trim();

    let rows = breakdownsData.filter((b) => (b.date || "").startsWith(PRESENT_MONTH_PREFIX));
    if (dateQ) {
        rows = rows.filter((b) => b.date === dateQ);
    } else if (!presentBdAllMonth && selectedDate) {
        rows = rows.filter((b) => b.date === selectedDate);
    }
    if (q) {
        rows = rows.filter((b) =>
            [b.toolCode, b.bdStatus, b.issue, b.machineNo, b.remarks, b.date].join(" ").toLowerCase().includes(q)
        );
    }

    rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center font-mono text-xs text-stone-400">No present month breakdown records.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((b, idx) => `
        <tr class="hover:bg-stone-900/60">
            <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs">${idx + 1}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-rose-300 whitespace-nowrap">${b.date || "—"}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono font-bold text-white">${b.toolCode || "—"}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-amber-300">${b.bdStatus || "—"}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 text-xs text-stone-100">${b.issue || "—"}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-sky-300">${b.machineNo || "—"}</td>
            <td class="py-2.5 px-3 text-xs text-stone-300">
                <div class="flex items-center justify-between gap-2">
                    <span>${b.remarks || "—"}</span>
                    <button type="button" onclick="deleteBreakdown('${b.id}')" class="text-rose-400 hover:underline font-mono text-[11px]">Del</button>
                </div>
            </td>
        </tr>
    `).join("");
}

function renderAllBreakdownTable() {
    const tbody = document.getElementById("all-bd-tbody");
    const q = document.getElementById("global-mould-search").value.trim().toLowerCase();
    const dateFilter = document.getElementById("all-bd-date-filter").value.trim() || document.getElementById("global-date-search").value.trim();

    let rows = [...breakdownsData];
    if (dateFilter) {
        rows = rows.filter((b) => b.date === dateFilter);
    }
    if (q) {
        rows = rows.filter((b) =>
            [b.toolCode, b.issue, b.remarks, b.machineNo, b.date, b.bdStatus].join(" ").toLowerCase().includes(q)
        );
    }

    rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center font-mono text-xs text-stone-400">No breakdown records across all months.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((b, idx) => `
        <tr class="hover:bg-stone-900/60">
            <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs">${idx + 1}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono text-xs text-rose-300 whitespace-nowrap">${b.date || "—"}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 font-mono font-bold text-white">${b.toolCode || "—"}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 text-xs text-stone-100">${b.issue || "—"}</td>
            <td class="py-2.5 px-3 border-r border-stone-800/80 text-xs text-stone-300">${b.remarks || "—"}</td>
            <td class="py-2.5 px-3 font-mono text-xs text-sky-300">
                <div class="flex items-center justify-between gap-2">
                    <span>${b.machineNo || "—"}</span>
                    <button type="button" onclick="deleteBreakdown('${b.id}')" class="text-rose-400 hover:underline font-mono text-[11px]">Del</button>
                </div>
            </td>
        </tr>
    `).join("");
}

function renderPhotosHistoryGallery() {
    const grid = document.getElementById("photos-gallery-grid");
    const q = document.getElementById("global-mould-search").value.trim().toLowerCase();
    const dateQ = document.getElementById("global-date-search").value.trim();

    let items = getAllSavedPhotos();
    if (dateQ) items = items.filter((p) => p.date === dateQ);
    if (q) items = items.filter((p) => [p.toolCode, p.remarks, p.date, p.stage].join(" ").toLowerCase().includes(q));

    document.getElementById("photos-gallery-count").textContent = `${items.length} pics`;

    if (!items.length) {
        grid.innerHTML = `<div class="col-span-full py-8 text-center font-mono text-xs text-stone-400">No PM mould photos uploaded yet.</div>`;
        return;
    }

    grid.innerHTML = items.map((p) => `
        <div class="rounded-xl border border-stone-800 bg-[#0b0d11] p-3 space-y-2.5">
            <div class="flex items-center justify-between text-xs font-mono border-b border-stone-800 pb-2">
                <span class="font-bold text-amber-300">MOULD NO: ${p.toolCode || "—"}</span>
                <span class="text-sky-300">DATE: ${p.date || "—"}</span>
            </div>
            <img src="${p.photo}" alt="${p.toolCode || "PM"} - ${p.date || ""}" class="w-full h-40 object-cover rounded-lg border border-stone-800" />
            <div class="flex items-center justify-between text-[11px] font-mono">
                <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">${p.stage || "PM PHOTO"}</span>
                <span class="text-stone-400 truncate max-w-[160px]">${p.remarks || ""}</span>
            </div>
        </div>
    `).join("");
}

function renderGlobalSearchDropdown() {
    const box = document.getElementById("global-search-results");
    const q = document.getElementById("global-mould-search").value.trim().toLowerCase();
    const dateQ = document.getElementById("global-date-search").value.trim();

    if (!q && !dateQ) {
        box.classList.add("hidden");
        box.innerHTML = "";
        return;
    }

    const pmMatches = toolsData
        .filter((t) => {
            const matchText = !q || [t.toolCode, t.exchangeMould, t.postpondMould, t.remarks, t.status].join(" ").toLowerCase().includes(q);
            const matchDate = !dateQ || t.scheduledDate === dateQ;
            return matchText && matchDate;
        })
        .map((t) => ({
            page: "present-pm",
            label: `PM • ${t.toolCode || ""}`,
            sub: `${t.scheduledDate || ""} • ${t.status || ""}`,
            date: t.scheduledDate || ""
        }));

    const bdMatches = breakdownsData
        .filter((b) => {
            const matchText = !q || [b.toolCode, b.issue, b.remarks, b.machineNo, b.bdStatus].join(" ").toLowerCase().includes(q);
            const matchDate = !dateQ || b.date === dateQ;
            return matchText && matchDate;
        })
        .map((b) => ({
            page: "breakdown-history",
            label: `BD • ${b.toolCode || ""}`,
            sub: `${b.date || ""} • ${b.issue || ""} (${b.machineNo || ""})`,
            date: b.date || ""
        }));

    const combined = [...pmMatches, ...bdMatches].slice(0, 15);
    box.classList.remove("hidden");

    if (!combined.length) {
        box.innerHTML = `<div class="p-3 font-mono text-[11px] text-stone-400">No matching mould/date across pages.</div>`;
        return;
    }

    box.innerHTML = combined.map((m) => `
        <button type="button" onclick="jumpFromGlobalSearch('${m.page}', '${m.date}')" class="w-full text-left p-2.5 hover:bg-stone-800/80 transition block">
            <div class="font-mono font-bold text-amber-300 text-[11px]">${m.label}</div>
            <div class="text-[11px] text-stone-300 truncate">${m.sub}</div>
        </button>
    `).join("");
}

window.jumpFromGlobalSearch = function (page, dateVal) {
    if (dateVal) {
        selectedDate = dateVal;
        allDatesMode = false;
        document.getElementById("pm-view-date").value = dateVal;
        document.getElementById("all-dates-toggle-btn").textContent = "All Date: OFF";
    }
    setActiveView(page);
};

function renderCurrentView() {
    updateBadges();
    renderPresentPmTable();
    renderPmHistoryTable();
    renderPresentBreakdownTable();
    renderAllBreakdownTable();
    renderPhotosHistoryGallery();
    renderGlobalSearchDropdown();
}

window.openPmModal = function (id) {
    const item = toolsData.find((t) => t.id === id);
    if (!item) return;
    activeModalToolId = id;
    draftBeforePhoto = item.beforePhoto || "";
    draftAfterPhoto = item.afterPhoto || "";

    document.getElementById("modal-mould-title").textContent = `${item.toolCode} (${item.scheduledDate || ""})`;
    document.getElementById("modal-exchange-mould").value = item.exchangeMould || "";
    document.getElementById("modal-postpond-mould").value = item.postpondMould || "";
    document.getElementById("modal-remark-input").value = item.remarks || "";

    const bpImg = document.getElementById("before-photo-preview");
    const bpPh = document.getElementById("before-photo-placeholder");
    if (draftBeforePhoto) {
        bpImg.src = draftBeforePhoto;
        bpImg.classList.remove("hidden");
        bpPh.classList.add("hidden");
    } else {
        bpImg.classList.add("hidden");
        bpPh.classList.remove("hidden");
    }

    const apImg = document.getElementById("after-photo-preview");
    const apPh = document.getElementById("after-photo-placeholder");
    if (draftAfterPhoto) {
        apImg.src = draftAfterPhoto;
        apImg.classList.remove("hidden");
        apPh.classList.add("hidden");
    } else {
        apImg.classList.add("hidden");
        apPh.classList.remove("hidden");
    }

    const modal = document.getElementById("photo-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

function closePmModal() {
    activeModalToolId = null;
    const modal = document.getElementById("photo-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

async function savePmModal(markCompleted) {
    if (!activeModalToolId) return;
    const idx = toolsData.findIndex((t) => t.id === activeModalToolId);
    if (idx === -1) return;

    const remarksVal = document.getElementById("modal-remark-input").value.trim();
    const updated = {
        ...toolsData[idx],
        beforePhoto: draftBeforePhoto,
        afterPhoto: draftAfterPhoto,
        exchangeMould: document.getElementById("modal-exchange-mould").value.trim().toUpperCase(),
        postpondMould: document.getElementById("modal-postpond-mould").value.trim().toUpperCase(),
        remarks: remarksVal,
        status: markCompleted ? "PM Completed" : toolsData[idx].status
    };

    if (typeof savePmPhotoToBackup === "function") {
        if (draftBeforePhoto) {
            savePmPhotoToBackup({
                toolCode: updated.toolCode,
                date: updated.scheduledDate,
                stage: "BEFORE PM",
                dataUrl: draftBeforePhoto,
                remarks: remarksVal
            });
        }
        if (draftAfterPhoto) {
            savePmPhotoToBackup({
                toolCode: updated.toolCode,
                date: updated.scheduledDate,
                stage: "AFTER PM",
                dataUrl: draftAfterPhoto,
                remarks: remarksVal
            });
        }
    }

    toolsData[idx] = updated;
    await putToStore(STORE_TOOLS, updated);
    writeLocalStorageMirror(toolsData, breakdownsData);
    closePmModal();
    renderCurrentView();
    showToast(markCompleted ? "PM marked completed" : "PM details saved");
}

window.deleteBreakdown = async function (id) {
    breakdownsData = breakdownsData.filter((b) => b.id !== id);
    await deleteByIdFromStore(STORE_BREAKDOWNS, id);
    writeLocalStorageMirror(toolsData, breakdownsData);
    renderCurrentView();
    showToast("Breakdown deleted");
};

async function initApp() {
    const loaded = await loadAllAppData();
    toolsData = loaded.tools;
    breakdownsData = loaded.breakdowns;
    if (typeof syncToolsPhotosToBackup === "function") {
        syncToolsPhotosToBackup(toolsData);
    }

    document.getElementById("pm-date-input").value = TODAY_ISO;
    document.getElementById("pm-view-date").value = TODAY_ISO;
    document.getElementById("bd-entry-date").value = TODAY_ISO;
    document.getElementById("plan-start-date").value = `${PRESENT_MONTH_PREFIX}-01`;

    document.querySelectorAll(".nav-item").forEach((btn) => {
        btn.addEventListener("click", () => setActiveView(btn.dataset.view));
    });

    document.getElementById("toggle-sidebar-btn").addEventListener("click", () => {
        const sb = document.getElementById("left-sidebar");
        const main = document.getElementById("right-main-content");
        sb.classList.toggle("hidden");
        main.classList.toggle("lg:col-span-9");
        main.classList.toggle("lg:col-span-12");
    });

    document.getElementById("top-today-btn").addEventListener("click", () => {
        selectedDate = TODAY_ISO;
        allDatesMode = false;
        document.getElementById("pm-view-date").value = TODAY_ISO;
        document.getElementById("all-dates-toggle-btn").textContent = "All Date: OFF";
        renderCurrentView();
    });

    document.getElementById("pm-view-date").addEventListener("change", (e) => {
        selectedDate = e.target.value || TODAY_ISO;
        allDatesMode = false;
        document.getElementById("all-dates-toggle-btn").textContent = "All Date: OFF";
        renderCurrentView();
    });

    document.getElementById("pm-show-all-dates-btn").addEventListener("click", () => {
        allDatesMode = true;
        document.getElementById("global-date-search").value = "";
        document.getElementById("all-dates-toggle-btn").textContent = "All Date: ON";
        renderCurrentView();
    });

    document.getElementById("all-dates-toggle-btn").addEventListener("click", (e) => {
        allDatesMode = !allDatesMode;
        e.target.textContent = allDatesMode ? "All Date: ON" : "All Date: OFF";
        renderCurrentView();
    });

    document.getElementById("global-mould-search").addEventListener("input", renderCurrentView);
    document.getElementById("global-date-search").addEventListener("change", renderCurrentView);
    document.getElementById("clear-global-search-btn").addEventListener("click", () => {
        document.getElementById("global-mould-search").value = "";
        document.getElementById("global-date-search").value = "";
        document.getElementById("all-bd-date-filter").value = "";
        document.getElementById("pm-hist-date-filter").value = "";
        allDatesMode = true;
        document.getElementById("all-dates-toggle-btn").textContent = "All Date: ON";
        renderCurrentView();
    });

    document.getElementById("pm-hist-date-filter").addEventListener("change", (e) => {
        pmHistAllDates = !e.target.value;
        renderPmHistoryTable();
    });
    document.getElementById("pm-hist-all-btn").addEventListener("click", () => {
        pmHistAllDates = true;
        document.getElementById("pm-hist-date-filter").value = "";
        renderPmHistoryTable();
    });

    document.getElementById("present-bd-all-month-btn").addEventListener("click", () => {
        presentBdAllMonth = !presentBdAllMonth;
        renderPresentBreakdownTable();
    });

    document.getElementById("all-bd-date-filter").addEventListener("change", renderAllBreakdownTable);
    document.getElementById("all-bd-clear-date-btn").addEventListener("click", () => {
        document.getElementById("all-bd-date-filter").value = "";
        renderAllBreakdownTable();
    });

    document.getElementById("open-add-pm-btn").addEventListener("click", () => {
        document.getElementById("add-pm-panel").classList.toggle("hidden");
    });
    document.getElementById("close-add-pm-btn").addEventListener("click", () => {
        document.getElementById("add-pm-panel").classList.add("hidden");
    });

    document.getElementById("add-pm-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const newTool = {
            id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            scheduledDate: document.getElementById("pm-date-input").value || TODAY_ISO,
            toolCode: document.getElementById("pm-mould-no-input").value.trim().toUpperCase(),
            exchangeMould: document.getElementById("pm-exchange-input").value.trim().toUpperCase(),
            postpondMould: document.getElementById("pm-postpond-input").value.trim().toUpperCase(),
            remarks: document.getElementById("pm-remark-input").value.trim(),
            status: "Scheduled",
            beforePhoto: "",
            afterPhoto: ""
        };
        toolsData.push(newTool);
        await putToStore(STORE_TOOLS, newTool);
        writeLocalStorageMirror(toolsData, breakdownsData);
        e.target.reset();
        document.getElementById("pm-date-input").value = TODAY_ISO;
        renderCurrentView();
        showToast("PM mould added");
    });

    document.getElementById("open-add-bd-top-btn").addEventListener("click", () => {
        document.getElementById("add-bd-panel").classList.toggle("hidden");
    });
    document.getElementById("close-add-bd-btn").addEventListener("click", () => {
        document.getElementById("add-bd-panel").classList.add("hidden");
    });

    document.getElementById("add-bd-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const newBd = {
            id: `bd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            date: document.getElementById("bd-entry-date").value || TODAY_ISO,
            toolCode: document.getElementById("bd-entry-mould").value.trim().toUpperCase(),
            bdStatus: document.getElementById("bd-entry-status").value.trim(),
            issue: document.getElementById("bd-entry-problem").value.trim(),
            machineNo: document.getElementById("bd-entry-mc").value.trim().toUpperCase(),
            remarks: document.getElementById("bd-entry-remark").value.trim()
        };
        breakdownsData.push(newBd);
        await putToStore(STORE_BREAKDOWNS, newBd);
        writeLocalStorageMirror(toolsData, breakdownsData);
        e.target.reset();
        document.getElementById("bd-entry-date").value = TODAY_ISO;
        renderCurrentView();
        showToast("Breakdown saved");
    });

    document.getElementById("before-photo-input").addEventListener("change", async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        draftBeforePhoto = await compressImageFile(f);
        const img = document.getElementById("before-photo-preview");
        img.src = draftBeforePhoto;
        img.classList.remove("hidden");
        document.getElementById("before-photo-placeholder").classList.add("hidden");
    });

    document.getElementById("after-photo-input").addEventListener("change", async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        draftAfterPhoto = await compressImageFile(f);
        const img = document.getElementById("after-photo-preview");
        img.src = draftAfterPhoto;
        img.classList.remove("hidden");
        document.getElementById("after-photo-placeholder").classList.add("hidden");
    });

    document.getElementById("close-photo-modal-btn").addEventListener("click", closePmModal);
    document.getElementById("save-pm-only-btn").addEventListener("click", () => savePmModal(false));
    document.getElementById("mark-pm-done-btn").addEventListener("click", () => savePmModal(true));
    document.getElementById("delete-pm-record-btn").addEventListener("click", async () => {
        if (!activeModalToolId) return;
        toolsData = toolsData.filter((t) => t.id !== activeModalToolId);
        await deleteByIdFromStore(STORE_TOOLS, activeModalToolId);
        writeLocalStorageMirror(toolsData, breakdownsData);
        closePmModal();
        renderCurrentView();
        showToast("PM record deleted");
    });

    // Photo to Text OCR
    document.getElementById("open-ocr-modal-btn").addEventListener("click", () => {
        document.getElementById("ocr-modal").classList.remove("hidden");
        document.getElementById("ocr-modal").classList.add("flex");
    });
    document.getElementById("close-ocr-modal-btn").addEventListener("click", () => {
        document.getElementById("ocr-modal").classList.add("hidden");
        document.getElementById("ocr-modal").classList.remove("flex");
    });

    document.getElementById("plan-photo-input").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file || !window.Tesseract) return;
        document.getElementById("ocr-status-line").textContent = "Scanning photo...";
        const { data } = await window.Tesseract.recognize(file, "eng");
        const tokens = (data.text || "").match(/[A-Z]{1,5}[-_ ]?\d{1,4}(?:[-_ ]?[A-Z0-9]+)?/gi) || [];
        const unique = [...new Set(tokens.map((x) => x.trim().toUpperCase()))];
        const startIso = document.getElementById("plan-start-date").value || `${PRESENT_MONTH_PREFIX}-01`;
        const lines = [];
        for (let i = 0; i < unique.length; i += 3) {
            const d = addDaysISO(startIso, Math.floor(i / 3));
            lines.push(`${d} | ${unique.slice(i, i + 3).join(", ")}`);
        }
        document.getElementById("datewise-text-output").value = lines.join("\n");
        document.getElementById("ocr-status-line").textContent = `Detected ${unique.length} mould codes`;
    });

    document.getElementById("auto-map-3-btn").addEventListener("click", () => {
        const raw = document.getElementById("datewise-text-output").value;
        const codes = raw.replace(/\d{4}-\d{2}-\d{2}\s*\|/g, "").split(/[\n,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
        const startIso = document.getElementById("plan-start-date").value || `${PRESENT_MONTH_PREFIX}-01`;
        const lines = [];
        for (let i = 0; i < codes.length; i += 3) {
            lines.push(`${addDaysISO(startIso, Math.floor(i / 3))} | ${codes.slice(i, i + 3).join(", ")}`);
        }
        document.getElementById("datewise-text-output").value = lines.join("\n");
    });

    document.getElementById("import-ocr-schedule-btn").addEventListener("click", async () => {
        const lines = document.getElementById("datewise-text-output").value.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
            const parts = line.split("|");
            if (parts.length < 2) continue;
            const d = parts[0].trim();
            const molds = parts[1].split(",").map((m) => m.trim().toUpperCase()).filter(Boolean);
            for (const mCode of molds) {
                const rec = {
                    id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    scheduledDate: d,
                    toolCode: mCode,
                    exchangeMould: "",
                    postpondMould: "",
                    remarks: "Imported via Photo to Text",
                    status: "Scheduled",
                    beforePhoto: "",
                    afterPhoto: ""
                };
                toolsData.push(rec);
                await putToStore(STORE_TOOLS, rec);
            }
        }
        writeLocalStorageMirror(toolsData, breakdownsData);
        document.getElementById("ocr-modal").classList.add("hidden");
        document.getElementById("ocr-modal").classList.remove("flex");
        setActiveView("present-pm");
        showToast("Schedule saved to PM Plan");
    });

    // Settings Export / Import / Reset
    document.getElementById("export-json-btn").addEventListener("click", () => {
        const payload = {
            tools: toolsData,
            breakdowns: breakdownsData,
            photoBackup: getAllSavedPhotos()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `toolsync-backup-${TODAY_ISO}.json`;
        a.click();
    });

    document.getElementById("import-json-input").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.tools)) toolsData = parsed.tools;
        if (Array.isArray(parsed.breakdowns)) breakdownsData = parsed.breakdowns;
        await safeClearStore(STORE_TOOLS);
        await safeClearStore(STORE_BREAKDOWNS);
        for (const t of toolsData) await putToStore(STORE_TOOLS, t);
        for (const b of breakdownsData) await putToStore(STORE_BREAKDOWNS, b);
        if (Array.isArray(parsed.photoBackup) && typeof writePhotoBackupStore === "function") {
            writePhotoBackupStore(parsed.photoBackup);
        }
        if (typeof syncToolsPhotosToBackup === "function") {
            syncToolsPhotosToBackup(toolsData);
        }
        writeLocalStorageMirror(toolsData, breakdownsData);
        renderCurrentView();
        showToast("Backup imported");
    });

    document.getElementById("export-csv-btn").addEventListener("click", () => {
        const header = "Type,Date,MouldNo,MachineNo,Status,ProblemOrRemark\n";
        const pmLines = toolsData.map((t) => `PM,${t.scheduledDate || ""},${t.toolCode || ""},,${t.status || ""},"${(t.remarks || "").replace(/"/g, '""')}"`);
        const bdLines = breakdownsData.map((b) => `Breakdown,${b.date || ""},${b.toolCode || ""},${b.machineNo || ""},${b.bdStatus || ""},"${(b.issue || "").replace(/"/g, '""')}"`);
        const blob = new Blob([header + [...pmLines, ...bdLines].join("\n")], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `toolsync-report-${TODAY_ISO}.csv`;
        a.click();
    });

    document.getElementById("clear-all-data-btn").addEventListener("click", async () => {
        toolsData = [];
        breakdownsData = [];
        await safeClearStore(STORE_TOOLS);
        await safeClearStore(STORE_BREAKDOWNS);
        if (typeof writePhotoBackupStore === "function") {
            writePhotoBackupStore([]);
        }
        writeLocalStorageMirror([], []);
        renderCurrentView();
        showToast("All records cleared");
    });

    setActiveView("present-pm");
}

initApp();