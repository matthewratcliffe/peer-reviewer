using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ReviewNotes
{
    public enum Severity
    {
        Info,
        Low,
        Medium,
        High
    }

    public class Finding
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("file")]
        public string File { get; set; } = "";

        [JsonPropertyName("startLine")]
        public int StartLine { get; set; }

        [JsonPropertyName("endLine")]
        public int EndLine { get; set; }

        [JsonPropertyName("severity")]
        public string SeverityRaw { get; set; } = "info";

        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("title")]
        public string Title { get; set; } = "";

        [JsonPropertyName("message")]
        public string Message { get; set; } = "";

        [JsonPropertyName("provider")]
        public string Provider { get; set; } = "";

        [JsonPropertyName("dismissed")]
        public bool Dismissed { get; set; }

        [JsonPropertyName("createdAt")]
        public string CreatedAt { get; set; } = "";

        [JsonIgnore]
        public Severity Severity
        {
            get
            {
                switch (SeverityRaw?.ToLowerInvariant())
                {
                    case "high": return Severity.High;
                    case "medium": return Severity.Medium;
                    case "low": return Severity.Low;
                    default: return Severity.Info;
                }
            }
        }
    }

    public class FindingsResponse
    {
        [JsonPropertyName("findings")]
        public List<Finding> Findings { get; set; } = new List<Finding>();
    }

    public class RepoResponse
    {
        [JsonPropertyName("repoRoot")]
        public string RepoRoot { get; set; } = "";
    }

    public class AnalysisProgress
    {
        [JsonPropertyName("total")]
        public int Total { get; set; }

        [JsonPropertyName("completed")]
        public int Completed { get; set; }

        [JsonPropertyName("startedAt")]
        public long StartedAt { get; set; }
    }

    public class CodexProviderConfig
    {
        [JsonPropertyName("command")]
        public string Command { get; set; } = "codex";

        [JsonPropertyName("args")]
        public List<string> Args { get; set; } = new List<string> { "exec", "--json" };
    }

    public class LlamaCppProviderConfig
    {
        [JsonPropertyName("baseUrl")]
        public string BaseUrl { get; set; } = "http://127.0.0.1:8080";
    }

    public class ClaudeProviderConfig
    {
        [JsonPropertyName("command")]
        public string Command { get; set; } = "claude";

        [JsonPropertyName("args")]
        public List<string> Args { get; set; } = new List<string> { "--print" };
    }

    public class OpenCodeProviderConfig
    {
        [JsonPropertyName("command")]
        public string Command { get; set; } = "opencode";

        [JsonPropertyName("args")]
        public List<string> Args { get; set; } = new List<string> { "--print" };
    }

    public class KiroProviderConfig
    {
        [JsonPropertyName("command")]
        public string Command { get; set; } = "kiro";

        [JsonPropertyName("args")]
        public List<string> Args { get; set; } = new List<string> { "--print" };
    }

    public class ProvidersConfig
    {
        [JsonPropertyName("codex")]
        public CodexProviderConfig Codex { get; set; } = new CodexProviderConfig();

        [JsonPropertyName("llamaCpp")]
        public LlamaCppProviderConfig LlamaCpp { get; set; } = new LlamaCppProviderConfig();

        [JsonPropertyName("claude")]
        public ClaudeProviderConfig Claude { get; set; } = new ClaudeProviderConfig();

        [JsonPropertyName("opencode")]
        public OpenCodeProviderConfig Opencode { get; set; } = new OpenCodeProviderConfig();

        [JsonPropertyName("kiro")]
        public KiroProviderConfig Kiro { get; set; } = new KiroProviderConfig();
    }

    public class SystemPromptConfig
    {
        [JsonPropertyName("mode")]
        public string Mode { get; set; } = "default";

        [JsonPropertyName("text")]
        public string Text { get; set; } = "";
    }

    public class PreCommitConfig
    {
        [JsonPropertyName("blockOnFindings")]
        public bool BlockOnFindings { get; set; } = true;
    }

    public class AutoAnalyseConfig
    {
        [JsonPropertyName("trigger")]
        public string Trigger { get; set; } = "disabled";

        [JsonPropertyName("intervalMinutes")]
        public int IntervalMinutes { get; set; } = 5;
    }

    public class ReviewNotesConfig
    {
        [JsonPropertyName("activeProvider")]
        public string ActiveProvider { get; set; } = "claude";

        [JsonPropertyName("providers")]
        public ProvidersConfig Providers { get; set; } = new ProvidersConfig();

        [JsonPropertyName("systemPrompt")]
        public SystemPromptConfig SystemPrompt { get; set; } = new SystemPromptConfig();

        [JsonPropertyName("preCommit")]
        public PreCommitConfig PreCommit { get; set; } = new PreCommitConfig();

        [JsonPropertyName("autoAnalyse")]
        public AutoAnalyseConfig AutoAnalyse { get; set; } = new AutoAnalyseConfig();

        [JsonPropertyName("maxFilesPerRun")]
        public int? MaxFilesPerRun { get; set; }

        [JsonPropertyName("debugLogging")]
        public bool DebugLogging { get; set; }
    }

    public class TestProviderResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("error")]
        public string Error { get; set; }
    }

    public class AnalyzeResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }
    }
}
