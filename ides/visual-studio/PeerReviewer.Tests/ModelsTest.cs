using Xunit;
using PeerReviewer;

namespace PeerReviewer.Tests
{
    public class ModelsTest
    {
        [Fact]
        public void PeerReviewerConfig_DefaultValues()
        {
            var config = new PeerReviewerConfig();
            Assert.Equal("claude", config.ActiveProvider);
            Assert.NotNull(config.Providers);
            Assert.NotNull(config.SystemPrompt);
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
        public void PeerReviewerConfig_SetsAllFields()
        {
            var config = new PeerReviewerConfig
            {
                ActiveProvider = "codex",
                CodingStandardsFolder = "/path/to/standards",
                MaxFilesPerRun = 20,
                DebugLogging = true,
            };
            Assert.Equal("codex", config.ActiveProvider);
            Assert.Equal("/path/to/standards", config.CodingStandardsFolder);
            Assert.Equal(20, config.MaxFilesPerRun);
            Assert.True(config.DebugLogging);
        }

        [Fact]
        public void Finding_SeverityParsing()
        {
            var finding = new Finding { SeverityRaw = "high" };
            Assert.Equal(Severity.High, finding.Severity);

            finding.SeverityRaw = "medium";
            Assert.Equal(Severity.Medium, finding.Severity);

            finding.SeverityRaw = "low";
            Assert.Equal(Severity.Low, finding.Severity);

            finding.SeverityRaw = "info";
            Assert.Equal(Severity.Info, finding.Severity);

            finding.SeverityRaw = "unknown";
            Assert.Equal(Severity.Info, finding.Severity);
        }

        [Fact]
        public void Finding_DefaultValues()
        {
            var finding = new Finding();
            Assert.Equal("", finding.Id);
            Assert.Equal("", finding.File);
            Assert.Equal(0, finding.StartLine);
            Assert.Equal(0, finding.EndLine);
            Assert.Equal("info", finding.SeverityRaw);
            Assert.False(finding.Dismissed);
        }

        [Fact]
        public void ProvidersConfig_DefaultProviders()
        {
            var providers = new ProvidersConfig();
            Assert.Equal("codex", providers.Codex.Command);
            Assert.Equal("claude", providers.Claude.Command);
            Assert.Equal("http://127.0.0.1:8080", providers.LlamaCpp.BaseUrl);
            Assert.Equal("opencode", providers.Opencode.Command);
            Assert.Equal("kiro", providers.Kiro.Command);
        }

        [Fact]
        public void AutoAnalyseConfig_Defaults()
        {
            var config = new AutoAnalyseConfig();
            Assert.Equal("disabled", config.Trigger);
            Assert.Equal(5, config.IntervalMinutes);
        }
    }
}
