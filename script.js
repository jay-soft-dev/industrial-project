// =========================================================
// IndexedDB Setup (Local Offline Storage for Privacy)
// =========================================================
const DB_NAME = "MoldPMControlDB";
const DB_VERSION = 1;
const STORE_TOOLS = "pmTools";
const STORE_LOGS = "auditLogs";

function openDB() {
    return new Promise((resolve, reject) => {
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
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function putToStore(storeName, item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// =========================================================
// Helpers: Dates, Toast, Image Compression
// =========================================================
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
    }, 2400);
}

// Compress image on client side to save local storage
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
let allTools = [];
let allLogs = [];
let activeDate = formatDateISO(new Date());
let activeModalToolId = null;
let draftBeforePhoto = null;
let draftAfterPhoto = null;

const dateInput = document.getElementById("selected-date");
dateInput.value = activeDate;

async function addAuditLog(message) {
    const entry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleString(),
        message
    };
    await putToStore(STORE_LOGS, entry);
    allLogs.unshift(entry);
}

async function seedSampleMonth() {
    await clearStore(STORE_TOOLS);
    await clearStore(STORE_LOGS);

    const base = activeDate;
    const sampleItems = [
        // Today (3 tools)
        { toolCode: "IM-101", moldName: "Front Bumper Bracket", machineNo: "IMM-01", offset: 0, status: "Scheduled" },
        { toolCode: "IM-102", moldName: "Dashboard Vent Cover", machineNo: "IMM-02", offset: 0, status: "Scheduled" },
        { toolCode: "IM-103", moldName: "Battery Terminal Cap", machineNo: "IMM-03", offset: 0, status: "Scheduled" },
        // Tomorrow (+1 day)
        { toolCode: "IM-104", moldName: "Gear Lever Bezel", machineNo: "IMM-04", offset: 1, status: "Scheduled" },
        { toolCode: "IM-105", moldName: "Headlamp Housing Clip", machineNo: "IMM-05", offset: 1, status: "Scheduled" },
        { toolCode: "IM-106", moldName: "Door Trim Retainer", machineNo: "IMM-06", offset: 1, status: "Scheduled" },
        // Day +2
        { toolCode: "IM-107", moldName: "Mirror Casing Mold", machineNo: "IMM-02", offset: 2, status: "Scheduled" },
        { toolCode: "IM-108", moldName: "Fuse Box Lid", machineNo: "IMM-07", offset: 2, status: "Scheduled" },
        { toolCode: "IM-109", moldName: "Sensor Connector Mold", machineNo: "IMM-08", offset: 2, status: "Scheduled" }
    ];

    for (let i = 0; i < sampleItems.length; i++) {
        const item = sampleItems[i];
        const sched = addDaysISO(base, item.offset);
        await putToStore(STORE_TOOLS, {
            id: `tool_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
            toolCode: item.toolCode,
            moldName: item.moldName,
            machineNo: item.machineNo,
            originalDate: sched,
            scheduledDate: sched,
            status: item.status,
            note: "",
            beforePhoto: null,
            afterPhoto: null,
            remarks: ""
        });
    }

    await addAuditLog(`Sample PM schedule initialized starting ${base} (3 tools/day).`);
    await refreshAll();
    showToast("Sample schedule loaded");
}

// Auto-Swap / Reschedule when tool is running on machine
async function handleMachineRunning(toolId) {
    const targetTool = allTools.find((t) => t.id === toolId);
    if (!targetTool) return;

    const currentSlotDate = targetTool.scheduledDate;

    // Find next available scheduled tool on a future date
    const futureCandidates = allTools
        .filter((t) => t.id !== targetTool.id && t.scheduledDate > currentSlotDate && t.status === "Scheduled")
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

    const pushedDate = addDaysISO(currentSlotDate, 1);

    if (futureCandidates.length > 0) {
        const replacement = futureCandidates[0];
        const oldReplacementDate = replacement.scheduledDate;

        // Pull replacement tool into today's slot so daily PM count stays balanced
        replacement.scheduledDate = currentSlotDate;
        replacement.note = `Pulled from ${oldReplacementDate} (Swap for running ${targetTool.toolCode})`;

        // Push running tool forward
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
        // No future candidate available; just push forward
        targetTool.scheduledDate = pushedDate;
        targetTool.status = "Swapped / Rescheduled";
        targetTool.note = `Running on ${currentSlotDate}; pushed to ${pushedDate}`;
        await putToStore(STORE_TOOLS, targetTool);
        await addAuditLog(`RESCHEDULED: ${targetTool.toolCode} pushed from ${currentSlotDate} to ${pushedDate}.`);
        showToast(`${targetTool.toolCode} pushed to ${pushedDate}`);
    }

    await refreshAll();
}

// =========================================================
// Photo & PM Completion Modal
// =========================================================
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
    if (dataUrl) {
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
    draftBeforePhoto = tool.beforePhoto || null;
    draftAfterPhoto = tool.afterPhoto || null;
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
        await addAuditLog(`PHOTOS SAVED: ${tool.toolCode} before/after proof updated.`);
    }

    await putToStore(STORE_TOOLS, tool);
    closePhotoModal();
    await refreshAll();
    showToast(markCompleted ? "PM marked completed" : "Photos saved");
}

document.getElementById("close-modal-btn").addEventListener("click", closePhotoModal);
document.getElementById("save-photos-only-btn").addEventListener("click", () => saveModalChanges(false));
document.getElementById("complete-pm-btn").addEventListener("click", () => saveModalChanges(true));

// =========================================================
// Rendering UI
// =========================================================
function getStatusBadge(status) {
    if (status === "PM Completed") {
        return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">PM Completed</span>`;
    }
    if (status === "Swapped / Rescheduled") {
        return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30">Swapped / Rescheduled</span>`;
    }
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">Scheduled</span>`;
}

function renderAll() {
    const todaysTools = allTools.filter((t) => t.scheduledDate === activeDate);
    const completedToday = todaysTools.filter((t) => t.status === "PM Completed").length;
    const swappedTotal = allTools.filter((t) => t.status === "Swapped / Rescheduled").length;

    document.getElementById("stat-day-count").textContent = `${completedToday} / ${Math.max(3, todaysTools.length)}`;
    document.getElementById("stat-swapped-count").textContent = String(swappedTotal);
    document.getElementById("stat-total-tools").textContent = String(allTools.length);

    // 1. Daily Cards
    const cardsGrid = document.getElementById("daily-cards-grid");
    if (todaysTools.length === 0) {
        cardsGrid.innerHTML = `
            <div class="col-span-full rounded-2xl border border-dashed border-stone-800 bg-[#11151d]/60 p-8 text-center text-sm text-stone-400">
                No mold PM scheduled for <span class="font-mono text-amber-400">${activeDate}</span>. Click <strong class="text-stone-200">+ Add Mold Slot</strong> or <strong class="text-stone-200">Load Sample Month</strong>.
            </div>
        `;
    } else {
        cardsGrid.innerHTML = todaysTools
            .map(
                (t) => `
                <article class="rounded-2xl border border-stone-800 bg-[#11151d] p-5 flex flex-col justify-between gap-4 hover:border-stone-700 transition">
                    <div class="space-y-2">
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-mono text-sm font-bold text-amber-400">${t.toolCode}</span>
                            ${getStatusBadge(t.status)}
                        </div>
                        <h3 class="font-bold text-base text-white">${t.moldName}</h3>
                        <p class="text-xs font-mono text-stone-400">Machine: ${t.machineNo} • Plan: ${t.scheduledDate}</p>
                        ${t.note ? `<p class="text-xs text-sky-300/90 bg-sky-950/30 border border-sky-800/40 rounded-lg p-2">${t.note}</p>` : ""}
                    </div>

                    <div class="space-y-2 pt-2 border-t border-stone-800/80">
                        <div class="flex items-center justify-between text-[11px] font-mono text-stone-400">
                            <span>Before: ${t.beforePhoto ? "✔ Attached" : "—"}</span>
                            <span>After: ${t.afterPhoto ? "✔ Attached" : "—"}</span>
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

    // 2. Schedule Table
    const sorted = [...allTools].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    const tableBody = document.getElementById("schedule-table-body");
    if (sorted.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-stone-500 font-mono text-xs">No records found</td></tr>`;
    } else {
        tableBody.innerHTML = sorted
            .map(
                (t) => `
                <tr class="hover:bg-stone-900/50">
                    <td class="py-3 px-4 font-mono text-xs whitespace-nowrap text-stone-300">${t.scheduledDate}</td>
                    <td class="py-3 px-4 font-mono text-xs font-bold text-amber-400 whitespace-nowrap">${t.toolCode}</td>
                    <td class="py-3 px-4">
                        <div class="font-medium text-stone-100">${t.moldName}</div>
                        <div class="text-xs font-mono text-stone-400">${t.machineNo}</div>
                    </td>
                    <td class="py-3 px-4 whitespace-nowrap">${getStatusBadge(t.status)}</td>
                    <td class="py-3 px-4 whitespace-nowrap">
                        <button type="button" onclick="openPhotoModal('${t.id}')" class="text-xs font-mono underline text-amber-300 hover:text-amber-200">
                            ${t.beforePhoto || t.afterPhoto ? "View / Edit" : "Upload"}
                        </button>
                    </td>
                </tr>
            `
            )
            .join("");
    }

    // 3. Audit Log
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
    allTools = await getAllFromStore(STORE_TOOLS);
    allLogs = (await getAllFromStore(STORE_LOGS)).sort((a, b) => b.id.localeCompare(a.id));
    renderAll();
}

// =========================================================
// Events: Date Change, Add Tool, Backup / CSV
// =========================================================
dateInput.addEventListener("change", (e) => {
    activeDate = e.target.value || formatDateISO(new Date());
    renderAll();
});

const addPanel = document.getElementById("add-tool-panel");
document.getElementById("open-add-tool-btn").addEventListener("click", () => {
    document.getElementById("new-tool-date").value = activeDate;
    addPanel.classList.toggle("hidden");
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
    await putToStore(STORE_TOOLS, item);
    await addAuditLog(`ADDED: ${item.toolCode} (${item.moldName}) scheduled for ${sched}.`);
    e.target.reset();
    addPanel.classList.add("hidden");
    await refreshAll();
    showToast("Mold slot added");
});

document.getElementById("seed-demo-btn").addEventListener("click", seedSampleMonth);

// JSON Backup Export & Import
document.getElementById("export-json-btn").addEventListener("click", () => {
    const payload = {
        exportedAt: new Date().toISOString(),
        tools: allTools,
        logs: allLogs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mold-pm-backup-${activeDate}.json`;
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
        await refreshAll();
        showToast("Backup restored");
    } catch {
        showToast("Invalid JSON backup");
    }
    e.target.value = "";
});

// CSV Export (without large base64 strings)
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
    a.download = `mold-pm-report-${activeDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV report downloaded");
});

// Init
refreshAll();