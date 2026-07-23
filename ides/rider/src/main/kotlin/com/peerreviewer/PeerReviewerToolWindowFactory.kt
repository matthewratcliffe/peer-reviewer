package com.peerreviewer

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.table.JBTable
import java.awt.Component
import java.awt.Dimension
import java.awt.Font
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JProgressBar
import javax.swing.JScrollPane
import javax.swing.JSplitPane
import javax.swing.JTable
import javax.swing.JTextArea
import javax.swing.SwingConstants
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import javax.swing.table.AbstractTableModel
import javax.swing.table.DefaultTableCellRenderer
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.FlowLayout
import java.io.File
import java.nio.file.Files
import java.nio.file.Paths
import java.util.Timer
import java.util.TimerTask
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

private val LOG = Logger.getInstance(PeerReviewerToolWindowFactory::class.java)

private const val POLL_INTERVAL_MS = 2000L
private const val PROGRESS_POLL_INTERVAL_MS = 1000L
private const val NOTES_SAVE_DELAY_MS = 500L

private val SEVERITY_ORDER = mapOf("HIGH" to 0, "MEDIUM" to 1, "LOW" to 2, "INFO" to 3)

private fun formatProcessingText(progress: AnalysisProgress): String {
    val completed = progress.completed.coerceAtMost(progress.total)
    val inProgress = if (progress.total > completed) 1 else 0
    val remaining = (progress.total - completed - inProgress).coerceAtLeast(0)
    val percent = if (progress.total > 0) ((completed * 100) / progress.total).coerceAtMost(100) else 0
    val etaText = if (completed > 0) {
        val elapsedMs = System.currentTimeMillis() - progress.startedAt
        val msPerFile = elapsedMs.toDouble() / completed
        val etaSeconds = ((msPerFile * (progress.total - completed)) / 1000).toLong().coerceAtLeast(0)
        "ETA: ${etaSeconds}s"
    } else {
        "ETA: calculating..."
    }
    return "${completed} complete, $inProgress in progress, $remaining remaining ($percent%)<br>$etaText"
}

private fun notesDir(repoRoot: String): java.nio.file.Path =
    Paths.get(repoRoot, ".peer-review", "notes")

private fun noteFileForFinding(repoRoot: String, finding: Finding): java.nio.file.Path {
    val safeFile = finding.file.replace("/", "_").replace("\\", "_")
    val fileName = "${safeFile}_L${finding.startLine}_${finding.category}.md"
    return notesDir(repoRoot).resolve(fileName)
}

private fun loadNote(repoRoot: String, finding: Finding): String {
    val path = noteFileForFinding(repoRoot, finding)
    return if (Files.exists(path)) Files.readString(path) else ""
}

private fun saveNote(repoRoot: String, finding: Finding, text: String) {
    val path = noteFileForFinding(repoRoot, finding)
    Files.createDirectories(path.parent)
    if (text.isBlank()) {
        Files.deleteIfExists(path)
    } else {
        Files.writeString(path, text)
    }
}

private sealed class DisplayRow {
    data class Group(val key: String, val count: Int, val expanded: Boolean) : DisplayRow()
    data class Item(val finding: Finding) : DisplayRow()
}

private class FindingsTableModel : AbstractTableModel() {
    private val columns = arrayOf("Severity", "Issue", "Description", "File", "Line")
    private var allFindings: List<Finding> = emptyList()
    private var rows: List<DisplayRow> = emptyList()
    private val collapsedGroups = mutableSetOf<String>()

    var severityFilter: String = "All"
        set(value) { field = value; rebuild() }
    var categoryFilter: String = "All"
        set(value) { field = value; rebuild() }
    var groupBy: String = "None"
        set(value) { field = value; collapsedGroups.clear(); rebuild() }

    fun setFindings(newFindings: List<Finding>) {
        allFindings = newFindings
        rebuild()
    }

