// Written by `lead-acid sync` from lead-acid.json: do not edit, run the sync again.
package org.gentropic.golem

import org.gentropic.leadacid.PluginFactory
import org.gentropic.leadacid.intent.IntentHandoff
import org.gentropic.leadacid.speech.Speech
import org.gentropic.leadacid.tts.Tts
import org.gentropic.leadacid.intake.Intake
import org.gentropic.leadacid.sensor.Sensor
import org.gentropic.leadacid.gnss.Gnss

/** The plugin factories, for the modules app/leadacid.gradle.kts depends on (`fs` and `shell` are always there). */
val leadAcidPlugins: List<PluginFactory> = listOf(IntentHandoff, Speech, Tts, Intake, Sensor, Gnss)
