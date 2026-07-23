import type { Finding, ProviderId } from "../api-types.js";

export interface FileChange {
  file: string;
  diff: string;
  fullContent: string;
}

export interface Provider {
  id: ProviderId;
  analyze(change: FileChange): Promise<Omit<Finding, "id" | "dismissed" | "createdAt" | "provider">[]>;
}
