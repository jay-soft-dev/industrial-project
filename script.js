// =========================================================
// Dual Persistence Setup (IndexedDB + localStorage Fallback)
// =========================================================
const DB_NAME = "ToolSyncPMDB";
const DB_VERSION = 3;
const STORE_TOOLS = "pmTools";
const STORE_LOGS = "auditLogs";
const LS_BACKUP_KEY = "ToolSyncPM_Persistent_State_v2";
const CLEAN_SLATE_FLAG = "ToolSyncPM_CleanStart_Done_v1";

function writeLocalStorageMirror(tools, logs) {
    try {
        const slimTools = tools.map((t) => ({
            ...t,
            beforePhoto: t.beforePhoto || null,
            afterPhoto: t.afterPhoto || null
        }));
        const payload = JSON.stringify({
            savedAt: Date.now(),
            tools: slimTools,
            logs: logs.slice(0, 120)
        });
        localStorage.setItem(LS_BACKUP_KEY, payload);
    } catch {
        try {
            const textOnlyTools = tools.map(({ beforePhoto, afterPhoto, ...rest }) => ({
                ...rest,
                beforePhoto: beforePhoto ? "__IDB_PHOTO__" : null,
                afterPhoto: afterPhoto ? "__IDB_PHOTO__" : null
            }));
            localStorage.setItem(
                LS_BACKUP_KEY,
                JSON.stringify({
                    savedAt: Date.now(),
                    tools: textOnlyTools,
                    logs: logs.slice(0, 120)
                })
            );
        } catch {
            // Ignore if storage is unavailable
        }
    }
}

function readLocalStorageMirror() {
    try {
        const raw = localStorage.getItem(LS_BACKUP_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.tools)) return null;
        return {
            tools: parsed.tools,
            logs: Array.isArray(parsed.logs) ? parsed.logs : []
        };
    } catch {
        return null;
    }
}

function openDB() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("IndexedDB not supported"));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_TOOLS)) {
                const toolStore = db.createObjectStore(STORE_TOOLS, { keyPath: "id" });
                toolStore.createIndex("scheduledDate", "scheduledDate", { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_LOGS)) {
                db.createObjectStore(STORE_LOGS, { keyPath: "id" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getAllFromStore(storeName) {
    try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch {
        const mirror = readLocalStorageMirror();
        if (!mirror) return [];
        return storeName === STORE_TOOLS ? mirror.tools : mirror.logs;
    }
}

async function putToStore(storeName, item) {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).put(item);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Fallback handled via mirror sync
    }
}

async function deleteByIdFromStore(storeName, id) {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Fallback handled via mirror sync
    }
}

async function clearStore(storeName) {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Fallback handled via mirror sync
    }
}

async function runOneTimeCleanSlate() {
    try {
        if (localStorage.getItem(CLEAN_SLATE_FLAG) === "true") return;

        await clearStore(STORE_TOOLS);
        await clearStore(STORE_LOGS);

        try {
            localStorage.removeItem(LS_BACKUP_KEY);
            localStorage.removeItem("ToolSyncPM_Persistent_State_v1");
        } catch {
            // Ignore
        }

        try {
            if (indexedDB && typeof indexedDB.deleteDatabase === "function") {
                indexedDB.deleteDatabase("MoldPMControlDB");
            }
        } catch {
            // Ignore
        }

        localStorage.setItem(CLEAN_SLATE_FLAG, "true");
    } catch {
        // Ignore
    }
}

// =========================================================
// Helpers: Dates, 12-Month Calendar, Toast, Image Compression
// =========================================================
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];
const MONTH_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatDateISO(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function addDaysISO(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return formatDateISO(dt);
}

function getMonthFirstDayISO(dateStr) {
    const [y, m] = dateStr.split("-");
    return `${y}-${m}-01`;
}

function getYearMonthPrefix(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

const toastEl = document.getElementById("toast");
let toastTimer = null;
function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove("translate-y-20", "opacity-0");
    toastEl.classList.add("translate-y-0", "opacity-100");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove("translate-y-0", "opacity-100");
        toastEl.classList.add("translate-y-20", "opacity-0");
    }, 2500);
}

