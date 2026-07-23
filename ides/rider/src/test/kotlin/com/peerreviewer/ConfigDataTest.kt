package com.peerreviewer

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class ConfigDataTest {

    @Test
    fun `PeerReviewerConfig data class holds all fields`() {
        val config = PeerReviewerConfig(
            activeProvider = "claude",
            providers = ProvidersConfig(
                codex = CodexProviderConfig(command = "codex", args = listOf("exec", "--json")),
                llamaCpp = LlamaCppProviderConfig(baseUrl = "http://127.0.0.1:8080"),
                claude = ClaudeProviderConfig(command = "claude", args = listOf("--print")),
                opencode = OpenCodeProviderConfig(command = "opencode", args = listOf("--print")),
                kiro = KiroProviderConfig(command = "kiro", args = listOf("--print"))
            ),
            systemPrompt = SystemPromptConfig(mode = "default", text = ""),
            preCommit = PreCommitConfig(blockOnFindings = true),
            autoAnalyse = AutoAnalyseConfig(trigger = "disabled", intervalMinutes = 5),
            codingStandardsFolder = null,
            maxFilesPerRun = null,
            debugLogging = false
        )
        assertEquals("claude", config.activeProvider)
        assertTrue(config.preCommit.blockOnFindings)
        assertNull(config.codingStandardsFolder)
        assertNull(config.maxFilesPerRun)
        assertEquals("disabled", config.autoAnalyse?.trigger)
    }

    @Test
    fun `PeerReviewerConfig with coding standards folder`() {
        val config = PeerReviewerConfig(
            activeProvider = "codex",
            providers = ProvidersConfig(
                codex = CodexProviderConfig(command = "codex", args = listOf("exec")),
                llamaCpp = LlamaCppProviderConfig(baseUrl = "http://localhost:8080"),
                claude = ClaudeProviderConfig(command = "claude", args = listOf("--print")),
                opencode = null,
                kiro = null
            ),
            systemPrompt = SystemPromptConfig(mode = "append", text = "Extra rules"),
            preCommit = PreCommitConfig(blockOnFindings = false),
            autoAnalyse = AutoAnalyseConfig(trigger = "on-save", intervalMinutes = 10),
            codingStandardsFolder = "/path/to/standards",
            maxFilesPerRun = 20,
            debugLogging = true
        )
        assertEquals("codex", config.activeProvider)
        assertEquals("/path/to/standards", config.codingStandardsFolder)
        assertEquals(20, config.maxFilesPerRun)
        assertTrue(config.debugLogging!!)
        assertEquals("append", config.systemPrompt.mode)
    }

    @Test
    fun `Finding data class holds all fields`() {
        val finding = Finding(
            id = "abc-123",
            file = "src/main.kt",
            startLine = 10,
            endLine = 15,
            severity = "high",
            category = "security",
            title = "SQL injection",
            message = "User input not sanitized",
            provider = "claude",
            dismissed = false
        )
        assertEquals("abc-123", finding.id)
        assertEquals("high", finding.severity)
        assertFalse(finding.dismissed)
        assertEquals(10, finding.startLine)
        assertEquals(15, finding.endLine)
    }

    @Test
    fun `AutoAnalyseConfig defaults`() {
        val config = AutoAnalyseConfig()
        assertEquals("disabled", config.trigger)
        assertEquals(5, config.intervalMinutes)
    }

    @Test
    fun `AnalysisProgress data class`() {
        val progress = AnalysisProgress(total = 10, completed = 3, startedAt = 1000L)
        assertEquals(10, progress.total)
        assertEquals(3, progress.completed)
        assertEquals(1000L, progress.startedAt)
    }
}
