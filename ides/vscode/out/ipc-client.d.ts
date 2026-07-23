export type Severity = "info" | "low" | "medium" | "high";
export type ProviderId = "codex" | "llama-cpp" | "claude" | "opencode" | "kiro";
export type ReviewCategory = "correctness" | "security" | "penetration-testing" | "naming" | "best-practice" | "unintended-consequence" | "error-handling" | "performance" | "concurrency" | "resource-leak" | "test-coverage" | "api-contract" | "maintainability";
export interface Finding {
    id: string;
    file: string;
    startLine: number;
    endLine: number;
    severity: Severity;
    category: ReviewCategory;
    title: string;
    message: string;
    provider: ProviderId;
    dismissed: boolean;
    createdAt: string;
}
export interface ReviewNotesConfig {
    activeProvider: ProviderId;
    providers: {
        codex: {
            command: string;
            args: string[];
        };
        llamaCpp: {
            baseUrl: string;
        };
        claude: {
            command: string;
            args: string[];
        };
        opencode: {
            command: string;
            args: string[];
        };
        kiro: {
            command: string;
            args: string[];
        };
    };
    systemPrompt: {
        mode: "default" | "append" | "replace";
        text: string;
    };
    preCommit: {
        blockOnFindings: boolean;
    };
    autoAnalyse: {
        trigger: "disabled" | "on-save" | "periodically";
        intervalMinutes: number;
    };
    maxFilesPerRun: number | null;
    debugLogging: boolean;
}
export interface AnalysisProgress {
    total: number;
    completed: number;
    startedAt: number;
}
interface HttpResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}
export declare class IpcClient {
    private ipcPath;
    private token;
    constructor();
    refreshToken(): void;
    request(method: string, urlPath: string, body?: unknown): Promise<HttpResponse>;
    registerRepo(repoPath: string): Promise<{
        repoRoot: string;
    }>;
    getAllFindings(repoRoot: string): Promise<Finding[]>;
    analyzeChanges(repoRoot: string): Promise<void>;
    analyzeProject(repoRoot: string): Promise<void>;
    getAnalysisProgress(repoRoot: string): Promise<AnalysisProgress>;
    cancelAnalysis(repoRoot: string): Promise<void>;
    getConfig(): Promise<ReviewNotesConfig>;
    updateConfig(config: ReviewNotesConfig): Promise<void>;
    testProvider(config: ReviewNotesConfig): Promise<{
        ok: boolean;
        error?: string;
    }>;
    dismissFinding(findingId: string): Promise<void>;
}
export {};
