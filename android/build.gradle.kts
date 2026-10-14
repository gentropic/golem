// Written once by `lead-acid init`; yours to edit.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
}

// lead-acid's modules live outside this folder (node_modules, or a clone): they build here, not there.
subprojects {
    if (!projectDir.toPath().normalize().startsWith(rootDir.toPath().normalize()))
        layout.buildDirectory.set(rootProject.layout.buildDirectory.dir("leadacid/$name"))
}
