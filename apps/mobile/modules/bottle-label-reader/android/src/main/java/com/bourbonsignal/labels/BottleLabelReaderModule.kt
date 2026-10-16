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
    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || Uri.parse(uri).scheme != "file") {
        promise.reject("INVALID_FRAME", "A local camera frame is required.", null)
      } else {
        try {
          val image = InputImage.fromFilePath(context, Uri.parse(uri))
          val reader = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
          reader.process(image)
            .addOnSuccessListener { result -> promise.resolve(mapOf("text" to result.text)) }
            .addOnFailureListener { error -> promise.reject("LABEL_READ_FAILED", "The label could not be read.", error) }
            .addOnCompleteListener { reader.close() }
        } catch (error: Exception) {
          promise.reject("LABEL_READ_FAILED", "The camera frame could not be read.", error)
        }
      }
    }
  }
}
