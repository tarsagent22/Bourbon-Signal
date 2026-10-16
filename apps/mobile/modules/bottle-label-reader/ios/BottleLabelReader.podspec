Pod::Spec.new do |s|
  s.name = 'BottleLabelReader'
  s.version = '1.0.0'
  s.summary = 'On-device bottle label recognition'
  s.description = 'Reads temporary local camera frames with Apple Vision.'
  s.author = 'Bourbon Signal'
  s.homepage = 'https://www.bourbonsignal.com'
  s.license = { :type => 'Proprietary' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/tarsagent22/Bourbon-Signal.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'Foundation'
  s.source_files = '**/*.swift'
end
