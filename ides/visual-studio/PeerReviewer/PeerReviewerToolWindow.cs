using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using Microsoft.VisualStudio.Shell;

namespace PeerReviewer
{
    [Guid("c3d4e5f6-a7b8-c9d0-1e2f-3a4b5c6d7e8f")]
    public class PeerReviewerToolWindow : ToolWindowPane
    {
        public PeerReviewerToolWindow() : base(null)
        {
            Caption = "Virtual Peer Review";
            try
            {
                Content = new PeerReviewerControl();
            }
            catch (Exception ex)
            {
                ActivityLog.LogError(nameof(PeerReviewerToolWindow), ex.ToString());
                Content = new TextBlock
                {
                    Text = $"Virtual Peer Review failed to initialize:\n{ex.Message}",
                    Margin = new Thickness(12),
                    TextWrapping = TextWrapping.Wrap
                };
            }
        }
    }
}
