import ExpoModulesCore
import Vision

public class BottleLabelReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BottleLabelReader")
    Constants(["liveFramesVersion": 1])
    AsyncFunction("readPhoto") { (uri: URL) -> String in
      guard uri.isFileURL else { throw NSError(domain: "BottleLabelReader", code: 1) }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      try VNImageRequestHandler(url: uri, options: [:]).perform([request])
      return (request.results ?? []).prefix(150).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
    View(BottleLabelCameraView.self) {
      Events("onFrame", "onStatus")
      Prop("active") { (view, active: Bool) in view.setActive(active) }
      Prop("scanning") { (view, scanning: Bool) in view.setScanning(scanning) }
      Prop("scanToken") { (view, token: Int) in view.setScanToken(token) }
      Prop("torch") { (view, enabled: Bool) in view.setTorch(enabled) }
    }
  }
}
