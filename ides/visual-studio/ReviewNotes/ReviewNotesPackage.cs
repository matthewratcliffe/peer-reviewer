using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Task = System.Threading.Tasks.Task;

namespace ReviewNotes
{
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [Guid(PackageGuidString)]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    [ProvideToolWindow(typeof(ReviewNotesToolWindow), Style = VsDockStyle.Tabbed,
        Window = "3ae79031-e1bc-11d0-8f78-00a0c9110057")]
    [ProvideOptionPage(typeof(ReviewNotesOptionsPage), "ReviewNotes", "General", 0, 0, true)]
    [ProvideAutoLoad(UIContextGuids80.SolutionExists, PackageAutoLoadFlags.BackgroundLoad)]
    public sealed class ReviewNotesPackage : AsyncPackage
    {
        public const string PackageGuidString = "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f90";
        public const string ToolWindowCommandSetGuid = "e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9012";
        public const int ToolWindowCommandId = 0x0100;

        protected override async Task InitializeAsync(CancellationToken cancellationToken,
            IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);

            var commandService = await GetServiceAsync(typeof(Microsoft.VisualStudio.Shell.Interop.SVsUIShell))
                as IVsUIShell;

            // Register the tool window command
            var menuCommandService = await GetServiceAsync(typeof(System.ComponentModel.Design.IMenuCommandService))
                as System.ComponentModel.Design.IMenuCommandService;

            if (menuCommandService != null)
            {
                var commandId = new System.ComponentModel.Design.CommandID(
                    new Guid(ToolWindowCommandSetGuid), ToolWindowCommandId);
                var menuItem = new System.ComponentModel.Design.MenuCommand(ShowToolWindow, commandId);
                menuCommandService.AddCommand(menuItem);
            }

            // Auto-show the tool window when the package loads
            ShowToolWindow(this, EventArgs.Empty);
        }

        private void ShowToolWindow(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            var window = FindToolWindow(typeof(ReviewNotesToolWindow), 0, true);
            if (window?.Frame == null)
                throw new NotSupportedException("Cannot create Review Notes tool window");

            var windowFrame = (IVsWindowFrame)window.Frame;
            Microsoft.VisualStudio.ErrorHandler.ThrowOnFailure(windowFrame.Show());
        }

        public override IVsAsyncToolWindowFactory GetAsyncToolWindowFactory(Guid toolWindowType)
        {
            if (toolWindowType == typeof(ReviewNotesToolWindow).GUID)
                return this;
            return base.GetAsyncToolWindowFactory(toolWindowType);
        }

        protected override string GetToolWindowTitle(Type toolWindowType, int id)
        {
            if (toolWindowType == typeof(ReviewNotesToolWindow))
                return "Review Notes";
            return base.GetToolWindowTitle(toolWindowType, id);
        }
    }
}
