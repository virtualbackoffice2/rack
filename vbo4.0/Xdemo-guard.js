(() => {
    const DEMO_MESSAGE = "Demo mode: this action is available for product walkthrough only.";
    const CSV_MESSAGE = "CSV export is disabled in the demo workspace.";
    const originalFetch = window.fetch.bind(window);
    const maps = {
        user: new Map(),
        name: new Map(),
        phone: new Map(),
        address: new Map(),
        mac: new Map(),
        olt: new Map(),
        pon: new Map(),
        ticket: new Map()
    };
    const CLIENT_LABELS = {
        MEROTRA: "DEMO-CLIENT-01",
        SUNNY: "DEMO-CLIENT-02",
        "ALL WINDOWS": "All Demo Windows"
    };

    function showDemoToast(message = DEMO_MESSAGE, type = "info", duration = 3000) {
        let toast = document.getElementById("toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast";
            toast.className = "toast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add("show");
        window.clearTimeout(showDemoToast.timer);
        showDemoToast.timer = window.setTimeout(() => toast.classList.remove("show"), duration);
    }

    window.alert = function demoAlert(message) {
        showDemoToast(message || DEMO_MESSAGE, "info");
    };

    function nextValue(map, rawValue, prefix, formatter) {
        const key = String(rawValue || "").trim();
        if (!key) return rawValue;
        if (!map.has(key)) {
            const index = map.size + 1;
            map.set(key, formatter ? formatter(index) : `${prefix}${String(index).padStart(3, "0")}`);
        }
        return map.get(key);
    }

    function maskPhone(value) {
        return nextValue(maps.phone, value, "", (index) => `90000${String(index).padStart(5, "0")}`.slice(-10));
    }

    function maskMac(value) {
        const key = String(value || "").replace(/[^a-fA-F0-9]/g, "").toLowerCase() || String(value || "").trim();
        return nextValue(maps.mac, key, "", (index) => {
            const hex = String(index).padStart(6, "0").slice(-6).match(/.{1,2}/g).join(":");
            return `02:00:00:${hex}`;
        });
    }

    function maskByKey(key, value) {
        const normalizedKey = String(key || "").toLowerCase();
        if (value === null || value === undefined || value === "") return value;
        if (typeof value === "object") return value;

        if (normalizedKey === "pon") {
            return maskPonText(value);
        }
        if (normalizedKey === "window") {
            return value;
        }
        if (normalizedKey === "users" || normalizedKey === "user_id" || normalizedKey === "userid") {
            return nextValue(maps.user, value, "DEMO-USER-");
        }
        if (normalizedKey === "name") {
            return nextValue(maps.name, value, "", (index) => `Demo User ${String(index).padStart(3, "0")}`);
        }
        if (normalizedKey.includes("called") || normalizedKey === "number" || normalizedKey.includes("phone") || normalizedKey.includes("mobile")) {
            return maskPhone(value);
        }
        if (normalizedKey === "location" || normalizedKey.includes("address")) {
            return nextValue(maps.address, value, "", (index) => `Demo Area ${String(index).padStart(3, "0")}`);
        }
        if (normalizedKey.includes("mac")) {
            return maskMac(value);
        }
        if (normalizedKey === "ticket") {
            return nextValue(maps.ticket, value, "DEMO-TICKET-");
        }
        return value;
    }

    function maskPayload(payload, parentKey = "") {
        if (Array.isArray(payload)) return payload.map((item) => maskPayload(item, parentKey));
        if (payload && typeof payload === "object") {
            const copy = {};
            Object.keys(payload).forEach((key) => {
                copy[key] = maskPayload(maskByKey(key, payload[key]), key);
            });
            return copy;
        }
        return maskByKey(parentKey, payload);
    }

    function scheduleDisplayMask() {
        if (scheduleDisplayMask.timer) return;
        scheduleDisplayMask.timer = window.setTimeout(() => {
            scheduleDisplayMask.timer = null;
            maskTextNodes(document.body);
        }, 80);
    }

    function maskPonText(text) {
        return String(text || "").replace(/\b([A-Z0-9]+)P(\d{1,2})\b/g, (match, olt, ponNumber) => {
            if (!maps.pon.has(match)) {
                if (!maps.olt.has(olt)) {
                    maps.olt.set(olt, `DEMOOLT${String(maps.olt.size + 1).padStart(2, "0")}`);
                }
                maps.pon.set(match, `${maps.olt.get(olt)}P${ponNumber}`);
            }
            return maps.pon.get(match);
        });
    }

    function maskOltText(text) {
        return String(text || "").replace(/\b([A-Z0-9]{2,})\s+Total\b/g, (match, olt) => {
            if (!maps.olt.has(olt)) {
                maps.olt.set(olt, `Demo OLT ${String(maps.olt.size + 1).padStart(2, "0")}`);
            }
            return `${maps.olt.get(olt)} Total`;
        });
    }

    function maskDisplayText(text) {
        let maskedText = String(text || "");
        Object.keys(CLIENT_LABELS).sort((left, right) => right.length - left.length).forEach((key) => {
            maskedText = maskedText.replace(new RegExp(key, "gi"), CLIENT_LABELS[key]);
        });
        return maskedText;
    }

    function maskTextNodes(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((node) => {
            const maskedText = maskDisplayText(node.nodeValue);
            if (maskedText !== node.nodeValue) node.nodeValue = maskedText;
        });
    }

    function isWriteRequest(input, options = {}) {
        const method = String(options.method || input && input.method || "GET").toUpperCase();
        return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    }

    window.fetch = async function demoFetch(input, options = {}) {
        if (isWriteRequest(input, options)) {
            showDemoToast();
            return new Response(JSON.stringify({ ok: true, demo: true, message: DEMO_MESSAGE }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        const response = await originalFetch(input, options);
        const contentType = response.headers.get("Content-Type") || "";
        if (!contentType.toLowerCase().includes("application/json")) return response;

        try {
            const payload = await response.clone().json();
            const headers = new Headers(response.headers);
            headers.delete("Content-Length");
            headers.delete("Content-Encoding");
            return new Response(JSON.stringify(maskPayload(payload)), {
                status: response.status,
                statusText: response.statusText,
                headers
            });
        } catch (error) {
            return response;
        }
    };

    window.addEventListener("DOMContentLoaded", () => {
        document.body.classList.add("demo-account");
        document.addEventListener("click", (event) => {
            const csvButton = event.target && event.target.closest ? event.target.closest("#btnDownloadCSV") : null;
            if (!csvButton) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            showDemoToast(CSV_MESSAGE, "warning");
        }, true);
        scheduleDisplayMask();
        const observer = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => mutation.addedNodes.length || mutation.type === "characterData")) {
                scheduleDisplayMask();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
})();
