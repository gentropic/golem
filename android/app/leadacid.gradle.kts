// Written by `lead-acid sync` from lead-acid.json: do not edit, run the sync again.
// The plugins: each module brings its own permissions into the merged manifest; LeadAcidPlugins.kt lists the same.
dependencies {
    "implementation"(project(":core"))
    "implementation"(project(":plugin-intent"))
    "implementation"(project(":plugin-speech"))
    "implementation"(project(":plugin-tts"))
}

// The artifact, copied from the web build at every build (never committed under src/): dist/golem.html
val leadacidArtifact = rootProject.file("../dist/golem.html")
val leadacidCopy = tasks.register("leadacidArtifact") {
    val out = layout.buildDirectory.dir("generated/leadacid-artifact")
    inputs.files(leadacidArtifact)
    outputs.dir(out)
    doLast {
        if (!leadacidArtifact.exists()) throw GradleException("the artifact is not built: $leadacidArtifact (dist/golem.html in lead-acid.json)")
        val dir = out.get().asFile
        dir.mkdirs()
        leadacidArtifact.copyTo(dir.resolve("artifact.html"), overwrite = true)
    }
}
tasks.matching { it.name.startsWith("generate") || it.name.startsWith("merge") }.configureEach { dependsOn(leadacidCopy) }
