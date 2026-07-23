using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.VisualStudio.Shell;

namespace PeerReviewer
{
    [Guid("f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f901234")]
    public class PeerReviewerOptionsPage : DialogPage
    {
        private PeerReviewerOptionsControl _control;

        protected override IWin32Window Window
        {
            get
            {
                if (_control == null)
                {
                    _control = new PeerReviewerOptionsControl(this);
                }
                return _control;
            }
        }

        [Category("Provider")]
        [DisplayName("Active Provider")]
        [Description("The LLM provider to use for code review (codex, llama-cpp, claude, opencode, kiro)")]
        public string ActiveProvider { get; set; } = "claude";

        [Category("Provider - Codex")]
        [DisplayName("Command")]
        [Description("Path or name of the codex CLI command")]
        public string CodexCommand { get; set; } = "codex";

        [Category("Provider - Codex")]
        [DisplayName("Arguments")]
        [Description("Arguments for the codex CLI (comma-separated)")]
        public string CodexArgs { get; set; } = "exec,--json";

        [Category("Provider - llama.cpp")]
        [DisplayName("Base URL")]
        [Description("Base URL for the llama.cpp HTTP API")]
        public string LlamaCppBaseUrl { get; set; } = "http://127.0.0.1:8080";

        [Category("Provider - Claude")]
        [DisplayName("Command")]
        [Description("Path or name of the claude CLI command")]
        public string ClaudeCommand { get; set; } = "claude";

        [Category("Provider - Claude")]
        [DisplayName("Arguments")]
        [Description("Arguments for the claude CLI (comma-separated)")]
        public string ClaudeArgs { get; set; } = "--print";

        [Category("Provider - OpenCode")]
        [DisplayName("Command")]
        [Description("Path or name of the opencode CLI command")]
        public string OpenCodeCommand { get; set; } = "opencode";

        [Category("Provider - OpenCode")]
        [DisplayName("Arguments")]
        [Description("Arguments for the opencode CLI (comma-separated)")]
        public string OpenCodeArgs { get; set; } = "--print";

        [Category("Provider - Kiro")]
        [DisplayName("Command")]
        [Description("Path or name of the kiro CLI command")]
        public string KiroCommand { get; set; } = "kiro";

        [Category("Provider - Kiro")]
        [DisplayName("Arguments")]
        [Description("Arguments for the kiro CLI (comma-separated)")]
        public string KiroArgs { get; set; } = "--print";

        [Category("System Prompt")]
        [DisplayName("Mode")]
        [Description("How to apply a custom system prompt: default, append, or replace")]
        public string SystemPromptMode { get; set; } = "default";

        [Category("System Prompt")]
        [DisplayName("Custom Text")]
        [Description("Custom system prompt text (used when mode is append or replace)")]
        public string SystemPromptText { get; set; } = "";

        [Category("Behaviour")]
        [DisplayName("Auto-Analyse Trigger")]
        [Description("When to trigger automatic analysis: disabled, on-save, or periodically")]
        public string AutoAnalyseTrigger { get; set; } = "disabled";

        [Category("Behaviour")]
        [DisplayName("Auto-Analyse Interval (minutes)")]
        [Description("Interval in minutes for periodic auto-analysis")]
        public int AutoAnalyseIntervalMinutes { get; set; } = 5;

        [Category("Behaviour")]
        [DisplayName("Max Files Per Run")]
        [Description("Maximum files to analyse per run (0 = unlimited)")]
        public int MaxFilesPerRun { get; set; } = 0;

        [Category("Behaviour")]
        [DisplayName("Block Pre-Commit on Findings")]
        [Description("Whether the pre-commit hook should block when there are findings")]
        public bool BlockOnFindings { get; set; } = true;

        [Category("Debug")]
        [DisplayName("Debug Logging")]
        [Description("Enable verbose debug logging in the service")]
        public bool DebugLogging { get; set; }

        protected override void OnApply(PageApplyEventArgs e)
        {
            base.OnApply(e);

            if (e.ApplyBehavior == ApplyKind.Apply)
            {
                try
                {
                    var client = new IpcClient();
                    var config = BuildConfig();
                    client.UpdateConfig(config);
                }
                catch
                {
                    // Service may not be running yet; settings will be applied when it starts
                }
            }
        }

