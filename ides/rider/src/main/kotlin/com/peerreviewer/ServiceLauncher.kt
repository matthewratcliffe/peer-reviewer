package com.peerreviewer

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import java.io.RandomAccessFile
import java.nio.channels.FileChannel
import java.nio.channels.FileLock
import java.nio.file.Files
import java.nio.file.Paths

private val LOG = Logger.getInstance(ServiceLauncher::class.java)
private const val CONNECT_RETRY_MS = 300L
private const val CONNECT_TIMEOUT_MS = 15000L

object ServiceLauncher {
    private val homeDir = Paths.get(System.getProperty("user.home"), ".peer-reviewer")
    private val lockFile = homeDir.resolve("launch.lock").toFile()

    /** Ensures the shared service is running, then registers [repoPath] and returns its resolved git root. */
    fun ensureRunningAndRegister(client: IpcClient, repoPath: String): String {
        tryRegister(client, repoPath)?.let { return it }

        Files.createDirectories(homeDir)
        RandomAccessFile(lockFile, "rw").use { raf ->
            val channel: FileChannel = raf.channel
            val lock: FileLock? = try {
                channel.tryLock()
            } catch (e: Exception) {
                null
            }

            if (lock != null) {
                try {
                    tryRegister(client, repoPath)?.let { return it }
                    spawnService()
                } finally {
                    lock.release()
                }
            }
            return waitUntilRegistered(client, repoPath)
        }
    }

    private fun tryRegister(client: IpcClient, repoPath: String): String? {
        return try {
            client.registerRepo(repoPath)
        } catch (e: Exception) {
            null
        }
    }

    private fun waitUntilRegistered(client: IpcClient, repoPath: String): String {
        val deadline = System.currentTimeMillis() + CONNECT_TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            tryRegister(client, repoPath)?.let { return it }
            Thread.sleep(CONNECT_RETRY_MS)
        }
        throw IllegalStateException("peer-reviewer-service did not become reachable within ${CONNECT_TIMEOUT_MS}ms")
    }

    private fun spawnService() {
        val plugin = PluginManagerCore.getPlugin(PluginId.getId("com.peerreviewer.rider"))
            ?: throw IllegalStateException("peer-reviewer plugin descriptor not found")
        val binaryName = if (System.getProperty("os.name").lowercase().contains("win")) {
            "peer-reviewer-service.exe"
        } else {
            "peer-reviewer-service"
        }
        val binaryPath = plugin.pluginPath.resolve("bin").resolve(binaryName)
        if (!Files.exists(binaryPath)) {
            throw IllegalStateException("bundled service binary not found at $binaryPath")
        }

        val logFile = homeDir.resolve("service.log").toFile()
        ProcessBuilder(binaryPath.toString())
            .redirectOutput(logFile)
            .redirectError(logFile)
            .start()
        LOG.info("launched peer-reviewer-service from $binaryPath")
    }
}
