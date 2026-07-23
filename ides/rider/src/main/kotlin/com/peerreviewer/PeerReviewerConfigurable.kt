package com.peerreviewer

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import java.awt.CardLayout
import java.awt.FlowLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JScrollPane
import kotlin.concurrent.thread

private val LOG = Logger.getInstance(PeerReviewerConfigurable::class.java)

private val PROVIDER_LABELS = linkedMapOf(
    "claude" to "Claude",
    "codex" to "Codex",
    "llama-cpp" to "llama.cpp",
    "opencode" to "OpenCode",
    "kiro" to "Kiro"
)

private const val DEFAULT_CODEX_COMMAND = "codex"
private const val DEFAULT_CODEX_ARGS = "exec --json"
private const val DEFAULT_LLAMA_BASE_URL = "http://127.0.0.1:8080"
private const val DEFAULT_CLAUDE_COMMAND = "claude"
private const val DEFAULT_CLAUDE_ARGS = "--print"
private const val DEFAULT_OPENCODE_COMMAND = "opencode"
private const val DEFAULT_OPENCODE_ARGS = "--print"
private const val DEFAULT_KIRO_COMMAND = "kiro"
private const val DEFAULT_KIRO_ARGS = "--print"

// Mirrors REVIEW_SYSTEM_PROMPT from packages/service/src/providers/prompt.ts
private const val DEFAULT_SYSTEM_PROMPT = """You are a first-pass code reviewer running before a human review. Given a unified diff, find concrete, worth-a-human's-time issues across these categories:
- correctness: logic errors, off-by-one, wrong conditionals, incorrect assumptions
- security: injection, auth/authz gaps, unsafe deserialization, secrets in code, unvalidated input at trust boundaries
- naming: names that mislead, misdescribe behavior, or violate the file/module's existing conventions (only flag if it will cause confusion or misuse, not pure taste)
- best-practice: idioms and patterns established elsewhere in this codebase/language being violated without reason
- unintended-consequence: a change that looks correct locally but breaks, bypasses, or contradicts behavior elsewhere (a caller, an invariant, a related code path visible in the diff context)
- error-handling: swallowed exceptions, missing checks at failure points, error paths that leave state inconsistent
- performance: obviously wasteful patterns introduced by this change (N+1 calls, unnecessary copies/allocations in hot paths, quadratic where linear is easy)
- concurrency: race conditions, missing synchronization, unsafe shared mutable state introduced by this change
- resource-leak: unclosed handles/connections/listeners, missing cleanup on error paths
- test-coverage: new branches/edge cases in this diff with no corresponding test change nearby
- api-contract: breaking a public function/API signature or behavior in a way callers won't expect
- maintainability: only flag if the change meaningfully increases future risk (e.g. duplicated logic that will drift, magic values with no explanation)

Do not comment on pure style/formatting preferences that have no functional or maintenance consequence. Only report things a competent human reviewer would actually flag — skip anything speculative or low-confidence. Do not include positive feedback, compliments, or commentary on things done well — only return actionable issues that need to be changed. Respond with strict JSON: an array of objects with fields startLine, endLine (1-indexed lines in the NEW file), severity ("info"|"low"|"medium"|"high"), category, title (short), message (explain the issue and, where relevant, its consequence). If there are no issues, respond with an empty array."""

class PeerReviewerConfigurable : Configurable {
    private val client = IpcClient()
    private var loaded: PeerReviewerConfig? = null

    private val providerCombo = ComboBox(PROVIDER_LABELS.values.toTypedArray())
    private val providerCards = JPanel(CardLayout())

    private val codexCommandField = JBTextField(DEFAULT_CODEX_COMMAND)
    private val codexArgsField = JBTextField(DEFAULT_CODEX_ARGS)

    private val llamaBaseUrlField = JBTextField(DEFAULT_LLAMA_BASE_URL)

    private val claudeCommandField = JBTextField(DEFAULT_CLAUDE_COMMAND)
    private val claudeArgsField = JBTextField(DEFAULT_CLAUDE_ARGS)

    private val opencodeCommandField = JBTextField(DEFAULT_OPENCODE_COMMAND)
    private val opencodeArgsField = JBTextField(DEFAULT_OPENCODE_ARGS)

    private val kiroCommandField = JBTextField(DEFAULT_KIRO_COMMAND)
    private val kiroArgsField = JBTextField(DEFAULT_KIRO_ARGS)

    private val systemPromptModeCombo = ComboBox(arrayOf("Default", "Append to default", "Replace default"))
    private val systemPromptTextArea = JBTextArea(8, 60).apply { lineWrap = true; wrapStyleWord = true }
    private val copyPromptButton = JButton("Copy prompt")

    private val blockOnFindingsCheckBox = JBCheckBox("Block commit when unresolved medium/high findings exist")

    private val autoAnalyseCombo = ComboBox(arrayOf("Off", "On Save", "Periodically"))
    private val autoAnalyseIntervalField = JBTextField("5")
    private val maxFilesPerRunField = JBTextField("")

    private val debugLoggingCheckBox = JBCheckBox("Enable debug logging (log all LLM requests/responses)")

