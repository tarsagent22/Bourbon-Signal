import ExpoModulesCore
import Foundation
import Vision

public class BottleLabelReaderModule: Module {
  private let recognitionQueue = DispatchQueue(label: "com.bourbonsignal.label-reader", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("BottleLabelReader")
    AsyncFunction("recognizeText") { (uri: String) -> [String: String] in
      guard let url = URL(string: uri), url.isFileURL else {
        throw NSError(domain: "BottleLabelReader", code: 1, userInfo: [NSLocalizedDescriptionKey: "A local camera frame is required."])
      }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["en-US"]
      request.usesLanguageCorrection = false
      let handler = VNImageRequestHandler(url: url, options: [:])
      try handler.perform([request])
      let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
      return ["text": lines.joined(separator: "\n")]
    }.runOnQueue(recognitionQueue)
  }
}