function compressImageFile(file, maxWidth = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.onerror = reject;
            img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// =========================================================
// App State & Core PM Logic
// =========================================================
const todayISO = formatDateISO(new Date());
let allTools = [];
let allLogs = [];
let activeDate = todayISO;
let tableShowAllDates = false;
let moldSearchQuery = "";

const [initY, initM] = todayISO.split("-").map(Number);
let calYear = initY;
let calMonth = initM - 1;

let activeModalToolId = null;
let activeEditToolId = null;
let draftBeforePhoto = null;
let draftAfterPhoto = null;
let lastRawOcrText = "";

const dateInput = document.getElementById("selected-date");
const monthSelect = document.getElementById("calendar-month-select");
const yearSelect = document.getElementById("calendar-year-select");
const addPanel = document.getElementById("add-tool-panel");

const headerMoldSearchInput = document.getElementById("header-mold-search");
const clearMoldSearchBtn = document.getElementById("clear-mold-search-btn");
const moldSearchResultsEl = document.getElementById("mold-search-results");
const activeSearchBanner = document.getElementById("active-search-banner");
const activeSearchText = document.getElementById("active-search-text");
const searchMatchesInlineList = document.getElementById("search-matches-inline-list");

function populateYearOptions(centerYear) {
    if (!yearSelect) return;
    const startYear = centerYear - 5;
    const endYear = centerYear + 2;
    yearSelect.innerHTML = "";
    for (let y = startYear; y <= endYear; y++) {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        if (y === calYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }
}

populateYearOptions(initY);
if (dateInput) dateInput.value = activeDate;
if (monthSelect) monthSelect.value = String(calMonth);

// =========================================================
// All-Months Mold Search (Header Connected to All 12 Months)
// =========================================================
function getMatchingMoldsAcrossAllMonths(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allTools
        .filter((t) => {
            const hay = `${t.toolCode || ""} ${t.moldName || ""} ${t.machineNo || ""} ${t.scheduledDate || ""} ${t.status || ""} ${t.remarks || ""}`.toLowerCase();
            return hay.includes(q);
        })
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

function jumpToToolAcrossMonths(toolId) {
    const found = allTools.find((t) => t.id === toolId);
    if (!found) return;
    if (moldSearchResultsEl) moldSearchResultsEl.classList.add("hidden");
    selectCalendarDate(found.scheduledDate);
    showToast(`Jumped to ${found.toolCode} (${found.scheduledDate})`);
}

function renderHeaderMoldSearchDropdown() {
    if (!clearMoldSearchBtn || !moldSearchResultsEl) return;
    const q = moldSearchQuery.trim();
    clearMoldSearchBtn.classList.toggle("hidden", q.length === 0);

    if (!q) {
        moldSearchResultsEl.classList.add("hidden");
        moldSearchResultsEl.innerHTML = "";
        return;
    }

    const matches = getMatchingMoldsAcrossAllMonths(q);
    moldSearchResultsEl.classList.remove("hidden");

    if (matches.length === 0) {
        moldSearchResultsEl.innerHTML = `
            <div class="p-4 text-xs font-mono text-stone-400">
                No mold matching "<span class="text-amber-300">${q}</span>" across any month.
            </div>
        `;
        return;
    }

    moldSearchResultsEl.innerHTML = `
        <div class="px-3 py-2 bg-[#0d1017] text-[10px] font-mono uppercase text-amber-300 flex items-center justify-between">
            <span>All Months Match (${matches.length})</span>
            <span class="text-stone-400">Click to jump</span>
        </div>
        ${matches
            .map((t) => {
                const [y, m] = (t.scheduledDate || "").split("-").map(Number);
                const mLabel = m ? `${MONTH_SHORT[m - 1]} ${y}` : t.scheduledDate;
                return `
                    <button
                        type="button"
                        onclick="jumpToToolAcrossMonths('${t.id}')"
                        class="w-full px-3.5 py-2.5 text-left hover:bg-stone-800/70 transition flex items-center justify-between gap-3"
                    >
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 font-mono text-xs">
                                <span class="font-bold text-amber-400">${t.toolCode}</span>
                                <span class="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 text-[10px]">${mLabel}</span>
                                <span class="text-stone-400 text-[11px]">${t.scheduledDate}</span>
                            </div>
                            <div class="text-xs text-stone-100 truncate mt-0.5">${t.moldName} • <span class="font-mono text-stone-400">${t.machineNo}</span></div>
                        </div>
                        <span class="text-[11px] font-mono text-amber-300 shrink-0">Go &rarr;</span>
                    </button>
                `;
            })
            .join("")}
    `;
}

function clearAllMoldSearch() {
    moldSearchQuery = "";
    if (headerMoldSearchInput) headerMoldSearchInput.value = "";
    if (clearMoldSearchBtn) clearMoldSearchBtn.classList.add("hidden");
    if (moldSearchResultsEl) {
        moldSearchResultsEl.classList.add("hidden");
        moldSearchResultsEl.innerHTML = "";
    }
    renderAll();
}

if (headerMoldSearchInput) {
    headerMoldSearchInput.addEventListener("input", (e) => {
        moldSearchQuery = e.target.value;
        renderHeaderMoldSearchDropdown();
        renderAll();
    });

    headerMoldSearchInput.addEventListener("focus", () => {
        if (moldSearchQuery.trim()) {
            renderHeaderMoldSearchDropdown();
        }
    });
}

if (clearMoldSearchBtn) {
    clearMoldSearchBtn.addEventListener("click", clearAllMoldSearch);
}

const resetAllSearchBtn = document.getElementById("reset-all-search-btn");
if (resetAllSearchBtn) {
    resetAllSearchBtn.addEventListener("click", clearAllMoldSearch);
}

document.addEventListener("click", (e) => {
    if (
        moldSearchResultsEl &&
        !e.target.closest("#header-mold-search") &&
        !e.target.closest("#mold-search-results")
    ) {
        moldSearchResultsEl.classList.add("hidden");
    }
});

async function addAuditLog(message) {
    const entry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleString(),
        message
    };
    await putToStore(STORE_LOGS, entry);
    allLogs.unshift(entry);
    writeLocalStorageMirror(allTools, allLogs);
}

async function deleteToolRecord(toolId, skipConfirm = false) {
    const target = allTools.find((t) => t.id === toolId);
    if (!target) return false;

    if (!skipConfirm) {
        const ok = window.confirm(
            `Delete "${target.toolCode} — ${target.moldName}" scheduled on ${target.scheduledDate}?`
        );
        if (!ok) return false;
    }

    allTools = allTools.filter((t) => t.id !== toolId);
    await deleteByIdFromStore(STORE_TOOLS, toolId);
    writeLocalStorageMirror(allTools, allLogs);

    if (activeModalToolId === toolId) closePhotoModal();
    if (activeEditToolId === toolId) closeEditModal();

    await addAuditLog(`DELETED: ${target.toolCode} (${target.moldName}) removed from ${target.scheduledDate}.`);
    await refreshAll();
    showToast(`Deleted ${target.toolCode}`);
    return true;
}

const editModal = document.getElementById("edit-tool-modal");
const editModalHeading = document.getElementById("edit-modal-heading");
const editToolForm = document.getElementById("edit-tool-form");
const editToolCodeInput = document.getElementById("edit-tool-code");
const editMoldNameInput = document.getElementById("edit-mold-name");
const editMachineNoInput = document.getElementById("edit-machine-no");
const editScheduledDateInput = document.getElementById("edit-scheduled-date");
const editStatusSelect = document.getElementById("edit-status");
const editRemarksInput = document.getElementById("edit-remarks");

function openEditModal(toolId) {
    const tool = allTools.find((t) => t.id === toolId);
    if (!tool) return;
    activeEditToolId = tool.id;
    editModalHeading.textContent = `Edit ${tool.toolCode} — ${tool.moldName}`;
    editToolCodeInput.value = tool.toolCode || "";
    editMoldNameInput.value = tool.moldName || "";
    editMachineNoInput.value = tool.machineNo || "";
    editScheduledDateInput.value = tool.scheduledDate || activeDate;
    editStatusSelect.value = tool.status || "Scheduled";
    editRemarksInput.value = tool.remarks || "";

    editModal.classList.remove("hidden");
    editModal.classList.add("flex");
}

function closeEditModal() {
    activeEditToolId = null;
    editModal.classList.add("hidden");
    editModal.classList.remove("flex");
}

document.getElementById("close-edit-modal-btn").addEventListener("click", closeEditModal);
document.getElementById("cancel-edit-btn").addEventListener("click", closeEditModal);

document.getElementById("delete-from-edit-btn").addEventListener("click", async () => {
    if (!activeEditToolId) return;
    await deleteToolRecord(activeEditToolId);
});

editToolForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeEditToolId) return;
    const tool = allTools.find((t) => t.id === activeEditToolId);
    if (!tool) return;

    const prevDate = tool.scheduledDate;
    tool.toolCode = editToolCodeInput.value.trim().toUpperCase();
    tool.moldName = editMoldNameInput.value.trim();
    tool.machineNo = editMachineNoInput.value.trim().toUpperCase();
    tool.scheduledDate = editScheduledDateInput.value || prevDate;
    tool.status = editStatusSelect.value;
    tool.remarks = editRemarksInput.value.trim();
    if (tool.status === "PM Completed" && !tool.completedAt) {
        tool.completedAt = new Date().toISOString();
    }

    await putToStore(STORE_TOOLS, tool);
    writeLocalStorageMirror(allTools, allLogs);
    await addAuditLog(
        `EDITED: ${tool.toolCode} (${tool.moldName}) updated on ${tool.scheduledDate} [${tool.status}].`
    );

    const targetDate = tool.scheduledDate;
    closeEditModal();
    selectCalendarDate(targetDate);
    await refreshAll();
    showToast(`Updated ${tool.toolCode}`);
});

