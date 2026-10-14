// Written by `lead-acid sync` from lead-acid.json: do not edit, run the sync again.
// lead-acid's modules, built from source where `leadacid.dir` (gradle.properties) points: the npm package or a clone.
val leadacidDir = settingsDir.resolve(providers.gradleProperty("leadacid.dir").get()).canonicalFile
if (!leadacidDir.resolve("core/build.gradle.kts").exists())
    throw GradleException("lead-acid not found at $leadacidDir: run npm install, or set leadacid.dir in gradle.properties")

dependencyResolutionManagement {
    // lead-acid's versions (AGP, Kotlin, AndroidX, the SDK levels) are this app's: they move together
    versionCatalogs { create("libs") { from(files(leadacidDir.resolve("gradle/libs.versions.toml"))) } }
}

for (m in listOf("core", "plugin-intent", "plugin-speech", "plugin-tts", "plugin-intake")) {
    include(":$m")
    project(":$m").projectDir = leadacidDir.resolve(m)
}