    fun toggleGroup(rowIndex: Int) {
        val row = rows.getOrNull(rowIndex) ?: return
        if (row is DisplayRow.Group) {
            if (collapsedGroups.contains(row.key)) {
                collapsedGroups.remove(row.key)
            } else {
                collapsedGroups.add(row.key)
            }
            rebuild()
        }
    }

    fun getRow(rowIndex: Int): DisplayRow? = rows.getOrNull(rowIndex)

    fun getFinding(rowIndex: Int): Finding? {
        return when (val r = rows.getOrNull(rowIndex)) {
            is DisplayRow.Item -> r.finding
            else -> null
        }
    }

    private fun rebuild() {
        var filtered = if (severityFilter == "All") {
            allFindings
        } else {
            allFindings.filter { it.severity.equals(severityFilter, ignoreCase = true) }
        }

        if (categoryFilter != "All") {
            filtered = filtered.filter { it.title.equals(categoryFilter, ignoreCase = true) }
        }

        val newRows = mutableListOf<DisplayRow>()

        when (groupBy) {
            "Severity" -> {
                val grouped = filtered.groupBy { it.severity.uppercase() }
                    .toSortedMap(compareBy { SEVERITY_ORDER[it] ?: 99 })
                for ((severity, findings) in grouped) {
                    val collapsed = collapsedGroups.contains(severity)
                    newRows.add(DisplayRow.Group(severity, findings.size, !collapsed))
                    if (!collapsed) {
                        findings.forEach { newRows.add(DisplayRow.Item(it)) }
                    }
                }
            }
            "File" -> {
                val grouped = filtered.groupBy { it.file }.toSortedMap()
                for ((file, findings) in grouped) {
                    val collapsed = collapsedGroups.contains(file)
                    newRows.add(DisplayRow.Group(file, findings.size, !collapsed))
                    if (!collapsed) {
                        findings.forEach { newRows.add(DisplayRow.Item(it)) }
                    }
                }
            }
            "Issue" -> {
                val grouped = filtered.groupBy { it.category }
                    .toSortedMap()
                for ((category, findings) in grouped) {
                    val collapsed = collapsedGroups.contains(category)
                    newRows.add(DisplayRow.Group(category, findings.size, !collapsed))
                    if (!collapsed) {
                        findings.forEach { newRows.add(DisplayRow.Item(it)) }
                    }
                }
            }
            else -> {
                filtered.forEach { newRows.add(DisplayRow.Item(it)) }
            }
        }

        rows = newRows
        fireTableDataChanged()
    }

    override fun getRowCount(): Int = rows.size
    override fun getColumnCount(): Int = columns.size
    override fun getColumnName(column: Int): String = columns[column]

    override fun getValueAt(rowIndex: Int, columnIndex: Int): Any {
        return when (val row = rows[rowIndex]) {
            is DisplayRow.Group -> {
                if (columnIndex == 0) {
                    val arrow = if (row.expanded) "\u25BC" else "\u25B6"
                    "$arrow ${row.key} (${row.count})"
                } else ""
            }
            is DisplayRow.Item -> {
                val finding = row.finding
                when (columnIndex) {
                    0 -> finding.severity.uppercase()
                    1 -> finding.title
                    2 -> finding.message
                    3 -> finding.file
                    4 -> finding.startLine.toString()
                    else -> ""
                }
            }
        }
    }
}

private class FindingsTableCellRenderer : DefaultTableCellRenderer() {
    override fun getTableCellRendererComponent(
        table: JTable, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int
    ): Component {
        val comp = super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)
        val model = table.model as FindingsTableModel
        val displayRow = model.getRow(row)
        if (displayRow is DisplayRow.Group) {
            comp.font = comp.font.deriveFont(Font.BOLD)
        } else {
            comp.font = comp.font.deriveFont(Font.PLAIN)
        }
        return comp
    }
}

class PeerReviewerToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val client = IpcClient()
        val repoPath = project.basePath ?: throw IllegalStateException("project has no base path")
        val repoRoot = AtomicReference<String>(null)
        val tableModel = FindingsTableModel()
        val table = JBTable(tableModel).apply {
            setShowGrid(false)
            autoResizeMode = JBTable.AUTO_RESIZE_LAST_COLUMN
            columnModel.getColumn(0).preferredWidth = 100
            columnModel.getColumn(1).preferredWidth = 200
            columnModel.getColumn(2).preferredWidth = 400
            columnModel.getColumn(3).preferredWidth = 200
            columnModel.getColumn(4).preferredWidth = 50
            setDefaultRenderer(Any::class.java, FindingsTableCellRenderer())
        }

        // --- Detail panel (right side) ---
        val detailTitleLabel = JLabel("Select a finding to view details")
        detailTitleLabel.font = detailTitleLabel.font.deriveFont(Font.BOLD, 14f)
        val detailSeverityLabel = JLabel("")
        val detailCategoryLabel = JLabel("")
        val detailFileLabel = JLabel("")
        val detailLineLabel = JLabel("")
        val detailProviderLabel = JLabel("")
        val detailMessageArea = JTextArea(5, 30).apply {
            isEditable = false
            lineWrap = true
            wrapStyleWord = true
            border = BorderFactory.createTitledBorder("Why it matters")
        }
        val notesArea = JBTextArea(5, 30).apply {
            lineWrap = true
            wrapStyleWord = true
            border = BorderFactory.createTitledBorder("Team Notes (shared via .peer-review/)")
        }

        val detailInfoPanel = JPanel().apply {
            layout = javax.swing.BoxLayout(this, javax.swing.BoxLayout.Y_AXIS)
            border = BorderFactory.createEmptyBorder(8, 8, 8, 8)
            add(detailTitleLabel)
            add(javax.swing.Box.createVerticalStrut(6))
            add(detailSeverityLabel)
            add(detailCategoryLabel)
            add(detailFileLabel)
            add(detailLineLabel)
            add(detailProviderLabel)
            add(javax.swing.Box.createVerticalStrut(10))
        }

        val detailPanel = JPanel(BorderLayout()).apply {
            preferredSize = Dimension(350, 0)
            minimumSize = Dimension(250, 0)
            add(detailInfoPanel, BorderLayout.NORTH)
            add(JScrollPane(detailMessageArea), BorderLayout.CENTER)
            add(JScrollPane(notesArea), BorderLayout.SOUTH)
        }

        val splitPane = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, JScrollPane(table), detailPanel).apply {
            resizeWeight = 0.7
            dividerLocation = 700
        }
        // Start with detail panel hidden
        detailPanel.isVisible = false
        splitPane.dividerSize = 0
        splitPane.rightComponent = null

        val detailToggleButton = JButton(com.intellij.icons.AllIcons.Actions.PreviewDetails).apply {
            toolTipText = "Toggle details panel"
            isBorderPainted = false
            isContentAreaFilled = false
        }

        fun setDetailPanelVisible(visible: Boolean) {
            if (visible) {
                splitPane.rightComponent = detailPanel
                detailPanel.isVisible = true
                splitPane.dividerSize = javax.swing.UIManager.getInt("SplitPane.dividerSize").let { if (it > 0) it else 5 }
                splitPane.dividerLocation = (splitPane.width * 0.65).toInt().coerceAtLeast(400)
            } else {
                splitPane.rightComponent = null
                detailPanel.isVisible = false
                splitPane.dividerSize = 0
            }
            splitPane.revalidate()
            splitPane.repaint()
        }

        detailToggleButton.addActionListener {
            setDetailPanelVisible(!detailPanel.isVisible)
        }

        var currentNoteFinding: Finding? = null
        var notesSaveTimer: Timer? = null

        fun showFindingDetail(finding: Finding) {
            val repo = repoRoot.get() ?: return
            currentNoteFinding = finding
            detailTitleLabel.text = finding.title
            detailSeverityLabel.text = "Severity: ${finding.severity.uppercase()}"
            detailCategoryLabel.text = "Category: ${finding.category}"
            detailFileLabel.text = "File: ${finding.file}"
            detailLineLabel.text = "Lines: ${finding.startLine}-${finding.endLine}"
            detailProviderLabel.text = "Provider: ${finding.provider}"
            detailMessageArea.text = finding.message
            detailMessageArea.caretPosition = 0

            // Load shared note
            val noteText = try { loadNote(repo, finding) } catch (_: Exception) { "" }
            notesArea.text = noteText
            notesArea.caretPosition = 0

            // Auto-open detail panel if closed
            if (!detailPanel.isVisible) {
                setDetailPanelVisible(true)
            }
        }

        // Save notes with debounce
        notesArea.document.addDocumentListener(object : DocumentListener {
            private fun scheduleSave() {
                notesSaveTimer?.cancel()
                notesSaveTimer = Timer("peer-reviewer-save", true).apply {
                    schedule(object : TimerTask() {
                        override fun run() {
                            val finding = currentNoteFinding ?: return
                            val repo = repoRoot.get() ?: return
                            try {
                                saveNote(repo, finding, notesArea.text)
                            } catch (e: Exception) {
                                LOG.warn("peer-reviewer: failed to save note", e)
                            }
                        }
                    }, NOTES_SAVE_DELAY_MS)
                }
            }
            override fun insertUpdate(e: DocumentEvent) = scheduleSave()
            override fun removeUpdate(e: DocumentEvent) = scheduleSave()
            override fun changedUpdate(e: DocumentEvent) = scheduleSave()
        })

        // --- Table click handling ---
        table.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                val row = table.rowAtPoint(e.point)
                if (row < 0) return
                val displayRow = tableModel.getRow(row)
                if (displayRow is DisplayRow.Group) {
                    tableModel.toggleGroup(row)
                    return
                }
                val finding = tableModel.getFinding(row) ?: return
                showFindingDetail(finding)
                if (e.clickCount == 2) {
                    navigateToFinding(project, repoRoot.get() ?: return, finding)
                }
            }
        })

        val reanalyzeChangesButton = JButton("Re-analyse changes")
        val reanalyzeProjectButton = JButton("Re-analyse project")
        val settingsButton = JButton(com.intellij.icons.AllIcons.General.GearPlain).apply {
            toolTipText = "Settings"
            isBorderPainted = false
            isContentAreaFilled = false
        }
        settingsButton.addActionListener {
            ShowSettingsUtil.getInstance().showSettingsDialog(project, PeerReviewerConfigurable::class.java)
        }
        val progressBar = JProgressBar().apply {
            isIndeterminate = true
            isVisible = false
        }

        val severityFilterCombo = ComboBox(arrayOf("All", "High", "Medium", "Low", "Info"))
        severityFilterCombo.addActionListener {
            tableModel.severityFilter = severityFilterCombo.selectedItem as String
        }

        val categoryFilterCombo = ComboBox(arrayOf("All"))
        categoryFilterCombo.addActionListener {
            tableModel.categoryFilter = categoryFilterCombo.selectedItem as? String ?: "All"
        }

        val groupByCombo = ComboBox(arrayOf("None", "Severity", "File", "Issue"))
        groupByCombo.addActionListener {
            tableModel.groupBy = groupByCombo.selectedItem as String
        }

        val centerCards = JPanel(CardLayout())
        val processingLabel = JLabel("Processing analysis. Please check back later.", SwingConstants.CENTER)
        val stopAnalysisButton = JButton("Stop Analysis")
        val processingPanel = JPanel(BorderLayout()).apply {
            add(processingLabel, BorderLayout.CENTER)
            add(JPanel(FlowLayout(FlowLayout.CENTER)).apply { add(stopAnalysisButton) }, BorderLayout.SOUTH)
        }
        val errorLabel = JLabel("", SwingConstants.CENTER)
        val loadingLabel = JLabel("Loading findings...", SwingConstants.CENTER)

        centerCards.add(loadingLabel, "loading")
        centerCards.add(splitPane, "findings")
        centerCards.add(processingPanel, "processing")
        centerCards.add(errorLabel, "error")

        (centerCards.layout as CardLayout).show(centerCards, "loading")

        val analysisInProgress = java.util.concurrent.atomic.AtomicBoolean(false)
        val severityCountsLabel = JBLabel("")

        fun runAnalysis(action: (IpcClient, String) -> Unit) {
            val repo = repoRoot.get()
            if (repo == null) {
                errorLabel.text = "<html><div style='text-align:center'>Analysis failed:<br>peer-reviewer-service is not connected yet. Please wait and try again.</div></html>"
                (centerCards.layout as CardLayout).show(centerCards, "error")
                return
            }
            analysisInProgress.set(true)
            reanalyzeChangesButton.isEnabled = false
            reanalyzeProjectButton.isEnabled = false
            progressBar.isVisible = true
            processingLabel.text = "<html><div style='text-align:center'>Processing analysis. Please check back later.</div></html>"
            (centerCards.layout as CardLayout).show(centerCards, "processing")

            val polling = java.util.concurrent.atomic.AtomicBoolean(true)
            thread(isDaemon = true, name = "peer-reviewer-progress-poll") {
                while (polling.get()) {
                    try {
                        val progress = client.getAnalysisProgress(repo)
                        if (progress.total > 0) {
                            val completed = progress.completed.coerceAtMost(progress.total)
                            val percent = if (progress.total > 0) ((completed * 100) / progress.total).coerceAtMost(100) else 0
                            val text = if (percent >= 100) {
                                "Preparing report..."
                            } else {
                                formatProcessingText(progress)
                            }
                            javax.swing.SwingUtilities.invokeLater {
                                processingLabel.text = "<html><div style='text-align:center'>$text</div></html>"
                            }
                        }
                    } catch (_: Exception) {}
                    Thread.sleep(PROGRESS_POLL_INTERVAL_MS)
                }
            }

            thread(isDaemon = true, name = "peer-reviewer-analyze") {
                var failure: Exception? = null
                try {
                    action(client, repo)
                } catch (e: Exception) {
                    LOG.warn("peer-reviewer: failed to run analysis", e)
                    failure = e
                } finally {
                    polling.set(false)
                    // Fetch all findings before showing the table
                    var findings: List<Finding> = emptyList()
                    if (failure == null) {
                        try {
                            findings = client.getAllFindings(repo).filter { !it.dismissed }
                        } catch (_: Exception) {}
                    }
                    javax.swing.SwingUtilities.invokeLater {
                        reanalyzeChangesButton.isEnabled = true
                        reanalyzeProjectButton.isEnabled = true
                        progressBar.isVisible = false
                        analysisInProgress.set(false)
                        if (failure != null) {
                            errorLabel.text = "<html><div style='text-align:center'>Analysis failed:<br>${failure.message}</div></html>"
                            (centerCards.layout as CardLayout).show(centerCards, "error")
                        } else {
                            tableModel.setFindings(findings)
                            val high = findings.count { it.severity.equals("high", ignoreCase = true) }
                            val medium = findings.count { it.severity.equals("medium", ignoreCase = true) }
                            val low = findings.count { it.severity.equals("low", ignoreCase = true) }
                            val info = findings.count { it.severity.equals("info", ignoreCase = true) }
                            severityCountsLabel.text = "H:$high M:$medium L:$low I:$info"
                            (centerCards.layout as CardLayout).show(centerCards, "findings")
                        }
                    }
                }
            }
        }

        reanalyzeChangesButton.addActionListener { runAnalysis { c, repo -> c.analyzeChanges(repo) } }
        reanalyzeProjectButton.addActionListener { runAnalysis { c, repo -> c.analyzeProject(repo) } }
        stopAnalysisButton.addActionListener {
            val repo = repoRoot.get() ?: return@addActionListener
            thread(isDaemon = true, name = "peer-reviewer-cancel") {
                try { client.cancelAnalysis(repo) } catch (_: Exception) {}
            }
        }

        val logoIcon = javax.swing.ImageIcon(javaClass.getResource("/META-INF/mr_logo.png")).let { icon ->
            val targetW = 45
            val targetH = 24
            val buffered = java.awt.image.BufferedImage(targetW, targetH, java.awt.image.BufferedImage.TYPE_INT_ARGB)
            val g2 = buffered.createGraphics()
            g2.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BICUBIC)
            g2.setRenderingHint(java.awt.RenderingHints.KEY_RENDERING, java.awt.RenderingHints.VALUE_RENDER_QUALITY)
            g2.setRenderingHint(java.awt.RenderingHints.KEY_ANTIALIASING, java.awt.RenderingHints.VALUE_ANTIALIAS_ON)
            g2.drawImage(icon.image, 0, 0, targetW, targetH, null)
            g2.dispose()
            javax.swing.ImageIcon(buffered)
        }
        val logoButton = JButton(logoIcon).apply {
            toolTipText = "matthewratcliffe.com.au"
            isBorderPainted = false
            isContentAreaFilled = false
            cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
            addActionListener {
                com.intellij.ide.BrowserUtil.browse("https://www.matthewratcliffe.com.au")
            }
        }

        val toolbarLeft = JPanel(FlowLayout(FlowLayout.LEFT))
        toolbarLeft.add(reanalyzeChangesButton)
        toolbarLeft.add(reanalyzeProjectButton)
        toolbarLeft.add(settingsButton)
        toolbarLeft.add(progressBar)
        toolbarLeft.add(severityCountsLabel)
        toolbarLeft.add(JBLabel("Severity:"))
        toolbarLeft.add(severityFilterCombo)
        toolbarLeft.add(JBLabel("Issue:"))
        toolbarLeft.add(categoryFilterCombo)
        toolbarLeft.add(JBLabel("Group by:"))
        toolbarLeft.add(groupByCombo)
        toolbarLeft.add(detailToggleButton)

        val toolbar = JPanel(BorderLayout())
        toolbar.add(toolbarLeft, BorderLayout.CENTER)
        toolbar.add(logoButton, BorderLayout.EAST)

        val panel = JPanel(BorderLayout())
        panel.add(toolbar, BorderLayout.NORTH)
        panel.add(centerCards, BorderLayout.CENTER)

        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)

        thread(isDaemon = true, name = "peer-reviewer-launch") {
            try {
                repoRoot.set(ServiceLauncher.ensureRunningAndRegister(client, repoPath))
            } catch (e: Exception) {
                return@thread
            }

            startAutoAnalyse(project, client, repoRoot,
                onStart = {
                    reanalyzeChangesButton.isEnabled = false
                    reanalyzeProjectButton.isEnabled = false
                },
                onFinish = {
                    reanalyzeChangesButton.isEnabled = true
                    reanalyzeProjectButton.isEnabled = true
                }
            )

            var firstLoad = true
            while (true) {
                if (!analysisInProgress.get()) {
                    try {
                        val findings = client.getAllFindings(repoRoot.get()!!).filter { !it.dismissed }
                        javax.swing.SwingUtilities.invokeLater {
                            tableModel.setFindings(findings)
                            val high = findings.count { it.severity.equals("high", ignoreCase = true) }
                            val medium = findings.count { it.severity.equals("medium", ignoreCase = true) }
                            val low = findings.count { it.severity.equals("low", ignoreCase = true) }
                            val info = findings.count { it.severity.equals("info", ignoreCase = true) }
                            severityCountsLabel.text = "H:$high M:$medium L:$low I:$info"

                            // Update issue filter dropdown with current finding titles
                            val currentSelection = categoryFilterCombo.selectedItem as? String ?: "All"
                            val titles = listOf("All") + findings.map { it.title }.distinct().sorted()
                            categoryFilterCombo.removeAllItems()
                            titles.forEach { categoryFilterCombo.addItem(it) }
                            if (titles.contains(currentSelection)) {
                                categoryFilterCombo.selectedItem = currentSelection
                            }

                            if (firstLoad) {
                                (centerCards.layout as CardLayout).show(centerCards, "findings")
                                firstLoad = false
                            }
                        }
                    } catch (_: Exception) {}
                }
                Thread.sleep(POLL_INTERVAL_MS)
            }
        }
    }

    private fun startAutoAnalyse(
        project: Project,
        client: IpcClient,
        repoRoot: AtomicReference<String>,
        onStart: () -> Unit,
        onFinish: () -> Unit
    ) {
        val analyseRunning = AtomicBoolean(false)
        var periodicTimer: Timer? = null

        fun triggerAnalyseInBackground() {
            val repo = repoRoot.get() ?: return
            if (!analyseRunning.compareAndSet(false, true)) return
            javax.swing.SwingUtilities.invokeLater { onStart() }
            thread(isDaemon = true, name = "peer-reviewer-auto-analyse") {
                try {
                    client.analyzeChanges(repo)
                } catch (e: Exception) {
                    LOG.warn("peer-reviewer: auto-analyse failed", e)
                } finally {
                    analyseRunning.set(false)
                    javax.swing.SwingUtilities.invokeLater { onFinish() }
                }
            }
        }

        project.messageBus.connect().subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
            override fun after(events: List<VFileEvent>) {
                val config = try { client.getConfig() } catch (_: Exception) { return }
                if (config.autoAnalyse?.trigger != "on-save") return
                val repo = repoRoot.get() ?: return
                val repoPrefix = repo.replace("\\", "/")
                val relevant = events.any { event ->
                    event is VFileContentChangeEvent &&
                        event.file.path.replace("\\", "/").startsWith(repoPrefix)
                }
                if (relevant) triggerAnalyseInBackground()
            }
        })

        thread(isDaemon = true, name = "peer-reviewer-auto-analyse-config") {
            var lastTrigger = ""
            var lastInterval = 0
            while (true) {
                try {
                    val config = client.getConfig()
                    val trigger = config.autoAnalyse?.trigger ?: "disabled"
                    val interval = config.autoAnalyse?.intervalMinutes ?: 5

                    if (trigger != lastTrigger || interval != lastInterval) {
                        periodicTimer?.cancel()
                        periodicTimer = null

                        if (trigger == "periodically") {
                            val periodMs = interval.toLong() * 60_000L
                            periodicTimer = Timer("peer-reviewer-periodic-analyse", true).apply {
                                scheduleAtFixedRate(object : TimerTask() {
                                    override fun run() {
                                        triggerAnalyseInBackground()
                                    }
                                }, periodMs, periodMs)
                            }
                        }

                        lastTrigger = trigger
                        lastInterval = interval
                    }
                } catch (_: Exception) {}
                Thread.sleep(5000)
            }
        }
    }

    private fun navigateToFinding(project: Project, repoRoot: String, finding: Finding) {
        val absolutePath = Paths.get(repoRoot, finding.file).toString()
        val virtualFile = LocalFileSystem.getInstance().findFileByIoFile(File(absolutePath)) ?: return
        val descriptor = OpenFileDescriptor(project, virtualFile, finding.startLine - 1, 0)
        FileEditorManager.getInstance(project).openTextEditor(descriptor, true)
    }
}