async function handleMachineRunning(toolId) {
    const targetTool = allTools.find((t) => t.id === toolId);
    if (!targetTool) return;

    const currentSlotDate = targetTool.scheduledDate;

    const futureCandidates = allTools
        .filter((t) => t.id !== targetTool.id && t.scheduledDate > currentSlotDate && t.status === "Scheduled")
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

    const pushedDate = addDaysISO(currentSlotDate, 1);

    if (futureCandidates.length > 0) {
        const replacement = futureCandidates[0];
        const oldReplacementDate = replacement.scheduledDate;

        replacement.scheduledDate = currentSlotDate;
        replacement.note = `Pulled from ${oldReplacementDate} (Swap for running ${targetTool.toolCode})`;

        targetTool.scheduledDate = addDaysISO(oldReplacementDate, 1);
        targetTool.status = "Swapped / Rescheduled";
        targetTool.note = `Running on ${targetTool.machineNo} on ${currentSlotDate}; moved to ${targetTool.scheduledDate}`;

        await putToStore(STORE_TOOLS, replacement);
        await putToStore(STORE_TOOLS, targetTool);
        await addAuditLog(
            `AUTO-SWAP: ${targetTool.toolCode} running on ${currentSlotDate} -> pushed to ${targetTool.scheduledDate}; ${replacement.toolCode} pulled to ${currentSlotDate}.`
        );
        showToast(`Swapped with ${replacement.toolCode}`);
    } else {
        targetTool.scheduledDate = pushedDate;
        targetTool.status = "Swapped / Rescheduled";
        targetTool.note = `Running on ${currentSlotDate}; pushed to ${pushedDate}`;
        await putToStore(STORE_TOOLS, targetTool);
        await addAuditLog(`RESCHEDULED: ${targetTool.toolCode} pushed from ${currentSlotDate} to ${pushedDate}.`);
        showToast(`${targetTool.toolCode} pushed to ${pushedDate}`);
    }

    await refreshAll();
}

function setCalendarMonth(year, monthIndex, selectFirstDayIfOutside = false) {
    const normalized = new Date(year, monthIndex, 1);
    calYear = normalized.getFullYear();
    calMonth = normalized.getMonth();

    if (yearSelect) {
        const existingYears = Array.from(yearSelect.options).map((o) => Number(o.value));
        if (!existingYears.includes(calYear)) {
            populateYearOptions(calYear);
        }
        yearSelect.value = String(calYear);
    }
    if (monthSelect) {
        monthSelect.value = String(calMonth);
    }

    const ymPrefix = getYearMonthPrefix(calYear, calMonth);
    if (selectFirstDayIfOutside && !activeDate.startsWith(ymPrefix)) {
        activeDate = `${ymPrefix}-01`;
        if (dateInput) dateInput.value = activeDate;
    }

    renderAll();
}

document.getElementById("prev-month-btn").addEventListener("click", () => {
    setCalendarMonth(calYear, calMonth - 1, true);
});

document.getElementById("next-month-btn").addEventListener("click", () => {
    setCalendarMonth(calYear, calMonth + 1, true);
});

if (monthSelect) {
    monthSelect.addEventListener("change", (e) => {
        setCalendarMonth(calYear, Number(e.target.value), true);
    });
}

if (yearSelect) {
    yearSelect.addEventListener("change", (e) => {
        setCalendarMonth(Number(e.target.value), calMonth, true);
    });
}

document.getElementById("jump-today-btn").addEventListener("click", () => {
    activeDate = todayISO;
    if (dateInput) dateInput.value = activeDate;
    const [y, m] = todayISO.split("-").map(Number);
    setCalendarMonth(y, m - 1, false);
});

const ocrModal = document.getElementById("ocr-modal");
const planPhotoInput = document.getElementById("plan-photo-input");
const planPhotoPreview = document.getElementById("plan-photo-preview");
const planPhotoPlaceholder = document.getElementById("plan-photo-placeholder");
const ocrProgressBox = document.getElementById("ocr-progress-box");
const ocrStatusText = document.getElementById("ocr-status-text");
const ocrPercent = document.getElementById("ocr-percent");
const ocrProgressBar = document.getElementById("ocr-progress-bar");
const planStartDateInput = document.getElementById("plan-start-date");
const datewiseTextarea = document.getElementById("datewise-text-output");
const parsedSummaryLabel = document.getElementById("parsed-summary-label");

document.getElementById("open-ocr-modal-btn").addEventListener("click", () => {
    planStartDateInput.value = getMonthFirstDayISO(activeDate);
    ocrModal.classList.remove("hidden");
    ocrModal.classList.add("flex");
    updateParsedCounter();
});

document.getElementById("close-ocr-modal-btn").addEventListener("click", () => {
    ocrModal.classList.add("hidden");
    ocrModal.classList.remove("flex");
});

