import AVFoundation
import ExpoModulesCore
import UIKit
import Vision

/// One live preview, one serial analyzer, no captured photos or frame files.
final class BottleLabelCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onFrame = EventDispatcher()
  let onStatus = EventDispatcher()
  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "com.bourbonsignal.camera-session", qos: .userInitiated)
  private let analysisQueue = DispatchQueue(label: "com.bourbonsignal.live-labels", qos: .utility)
  private let stateLock = NSLock()
  private var generation = 0
  private var running = false
  private var captureRequested = false
  private var scanning = true
  private var scanToken = 0
  private var requestedActive = false
  private var foreground = true
  private var torch = false
  private var configured = false
  private var device: AVCaptureDevice?
  private var videoOutput: AVCaptureVideoDataOutput?
  private var nextRead: CFTimeInterval = 0
  private var sequence = 0
  private var observers: [NSObjectProtocol] = []
  private lazy var preview = AVCaptureVideoPreviewLayer(session: session)
  private let textRequest: VNRecognizeTextRequest = {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.008
    // Normalized upright image coordinates; keep curved labels and base strips.
    request.regionOfInterest = CGRect(x: 0.04, y: 0.04, width: 0.92, height: 0.92)
    return request
  }()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    preview.videoGravity = .resizeAspectFill
    layer.addSublayer(preview)
    foreground = UIApplication.shared.applicationState == .active
    let center = NotificationCenter.default
    observers = [
      center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.foreground = false; self?.updateSession()
      },
      center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.foreground = true; self?.updateSession()
      },
      center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: .main) { [weak self] _ in
        self?.invalidateFrames(); if let self { self.onStatus(["state": "interrupted", "code": "CAMERA_INTERRUPTED", "scanToken": self.scanToken]) }
      },
      center.addObserver(forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: .main) { [weak self] _ in
        self?.updateSession()
      },
      center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: .main) { [weak self] _ in
        self?.invalidateFrames(); if let self { self.onStatus(["state": "error", "code": "CAMERA_SESSION_FAILED", "scanToken": self.scanToken]) }
      }
    ]
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // Camera geometry is not an animated UI transition. Implicit layer actions
    // otherwise make the image swim when the surrounding results lay out.
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    if preview.frame != bounds { preview.frame = bounds }
    if let connection = preview.connection, connection.isVideoOrientationSupported, connection.videoOrientation != .portrait { connection.videoOrientation = .portrait }
    CATransaction.commit()
  }

  override func didMoveToWindow() { super.didMoveToWindow(); updateSession() }
  func setActive(_ value: Bool) { guard requestedActive != value else { return }; requestedActive = value; updateSession() }
  func setScanning(_ value: Bool) {
    stateLock.lock()
    guard scanning != value else { stateLock.unlock(); return }
    scanning = value; generation += 1; stateLock.unlock()
    if value { analysisQueue.async { [weak self] in self?.nextRead = 0 } }
  }
  func setScanToken(_ value: Int) {
    stateLock.lock()
    guard scanToken != value else { stateLock.unlock(); return }
    scanToken = value; generation += 1; stateLock.unlock()
    // A new scan invalidates old results, without touching the running camera.
    analysisQueue.async { [weak self] in self?.nextRead = 0 }
  }
  func setTorch(_ value: Bool) {
    guard torch != value else { return }
    torch = value
    sessionQueue.async { [weak self] in self?.applyTorch(value) }
  }
  private func invalidateFrames() {
    stateLock.lock(); generation += 1; running = false; stateLock.unlock()
  }
  private func updateSession() {
    let shouldRun = requestedActive && foreground && window != nil
    stateLock.lock()
    guard captureRequested != shouldRun || (shouldRun && !running) else { stateLock.unlock(); return }
    captureRequested = shouldRun
    generation += 1; let epoch = generation; running = shouldRun; stateLock.unlock()
    let requestedTorch = torch
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if !shouldRun {
        self.applyTorch(false)
        self.videoOutput?.setSampleBufferDelegate(nil, queue: nil)
        if self.session.isRunning { self.session.stopRunning() }
        return
      }
      guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
        self.emitStatus("error", code: "CAMERA_PERMISSION_REQUIRED", epoch: epoch); return
      }
      do {
        if !self.configured { try self.configure() }
        self.videoOutput?.setSampleBufferDelegate(self, queue: self.analysisQueue)
        if !self.session.isRunning { self.session.startRunning() }
        DispatchQueue.main.async { [weak self] in
          guard let self else { return }
          if let connection = self.preview.connection, connection.isVideoOrientationSupported, connection.videoOrientation != .portrait { connection.videoOrientation = .portrait }
        }
        self.applyTorch(requestedTorch)
        self.emitStatus("ready", epoch: epoch)
      } catch {
        self.emitStatus("error", code: "CAMERA_UNAVAILABLE", epoch: epoch)
      }
    }
  }
  private func configure() throws {
    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
      throw NSError(domain: "BottleLabelReader", code: 2)
    }
    let input = try AVCaptureDeviceInput(device: camera)
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.sessionPreset = .hd1920x1080
    guard session.canAddInput(input) else { throw NSError(domain: "BottleLabelReader", code: 3) }
    session.addInput(input)
    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
    output.setSampleBufferDelegate(self, queue: analysisQueue)
    guard session.canAddOutput(output) else { session.removeInput(input); throw NSError(domain: "BottleLabelReader", code: 4) }
    session.addOutput(output)
    // Deliver physically upright buffers; Vision observations and preview share portrait coordinates.
    if output.connection(with: .video)?.isVideoOrientationSupported == true { output.connection(with: .video)?.videoOrientation = .portrait }
    if (try? camera.lockForConfiguration()) != nil {
      if camera.isFocusModeSupported(.continuousAutoFocus) { camera.focusMode = .continuousAutoFocus }
      if camera.isExposureModeSupported(.continuousAutoExposure) { camera.exposureMode = .continuousAutoExposure }
      if camera.isSmoothAutoFocusSupported { camera.isSmoothAutoFocusEnabled = true }
      if camera.activeFormat.videoSupportedFrameRateRanges.contains(where: { $0.minFrameRate <= 30 && $0.maxFrameRate >= 30 }) {
        camera.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 30)
        camera.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 30)
      }
      camera.unlockForConfiguration()
    }
    device = camera
    videoOutput = output
    configured = true
  }
  private func applyTorch(_ enabled: Bool) {
    guard let camera = device, camera.hasTorch else { return }
    guard camera.torchMode != (enabled ? .on : .off) else { return }
    do { try camera.lockForConfiguration(); camera.torchMode = enabled ? .on : .off; camera.unlockForConfiguration() } catch { }
  }
  private func emitStatus(_ state: String, code: String = "", epoch: Int) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.isCurrent(epoch) else { return }
      self.onStatus(["state": state, "code": code, "scanToken": self.scanToken])
    }
  }
  private func isCurrent(_ epoch: Int) -> Bool {
    stateLock.lock(); defer { stateLock.unlock() }; return running && scanning && generation == epoch
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    stateLock.lock(); let epoch = generation; let active = running && scanning; let token = scanToken; stateLock.unlock()
    let now = CACurrentMediaTime()
    guard active, now >= nextRead, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let started = now
    // Leave at least as much time idle as the last OCR pass consumed. First
    // suggestions remain immediate; a slow recognizer cannot saturate the phone.
    defer { nextRead = started + max(1.0 / 3.0, (CACurrentMediaTime() - started) * 2) }
    autoreleasepool {
      do {
        let start = CACurrentMediaTime()
        try VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:]).perform([textRequest])
        let blocks: [[String: Any]] = (textRequest.results ?? []).prefix(40).compactMap { observation in
          guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.25 else { return nil }
          let box = observation.boundingBox
          return ["text": candidate.string, "confidence": candidate.confidence,
            "x": box.minX, "y": 1 - box.maxY, "width": box.width, "height": box.height]
        }
        sequence += 1
        let payload: [String: Any] = ["scanToken": token, "sequence": sequence, "timestamp": Date().timeIntervalSince1970 * 1000,
          "processingMs": (CACurrentMediaTime() - start) * 1000, "blocks": blocks,
          "scene": fingerprint(buffer), "width": CVPixelBufferGetWidth(buffer), "height": CVPixelBufferGetHeight(buffer)]
        DispatchQueue.main.async { [weak self] in
          guard let self, self.isCurrent(epoch) else { return }
          self.onFrame(payload)
        }
      } catch { emitStatus("error", code: "LABEL_ANALYSIS_FAILED", epoch: epoch) }
    }
  }

  /// Small central luma grid for temporal reset. No image pixels cross to JS or disk.
  private func fingerprint(_ buffer: CVPixelBuffer) -> [Int] {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, 0) else { return [] }
    let width = CVPixelBufferGetWidthOfPlane(buffer, 0), height = CVPixelBufferGetHeightOfPlane(buffer, 0)
    let stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    return (0..<36).map { i in
      let x = Int(Double(width) * (0.25 + Double(i % 6) * 0.1))
      let y = Int(Double(height) * (0.2 + Double(i / 6) * 0.12))
      return Int(bytes[min(height - 1, y) * stride + min(width - 1, x)])
    }
  }
  deinit {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    let capture = session
    sessionQueue.async { if capture.isRunning { capture.stopRunning() } }
  }
}
