using System.IO;

namespace PeerReviewer
{
    public static class NotesHelper
    {
        private static string NotesDir(string repoRoot)
        {
            return Path.Combine(repoRoot, ".peer-review", "notes");
        }

        private static string NoteFileName(Finding finding)
        {
            var safeFile = finding.File
                .Replace("/", "_")
                .Replace("\\", "_");
            return $"{safeFile}_L{finding.StartLine}_{finding.Category}.md";
        }

        private static string NoteFilePath(string repoRoot, Finding finding)
        {
            return Path.Combine(NotesDir(repoRoot), NoteFileName(finding));
        }

        public static string LoadNote(string repoRoot, Finding finding)
        {
            var path = NoteFilePath(repoRoot, finding);
            if (File.Exists(path))
                return File.ReadAllText(path);
            return "";
        }

        public static void SaveNote(string repoRoot, Finding finding, string text)
        {
            var dir = NotesDir(repoRoot);
            var path = NoteFilePath(repoRoot, finding);

            if (string.IsNullOrWhiteSpace(text))
            {
                if (File.Exists(path))
                    File.Delete(path);
                return;
            }

            Directory.CreateDirectory(dir);
            File.WriteAllText(path, text);
        }
    }
}