        protected override void OnActivate(CancelEventArgs e)
        {
            base.OnActivate(e);

            try
            {
                var client = new IpcClient();
                var config = client.GetConfig();
                LoadFromConfig(config);
            }
            catch
            {
                // Service not available; use current/default values
            }

            _control?.RefreshGrid();
        }

        private void LoadFromConfig(PeerReviewerConfig config)
        {
            ActiveProvider = config.ActiveProvider ?? "claude";

            if (config.Providers?.Codex != null)
            {
                CodexCommand = config.Providers.Codex.Command;
                CodexArgs = string.Join(",", config.Providers.Codex.Args ?? new List<string>());
            }

            if (config.Providers?.LlamaCpp != null)
                LlamaCppBaseUrl = config.Providers.LlamaCpp.BaseUrl;

            if (config.Providers?.Claude != null)
            {
                ClaudeCommand = config.Providers.Claude.Command;
                ClaudeArgs = string.Join(",", config.Providers.Claude.Args ?? new List<string>());
            }

            if (config.Providers?.Opencode != null)
            {
                OpenCodeCommand = config.Providers.Opencode.Command;
                OpenCodeArgs = string.Join(",", config.Providers.Opencode.Args ?? new List<string>());
            }

            if (config.Providers?.Kiro != null)
            {
                KiroCommand = config.Providers.Kiro.Command;
                KiroArgs = string.Join(",", config.Providers.Kiro.Args ?? new List<string>());
            }

            if (config.SystemPrompt != null)
            {
                SystemPromptMode = config.SystemPrompt.Mode ?? "default";
                SystemPromptText = config.SystemPrompt.Text ?? "";
            }

            if (config.AutoAnalyse != null)
            {
                AutoAnalyseTrigger = config.AutoAnalyse.Trigger ?? "disabled";
                AutoAnalyseIntervalMinutes = config.AutoAnalyse.IntervalMinutes;
            }

            MaxFilesPerRun = config.MaxFilesPerRun ?? 0;
            BlockOnFindings = config.PreCommit?.BlockOnFindings ?? true;
            DebugLogging = config.DebugLogging;
        }

        internal PeerReviewerConfig BuildConfig()
        {
            return new PeerReviewerConfig
            {
                ActiveProvider = ActiveProvider,
                Providers = new ProvidersConfig
                {
                    Codex = new CodexProviderConfig
                    {
                        Command = CodexCommand,
                        Args = ParseArgs(CodexArgs)
                    },
                    LlamaCpp = new LlamaCppProviderConfig
                    {
                        BaseUrl = LlamaCppBaseUrl
                    },
                    Claude = new ClaudeProviderConfig
                    {
                        Command = ClaudeCommand,
                        Args = ParseArgs(ClaudeArgs)
                    },
                    Opencode = new OpenCodeProviderConfig
                    {
                        Command = OpenCodeCommand,
                        Args = ParseArgs(OpenCodeArgs)
                    },
                    Kiro = new KiroProviderConfig
                    {
                        Command = KiroCommand,
                        Args = ParseArgs(KiroArgs)
                    }
                },
                SystemPrompt = new SystemPromptConfig
                {
                    Mode = SystemPromptMode,
                    Text = SystemPromptText
                },
                PreCommit = new PreCommitConfig
                {
                    BlockOnFindings = BlockOnFindings
                },
                AutoAnalyse = new AutoAnalyseConfig
                {
                    Trigger = AutoAnalyseTrigger,
                    IntervalMinutes = AutoAnalyseIntervalMinutes
                },
                MaxFilesPerRun = MaxFilesPerRun > 0 ? MaxFilesPerRun : (int?)null,
                DebugLogging = DebugLogging
            };
        }

        private List<string> ParseArgs(string args)
        {
            if (string.IsNullOrWhiteSpace(args))
                return new List<string>();
            return new List<string>(args.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries));
        }
    }
}
