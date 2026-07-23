using Xunit;
using PeerReviewer;
using System.Collections.Generic;

namespace PeerReviewer.Tests
{
    public class OptionsPageTest
    {
        [Fact]
        public void BuildConfig_DefaultValues()
        {
            var page = new PeerReviewerOptionsPage();
            var config = page.BuildConfig();

            Assert.Equal("claude", config.ActiveProvider);
            Assert.Equal("claude", config.Providers.Claude.Command);
            Assert.Contains("--print", config.Providers.Claude.Args);
            Assert.Equal("codex", config.Providers.Codex.Command);
            Assert.Equal("http://127.0.0.1:8080", config.Providers.LlamaCpp.BaseUrl);
            Assert.Equal("default", config.SystemPrompt.Mode);
            Assert.Equal("", config.SystemPrompt.Text);
            Assert.True(config.PreCommit.BlockOnFindings);
            Assert.Equal("disabled", config.AutoAnalyse.Trigger);
            Assert.Equal(5, config.AutoAnalyse.IntervalMinutes);
            Assert.Null(config.CodingStandardsFolder);
            Assert.Null(config.MaxFilesPerRun);
            Assert.False(config.DebugLogging);
        }

        [Fact]
        public void BuildConfig_CustomValues()
        {
            var page = new PeerReviewerOptionsPage
            {
                ActiveProvider = "codex",
                CodexCommand = "/usr/bin/codex",
                CodexArgs = "exec,--json",
                ClaudeCommand = "claude-3",
                ClaudeArgs = "--print,--model,opus",
                LlamaCppBaseUrl = "http://localhost:9090",
                SystemPromptMode = "append",
                SystemPromptText = "Extra rules here",
                AutoAnalyseTrigger = "on-save",
                AutoAnalyseIntervalMinutes = 10,
                CodingStandardsFolder = "/path/to/standards",
                MaxFilesPerRun = 25,
                BlockOnFindings = false,
                DebugLogging = true,
            };
            var config = page.BuildConfig();

            Assert.Equal("codex", config.ActiveProvider);
            Assert.Equal("/usr/bin/codex", config.Providers.Codex.Command);
            Assert.Equal(new List<string> { "exec", "--json" }, config.Providers.Codex.Args);
            Assert.Equal("claude-3", config.Providers.Claude.Command);
            Assert.Equal(new List<string> { "--print", "--model", "opus" }, config.Providers.Claude.Args);
            Assert.Equal("http://localhost:9090", config.Providers.LlamaCpp.BaseUrl);
            Assert.Equal("append", config.SystemPrompt.Mode);
            Assert.Equal("Extra rules here", config.SystemPrompt.Text);
            Assert.Equal("on-save", config.AutoAnalyse.Trigger);
            Assert.Equal(10, config.AutoAnalyse.IntervalMinutes);
            Assert.Equal("/path/to/standards", config.CodingStandardsFolder);
            Assert.Equal(25, config.MaxFilesPerRun);
            Assert.False(config.PreCommit.BlockOnFindings);
            Assert.True(config.DebugLogging);
        }

        [Fact]
        public void BuildConfig_EmptyCodingStandardsFolder_IsNull()
        {
            var page = new PeerReviewerOptionsPage { CodingStandardsFolder = "   " };
            var config = page.BuildConfig();
            Assert.Null(config.CodingStandardsFolder);
        }

        [Fact]
        public void BuildConfig_ZeroMaxFiles_IsNull()
        {
            var page = new PeerReviewerOptionsPage { MaxFilesPerRun = 0 };
            var config = page.BuildConfig();
            Assert.Null(config.MaxFilesPerRun);
        }
    }
}