    private val testConnectionButton = JButton("Test Connection")
    private val testConnectionStatusLabel = JBLabel("")

    override fun getDisplayName(): String = "Peer Reviewer"

    override fun createComponent(): JComponent {
        providerCards.add(buildCodexPanel(), "codex")
        providerCards.add(buildLlamaPanel(), "llama-cpp")
        providerCards.add(buildClaudePanel(), "claude")
        providerCards.add(buildOpenCodePanel(), "opencode")
        providerCards.add(buildKiroPanel(), "kiro")
        providerCombo.addActionListener { showCardForSelectedProvider() }

        systemPromptModeCombo.addActionListener {
            updateSystemPromptUi()
        }

        copyPromptButton.addActionListener {
            val clipboard = java.awt.Toolkit.getDefaultToolkit().systemClipboard
            clipboard.setContents(java.awt.datatransfer.StringSelection(systemPromptTextArea.text), null)
        }

        autoAnalyseCombo.addActionListener { updateAutoAnalyseVisibility() }

        testConnectionButton.addActionListener { testConnection() }
        val testConnectionPanel = JPanel(FlowLayout(FlowLayout.LEFT))
        testConnectionPanel.add(testConnectionButton)
        testConnectionPanel.add(testConnectionStatusLabel)

        val promptToolbar = JPanel(FlowLayout(FlowLayout.LEFT))
        promptToolbar.add(systemPromptModeCombo)
        promptToolbar.add(copyPromptButton)

        val panel = FormBuilder.createFormBuilder()
            .addLabeledComponent("LLM provider:", providerCombo)
            .addComponent(providerCards)
            .addComponent(testConnectionPanel)
            .addSeparator()
            .addLabeledComponent("System prompt:", promptToolbar)
            .addComponentFillVertically(JScrollPane(systemPromptTextArea), 0)
            .addSeparator()
            .addComponent(blockOnFindingsCheckBox)
            .addSeparator()
            .addLabeledComponent("Auto analyse on:", autoAnalyseCombo)
            .addLabeledComponent("Interval (minutes):", autoAnalyseIntervalField)
            .addLabeledComponent("Max files per run:", maxFilesPerRunField)
            .addSeparator()
            .addComponent(debugLoggingCheckBox)
            .panel

        reload()
        return panel
    }

    private fun buildCodexPanel(): JComponent =
        FormBuilder.createFormBuilder()
            .addLabeledComponent("Command:", codexCommandField)
            .addLabeledComponent("Arguments:", codexArgsField)
            .panel

    private fun buildLlamaPanel(): JComponent =
        FormBuilder.createFormBuilder()
            .addLabeledComponent("Endpoint URL:", llamaBaseUrlField)
            .panel

    private fun buildClaudePanel(): JComponent =
        FormBuilder.createFormBuilder()
            .addLabeledComponent("Command:", claudeCommandField)
            .addLabeledComponent("Arguments:", claudeArgsField)
            .panel

    private fun buildOpenCodePanel(): JComponent =
        FormBuilder.createFormBuilder()
            .addLabeledComponent("Command:", opencodeCommandField)
            .addLabeledComponent("Arguments:", opencodeArgsField)
            .panel

    private fun buildKiroPanel(): JComponent =
        FormBuilder.createFormBuilder()
            .addLabeledComponent("Command:", kiroCommandField)
            .addLabeledComponent("Arguments:", kiroArgsField)
            .panel

    private fun testConnection() {
        val config = buildConfigFromUi()
        testConnectionButton.isEnabled = false
        testConnectionStatusLabel.text = "Testing..."
        testConnectionStatusLabel.foreground = java.awt.Color.GRAY
        thread(isDaemon = true, name = "peer-reviewer-test-connection") {
            var failure: Exception? = null
            try {
                client.testProvider(config)
            } catch (e: Exception) {
                failure = e
            }
            javax.swing.SwingUtilities.invokeLater {
                testConnectionButton.isEnabled = true
                if (failure == null) {
                    testConnectionStatusLabel.foreground = java.awt.Color(0, 128, 0)
                    testConnectionStatusLabel.text = "Connected"
                } else {
                    testConnectionStatusLabel.foreground = java.awt.Color.RED
                    testConnectionStatusLabel.text = "Failed: ${failure.message}"
                }
            }
        }
    }

    private fun showCardForSelectedProvider() {
        val id = providerIdForSelection()
        (providerCards.layout as CardLayout).show(providerCards, id)
    }

    private fun updateAutoAnalyseVisibility() {
        autoAnalyseIntervalField.isEnabled = autoAnalyseCombo.selectedIndex == 2
    }

    private fun updateSystemPromptUi() {
        val isDefault = systemPromptModeCombo.selectedIndex == 0
        systemPromptTextArea.isEditable = !isDefault
        if (isDefault) {
            systemPromptTextArea.text = DEFAULT_SYSTEM_PROMPT
        } else if (systemPromptTextArea.text == DEFAULT_SYSTEM_PROMPT) {
            systemPromptTextArea.text = loaded?.systemPrompt?.text ?: ""
        }
    }

