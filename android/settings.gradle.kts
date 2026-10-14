// Written once by `lead-acid init`; yours to edit.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "golem"
include(":app")
apply(from = "leadacid.settings.gradle.kts")   // lead-acid's core and plugins (written by `lead-acid sync`)