function convertOcrTextToDateWiseFormat(rawText, monthStartISO) {
    const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

    const [baseYear, baseMonth] = monthStartISO.split("-");
    const dateMap = new Map();
    const ungroupedMolds = [];

    const moldTokenRegex = /\b(?:IM|T|TL|MLD|MOLD|M)[-\s]?\d{1,4}[A-Z]?\b/gi;
    const dateRegex = /\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/;

    for (const line of lines) {
        const foundMolds = (line.match(moldTokenRegex) || []).map((m) =>
            m.toUpperCase().replace(/\s+/g, "-")
        );
        const dateMatch = line.match(dateRegex);

        if (dateMatch && foundMolds.length > 0) {
            const dayNum = String(Math.min(31, Math.max(1, parseInt(dateMatch[1], 10)))).padStart(2, "0");
            const monthNum = dateMatch[2]
                ? String(Math.min(12, Math.max(1, parseInt(dateMatch[2], 10)))).padStart(2, "0")
                : baseMonth;
            const yearNum = dateMatch[3]
                ? dateMatch[3].length === 2
                    ? `20${dateMatch[3]}`
                    : dateMatch[3]
                : baseYear;

            const iso = `${yearNum}-${monthNum}-${dayNum}`;
            const existing = dateMap.get(iso) || [];
            for (const code of foundMolds) {
                if (!existing.includes(code)) existing.push(code);
            }
            dateMap.set(iso, existing);
        } else if (foundMolds.length > 0) {
            for (const code of foundMolds) {
                if (!ungroupedMolds.includes(code)) ungroupedMolds.push(code);
            }
        }
    }

    const outputLines = [];
    if (dateMap.size > 0) {
        const sortedDates = Array.from(dateMap.keys()).sort();
        for (const d of sortedDates) {
            outputLines.push(`${d} | ${dateMap.get(d).join(", ")}`);
        }
    }

    if (ungroupedMolds.length > 0) {
        const startOffset = outputLines.length;
        for (let i = 0; i < ungroupedMolds.length; i += 3) {
            const chunk = ungroupedMolds.slice(i, i + 3);
            const dayDate = addDaysISO(monthStartISO, startOffset + Math.floor(i / 3));
            outputLines.push(`${dayDate} | ${chunk.join(", ")}`);
        }
    }

    if (outputLines.length === 0) {
        return lines
            .map((line, idx) => `${addDaysISO(monthStartISO, Math.floor(idx / 3))} | ${line}`)
            .join("\n");
    }

    return outputLines.join("\n");
}

document.getElementById("auto-distribute-80-btn").addEventListener("click", () => {
    const startISO = planStartDateInput.value || getMonthFirstDayISO(activeDate);
    const currentText = datewiseTextarea.value.trim();

    const extracted = [];
    const lines = currentText.split(/\r?\n/);
    for (const line of lines) {
        const contentPart = line.includes("|") ? line.split("|").slice(1).join("|") : line;
        const parts = contentPart
            .split(/[,;]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        for (const p of parts) {
            extracted.push(p);
        }
    }

    if (extracted.length === 0) {
        showToast("Enter or scan mold numbers first");
        return;
    }

    const mappedLines = [];
    for (let i = 0; i < extracted.length; i += 3) {
        const slice = extracted.slice(i, i + 3);
        const slotDate = addDaysISO(startISO, Math.floor(i / 3));
        mappedLines.push(`${slotDate} | ${slice.join(", ")}`);
    }

    datewiseTextarea.value = mappedLines.join("\n");
    updateParsedCounter();
    showToast(`Mapped ${extracted.length} molds (3/day)`);
});

planPhotoInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    planPhotoPreview.src = previewUrl;
    planPhotoPreview.classList.remove("hidden");
    planPhotoPlaceholder.classList.add("hidden");

    ocrProgressBox.classList.remove("hidden");
    ocrStatusText.textContent = "Scanning plan photo...";
    ocrPercent.textContent = "5%";
    ocrProgressBar.style.width = "5%";

    try {
        if (typeof Tesseract === "undefined") {
            throw new Error("OCR engine unavailable offline");
        }
        const result = await Tesseract.recognize(file, "eng", {
            logger: (m) => {
                if (m.status === "recognizing text" && typeof m.progress === "number") {
                    const pct = Math.round(m.progress * 100);
                    ocrPercent.textContent = `${pct}%`;
                    ocrProgressBar.style.width = `${pct}%`;
                }
            }
        });

        lastRawOcrText = result.data.text || "";
        const startISO = planStartDateInput.value || getMonthFirstDayISO(activeDate);
        datewiseTextarea.value = convertOcrTextToDateWiseFormat(lastRawOcrText, startISO);
        ocrStatusText.textContent = "Scan complete — review text below";
        updateParsedCounter();
        showToast("Plan photo converted to date-wise text");
    } catch {
        ocrStatusText.textContent = "Could not auto-read image; edit manually or use Auto-Map.";
        showToast("OCR scan failed — edit manually");
    }
});

function parseDateWiseLines(text) {
    const entries = [];
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
        const match = line.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/);
        if (!match) continue;
        const dateStr = match[1];
        const molds = match[2]
            .split(/[,;]+/)
            .map((m) => m.trim())
            .filter(Boolean);

        for (const moldCode of molds) {
            entries.push({ dateStr, moldCode });
        }
    }
    return entries;
}

function updateParsedCounter() {
    const parsed = parseDateWiseLines(datewiseTextarea.value);
    const uniqueDays = new Set(parsed.map((p) => p.dateStr)).size;
    parsedSummaryLabel.textContent = `${parsed.length} molds across ${uniqueDays} calendar dates ready to save`;
}

datewiseTextarea.addEventListener("input", updateParsedCounter);

document.getElementById("copy-datewise-text-btn").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(datewiseTextarea.value);
        showToast("Date-wise text copied");
    } catch {
        datewiseTextarea.select();
        document.execCommand("copy");
        showToast("Text copied");
    }
});

