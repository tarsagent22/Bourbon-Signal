package com.bourbonsignal.labels

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BottleLabelReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BottleLabelReader")
    Constants("liveFramesVersion" to 1)
    AsyncFunction("readPhoto") { uri: String, promise: Promise ->
      val file = Uri.parse(uri)
      require(file.scheme == "file")
      val context = requireNotNull(appContext.reactContext)
      val image = InputImage.fromFilePath(context, file)
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { result -> promise.resolve(result.text.take(12000)) }
        .addOnFailureListener { error -> promise.reject("LABEL_PHOTO_FAILED", "Could not read photo", error) }
        .addOnCompleteListener { recognizer.close() }
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
