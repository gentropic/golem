package org.gentropic.golem

import org.gentropic.leadacid.LeadAcidActivity
import org.gentropic.leadacid.PluginFactory

/**
 * The app is a LeadAcidActivity and its list of plugins. The list is generated (LeadAcidPlugins.kt, from
 * lead-acid.json) beside the Gradle dependencies that carry each plugin's permissions, so the two agree.
 */
class InstrumentActivity : LeadAcidActivity() {
    override val plugins: List<PluginFactory> = leadAcidPlugins
}
