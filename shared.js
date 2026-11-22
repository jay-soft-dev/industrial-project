const DB_NAME = "ToolSyncPMDB_v3";
const DB_VERSION = 1;
const STORE_TOOLS = "tools";
const STORE_BREAKDOWNS = "breakdowns";
const LS_KEY = "ToolSyncPM_State_v3";
const PHOTO_BACKUP_LS_KEY = "ToolSyncPM_PhotoBackup_v1";

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

function addDaysISO(isoDate, deltaDays) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d + deltaDays);
    return formatDateISO(dt);
}

function getYearMonthPrefix(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function escapeHtmlAttr(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function getStatusBadge(status) {
    if (status === "PM Completed") {
        return `<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-mono text-[11px]">PM Completed</span>`;
    }
    if (status === "Swapped / Rescheduled") {
        return `<span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/40 font-mono text-[11px]">Swapped</span>`;
    }
    return `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 font-mono text-[11px]">Scheduled</span>`;
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("translate-y-20", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
        toast.classList.remove("translate-y-0", "opacity-100");
        toast.classList.add("translate-y-20", "opacity-0");
    }, 2600);
}

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_TOOLS)) {
                db.createObjectStore(STORE_TOOLS, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STORE_BREAKDOWNS)) {
                db.createObjectStore(STORE_BREAKDOWNS, { keyPath: "id" });
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
        return [];
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
        // Fallback already mirrored to localStorage
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
        // Fallback already mirrored to localStorage
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
        // Ignore
    }
}

function writeLocalStorageMirror(tools, breakdowns) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({ tools, breakdowns }));
    } catch {
        // Storage quota safe
    }
}

function readLocalStorageMirror() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { tools: [], breakdowns: [] };
        const parsed = JSON.parse(raw);
        return {
            tools: Array.isArray(parsed.tools) ? parsed.tools : [],
            breakdowns: Array.isArray(parsed.breakdowns) ? parsed.breakdowns : []
        };
    } catch {
        return { tools: [], breakdowns: [] };
    }
}

async function loadAllAppData() {
    const mirror = readLocalStorageMirror();
    const [dbTools, dbBreakdowns] = await Promise.all([
        getAllFromStore(STORE_TOOLS),
        getAllFromStore(STORE_BREAKDOWNS)
    ]);

    const tools = dbTools.length ? dbTools : mirror.tools;
    const breakdowns = dbBreakdowns.length ? dbBreakdowns : mirror.breakdowns;
    writeLocalStorageMirror(tools, breakdowns);
    return { tools, breakdowns };
}

function readPhotoBackupStore() {
    try {
        const raw = localStorage.getItem(PHOTO_BACKUP_LS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writePhotoBackupStore(list) {
    try {
        localStorage.setItem(PHOTO_BACKUP_LS_KEY, JSON.stringify(list));
    } catch {
        showToast("Photo backup storage limit reached");
    }
}

function savePmPhotoToBackup({ toolCode, date, stage, dataUrl, remarks }) {
    if (!dataUrl || !toolCode) return;
    const cleanCode = String(toolCode).trim().toUpperCase();
    const cleanDate = date || formatDateISO(new Date());
    const cleanStage = stage || "PM PHOTO";
    const list = readPhotoBackupStore();

    const duplicate = list.some(
        (item) =>
            item.toolCode === cleanCode &&
            item.date === cleanDate &&
            item.stage === cleanStage &&
            item.photo === dataUrl
    );
    if (duplicate) return;

    list.unshift({
        id: `pic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        toolCode: cleanCode,
        date: cleanDate,
        stage: cleanStage,
        photo: dataUrl,
        remarks: remarks || ""
    });
    writePhotoBackupStore(list);
}

function syncToolsPhotosToBackup(tools) {
    if (!Array.isArray(tools)) return;
    tools.forEach((t) => {
        if (t.beforePhoto) {
            savePmPhotoToBackup({
                toolCode: t.toolCode,
                date: t.scheduledDate,
                stage: "BEFORE PM",
                dataUrl: t.beforePhoto,
                remarks: t.remarks || ""
            });
        }
        if (t.afterPhoto) {
            savePmPhotoToBackup({
                toolCode: t.toolCode,
                date: t.scheduledDate,
                stage: "AFTER PM",
                dataUrl: t.afterPhoto,
                remarks: t.remarks || ""
            });
        }
    });
}

function compressImageFile(file, maxWidth = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
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
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderSlideMenu(activePage) {
    const aside = document.getElementById("slide-menu-aside");
    const links = [
        { href: "index_3.html", label: "Main Workspace (index_3)" },
        { href: "pm-plan.html", label: "PM Plan & Daily Schedule" },
        { href: "pm-history.html", label: "PM History (Completed)" },
        { href: "pm-photos.html", label: "All PM Mould Photos History" },
        { href: "present-breakdown.html", label: "Present Month Breakdown" },
        { href: "breakdown_2.html", label: "Breakdown Calendar & Entry" },
        { href: "breakdown-history_2.html", label: "Breakdown History (All Months)" }
    ];

    if (aside) {
        aside.innerHTML = links
            .map((item) => {
                const isCurrent = activePage === item.href;
                return `
                    <a
                        href="${item.href}"
                        class="block px-3 py-2.5 rounded-xl border font-mono text-xs font-semibold transition ${
                            isCurrent
                                ? "border-amber-400 bg-amber-400/15 text-amber-300"
                                : "border-stone-800 bg-[#0b0d11] text-stone-300 hover:border-stone-600"
                        }"
                    >
                        ${item.label}
                    </a>
                `;
            })
            .join("");
    }

    const toggleBtn =
        document.getElementById("toggle-slide-btn") || document.getElementById("toggle-slide-menu-btn");
    const shell =
        document.getElementById("page-shell") || document.getElementById("workspace-shell");

    if (toggleBtn && aside && shell) {
        toggleBtn.addEventListener("click", () => {
            const hidden = aside.classList.toggle("hidden");
            if (hidden) {
                shell.classList.remove("lg:grid-cols-12");
                shell.classList.add("lg:grid-cols-1");
            } else {
                shell.classList.remove("lg:grid-cols-1");
                shell.classList.add("lg:grid-cols-12");
            }
        });
    }
}