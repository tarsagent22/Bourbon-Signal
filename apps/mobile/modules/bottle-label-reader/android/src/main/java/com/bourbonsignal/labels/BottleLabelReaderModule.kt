package com.bourbonsignal.labels

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal fun readShelfPhoto(context: Context, uri: Uri): Task<String> {
  require(uri.scheme == "file")
  val image = InputImage.fromFilePath(context, uri)
  val reader = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  return reader.process(image).continueWith { task ->
    try { task.result.text.take(12000) } finally { reader.close() }
  }
}

class BottleLabelReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BottleLabelReader")
    Constants("liveFramesVersion" to 1)
    AsyncFunction("readPhoto") { uri: String, promise: Promise ->
      readShelfPhoto(requireNotNull(appContext.reactContext), Uri.parse(uri))
        .addOnSuccessListener { text -> promise.resolve(text) }
        .addOnFailureListener { error -> promise.reject("LABEL_PHOTO_FAILED", "Could not read photo", error) }
    }
    View(BottleLabelCameraView::class) {
      Events("onFrame", "onStatus")
      Prop("active") { view: BottleLabelCameraView, active: Boolean -> view.setActive(active) }
      Prop("scanning") { view: BottleLabelCameraView, scanning: Boolean -> view.setScanning(scanning) }
      Prop("scanToken") { view: BottleLabelCameraView, token: Int -> view.setScanToken(token) }
      Prop("torch") { view: BottleLabelCameraView, enabled: Boolean -> view.setTorch(enabled) }
    }
  }
}
