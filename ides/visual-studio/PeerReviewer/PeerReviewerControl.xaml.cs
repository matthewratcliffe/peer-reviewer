using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using EnvDTE;
using EnvDTE80;

namespace PeerReviewer
{
    public class FindingDisplayRow
    {
        public bool IsGroup { get; set; }
        public string GroupKey { get; set; }
        public int GroupCount { get; set; }
        public bool GroupExpanded { get; set; }
        public Finding Finding { get; set; }

        public string SeverityDisplay => IsGroup
            ? (GroupExpanded ? "\u25BC " : "\u25B6 ") + GroupKey + $" ({GroupCount})"
            : Finding?.SeverityRaw?.ToUpperInvariant() ?? "";

        public string TitleDisplay => IsGroup ? "" : Finding?.Title ?? "";
        public string MessageDisplay => IsGroup ? "" : Truncate(Finding?.Message, 100);
        public string FileDisplay => IsGroup ? "" : Finding?.File ?? "";
        public string LineDisplay => IsGroup ? "" : Finding?.StartLine.ToString() ?? "";

        private static string Truncate(string value, int maxLength)
        {
            if (string.IsNullOrEmpty(value)) return "";
            return value.Length <= maxLength ? value : value.Substring(0, maxLength) + "...";
        }
    }

    public partial class PeerReviewerControl : UserControl
    {
        private IpcClient _client;
        private string _repoRoot;
        private List<Finding> _allFindings = new List<Finding>();
        private readonly ObservableCollection<FindingDisplayRow> _displayRows = new ObservableCollection<FindingDisplayRow>();
        private readonly HashSet<string> _collapsedGroups = new HashSet<string>();
        private Finding _currentFinding;
        private CancellationTokenSource _pollCts;
        private CancellationTokenSource _analysisCts;
        private DispatcherTimer _notesSaveTimer;
        private DispatcherTimer _autoAnalyseTimer;
        private bool _analysisInProgress;
        private bool _detailVisible;

        public PeerReviewerControl()
        {
            InitializeComponent();
            try
            {
                _client = new IpcClient();
            }
            catch (Exception ex)
            {
                ShowError($"Failed to initialize IPC client: {ex.Message}");
                _client = null;
            }
            FindingsDataGrid.ItemsSource = _displayRows;
            _notesSaveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            _notesSaveTimer.Tick += NotesSaveTimer_Tick;

            Loaded += OnLoaded;
            Unloaded += OnUnloaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            _pollCts = new CancellationTokenSource();
            await Task.Run(() => InitializeConnection());
            StartPolling(_pollCts.Token);
            StartAutoAnalyseWatcher(_pollCts.Token);
        }

        private void OnUnloaded(object sender, RoutedEventArgs e)
        {
            _pollCts?.Cancel();
            _analysisCts?.Cancel();
            _autoAnalyseTimer?.Stop();
        }

        private void InitializeConnection()
        {
            try
            {
                if (_client == null)
                {
                    Dispatcher.Invoke(() => ShowError("IPC client is not available."));
                    return;
                }

                var solutionPath = GetSolutionDirectory();
                if (string.IsNullOrEmpty(solutionPath))
                    return;

                _repoRoot = ServiceLauncher.EnsureRunningAndRegister(_client, solutionPath);
            }
            catch (Exception ex)
            {
                Dispatcher.Invoke(() =>
                {
                    ShowError($"Failed to connect to peer-reviewer-service: {ex.Message}");
                });
            }
        }

        private string GetSolutionDirectory()
        {
            string path = null;
            ThreadHelper.JoinableTaskFactory.Run(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                var dte = Package.GetGlobalService(typeof(SDTE)) as DTE2;
                if (dte?.Solution != null && !string.IsNullOrEmpty(dte.Solution.FullName))
                {
                    path = Path.GetDirectoryName(dte.Solution.FullName);
                }
            });
            return path;
        }

