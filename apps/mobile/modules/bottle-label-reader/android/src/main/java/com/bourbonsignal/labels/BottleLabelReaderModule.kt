package com.bourbonsignal.labels

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BottleLabelReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BottleLabelReader")
    Constants("liveFramesVersion" to 1)
    View(BottleLabelCameraView::class) {
      Events("onFrame", "onStatus")
      Prop("active") { view: BottleLabelCameraView, active: Boolean -> view.setActive(active) }
      Prop("scanning") { view: BottleLabelCameraView, scanning: Boolean -> view.setScanning(scanning) }
      Prop("scanToken") { view: BottleLabelCameraView, token: Int -> view.setScanToken(token) }
      Prop("torch") { view: BottleLabelCameraView, enabled: Boolean -> view.setTorch(enabled) }
    }
  }
}
