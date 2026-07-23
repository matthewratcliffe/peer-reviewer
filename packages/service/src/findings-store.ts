import type { Finding } from "./api-types.js";

export class FindingsStore {
  private byFile = new Map<string, Finding[]>();

  replaceForFile(file: string, findings: Finding[]): void {
    const previous = this.byFile.get(file) ?? [];
    const dismissedIds = new Set(previous.filter((f) => f.dismissed).map((f) => f.id));
    const merged = findings.map((f) => (dismissedIds.has(f.id) ? { ...f, dismissed: true } : f));
    this.byFile.set(file, merged);
  }

  forFile(file: string): Finding[] {
    return this.byFile.get(file) ?? [];
  }

  all(): Finding[] {
    return [...this.byFile.values()].flat();
  }

  dismiss(id: string): boolean {
    for (const findings of this.byFile.values()) {
      const finding = findings.find((f) => f.id === id);
      if (finding) {
        finding.dismissed = true;
        return true;
      }
    }
    return false;
  }

  openBlockingFindings(): Finding[] {
    return this.all().filter((f) => !f.dismissed && (f.severity === "high" || f.severity === "medium"));
  }
}