    private fun providerIdForSelection(): String =
        PROVIDER_LABELS.entries.firstOrNull { it.value == providerCombo.selectedItem }?.key ?: "claude"

    private fun reload() {
        thread(isDaemon = true, name = "peer-reviewer-settings-load") {
            val config = try {
                client.getConfig()
            } catch (e: Exception) {
                LOG.warn("peer-reviewer: failed to load config (is the service running?)", e)
                null
            } ?: return@thread

            javax.swing.SwingUtilities.invokeLater {
                loaded = config
                providerCombo.selectedItem = PROVIDER_LABELS[config.activeProvider] ?: PROVIDER_LABELS["claude"]
                showCardForSelectedProvider()

                codexCommandField.text = config.providers.codex.command
                codexArgsField.text = config.providers.codex.args.joinToString(" ")
                llamaBaseUrlField.text = config.providers.llamaCpp.baseUrl
                claudeCommandField.text = config.providers.claude.command
                claudeArgsField.text = config.providers.claude.args.joinToString(" ")
                opencodeCommandField.text = config.providers.opencode?.command ?: DEFAULT_OPENCODE_COMMAND
                opencodeArgsField.text = config.providers.opencode?.args?.joinToString(" ") ?: DEFAULT_OPENCODE_ARGS
                kiroCommandField.text = config.providers.kiro?.command ?: DEFAULT_KIRO_COMMAND
                kiroArgsField.text = config.providers.kiro?.args?.joinToString(" ") ?: DEFAULT_KIRO_ARGS

                systemPromptModeCombo.selectedIndex = when (config.systemPrompt.mode) {
                    "append" -> 1
                    "replace" -> 2
                    else -> 0
                }
                systemPromptTextArea.text = config.systemPrompt.text
                updateSystemPromptUi()

                blockOnFindingsCheckBox.isSelected = config.preCommit.blockOnFindings

                autoAnalyseCombo.selectedIndex = when (config.autoAnalyse?.trigger) {
                    "on-save" -> 1
                    "periodically" -> 2
                    else -> 0
                }
                autoAnalyseIntervalField.text = (config.autoAnalyse?.intervalMinutes ?: 5).toString()
                updateAutoAnalyseVisibility()

                maxFilesPerRunField.text = config.maxFilesPerRun?.toString() ?: ""

                debugLoggingCheckBox.isSelected = config.debugLogging ?: false
            }
        }
    }

    private fun buildConfigFromUi(): PeerReviewerConfig {
        val promptMode = when (systemPromptModeCombo.selectedIndex) {
            1 -> "append"
            2 -> "replace"
            else -> "default"
        }
        val promptText = if (promptMode == "default") "" else systemPromptTextArea.text
        return PeerReviewerConfig(
            activeProvider = providerIdForSelection(),
            providers = ProvidersConfig(
                codex = CodexProviderConfig(
                    command = codexCommandField.text.ifBlank { DEFAULT_CODEX_COMMAND },
                    args = codexArgsField.text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
                        .ifEmpty { DEFAULT_CODEX_ARGS.split(" ") }
                ),
                llamaCpp = LlamaCppProviderConfig(
                    baseUrl = llamaBaseUrlField.text.ifBlank { DEFAULT_LLAMA_BASE_URL }
                ),
                claude = ClaudeProviderConfig(
                    command = claudeCommandField.text.ifBlank { DEFAULT_CLAUDE_COMMAND },
                    args = claudeArgsField.text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
                        .ifEmpty { DEFAULT_CLAUDE_ARGS.split(" ") }
                ),
                opencode = OpenCodeProviderConfig(
                    command = opencodeCommandField.text.ifBlank { DEFAULT_OPENCODE_COMMAND },
                    args = opencodeArgsField.text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
                        .ifEmpty { DEFAULT_OPENCODE_ARGS.split(" ") }
                ),
                kiro = KiroProviderConfig(
                    command = kiroCommandField.text.ifBlank { DEFAULT_KIRO_COMMAND },
                    args = kiroArgsField.text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
                        .ifEmpty { DEFAULT_KIRO_ARGS.split(" ") }
                )
            ),
            systemPrompt = SystemPromptConfig(mode = promptMode, text = promptText),
            preCommit = PreCommitConfig(blockOnFindings = blockOnFindingsCheckBox.isSelected),
            autoAnalyse = AutoAnalyseConfig(
                trigger = when (autoAnalyseCombo.selectedIndex) {
                    1 -> "on-save"
                    2 -> "periodically"
                    else -> "disabled"
                },
                intervalMinutes = autoAnalyseIntervalField.text.toIntOrNull()?.coerceAtLeast(1) ?: 5
            ),
            maxFilesPerRun = maxFilesPerRunField.text.trim().toIntOrNull()?.coerceAtLeast(1),
            debugLogging = debugLoggingCheckBox.isSelected
        )
    }

    override fun isModified(): Boolean {
        val current = loaded ?: return false
        val ui = buildConfigFromUi()
        return ui != current
    }

    override fun apply() {
        val updated = client.updateConfig(buildConfigFromUi())
        loaded = updated
    }

    override fun reset() {
        reload()
    }
}
