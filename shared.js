const DB_NAME = "ToolSyncPMDB";
const DB_VERSION = 5;
const STORE_TOOLS = "pmTools";
const STORE_BREAKDOWNS = "breakdownHistory";
const LS_BACKUP_KEY = "ToolSyncPM_Persistent_State_v3";

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

function getYearMonthPrefix(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function escapeHtmlAttr(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function showToast(msg) {
    let el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("translate-y-20", "opacity-0");
    el.classList.add("translate-y-0", "opacity-100");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
        el.classList.remove("translate-y-0", "opacity-100");
        el.classList.add("translate-y-20", "opacity-0");
    }, 2400);
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

function writeLocalStorageMirror(tools, breakdowns) {
    try {
        localStorage.setItem(
            LS_BACKUP_KEY,
            JSON.stringify({ savedAt: Date.now(), tools: tools || [], breakdowns: breakdowns || [] })
        );
    } catch {
        // Ignore quota errors
    }
}

function readLocalStorageMirror() {
    try {
        const raw = localStorage.getItem(LS_BACKUP_KEY);
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

function openDB() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("IndexedDB unavailable"));
            return;
        }
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
        const m = readLocalStorageMirror();
        return storeName === STORE_BREAKDOWNS ? m.breakdowns : m.tools;
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
        // Fallback mirror handles persistence
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
        // Fallback mirror handles persistence
    }
}

async function loadAllAppData() {
    let tools = await getAllFromStore(STORE_TOOLS);
    let breakdowns = await getAllFromStore(STORE_BREAKDOWNS);
    const mirror = readLocalStorageMirror();

    if (tools.length === 0 && mirror.tools.length > 0) {
        tools = mirror.tools;
        for (const t of tools) await putToStore(STORE_TOOLS, t);
    }
    if (breakdowns.length === 0 && mirror.breakdowns.length > 0) {
        breakdowns = mirror.breakdowns;
        for (const b of breakdowns) await putToStore(STORE_BREAKDOWNS, b);
    }

    writeLocalStorageMirror(tools, breakdowns);
    return { tools, breakdowns };
}

function getStatusBadge(status) {
    if (status === "PM Completed") {
        return `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">PM Completed</span>`;
    }
    if (status === "Swapped / Rescheduled") {
        return `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30">Swapped / Rescheduled</span>`;
    }
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">Scheduled</span>`;
}

function renderSlideMenu(currentPageFile) {
    const pages = [
        { file: "pm-plan.html", label: "PM Plan" },
        { file: "present-pm.html", label: "Present PM Plan" },
        { file: "pm-history.html", label: "PM History" },
        { file: "breakdown.html", label: "Breakdown" },
        { file: "present-breakdown.html", label: "Present Month Breakdown" },
        { file: "breakdown-history.html", label: "Breakdown History" }
    ];

    const aside = document.getElementById("slide-menu-aside");
    if (!aside) return;

    aside.innerHTML = `
        <div class="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-stone-400">
            Slide Menu
        </div>
        ${pages
            .map((p) => {
                const isActive = p.file === currentPageFile;
                return `
                    <a
                        href="${p.file}"
                        class="w-full px-3 py-2.5 rounded-xl text-left font-mono text-xs font-bold flex items-center justify-between transition border ${
                            isActive
                                ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                                : "border-transparent hover:border-stone-700 bg-[#0b0d11] text-stone-200"
                        }"
                    >
                        <span>${p.label}</span>
                        <span>&rsaquo;</span>
                    </a>
                `;
            })
            .join("")}
    `;

    const toggleBtn = document.getElementById("toggle-slide-btn");
    const shell = document.getElementById("page-shell");
    if (toggleBtn && aside && shell) {
        toggleBtn.addEventListener("click", () => {
            const hidden = aside.classList.toggle("hidden");
            shell.className = hidden
                ? "max-w-[1440px] mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 gap-4 items-start"
                : "max-w-[1440px] mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start";
        });
    }
}