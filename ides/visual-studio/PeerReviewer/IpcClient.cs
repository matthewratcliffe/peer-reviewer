using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Web;

namespace PeerReviewer
{
    public class IpcClient
    {
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        private string PipeName
        {
            get
            {
                var username = Environment.UserName;
                return $"peer-reviewer-{username}";
            }
        }

        private string ReadToken()
        {
            var tokenPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".peer-reviewer",
                "session.token");
            return File.ReadAllText(tokenPath).Trim();
        }

        private string SendRequest(string method, string path, string jsonBody = null)
        {
            using (var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.None))
            {
                pipe.Connect(5000);

                var token = ReadToken();
                var bodyBytes = jsonBody != null ? Encoding.UTF8.GetBytes(jsonBody) : null;

                var request = new StringBuilder();
                request.Append($"{method} {path} HTTP/1.1\r\n");
                request.Append("Host: localhost\r\n");
                request.Append($"x-peer-reviewer-token: {token}\r\n");
                if (bodyBytes != null)
                {
                    request.Append("Content-Type: application/json\r\n");
                    request.Append($"Content-Length: {bodyBytes.Length}\r\n");
                }
                request.Append("Connection: close\r\n");
                request.Append("\r\n");

                var headerBytes = Encoding.UTF8.GetBytes(request.ToString());
                pipe.Write(headerBytes, 0, headerBytes.Length);
                if (bodyBytes != null)
                {
                    pipe.Write(bodyBytes, 0, bodyBytes.Length);
                }
                pipe.Flush();

                var responseBytes = ReadAllBytes(pipe);
                var response = Encoding.UTF8.GetString(responseBytes);

                var headerEnd = response.IndexOf("\r\n\r\n", StringComparison.Ordinal);
                if (headerEnd < 0)
                    throw new InvalidOperationException("Invalid HTTP response from service");

                var headerSection = response.Substring(0, headerEnd);
                var body = response.Substring(headerEnd + 4);

                var statusLine = headerSection.Split(new[] { "\r\n" }, StringSplitOptions.None)[0];
                var statusParts = statusLine.Split(' ');
                var statusCode = statusParts.Length > 1 ? int.Parse(statusParts[1]) : 0;

                if (statusCode >= 400)
                    throw new InvalidOperationException($"peer-reviewer-service responded {statusCode}: {body}");

                return body;
            }
        }

        private byte[] ReadAllBytes(Stream stream)
        {
            using (var ms = new MemoryStream())
            {
                var buffer = new byte[4096];
                int read;
                while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    ms.Write(buffer, 0, read);
                }
                return ms.ToArray();
            }
        }

        public string RegisterRepo(string repoPath)
        {
            var payload = JsonSerializer.Serialize(new { path = repoPath }, JsonOptions);
            var body = SendRequest("POST", "/repos", payload);
            var result = JsonSerializer.Deserialize<RepoResponse>(body, JsonOptions);
            return result?.RepoRoot ?? "";
        }

        public FindingsResponse GetAllFindings(string repoRoot)
        {
            var encoded = HttpUtility.UrlEncode(repoRoot);
            var body = SendRequest("GET", $"/findings?repo={encoded}");
            return JsonSerializer.Deserialize<FindingsResponse>(body, JsonOptions) ?? new FindingsResponse();
        }

        public void AnalyzeChanges(string repoRoot)
        {
            var encoded = HttpUtility.UrlEncode(repoRoot);
            var payload = JsonSerializer.Serialize(new { scope = "changes" }, JsonOptions);
            SendRequest("POST", $"/analyze?repo={encoded}", payload);
        }

        public void AnalyzeProject(string repoRoot)
        {
            var encoded = HttpUtility.UrlEncode(repoRoot);
            var payload = JsonSerializer.Serialize(new { scope = "project" }, JsonOptions);
            SendRequest("POST", $"/analyze?repo={encoded}", payload);
        }

        public AnalysisProgress GetAnalysisProgress(string repoRoot)
        {
            var encoded = HttpUtility.UrlEncode(repoRoot);
            var body = SendRequest("GET", $"/analyze/progress?repo={encoded}");
            return JsonSerializer.Deserialize<AnalysisProgress>(body, JsonOptions) ?? new AnalysisProgress();
        }

        public void CancelAnalysis(string repoRoot)
        {
            var encoded = HttpUtility.UrlEncode(repoRoot);
            SendRequest("POST", $"/analyze/cancel?repo={encoded}");
        }

        public PeerReviewerConfig GetConfig()
        {
            var body = SendRequest("GET", "/config");
            return JsonSerializer.Deserialize<PeerReviewerConfig>(body, JsonOptions) ?? new PeerReviewerConfig();
        }

        public PeerReviewerConfig UpdateConfig(PeerReviewerConfig config)
        {
            var payload = JsonSerializer.Serialize(config, JsonOptions);
            var body = SendRequest("PUT", "/config", payload);
            return JsonSerializer.Deserialize<PeerReviewerConfig>(body, JsonOptions) ?? new PeerReviewerConfig();
        }

        public void TestProvider(PeerReviewerConfig config)
        {
            var payload = JsonSerializer.Serialize(config, JsonOptions);
            SendRequest("POST", "/providers/test", payload);
        }

        public void DismissFinding(string findingId)
        {
            SendRequest("POST", $"/findings/{findingId}/dismiss");
        }
    }
}
