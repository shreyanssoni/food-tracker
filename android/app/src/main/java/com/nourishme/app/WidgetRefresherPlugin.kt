package com.nourishme.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginMethod
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetRefresher")
class WidgetRefresherPlugin : Plugin() {
    override fun load() {
        // No-op
    }

    @PluginMethod
    fun refresh(call: PluginCall) {
        try {
            TaskWidgetProvider.requestRefresh(context)
            val ret = JSObject()
            ret.put("ok", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("failed", e)
        }
    }
}