        private async void StartPolling(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                if (!_analysisInProgress && !string.IsNullOrEmpty(_repoRoot) && _client != null)
                {
                    try
                    {
                        var response = await Task.Run(() => _client.GetAllFindings(_repoRoot), token);
                        var findings = response.Findings.Where(f => !f.Dismissed).ToList();
                        Dispatcher.Invoke(() => UpdateFindings(findings));
                    }
                    catch (OperationCanceledException) { break; }
                    catch { }
                }
                try { await Task.Delay(2000, token); }
                catch (OperationCanceledException) { break; }
            }
        }

        private async void StartAutoAnalyseWatcher(CancellationToken token)
        {
            string lastTrigger = "";
            int lastInterval = 0;

            while (!token.IsCancellationRequested)
            {
                if (!string.IsNullOrEmpty(_repoRoot) && _client != null)
                {
                    try
                    {
                        var config = await Task.Run(() => _client.GetConfig(), token);
                        var trigger = config.AutoAnalyse?.Trigger ?? "disabled";
                        var interval = config.AutoAnalyse?.IntervalMinutes ?? 5;

                        if (trigger != lastTrigger || interval != lastInterval)
                        {
                            Dispatcher.Invoke(() =>
                            {
                                _autoAnalyseTimer?.Stop();
                                _autoAnalyseTimer = null;

                                if (trigger == "periodically")
                                {
                                    _autoAnalyseTimer = new DispatcherTimer
                                    {
                                        Interval = TimeSpan.FromMinutes(interval)
                                    };
                                    _autoAnalyseTimer.Tick += (s, e) => RunAnalysis(AnalysisScope.Changes);
                                    _autoAnalyseTimer.Start();
                                }
                            });
                            lastTrigger = trigger;
                            lastInterval = interval;
                        }
                    }
                    catch (OperationCanceledException) { break; }
                    catch { }
                }
                try { await Task.Delay(5000, token); }
                catch (OperationCanceledException) { break; }
            }
        }

        private void UpdateFindings(List<Finding> findings)
        {
            _allFindings = findings;
            UpdateSeverityCounts();
            UpdateIssueFilter();
            RebuildDisplayRows();
            ShowFindings();
        }

        private void UpdateSeverityCounts()
        {
            var high = _allFindings.Count(f => f.Severity == Severity.High);
            var medium = _allFindings.Count(f => f.Severity == Severity.Medium);
            var low = _allFindings.Count(f => f.Severity == Severity.Low);
            var info = _allFindings.Count(f => f.Severity == Severity.Info);

            HighCount.Text = $"H:{high}";
            MediumCount.Text = $"M:{medium}";
            LowCount.Text = $"L:{low}";
            InfoCount.Text = $"I:{info}";
        }

        private void UpdateIssueFilter()
        {
            var currentSelection = (IssueFilter.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "All";
            var titles = _allFindings.Select(f => f.Title).Distinct().OrderBy(t => t).ToList();

            IssueFilter.Items.Clear();
            IssueFilter.Items.Add(new ComboBoxItem { Content = "All" });
            foreach (var title in titles)
            {
                IssueFilter.Items.Add(new ComboBoxItem { Content = title });
            }

            var match = IssueFilter.Items.Cast<ComboBoxItem>()
                .FirstOrDefault(i => i.Content.ToString() == currentSelection);
            IssueFilter.SelectedItem = match ?? IssueFilter.Items[0];
        }

        private void RebuildDisplayRows()
        {
            _displayRows.Clear();

            var filtered = ApplyFilters(_allFindings);

            var groupBy = (GroupByCombo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "None";

            switch (groupBy)
            {
                case "Severity":
                    BuildGroupedRows(filtered, f => f.SeverityRaw.ToUpperInvariant(),
                        new[] { "HIGH", "MEDIUM", "LOW", "INFO" });
                    break;
                case "File":
                    BuildGroupedRows(filtered, f => f.File, null);
                    break;
                case "Issue":
                    BuildGroupedRows(filtered, f => f.Category, null);
                    break;
                default:
                    foreach (var finding in filtered)
                        _displayRows.Add(new FindingDisplayRow { Finding = finding });
                    break;
            }
        }

        private void BuildGroupedRows(List<Finding> findings, Func<Finding, string> keySelector, string[] order)
        {
            var groups = findings.GroupBy(keySelector).ToDictionary(g => g.Key, g => g.ToList());

            IEnumerable<string> keys;
            if (order != null)
                keys = order.Where(k => groups.ContainsKey(k));
            else
                keys = groups.Keys.OrderBy(k => k);

            foreach (var key in keys)
            {
                var items = groups[key];
                var collapsed = _collapsedGroups.Contains(key);
                _displayRows.Add(new FindingDisplayRow
                {
                    IsGroup = true,
                    GroupKey = key,
                    GroupCount = items.Count,
                    GroupExpanded = !collapsed
                });

                if (!collapsed)
                {
                    foreach (var finding in items)
                        _displayRows.Add(new FindingDisplayRow { Finding = finding });
                }
            }
        }

        private List<Finding> ApplyFilters(List<Finding> findings)
        {
            var severity = (SeverityFilter.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "All";
            var issue = (IssueFilter.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "All";

            var filtered = findings.AsEnumerable();

            if (severity != "All")
                filtered = filtered.Where(f => f.SeverityRaw.Equals(severity, StringComparison.OrdinalIgnoreCase));

            if (issue != "All")
                filtered = filtered.Where(f => f.Title.Equals(issue, StringComparison.OrdinalIgnoreCase));

            return filtered.ToList();
        }

        private enum AnalysisScope { Changes, Project }

        private async void RunAnalysis(AnalysisScope scope)
        {
            if (_client == null)
            {
                ShowError("IPC client is not available. Cannot run analysis.");
                return;
            }

            if (string.IsNullOrEmpty(_repoRoot))
            {
                ShowError("Not connected to peer-reviewer-service. Please wait and try again.");
                return;
            }

            _analysisInProgress = true;
            _analysisCts = new CancellationTokenSource();
            SetAnalysisButtonsEnabled(false);
            ShowProcessing();

            var progressTask = PollProgress(_analysisCts.Token);

            try
            {
                await Task.Run(() =>
                {
                    if (scope == AnalysisScope.Changes)
                        _client.AnalyzeChanges(_repoRoot);
                    else
                        _client.AnalyzeProject(_repoRoot);
                });

                var response = await Task.Run(() => _client.GetAllFindings(_repoRoot));
                var findings = response.Findings.Where(f => !f.Dismissed).ToList();
                UpdateFindings(findings);
            }
            catch (Exception ex)
            {
                ShowError($"Analysis failed: {ex.Message}");
            }
            finally
            {
                _analysisCts.Cancel();
                _analysisInProgress = false;
                SetAnalysisButtonsEnabled(true);
            }
        }

        private async Task PollProgress(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                if (_client == null) break;

                try
                {
                    var progress = await Task.Run(() => _client.GetAnalysisProgress(_repoRoot), token);
                    if (progress.Total > 0)
                    {
                        var completed = Math.Min(progress.Completed, progress.Total);
                        var percent = progress.Total > 0 ? (completed * 100) / progress.Total : 0;
                        percent = Math.Min(percent, 100);

                        string text;
                        if (percent >= 100)
                        {
                            text = "Preparing report...";
                        }
                        else
                        {
                            var inProgress = progress.Total > completed ? 1 : 0;
                            var remaining = Math.Max(progress.Total - completed - inProgress, 0);
                            var etaText = "ETA: calculating...";
                            if (completed > 0)
                            {
                                var elapsedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - progress.StartedAt;
                                var msPerFile = (double)elapsedMs / completed;
                                var etaSeconds = Math.Max((long)(msPerFile * (progress.Total - completed) / 1000), 0);
                                etaText = $"ETA: {etaSeconds}s";
                            }
                            text = $"{completed} complete, {inProgress} in progress, {remaining} remaining ({percent}%)\n{etaText}";
                        }

                        Dispatcher.Invoke(() => ProcessingLabel.Text = text);
                    }
                }
                catch (OperationCanceledException) { break; }
                catch { }

                try { await Task.Delay(1000, token); }
                catch (OperationCanceledException) { break; }
            }
        }

        private void SetAnalysisButtonsEnabled(bool enabled)
        {
            AnalyzeChangesButton.IsEnabled = enabled;
            AnalyzeProjectButton.IsEnabled = enabled;
        }

        private void ShowLoading()
        {
            LoadingLabel.Visibility = Visibility.Visible;
            ErrorLabel.Visibility = Visibility.Collapsed;
            ProcessingPanel.Visibility = Visibility.Collapsed;
            FindingsGrid.Visibility = Visibility.Collapsed;
        }

        private void ShowFindings()
        {
            LoadingLabel.Visibility = Visibility.Collapsed;
            ErrorLabel.Visibility = Visibility.Collapsed;
            ProcessingPanel.Visibility = Visibility.Collapsed;
            FindingsGrid.Visibility = Visibility.Visible;
        }

        private void ShowProcessing()
        {
            LoadingLabel.Visibility = Visibility.Collapsed;
            ErrorLabel.Visibility = Visibility.Collapsed;
            ProcessingPanel.Visibility = Visibility.Visible;
            FindingsGrid.Visibility = Visibility.Collapsed;
            ProcessingLabel.Text = "Processing analysis...";
        }

        private void ShowError(string message)
        {
            LoadingLabel.Visibility = Visibility.Collapsed;
            ErrorLabel.Text = message;
            ErrorLabel.Visibility = Visibility.Visible;
            ProcessingPanel.Visibility = Visibility.Collapsed;
            FindingsGrid.Visibility = Visibility.Collapsed;
        }

        private void ShowDetailPanel(bool show)
        {
            _detailVisible = show;
            if (show)
            {
                DetailColumn.Width = new GridLength(350);
                DetailPanel.Visibility = Visibility.Visible;
                DetailSplitter.Visibility = Visibility.Visible;
            }
            else
            {
                DetailColumn.Width = new GridLength(0);
                DetailPanel.Visibility = Visibility.Collapsed;
                DetailSplitter.Visibility = Visibility.Collapsed;
            }
        }

        private void ShowFindingDetail(Finding finding)
        {
            if (finding == null) return;
            _currentFinding = finding;

            DetailTitle.Text = finding.Title;
            DetailSeverity.Text = $"Severity: {finding.SeverityRaw.ToUpperInvariant()}";
            DetailCategory.Text = $"Category: {finding.Category}";
            DetailFile.Text = $"File: {finding.File}";
            DetailLines.Text = $"Lines: {finding.StartLine}-{finding.EndLine}";
            DetailProvider.Text = $"Provider: {finding.Provider}";
            DetailMessage.Text = finding.Message;

            var noteText = "";
            if (!string.IsNullOrEmpty(_repoRoot))
            {
                try { noteText = NotesHelper.LoadNote(_repoRoot, finding); }
                catch { }
            }
            NotesTextBox.Text = noteText;

            if (!_detailVisible)
                ShowDetailPanel(true);
        }

        private void NavigateToFinding(Finding finding)
        {
            if (finding == null || string.IsNullOrEmpty(_repoRoot)) return;

            ThreadHelper.JoinableTaskFactory.Run(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                var dte = Package.GetGlobalService(typeof(SDTE)) as DTE2;
                if (dte == null) return;

                var absolutePath = Path.Combine(_repoRoot, finding.File);
                if (!File.Exists(absolutePath)) return;

                dte.ItemOperations.OpenFile(absolutePath);
                var textDoc = dte.ActiveDocument?.Object("TextDocument") as TextDocument;
                if (textDoc != null)
                {
                    var editPoint = textDoc.StartPoint.CreateEditPoint();
                    editPoint.MoveToLineAndOffset(finding.StartLine, 1);
                    var selection = dte.ActiveDocument.Selection as TextSelection;
                    selection?.MoveToPoint(editPoint);
                }
            });
        }

        // --- Event Handlers ---

        private void AnalyzeChangesButton_Click(object sender, RoutedEventArgs e)
        {
            RunAnalysis(AnalysisScope.Changes);
        }

        private void AnalyzeProjectButton_Click(object sender, RoutedEventArgs e)
        {
            RunAnalysis(AnalysisScope.Project);
        }

        private void StopAnalysisButton_Click(object sender, RoutedEventArgs e)
        {
            if (_client != null && !string.IsNullOrEmpty(_repoRoot))
            {
                Task.Run(() =>
                {
                    try { _client.CancelAnalysis(_repoRoot); }
                    catch { }
                });
            }
        }

        private void SettingsButton_Click(object sender, RoutedEventArgs e)
        {
            ThreadHelper.JoinableTaskFactory.Run(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                var dte = Package.GetGlobalService(typeof(SDTE)) as DTE2;
                dte?.ExecuteCommand("Tools.Options", "PeerReviewer");
            });
        }

        private void DetailToggleButton_Click(object sender, RoutedEventArgs e)
        {
            ShowDetailPanel(!_detailVisible);
        }

        private void LogoButton_Click(object sender, RoutedEventArgs e)
        {
            System.Diagnostics.Process.Start(new ProcessStartInfo
            {
                FileName = "https://www.matthewratcliffe.com.au",
                UseShellExecute = true
            });
        }

        private void SeverityFilter_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_allFindings != null)
                RebuildDisplayRows();
        }

        private void IssueFilter_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (_allFindings != null)
                RebuildDisplayRows();
        }

        private void GroupByCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            _collapsedGroups.Clear();
            if (_allFindings != null)
                RebuildDisplayRows();
        }

        private void FindingsDataGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            var row = FindingsDataGrid.SelectedItem as FindingDisplayRow;
            if (row == null) return;

            if (row.IsGroup)
            {
                if (_collapsedGroups.Contains(row.GroupKey))
                    _collapsedGroups.Remove(row.GroupKey);
                else
                    _collapsedGroups.Add(row.GroupKey);
                RebuildDisplayRows();
                return;
            }

            if (row.Finding != null)
                ShowFindingDetail(row.Finding);
        }

        private void FindingsDataGrid_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            var row = FindingsDataGrid.SelectedItem as FindingDisplayRow;
            if (row?.Finding != null)
                NavigateToFinding(row.Finding);
        }

        private void NotesTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            _notesSaveTimer.Stop();
            _notesSaveTimer.Start();
        }

        private void NotesSaveTimer_Tick(object sender, EventArgs e)
        {
            _notesSaveTimer.Stop();
            var finding = _currentFinding;
            var repo = _repoRoot;
            var text = NotesTextBox.Text;

            if (finding == null || string.IsNullOrEmpty(repo)) return;

            Task.Run(() =>
            {
                try { NotesHelper.SaveNote(repo, finding, text); }
                catch { }
            });
        }

        private async void DismissButton_Click(object sender, RoutedEventArgs e)
        {
            var finding = _currentFinding;
            if (finding == null || _client == null) return;

            try
            {
                await Task.Run(() => _client.DismissFinding(finding.Id));
                _allFindings.Remove(finding);
                UpdateFindings(_allFindings);
                ShowDetailPanel(false);
            }
            catch { }
        }
    }
}
