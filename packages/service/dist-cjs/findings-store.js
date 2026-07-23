"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindingsStore = void 0;
class FindingsStore {
    byFile = new Map();
    replaceForFile(file, findings) {
        const previous = this.byFile.get(file) ?? [];
        const dismissedIds = new Set(previous.filter((f) => f.dismissed).map((f) => f.id));
        const merged = findings.map((f) => (dismissedIds.has(f.id) ? { ...f, dismissed: true } : f));
        this.byFile.set(file, merged);
    }
    forFile(file) {
        return this.byFile.get(file) ?? [];
    }
    all() {
        return [...this.byFile.values()].flat();
    }
    dismiss(id) {
        for (const findings of this.byFile.values()) {
            const finding = findings.find((f) => f.id === id);
            if (finding) {
                finding.dismissed = true;
                return true;
            }
        }
        return false;
    }
    openBlockingFindings() {
        return this.all().filter((f) => !f.dismissed && (f.severity === "high" || f.severity === "medium"));
    }
}
exports.FindingsStore = FindingsStore;
