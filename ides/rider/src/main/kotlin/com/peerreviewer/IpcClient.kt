package com.peerreviewer

import com.google.gson.Gson
import org.newsclub.net.unix.AFUNIXSocket
import org.newsclub.net.unix.AFUNIXSocketAddress
import java.io.BufferedReader
import java.io.Closeable
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.io.RandomAccessFile
import java.nio.channels.Channels
import java.nio.charset.StandardCharsets
import java.nio.file.Paths

data class Finding(
    val id: String,
    val file: String,
    val startLine: Int,
    val endLine: Int,
    val severity: String,
    val category: String,
    val title: String,
    val message: String,
    val provider: String,
    val dismissed: Boolean
)

private data class FindingsResponse(val findings: List<Finding>)
private data class RepoResponse(val repoRoot: String)

data class CodexProviderConfig(val command: String, val args: List<String>)
data class LlamaCppProviderConfig(val baseUrl: String)
data class ClaudeProviderConfig(val command: String, val args: List<String>)
data class OpenCodeProviderConfig(val command: String, val args: List<String>)
data class KiroProviderConfig(val command: String, val args: List<String>)
data class ProvidersConfig(
    val codex: CodexProviderConfig,
    val llamaCpp: LlamaCppProviderConfig,
    val claude: ClaudeProviderConfig,
    val opencode: OpenCodeProviderConfig?,
    val kiro: KiroProviderConfig?
)
data class SystemPromptConfig(val mode: String, val text: String)
data class PreCommitConfig(val blockOnFindings: Boolean)
data class AutoAnalyseConfig(val trigger: String = "disabled", val intervalMinutes: Int = 5)
data class PeerReviewerConfig(
    val activeProvider: String,
    val providers: ProvidersConfig,
    val systemPrompt: SystemPromptConfig,
    val preCommit: PreCommitConfig,
    val autoAnalyse: AutoAnalyseConfig?,
    val maxFilesPerRun: Int?,
    val debugLogging: Boolean?
)
data class AnalysisProgress(val total: Int, val completed: Int, val startedAt: Long)

private interface IpcConnection : Closeable {
    val inputStream: InputStream
    val outputStream: OutputStream
}

/**
 * The service listens on a real Windows named pipe (`\\.\pipe\...`), not an AF_UNIX socket,
 * so junixsocket (AF_UNIX only) can't reach it there. Named pipes are addressable as regular
 * files via CreateFile, so a RandomAccessFile over the pipe path works as a byte-mode client.
 */
private class WindowsPipeConnection(path: String) : IpcConnection {
    private val raf = RandomAccessFile(path, "rw")
    override val inputStream: InputStream = Channels.newInputStream(raf.channel)
    override val outputStream: OutputStream = Channels.newOutputStream(raf.channel)
    override fun close() = raf.close()
}

private class UnixSocketConnection(private val socket: AFUNIXSocket) : IpcConnection {
    override val inputStream: InputStream = socket.inputStream
    override val outputStream: OutputStream = socket.outputStream
    override fun close() = socket.close()
}

class IpcClient {
    private val gson = Gson()

    private fun connect(): IpcConnection {
        val os = System.getProperty("os.name").lowercase()
        return if (os.contains("win")) {
            WindowsPipeConnection("\\\\.\\pipe\\peer-reviewer-${System.getProperty("user.name")}")
        } else {
            val home = System.getProperty("user.home")
            val address = AFUNIXSocketAddress.of(Paths.get(home, ".peer-reviewer", "service.sock").toFile())
            UnixSocketConnection(AFUNIXSocket.connectTo(address))
        }
    }

    private fun readToken(): String {
        val home = System.getProperty("user.home")
        return Paths.get(home, ".peer-reviewer", "session.token").toFile().readText().trim()
    }

    private fun request(method: String, path: String, jsonBody: String? = null): String {
        connect().use { socket ->
            val out: OutputStream = socket.outputStream
            val token = readToken()
            val bodyBytes = jsonBody?.toByteArray(StandardCharsets.UTF_8)
            val requestText = buildString {
                append("$method $path HTTP/1.1\r\n")
                append("Host: localhost\r\n")
                append("x-peer-reviewer-token: $token\r\n")
                if (bodyBytes != null) {
                    append("Content-Type: application/json\r\n")
                    append("Content-Length: ${bodyBytes.size}\r\n")
                }
                append("Connection: close\r\n")
                append("\r\n")
            }
            out.write(requestText.toByteArray(StandardCharsets.UTF_8))
            if (bodyBytes != null) out.write(bodyBytes)
            out.flush()

            val reader = BufferedReader(InputStreamReader(socket.inputStream, StandardCharsets.UTF_8))
            var line: String?
            var contentLength = 0
            var statusLine = ""
            var first = true
            while (true) {
                line = reader.readLine() ?: break
                if (first) {
                    statusLine = line
                    first = false
                    continue
                }
                if (line.isEmpty()) break
                val (name, value) = line.split(":", limit = 2).let { it[0].trim() to it.getOrElse(1) { "" }.trim() }
                if (name.equals("Content-Length", ignoreCase = true)) {
                    contentLength = value.toIntOrNull() ?: 0
                }
            }

            val bodyChars = CharArray(contentLength)
            var read = 0
            while (read < contentLength) {
                val n = reader.read(bodyChars, read, contentLength - read)
                if (n == -1) break
                read += n
            }
            val body = String(bodyChars, 0, read)

            val statusCode = statusLine.split(" ").getOrNull(1)?.toIntOrNull() ?: 0
            if (statusCode >= 400) {
                throw RuntimeException("peer-reviewer-service responded $statusCode: $body")
            }
            return body
        }
    }

    fun registerRepo(path: String): String {
        val payload = gson.toJson(mapOf("path" to path))
        val body = request("POST", "/repos", payload)
        return gson.fromJson(body, RepoResponse::class.java).repoRoot
    }

    fun getAllFindings(repo: String): List<Finding> {
        val body = request("GET", "/findings?repo=${java.net.URLEncoder.encode(repo, "UTF-8")}")
        return gson.fromJson(body, FindingsResponse::class.java).findings
    }

    fun dismiss(id: String) {
        request("POST", "/findings/$id/dismiss")
    }

    fun analyzeChanges(repo: String) {
        request("POST", "/analyze?repo=${java.net.URLEncoder.encode(repo, "UTF-8")}", gson.toJson(mapOf("scope" to "changes")))
    }

    fun analyzeProject(repo: String) {
        request("POST", "/analyze?repo=${java.net.URLEncoder.encode(repo, "UTF-8")}", gson.toJson(mapOf("scope" to "project")))
    }

    fun getAnalysisProgress(repo: String): AnalysisProgress {
        val body = request("GET", "/analyze/progress?repo=${java.net.URLEncoder.encode(repo, "UTF-8")}")
        return gson.fromJson(body, AnalysisProgress::class.java)
    }

    fun cancelAnalysis(repo: String) {
        request("POST", "/analyze/cancel?repo=${java.net.URLEncoder.encode(repo, "UTF-8")}")
    }

    fun getConfig(): PeerReviewerConfig {
        val body = request("GET", "/config")
        return gson.fromJson(body, PeerReviewerConfig::class.java)
    }

    fun updateConfig(config: PeerReviewerConfig): PeerReviewerConfig {
        val body = request("PUT", "/config", gson.toJson(config))
        return gson.fromJson(body, PeerReviewerConfig::class.java)
    }

    /** Tests the active provider in [config] against the live service without persisting it. Throws with details on failure. */
    fun testProvider(config: PeerReviewerConfig) {
        request("POST", "/providers/test", gson.toJson(config))
    }
}
