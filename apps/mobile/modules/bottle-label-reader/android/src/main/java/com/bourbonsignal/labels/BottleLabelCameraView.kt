package com.bourbonsignal.labels

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.os.SystemClock
import android.os.Bundle
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/// Native preview and in-memory analysis share one CameraX session.
@SuppressLint("ViewConstructor")
class BottleLabelCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext), LifecycleOwner {
  override val shouldUseAndroidLayout = true
  private var registry = LifecycleRegistry(this)
  override fun getLifecycle(): Lifecycle = registry
  private val onFrame by EventDispatcher()
  private val onStatus by EventDispatcher()
  private val preview = PreviewView(context).also {
    it.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    it.scaleType = PreviewView.ScaleType.FILL_CENTER
    addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }
  private var controller: LifecycleCameraController? = null
  private var reader: TextRecognizer? = null
  private var executor = Executors.newSingleThreadExecutor()
  // ML Kit's default success listener runs on the main thread. Keep result
  // preparation with analysis; only dispatch the finished event onto the UI.
  private val resultExecutor = Executor { task ->
    try { executor.execute(task) } catch (_: RejectedExecutionException) { /* detached */ }
  }
  private val busy = AtomicBoolean(false)
  private val epoch = AtomicInteger(0)
  @Volatile private var analyzing = false
  @Volatile private var scanning = true
  @Volatile private var scanToken = 0
  private var active = false
  private var foreground = true
  private var torch = false
  @Volatile private var nextRead = 0L
  private var sequence = 0
  private var hostActivity: Activity? = null
  private val application = context.applicationContext as Application
  private val activityLifecycle = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityResumed(activity: Activity) { if (activity === hostActivity) { foreground = true; updateCapture() } }
    override fun onActivityPaused(activity: Activity) { if (activity === hostActivity) { foreground = false; updateCapture() } }
    override fun onActivityDestroyed(activity: Activity) { if (activity === hostActivity) { foreground = false; release() } }
    override fun onActivityCreated(activity: Activity, state: Bundle?) { }
    override fun onActivityStarted(activity: Activity) { }
    override fun onActivityStopped(activity: Activity) { }
    override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) { }
  }

  fun setActive(value: Boolean) { if (active == value) return; active = value; updateCapture() }
  fun setScanning(value: Boolean) { if (scanning == value) return; scanning = value; epoch.incrementAndGet(); if (value) nextRead = 0L }
  fun setScanToken(value: Int) { if (scanToken == value) return; scanToken = value; epoch.incrementAndGet(); nextRead = 0L }
  fun setTorch(value: Boolean) { if (torch == value) return; torch = value; controller?.enableTorch(value && analyzing) }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (registry.currentState == Lifecycle.State.DESTROYED) registry = LifecycleRegistry(this)
    registry.currentState = Lifecycle.State.CREATED
    hostActivity = appContext.currentActivity
    val hostState = (hostActivity as? LifecycleOwner)?.lifecycle?.currentState
    foreground = hostActivity != null && (hostState == null || hostState.isAtLeast(Lifecycle.State.RESUMED))
    application.registerActivityLifecycleCallbacks(activityLifecycle)
    if (executor.isShutdown) executor = Executors.newSingleThreadExecutor()
    reader = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    updateCapture()
  }
  override fun onDetachedFromWindow() {
    application.unregisterActivityLifecycleCallbacks(activityLifecycle)
    release()
    super.onDetachedFromWindow()
  }
  private fun release() {
    analyzing = false; epoch.incrementAndGet()
    controller?.clearImageAnalysisAnalyzer()
    controller?.enableTorch(false)
    controller?.unbind(); controller = null; preview.controller = null
    registry.currentState = Lifecycle.State.DESTROYED
    reader?.close(); reader = null
    executor.shutdown()
  }
  @SuppressLint("MissingPermission")
  private fun updateCapture() {
    val shouldRun = active && foreground && isAttachedToWindow
    if (analyzing == shouldRun && (!shouldRun || controller != null)) return
    epoch.incrementAndGet(); analyzing = shouldRun
    if (!shouldRun) {
      controller?.enableTorch(false)
      if (registry.currentState != Lifecycle.State.DESTROYED && registry.currentState.isAtLeast(Lifecycle.State.STARTED)) registry.currentState = Lifecycle.State.CREATED
      return
    }
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      analyzing = false; onStatus(mapOf("state" to "error", "code" to "CAMERA_PERMISSION_REQUIRED", "scanToken" to scanToken)); return
    }
    try {
      if (controller == null) {
        controller = LifecycleCameraController(context).also { camera ->
          camera.cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
          camera.setEnabledUseCases(CameraController.IMAGE_ANALYSIS)
          camera.imageAnalysisBackpressureStrategy = ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST
          camera.imageAnalysisResolutionSelector = ResolutionSelector.Builder().setResolutionStrategy(
            ResolutionStrategy(Size(1280, 960), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)
          ).build()
          camera.setImageAnalysisAnalyzer(executor) { image -> analyze(image) }
          preview.controller = camera
          camera.bindToLifecycle(this)
          camera.initializationFuture.addListener({
            try {
              camera.initializationFuture.get()
              camera.cameraInfo?.cameraState?.observe(this@BottleLabelCameraView) { state ->
                if (state.error != null && analyzing && controller === camera) {
                  onStatus(mapOf("state" to "error", "code" to "CAMERA_SESSION_FAILED", "scanToken" to scanToken))
                }
              }
            } catch (_: Exception) {
              if (analyzing && controller === camera) onStatus(mapOf("state" to "error", "code" to "CAMERA_UNAVAILABLE", "scanToken" to scanToken))
            }
          }, ContextCompat.getMainExecutor(context))
        }
      }
      registry.currentState = Lifecycle.State.RESUMED
      controller?.enableTorch(torch)
      // CameraX performs AF/AE continuously; no still capture, JPEG or disk IO.
      onStatus(mapOf("state" to "ready", "code" to "", "scanToken" to scanToken))
    } catch (_: Exception) {
      analyzing = false
      onStatus(mapOf("state" to "error", "code" to "CAMERA_UNAVAILABLE", "scanToken" to scanToken))
    }
  }

  @androidx.annotation.OptIn(ExperimentalGetImage::class)
  private fun analyze(image: ImageProxy) {
    val started = SystemClock.elapsedRealtime()
    val generation = epoch.get()
    val token = scanToken
    val recognizer = reader
    if (!analyzing || !scanning || recognizer == null || started < nextRead || !busy.compareAndSet(false, true)) { image.close(); return }
    val media = image.image
    if (media == null) { busy.set(false); image.close(); return }
    try {
      val rotation = image.imageInfo.rotationDegrees
      val uprightWidth = if (rotation % 180 == 0) image.width else image.height
      val uprightHeight = if (rotation % 180 == 0) image.height else image.width
      val scene = fingerprint(image)
      val input = InputImage.fromMediaImage(media, rotation)
      recognizer.process(input)
        .addOnSuccessListener(resultExecutor) { result ->
          if (!analyzing || !scanning || generation != epoch.get()) return@addOnSuccessListener
          val blocks = result.textBlocks.flatMap { it.lines }.take(40).mapNotNull { line ->
            val box = line.boundingBox ?: return@mapNotNull null
            val confidence = line.confidence
            if (confidence < 0.25f) return@mapNotNull null
            mapOf("text" to line.text, "confidence" to confidence,
              "x" to box.left.toDouble() / uprightWidth, "y" to box.top.toDouble() / uprightHeight,
              "width" to box.width().toDouble() / uprightWidth, "height" to box.height().toDouble() / uprightHeight)
          }
          sequence += 1
          val payload = mapOf("scanToken" to token, "sequence" to sequence, "timestamp" to System.currentTimeMillis().toDouble(),
            "processingMs" to (SystemClock.elapsedRealtime() - started).toDouble(), "blocks" to blocks,
            "scene" to scene, "width" to uprightWidth, "height" to uprightHeight)
          post { if (analyzing && scanning && generation == epoch.get()) onFrame(payload) }
        }
        .addOnFailureListener(resultExecutor) {
          post { if (analyzing && scanning && generation == epoch.get()) onStatus(mapOf("state" to "error", "code" to "LABEL_ANALYSIS_FAILED", "scanToken" to token)) }
        }
        // Completion must always close the camera buffer, even after detach/pause.
        .addOnCompleteListener {
          // Completion still closes buffers after the worker has been shut down.
          if (generation == epoch.get()) nextRead = started + maxOf(334L, (SystemClock.elapsedRealtime() - started) * 2)
          image.close(); busy.set(false)
        }
    } catch (_: Exception) {
      busy.set(false); image.close()
      post { if (analyzing && scanning && generation == epoch.get()) onStatus(mapOf("state" to "error", "code" to "LABEL_ANALYSIS_FAILED", "scanToken" to token)) }
    }
  }
  private fun fingerprint(image: ImageProxy): List<Int> {
    val plane = image.planes[0]
    val buffer = plane.buffer.duplicate()
    return (0 until 36).map { i ->
      val x = (image.width * (0.25 + (i % 6) * 0.1)).toInt().coerceIn(0, image.width - 1)
      val y = (image.height * (0.2 + (i / 6) * 0.12)).toInt().coerceIn(0, image.height - 1)
      buffer.get((y * plane.rowStride + x * plane.pixelStride).coerceAtMost(buffer.limit() - 1)).toInt() and 255
    }
  }
}