document.getElementById("import-replace-btn").addEventListener("click", async () => {
    const parsed = parseDateWiseLines(datewiseTextarea.value);
    if (parsed.length === 0) {
        showToast("Use format: YYYY-MM-DD | MOLD-01, MOLD-02, MOLD-03");
        return;
    }

    const affectedMonths = new Set(parsed.map((p) => p.dateStr.slice(0, 7)));
    const existingInTargetMonths = allTools.filter((t) =>
        affectedMonths.has(t.scheduledDate.slice(0, 7))
    );
    for (const oldItem of existingInTargetMonths) {
        await deleteByIdFromStore(STORE_TOOLS, oldItem.id);
    }

    for (let i = 0; i < parsed.length; i++) {
        const { dateStr, moldCode } = parsed[i];
        await putToStore(STORE_TOOLS, {
            id: `tool_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
            toolCode: moldCode.toUpperCase(),
            moldName: `Mold ${moldCode.toUpperCase()}`,
            machineNo: `IMM-${String((i % 12) + 1).padStart(2, "0")}`,
            originalDate: dateStr,
            scheduledDate: dateStr,
            status: "Scheduled",
            note: "",
            beforePhoto: null,
            afterPhoto: null,
            remarks: ""
        });
    }

    activeDate = parsed[0].dateStr;
    if (dateInput) dateInput.value = activeDate;
    const [y, m] = activeDate.split("-").map(Number);
    setCalendarMonth(y, m - 1, false);

    await addAuditLog(
        `SCHEDULE BOUND TO CALENDAR: Saved ${parsed.length} molds (${Array.from(affectedMonths).join(", ")}).`
    );
    ocrModal.classList.add("hidden");
    ocrModal.classList.remove("flex");
    await refreshAll();
    showToast(`Saved ${parsed.length} molds to calendar dates`);
});

const photoModal = document.getElementById("photo-modal");
const modalTitle = document.getElementById("modal-tool-title");
const beforeInput = document.getElementById("before-photo-input");
const afterInput = document.getElementById("after-photo-input");
const beforePreview = document.getElementById("before-photo-preview");
const afterPreview = document.getElementById("after-photo-preview");
const beforePlaceholder = document.getElementById("before-photo-placeholder");
const afterPlaceholder = document.getElementById("after-photo-placeholder");
const remarksInput = document.getElementById("pm-remarks");

function setPhotoSlot(imgEl, placeholderEl, dataUrl) {
    if (dataUrl && dataUrl !== "__IDB_PHOTO__") {
        imgEl.src = dataUrl;
        imgEl.classList.remove("hidden");
        placeholderEl.classList.add("hidden");
    } else {
        imgEl.src = "";
        imgEl.classList.add("hidden");
        placeholderEl.classList.remove("hidden");
    }
}

function openPhotoModal(toolId) {
    const tool = allTools.find((t) => t.id === toolId);
    if (!tool) return;
    activeModalToolId = tool.id;
    draftBeforePhoto = tool.beforePhoto && tool.beforePhoto !== "__IDB_PHOTO__" ? tool.beforePhoto : null;
    draftAfterPhoto = tool.afterPhoto && tool.afterPhoto !== "__IDB_PHOTO__" ? tool.afterPhoto : null;
    remarksInput.value = tool.remarks || "";

    modalTitle.textContent = `${tool.toolCode} — ${tool.moldName} (${tool.scheduledDate})`;
    setPhotoSlot(beforePreview, beforePlaceholder, draftBeforePhoto);
    setPhotoSlot(afterPreview, afterPlaceholder, draftAfterPhoto);

    photoModal.classList.remove("hidden");
    photoModal.classList.add("flex");
}

function closePhotoModal() {
    activeModalToolId = null;
    draftBeforePhoto = null;
    draftAfterPhoto = null;
    beforeInput.value = "";
    afterInput.value = "";
    photoModal.classList.add("hidden");
    photoModal.classList.remove("flex");
}

document.getElementById("remove-before-photo-btn").addEventListener("click", () => {
    draftBeforePhoto = null;
    beforeInput.value = "";
    setPhotoSlot(beforePreview, beforePlaceholder, null);
    showToast("Before photo cleared");
});

document.getElementById("remove-after-photo-btn").addEventListener("click", () => {
    draftAfterPhoto = null;
    afterInput.value = "";
    setPhotoSlot(afterPreview, afterPlaceholder, null);
    showToast("After photo cleared");
});

document.getElementById("delete-from-photo-btn").addEventListener("click", async () => {
    if (!activeModalToolId) return;
    await deleteToolRecord(activeModalToolId);
});

beforeInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    draftBeforePhoto = await compressImageFile(file);
    setPhotoSlot(beforePreview, beforePlaceholder, draftBeforePhoto);
    showToast("Before photo compressed");
});

afterInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    draftAfterPhoto = await compressImageFile(file);
    setPhotoSlot(afterPreview, afterPlaceholder, draftAfterPhoto);
    showToast("After photo compressed");
});

async function saveModalChanges(markCompleted) {
    const tool = allTools.find((t) => t.id === activeModalToolId);
    if (!tool) return;

    tool.beforePhoto = draftBeforePhoto;
    tool.afterPhoto = draftAfterPhoto;
    tool.remarks = remarksInput.value.trim();

    if (markCompleted) {
        tool.status = "PM Completed";
        tool.completedAt = new Date().toISOString();
        await addAuditLog(`PM COMPLETED: ${tool.toolCode} (${tool.moldName}) on ${tool.scheduledDate}.`);
    } else {
        await addAuditLog(`PHOTOS SAVED: ${tool.toolCode} on ${tool.scheduledDate} updated.`);
    }

    await putToStore(STORE_TOOLS, tool);
    writeLocalStorageMirror(allTools, allLogs);
    closePhotoModal();
    await refreshAll();
    showToast(markCompleted ? "PM marked completed" : "Photos saved");
}

document.getElementById("close-modal-btn").addEventListener("click", closePhotoModal);
document.getElementById("save-photos-only-btn").addEventListener("click", () => saveModalChanges(false));
document.getElementById("complete-pm-btn").addEventListener("click", () => saveModalChanges(true));

function getStatusBadge(status) {
    if (status === "PM Completed") {
        return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">PM Completed</span>`;
    }
    if (status === "Swapped / Rescheduled") {
        return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30">Swapped / Rescheduled</span>`;
    }
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">Scheduled</span>`;
}

function selectCalendarDate(dateStr) {
    activeDate = dateStr;
    if (dateInput) dateInput.value = dateStr;
    const [y, m] = dateStr.split("-").map(Number);
    calYear = y;
    calMonth = m - 1;
    if (monthSelect) monthSelect.value = String(calMonth);
    if (yearSelect) {
        const existingYears = Array.from(yearSelect.options).map((o) => Number(o.value));
        if (!existingYears.includes(calYear)) {
            populateYearOptions(calYear);
        }
        yearSelect.value = String(calYear);
    }
    renderAll();
}

function renderTwelveMonthPills() {
    const pillsContainer = document.getElementById("twelve-month-pills");
    pillsContainer.innerHTML = MONTH_SHORT.map((shortLabel, idx) => {
        const prefix = getYearMonthPrefix(calYear, idx);
        const count = allTools.filter((t) => t.scheduledDate.startsWith(prefix)).length;
        const isCurrent = idx === calMonth;
        return `
            <button
                type="button"
                onclick="setCalendarMonth(${calYear}, ${idx}, true)"
                class="shrink-0 px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                    isCurrent
                        ? "border-amber-400 bg-amber-400/15 text-amber-300 font-bold"
                        : "border-stone-800 bg-[#0b0d11] hover:border-stone-600 text-stone-300"
                }"
            >
                <span>${shortLabel}</span>
                <span class="px-1.5 py-0.2 rounded bg-stone-800 text-[10px] text-stone-200">${count}</span>
            </button>
        `;
    }).join("");
}

function renderCalendarGrid() {
    document.getElementById("calendar-month-heading").textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
    renderTwelveMonthPills();

    const grid = document.getElementById("calendar-days-grid");
    const firstWeekday = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    const byDate = new Map();
    for (const tool of allTools) {
        const list = byDate.get(tool.scheduledDate) || [];
        list.push(tool);
        byDate.set(tool.scheduledDate, list);
    }

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) {
        cells.push(`<div class="min-h-[76px] sm:min-h-[88px] rounded-xl border border-stone-900/60 bg-[#0a0c10]/50"></div>`);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayTools = byDate.get(dateStr) || [];
        const doneCount = dayTools.filter((t) => t.status === "PM Completed").length;
        const swapCount = dayTools.filter((t) => t.status === "Swapped / Rescheduled").length;
        const allDoneOnDate = dayTools.length > 0 && doneCount === dayTools.length;

        const isSelected = dateStr === activeDate;
        const isToday = dateStr === todayISO;

        const borderClass = isSelected
            ? "border-amber-400 ring-1 ring-amber-400/60 bg-[#171c26]"
            : allDoneOnDate
            ? "border-emerald-500/40 bg-[#0e1714] hover:border-emerald-400/70"
            : isToday
            ? "border-sky-400/60 bg-[#131822]"
            : "border-stone-800/90 bg-[#0b0d11] hover:border-stone-600";

        cells.push(`
            <button
                type="button"
                onclick="selectCalendarDate('${dateStr}')"
                class="min-h-[76px] sm:min-h-[88px] rounded-xl border ${borderClass} p-1.5 sm:p-2 text-left flex flex-col justify-between transition"
            >
                <div class="flex items-center justify-between w-full font-mono text-xs">
                    <span class="${isSelected ? "text-amber-300 font-bold" : "text-stone-300"}">${day}</span>
                    ${
                        allDoneOnDate
                            ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">PM DONE</span>`
                            : isToday
                            ? `<span class="text-[9px] px-1 rounded bg-sky-500/20 text-sky-300">TODAY</span>`
                            : ""
                    }
                </div>

                <div class="space-y-1 w-full">
                    ${
                        dayTools.length > 0
                            ? `<div class="text-[10px] font-mono text-amber-300 truncate">${dayTools.map((x) => x.toolCode).join(", ")}</div>`
                            : `<div class="text-[10px] font-mono text-stone-600">—</div>`
                    }
                    ${
                        swapCount > 0
                            ? `<div class="text-[9px] font-mono text-sky-300 truncate">${swapCount} swapped</div>`
                            : ""
                    }
                </div>
            </button>
        `);
    }

    grid.innerHTML = cells.join("");
}

function renderClickedDateStatusBanner(selectedDayTools) {
    const badgeEl = document.getElementById("clicked-date-badge");
    const summaryEl = document.getElementById("clicked-date-summary");
    const quickActionsEl = document.getElementById("clicked-date-quick-actions");

    badgeEl.textContent = `Calendar Date Record • ${activeDate}`;

    if (selectedDayTools.length === 0) {
        summaryEl.innerHTML = `No PM entry saved behind <span class="font-mono text-amber-300">${activeDate}</span> yet.`;
        quickActionsEl.innerHTML = "";
        return;
    }

    const doneTools = selectedDayTools.filter((t) => t.status === "PM Completed");
    const pendingTools = selectedDayTools.filter((t) => t.status !== "PM Completed");

    if (doneTools.length === selectedDayTools.length) {
        summaryEl.innerHTML = `<span class="text-emerald-400 font-bold">&#10004; PM Completed on ${activeDate}</span> — ${doneTools
            .map((t) => `${t.toolCode} (${t.moldName})`)
            .join(", ")}`;
    } else if (doneTools.length > 0) {
        summaryEl.innerHTML = `<span class="text-amber-300 font-bold">Partial PM on ${activeDate}:</span> ${doneTools.length} completed (${doneTools
            .map((t) => t.toolCode)
            .join(", ")}), ${pendingTools.length} pending (${pendingTools.map((t) => t.toolCode).join(", ")})`;
    } else {
        summaryEl.innerHTML = `<span class="text-amber-300 font-bold">Scheduled on ${activeDate}:</span> ${selectedDayTools
            .map((t) => `${t.toolCode} [${t.status}]`)
            .join(", ")}`;
    }

    quickActionsEl.innerHTML = selectedDayTools
        .map(
            (t) => `
            <span class="inline-flex items-center gap-1 rounded-lg bg-[#11151d] border border-stone-800 px-2 py-1 text-[11px] font-mono">
                <span class="text-amber-300 font-semibold">${t.toolCode}</span>
                <button
                    type="button"
                    onclick="openEditModal('${t.id}')"
                    class="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-sky-300 transition"
                >
                    Edit
                </button>
                <button
                    type="button"
                    onclick="deleteToolRecord('${t.id}')"
                    class="px-1.5 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition"
                >
                    Delete
                </button>
            </span>
        `
        )
        .join("");
}

function renderAll() {
    renderCalendarGrid();

    const q = moldSearchQuery.trim();
    const allMonthMatches = q ? getMatchingMoldsAcrossAllMonths(q) : [];

    if (activeSearchBanner && activeSearchText && searchMatchesInlineList) {
        if (q) {
            activeSearchBanner.classList.remove("hidden");
            activeSearchText.textContent = `All 12 Months Mold Search ("${q}") — ${allMonthMatches.length} found`;
            searchMatchesInlineList.innerHTML = allMonthMatches.length
                ? allMonthMatches
                      .map((t) => {
                          const [y, m] = (t.scheduledDate || "").split("-").map(Number);
                          const mLabel = m ? `${MONTH_SHORT[m - 1]} ${y}` : t.scheduledDate;
                          return `
                              <button
                                  type="button"
                                  onclick="jumpToToolAcrossMonths('${t.id}')"
                                  class="rounded-xl border border-stone-800 bg-[#0b0d11] hover:border-amber-400 p-3 text-left transition flex items-center justify-between gap-2"
                              >
                                  <div class="min-w-0">
                                      <div class="font-mono text-xs flex items-center gap-1.5">
                                          <span class="font-bold text-amber-400">${t.toolCode}</span>
                                          <span class="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 text-[10px]">${mLabel}</span>
                                          <span class="text-stone-400 text-[11px]">${t.scheduledDate}</span>
                                      </div>
                                      <div class="text-xs text-stone-200 truncate mt-0.5">${t.moldName} (${t.machineNo})</div>
                                  </div>
                                  <span class="text-[11px] font-mono text-amber-300 shrink-0">Open &rarr;</span>
                              </button>
                          `;
                      })
                      .join("")
                : `<div class="col-span-full text-xs font-mono text-stone-400">No mold found across any month.</div>`;
        } else {
            activeSearchBanner.classList.add("hidden");
            activeSearchText.textContent = "";
            searchMatchesInlineList.innerHTML = "";
        }
    }

    const ymPrefix = getYearMonthPrefix(calYear, calMonth);
    const monthTools = allTools.filter((t) => t.scheduledDate.startsWith(ymPrefix));
    const selectedDayTools = allTools.filter((t) => t.scheduledDate === activeDate);
    const completedOnDay = selectedDayTools.filter((t) => t.status === "PM Completed").length;
    const swappedInMonth = monthTools.filter((t) => t.status === "Swapped / Rescheduled").length;

    document.getElementById("stat-day-count").textContent = `${completedOnDay} / ${Math.max(3, selectedDayTools.length)}`;
    document.getElementById("stat-swapped-count").textContent = String(swappedInMonth);
    document.getElementById("stat-month-tools").textContent = String(monthTools.length);

    renderClickedDateStatusBanner(selectedDayTools);

    document.getElementById("daily-section-heading").textContent = `Mold PM on ${activeDate}`;

    const cardsGrid = document.getElementById("daily-cards-grid");
    if (selectedDayTools.length === 0) {
        cardsGrid.innerHTML = `
            <div class="col-span-full rounded-2xl border border-dashed border-stone-800 bg-[#11151d]/60 p-8 text-center text-sm text-stone-400">
                No mold PM saved for <span class="font-mono text-amber-400">${activeDate}</span>. Click <strong class="text-amber-300">+ Add PM on Selected Date</strong> to store PM records behind this date.
            </div>
        `;
    } else {
        cardsGrid.innerHTML = selectedDayTools
            .map(
                (t) => `
                <article class="rounded-2xl border border-stone-800 bg-[#11151d] p-5 flex flex-col justify-between gap-4 hover:border-stone-700 transition">
                    <div class="space-y-2">
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-mono text-sm font-bold text-amber-400">${t.toolCode}</span>
                            <div class="flex items-center gap-1.5">
                                ${getStatusBadge(t.status)}
                                <button
                                    type="button"
                                    onclick="openEditModal('${t.id}')"
                                    class="px-2 py-0.5 rounded text-[11px] font-mono bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition"
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onclick="deleteToolRecord('${t.id}')"
                                    class="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 transition"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                        <h3 class="font-bold text-base text-white">${t.moldName}</h3>
                        <p class="text-xs font-mono text-stone-400">Machine: ${t.machineNo} &bull; Date: ${t.scheduledDate}</p>
                        ${t.remarks ? `<p class="text-xs text-stone-300 bg-stone-900/80 border border-stone-800 rounded-lg p-2">Remark: ${t.remarks}</p>` : ""}
                        ${t.note ? `<p class="text-xs text-sky-300/90 bg-sky-950/30 border border-sky-800/40 rounded-lg p-2">${t.note}</p>` : ""}
                    </div>

                    <div class="space-y-2 pt-2 border-t border-stone-800/80">
                        <div class="flex items-center justify-between text-[11px] font-mono text-stone-400">
                            <span>Before: ${t.beforePhoto ? "&#10004; Attached" : "—"}</span>
                            <span>After: ${t.afterPhoto ? "&#10004; Attached" : "—"}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 pt-1">
                            <button type="button" onclick="openPhotoModal('${t.id}')" class="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-100 font-mono text-xs font-semibold transition">
                                Photos / PM Done
                            </button>
                            <button type="button" onclick="handleMachineRunning('${t.id}')" class="px-3 py-2 rounded-lg border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 font-mono text-xs font-semibold transition">
                                Running / Swap
                            </button>
                        </div>
                    </div>
                </article>
            `
            )
            .join("");
    }

    const rowsToShow = q
        ? [...allMonthMatches]
        : tableShowAllDates
        ? [...allTools]
        : [...monthTools];
    rowsToShow.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

    document.getElementById("pm-schedule-heading").textContent = q
        ? `Search Results Across All Months ("${q}") (${rowsToShow.length})`
        : tableShowAllDates
        ? `PM Schedule — All Months (${rowsToShow.length})`
        : `PM Schedule — ${MONTH_NAMES[calMonth]} ${calYear} (${rowsToShow.length})`;

    const tableBody = document.getElementById("schedule-table-body");
    if (rowsToShow.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-stone-500 font-mono text-xs">No PM schedule entries found</td></tr>`;
    } else {
        tableBody.innerHTML = rowsToShow
            .map(
                (t) => `
                <tr class="hover:bg-stone-900/50 cursor-pointer" onclick="selectCalendarDate('${t.scheduledDate}')">
                    <td class="py-3 px-4 font-mono text-xs whitespace-nowrap text-stone-300">${t.scheduledDate}</td>
                    <td class="py-3 px-4 font-mono text-xs font-bold text-amber-400 whitespace-nowrap">${t.toolCode}</td>
                    <td class="py-3 px-4">
                        <div class="font-medium text-stone-100">${t.moldName}</div>
                        <div class="text-xs font-mono text-stone-400">${t.machineNo}</div>
                    </td>
                    <td class="py-3 px-4 whitespace-nowrap">${getStatusBadge(t.status)}</td>
                    <td class="py-3 px-4 whitespace-nowrap" onclick="event.stopPropagation()">
                        <div class="flex items-center gap-2 font-mono text-xs">
                            <button type="button" onclick="openPhotoModal('${t.id}')" class="underline text-amber-300 hover:text-amber-200">
                                ${t.beforePhoto || t.afterPhoto ? "Photos" : "Upload"}
                            </button>
                            <button type="button" onclick="openEditModal('${t.id}')" class="underline text-sky-300 hover:text-sky-200">
                                Edit
                            </button>
                            <button type="button" onclick="deleteToolRecord('${t.id}')" class="underline text-rose-300 hover:text-rose-200">
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `
            )
            .join("");
    }

    const logList = document.getElementById("audit-log-list");
    if (allLogs.length === 0) {
        logList.innerHTML = `<div class="text-stone-500 text-xs">No swap or completion events yet.</div>`;
    } else {
        logList.innerHTML = allLogs
            .map(
                (l) => `
                <div class="rounded-lg border border-stone-800/90 bg-[#0b0d11] p-3 space-y-1">
                    <div class="text-[10px] text-stone-500">${l.timestamp}</div>
                    <div class="text-stone-200 leading-relaxed">${l.message}</div>
                </div>
            `
            )
            .join("");
    }
}

async function refreshAll() {
    let idbTools = await getAllFromStore(STORE_TOOLS);
    let idbLogs = await getAllFromStore(STORE_LOGS);
    const mirror = readLocalStorageMirror();

    if (idbTools.length === 0 && mirror && mirror.tools.length > 0) {
        idbTools = mirror.tools;
        for (const t of idbTools) {
            await putToStore(STORE_TOOLS, t);
        }
    }
    if (idbLogs.length === 0 && mirror && mirror.logs.length > 0) {
        idbLogs = mirror.logs;
        for (const l of idbLogs) {
            await putToStore(STORE_LOGS, l);
        }
    }

    allTools = idbTools;
    allLogs = idbLogs.sort((a, b) => b.id.localeCompare(a.id));
    writeLocalStorageMirror(allTools, allLogs);
    renderAll();
    if (moldSearchQuery.trim()) {
        renderHeaderMoldSearchDropdown();
    }
}

if (dateInput) {
    dateInput.addEventListener("change", (e) => {
        const val = e.target.value || todayISO;
        selectCalendarDate(val);
        showToast(`Jumped to ${val}`);
    });
}

function openAddFormForActiveDate() {
    document.getElementById("new-tool-date").value = activeDate;
    addPanel.classList.remove("hidden");
    addPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("open-add-tool-btn").addEventListener("click", () => {
    document.getElementById("new-tool-date").value = activeDate;
    addPanel.classList.toggle("hidden");
});

document.getElementById("quick-add-for-selected-date-btn").addEventListener("click", openAddFormForActiveDate);

const filterMonthBtn = document.getElementById("filter-month-btn");
const filterAllBtn = document.getElementById("filter-all-btn");

filterMonthBtn.addEventListener("click", () => {
    tableShowAllDates = false;
    filterMonthBtn.className = "px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-400/50 text-amber-300";
    filterAllBtn.className = "px-2.5 py-1 rounded-lg bg-[#0b0d11] border border-stone-700 text-stone-300 hover:border-amber-400";
    renderAll();
});

filterAllBtn.addEventListener("click", () => {
    tableShowAllDates = true;
    filterAllBtn.className = "px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-400/50 text-amber-300";
    filterMonthBtn.className = "px-2.5 py-1 rounded-lg bg-[#0b0d11] border border-stone-700 text-stone-300 hover:border-amber-400";
    renderAll();
});

document.getElementById("add-tool-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const sched = fd.get("scheduledDate") || activeDate;
    const item = {
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        toolCode: String(fd.get("toolCode")).trim().toUpperCase(),
        moldName: String(fd.get("moldName")).trim(),
        machineNo: String(fd.get("machineNo")).trim().toUpperCase(),
        originalDate: sched,
        scheduledDate: sched,
        status: "Scheduled",
        note: "",
        beforePhoto: null,
        afterPhoto: null,
        remarks: ""
    };
    allTools.push(item);
    await putToStore(STORE_TOOLS, item);
    writeLocalStorageMirror(allTools, allLogs);
    await addAuditLog(`ADDED: ${item.toolCode} (${item.moldName}) saved under calendar date ${sched}.`);
    e.target.reset();
    addPanel.classList.add("hidden");
    selectCalendarDate(sched);
    await refreshAll();
    showToast(`Saved to ${sched}`);
});

document.getElementById("export-json-btn").addEventListener("click", () => {
    const payload = {
        system: "ToolSync PM",
        exportedAt: new Date().toISOString(),
        tools: allTools,
        logs: allLogs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toolsync-pm-backup-${activeDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("JSON backup exported");
});

document.getElementById("import-json-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data.tools)) throw new Error("Invalid backup format");
        await clearStore(STORE_TOOLS);
        await clearStore(STORE_LOGS);
        for (const t of data.tools) await putToStore(STORE_TOOLS, t);
        if (Array.isArray(data.logs)) {
            for (const l of data.logs) await putToStore(STORE_LOGS, l);
        }
        writeLocalStorageMirror(data.tools, Array.isArray(data.logs) ? data.logs : []);
        await refreshAll();
        showToast("Backup restored");
    } catch {
        showToast("Invalid JSON backup");
    }
    e.target.value = "";
});

document.getElementById("export-csv-btn").addEventListener("click", () => {
    const headers = ["Scheduled Date", "Original Date", "Tool ID", "Mold Name", "Machine", "Status", "Before Photo", "After Photo", "Remarks"];
    const rows = allTools.map((t) => [
        t.scheduledDate,
        t.originalDate || t.scheduledDate,
        t.toolCode,
        `"${(t.moldName || "").replace(/"/g, '""')}"`,
        t.machineNo,
        `"${(t.status || "").replace(/"/g, '""')}"`,
        t.beforePhoto ? "Yes" : "No",
        t.afterPhoto ? "Yes" : "No",
        `"${(t.remarks || "").replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toolsync-pm-report-${activeDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV report downloaded");
});

window.addEventListener("beforeunload", () => {
    writeLocalStorageMirror(allTools, allLogs);
});

(async function initApp() {
    await runOneTimeCleanSlate();
    await refreshAll();
})();