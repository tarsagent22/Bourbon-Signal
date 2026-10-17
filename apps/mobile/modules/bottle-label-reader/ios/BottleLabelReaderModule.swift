import ExpoModulesCore

public class BottleLabelReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BottleLabelReader")
    Constants(["liveFramesVersion": 1])
    View(BottleLabelCameraView.self) {
      Events("onFrame", "onStatus")
      Prop("active") { (view, active: Bool) in view.setActive(active) }
      Prop("scanning") { (view, scanning: Bool) in view.setScanning(scanning) }
      Prop("scanToken") { (view, token: Int) in view.setScanToken(token) }
      Prop("torch") { (view, enabled: Bool) in view.setTorch(enabled) }
    }
  }
}
