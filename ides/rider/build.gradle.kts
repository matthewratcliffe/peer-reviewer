plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.4.10"
    id("org.jetbrains.intellij.platform") version "2.18.1"
}

group = "com.reviewnotes"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        rider("2024.2") { useInstaller = false }
    }
    implementation("com.kohlschutter.junixsocket:junixsocket-core:2.10.1")
    implementation("com.google.code.gson:gson:2.11.0")
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "242"
        }
    }
    buildSearchableOptions = false
    signing {
        privateKey = providers.environmentVariable("JETBRAINS_SIGNING_KEY")
        certificateChain = providers.environmentVariable("JETBRAINS_CERTIFICATE_CHAIN")
    }
    publishing {
        token = providers.gradleProperty("intellijPublishToken")
    }
}

kotlin {
    jvmToolchain(17)
}

// The service binary is built separately via `npm run package --workspace packages/service`,
// which drops it in dist-bin/. Bundle it into the plugin distribution under bin/ so
// ServiceLauncher can find and spawn it without requiring Node on the end user's machine.
//
// Target directory must come from PrepareSandboxTask.pluginDirectory, not a hand-built path:
// the IntelliJ Platform Gradle Plugin nests the sandbox under a platform+version-specific
// subdirectory (e.g. idea-sandbox/RD-2024.2/plugins/<name>) that isn't stable across plugin
// versions or IDE targets, and a hardcoded path here silently produces an empty bin/ (the
// plugin fails at runtime with "the system cannot find the file specified" on the pipe/socket
// connect, because the service binary never actually shipped).
// pluginDirectory isn't queryable until prepareSandbox has actually run (it's not a fixed
// configuration-time convention), so this must run AFTER prepareSandbox, not before — anything
// that needs the sandbox populated (runIde, tests) must depend on bundleServiceBinary directly,
// since depending on prepareSandbox alone would skip this step.
val prepareSandboxTask = tasks.named<org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask>("prepareSandbox")

tasks.register<Copy>("bundleServiceBinary") {
    dependsOn(prepareSandboxTask)
    from(project.rootDir.resolve("../../dist-bin"))
    into(prepareSandboxTask.map { it.pluginDirectory.get().dir("bin") })
}

tasks.named("runIde") {
    dependsOn("bundleServiceBinary")
}
