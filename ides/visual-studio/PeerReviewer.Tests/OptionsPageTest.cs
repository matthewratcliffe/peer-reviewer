using Xunit;
using PeerReviewer;
using System.Collections.Generic;
using System.Text.Json;

namespace PeerReviewer.Tests
{
    public class ConfigSerializationTest
    {
        [Fact]
        public void PeerReviewerConfig_RoundTripsViaJson()
        {
            var config = new PeerReviewerConfig
            {
                ActiveProvider = "codex",
                Providers = new ProvidersConfig
                {
                    Codex = new CodexProviderConfig { Command = "/usr/bin/codex", Args = new List<string> { "exec", "--json" } },
                    LlamaCpp = new LlamaCppProviderConfig { BaseUrl = "http://localhost:9090" },
                    Claude = new ClaudeProviderConfig { Command = "claude-3", Args = new List<string> { "--print", "--model", "opus" } },
                    Opencode = new OpenCodeProviderConfig { Command = "oc", Args = new List<string> { "run" } },
                    Kiro = new KiroProviderConfig { Command = "kiro-cli", Args = new List<string> { "--print" } }
                },
                SystemPrompt = new SystemPromptConfig { Mode = "append", Text = "Extra rules" },
                PreCommit = new PreCommitConfig { BlockOnFindings = false },
                AutoAnalyse = new AutoAnalyseConfig { Trigger = "on-save", IntervalMinutes = 10 },
                CodingStandardsFolder = "/path/to/standards",
                MaxFilesPerRun = 25,
                DebugLogging = true,
            };

            var json = JsonSerializer.Serialize(config);
            var deserialized = JsonSerializer.Deserialize<PeerReviewerConfig>(json);

            Assert.NotNull(deserialized);
            Assert.Equal("codex", deserialized!.ActiveProvider);
            Assert.Equal("/usr/bin/codex", deserialized.Providers.Codex.Command);
            Assert.Equal("http://localhost:9090", deserialized.Providers.LlamaCpp.BaseUrl);
            Assert.Equal("claude-3", deserialized.Providers.Claude.Command);
            Assert.Equal("append", deserialized.SystemPrompt.Mode);
            Assert.Equal("Extra rules", deserialized.SystemPrompt.Text);
            Assert.False(deserialized.PreCommit.BlockOnFindings);
            Assert.Equal("on-save", deserialized.AutoAnalyse.Trigger);
            Assert.Equal(10, deserialized.AutoAnalyse.IntervalMinutes);
            Assert.Equal("/path/to/standards", deserialized.CodingStandardsFolder);
            Assert.Equal(25, deserialized.MaxFilesPerRun);
            Assert.True(deserialized.DebugLogging);
        }

        [Fact]
        public void PeerReviewerConfig_NullFieldsSerializeCorrectly()
        {
            var config = new PeerReviewerConfig
            {
                CodingStandardsFolder = null,
                MaxFilesPerRun = null,
            };

            var json = JsonSerializer.Serialize(config);
            Assert.Contains("\"codingStandardsFolder\":null", json);
            Assert.Contains("\"maxFilesPerRun\":null", json);

            var deserialized = JsonSerializer.Deserialize<PeerReviewerConfig>(json);
            Assert.Null(deserialized!.CodingStandardsFolder);
            Assert.Null(deserialized.MaxFilesPerRun);
        }

        [Fact]
        public void PeerReviewerConfig_JsonPropertyNames_MatchApiContract()
        {
            var config = new PeerReviewerConfig();
            var json = JsonSerializer.Serialize(config);

            Assert.Contains("\"activeProvider\"", json);
            Assert.Contains("\"providers\"", json);
            Assert.Contains("\"systemPrompt\"", json);
            Assert.Contains("\"preCommit\"", json);
            Assert.Contains("\"autoAnalyse\"", json);
            Assert.Contains("\"codingStandardsFolder\"", json);
            Assert.Contains("\"maxFilesPerRun\"", json);
            Assert.Contains("\"debugLogging\"", json);
        }

        [Fact]
        public void Finding_DeserializesFromServiceJson()
        {
            var json = @"{
                ""id"": ""abc-123"",
                ""file"": ""src/main.cs"",
                ""startLine"": 10,
                ""endLine"": 15,
                ""severity"": ""high"",
                ""category"": ""security"",
                ""title"": ""SQL injection"",
                ""message"": ""User input not sanitized"",
                ""provider"": ""claude"",
                ""dismissed"": false,
                ""createdAt"": ""2025-01-01T00:00:00Z""
            }";

            var finding = JsonSerializer.Deserialize<Finding>(json);
            Assert.NotNull(finding);
            Assert.Equal("abc-123", finding!.Id);
            Assert.Equal("src/main.cs", finding.File);
            Assert.Equal(10, finding.StartLine);
            Assert.Equal(15, finding.EndLine);
            Assert.Equal("high", finding.SeverityRaw);
            Assert.Equal(Severity.High, finding.Severity);
            Assert.Equal("security", finding.Category);
            Assert.Equal("SQL injection", finding.Title);
            Assert.False(finding.Dismissed);
        }
    }
}
