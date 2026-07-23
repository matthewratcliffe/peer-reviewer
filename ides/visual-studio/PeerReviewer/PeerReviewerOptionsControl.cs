using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PeerReviewer
{
    internal class PeerReviewerOptionsControl : UserControl
    {
        private readonly PeerReviewerOptionsPage _page;
        private readonly PropertyGrid _grid;
        private readonly Button _testConnectionButton;
        private readonly Label _testConnectionStatusLabel;

        public PeerReviewerOptionsControl(PeerReviewerOptionsPage page)
        {
            _page = page;

            Dock = DockStyle.Fill;

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                FlowDirection = FlowDirection.LeftToRight,
                Padding = new Padding(0, 0, 0, 6),
            };

            _testConnectionButton = new Button
            {
                Text = "Test Connection",
                AutoSize = true,
            };
            _testConnectionButton.Click += OnTestConnectionClick;

            _testConnectionStatusLabel = new Label
            {
                AutoSize = true,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(8, 6, 0, 0),
            };

            toolbar.Controls.Add(_testConnectionButton);
            toolbar.Controls.Add(_testConnectionStatusLabel);

            _grid = new PropertyGrid
            {
                Dock = DockStyle.Fill,
                ToolbarVisible = false,
                HelpVisible = true,
                SelectedObject = _page,
            };

            Controls.Add(_grid);
            Controls.Add(toolbar);
        }

        public void RefreshGrid()
        {
            _grid.Refresh();
        }

        private async void OnTestConnectionClick(object sender, EventArgs e)
        {
            var config = _page.BuildConfig();

            _testConnectionButton.Enabled = false;
            _testConnectionStatusLabel.ForeColor = SystemColors.GrayText;
            _testConnectionStatusLabel.Text = "Testing...";

            Exception failure = null;
            try
            {
                await Task.Run(() => new IpcClient().TestProvider(config));
            }
            catch (Exception ex)
            {
                failure = ex;
            }

            _testConnectionButton.Enabled = true;
            if (failure == null)
            {
                _testConnectionStatusLabel.ForeColor = Color.Green;
                _testConnectionStatusLabel.Text = "Connected";
            }
            else
            {
                _testConnectionStatusLabel.ForeColor = Color.Red;
                _testConnectionStatusLabel.Text = $"Failed: {failure.Message}";
            }
        }
    }
}
