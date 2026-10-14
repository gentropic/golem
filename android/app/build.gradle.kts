// golem: the app around dist/golem.html. Written once by `lead-acid init`; yours to edit (the version, signing).
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "org.gentropic.golem"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "org.gentropic.golem"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1"
    }

    // SPEC §6: the keystore never enters the repo. A root keystore.properties
    // (gitignored) signs release; without one, release builds are UNSIGNED.
    // See docs/signing.md.
    val ksProps = rootProject.file("keystore.properties")
    if (ksProps.exists()) {
        val p = Properties().apply { ksProps.inputStream().use { load(it) } }
        signingConfigs {
            create("release") {
                storeFile = rootProject.file(p.getProperty("storeFile"))
                storePassword = p.getProperty("storePassword")
                keyAlias = p.getProperty("keyAlias")
                keyPassword = p.getProperty("keyPassword")
                // v3 carries the proof-of-rotation lineage (docs/signing.md) —
                // AGP leaves it off by default; we want it from the first build.
                // (minSdk 29 ≥ 28, so AGP then signs v3 alone — v2 is redundant.)
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        // A debug build installs BESIDE the real instrument (different id), so
        // developing never clobbers — or is blocked by — the signed install.
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            if (ksProps.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }

    // the artifact, copied from the web build at every build (leadacid.gradle.kts)
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/leadacid-artifact"))

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// lead-acid's core, the plugins and the artifact (written by `lead-acid sync` from lead-acid.json)
apply(from = "leadacid.gradle.kts")
