using System;
using System.Runtime.InteropServices;
using Microsoft.VisualStudio.Shell;

namespace PeerReviewer
{
    [Guid("c3d4e5f6-a7b8-c9d0-1e2f-3a4b5c6d7e8f")]
    public class PeerReviewerToolWindow : ToolWindowPane
    {
        public PeerReviewerToolWindow() : base(null)
        {
            Caption = "Peer Reviewer";
            Content = new PeerReviewerControl();
        }
    }
}
