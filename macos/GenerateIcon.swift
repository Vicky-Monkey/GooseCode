import AppKit
import Foundation

// Convert the checked-in GooseCode artwork to every standard macOS icon size.
// Keep the source artwork unchanged; no network or external dependencies needed.
guard CommandLine.arguments.count == 3 else {
    fputs("Usage: GenerateIcon <source-image> <output.iconset>\n", stderr)
    exit(2)
}
let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let directory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
guard let source = NSImage(contentsOf: sourceURL), source.isValid,
      source.size.width > 0, source.size.height > 0 else {
    throw NSError(domain: "GooseCodeIconGenerator", code: 1,
                  userInfo: [NSLocalizedDescriptionKey: "Could not load the GooseCode icon artwork: \(sourceURL.path)"])
}
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

func writeIcon(size: Int, destination: URL) throws {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
        let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw NSError(domain: "GooseCodeIconGenerator", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "Could not create a \(size)-pixel icon bitmap."])
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    let canvas = NSRect(x: 0, y: 0, width: size, height: size)
    context.cgContext.clear(canvas)
    let scale = CGFloat(size) / max(source.size.width, source.size.height)
    let width = source.size.width * scale, height = source.size.height * scale
    let bounds = NSRect(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - height) / 2,
                        width: width, height: height)
    source.draw(in: bounds, from: .zero, operation: .copy, fraction: 1,
                respectFlipped: false, hints: [.interpolation: NSImageInterpolation.high])
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "GooseCodeIconGenerator", code: 3,
                      userInfo: [NSLocalizedDescriptionKey: "Could not encode the icon as PNG."])
    }
    try data.write(to: destination, options: .atomic)
}

for base in [16, 32, 128, 256, 512] {
    try writeIcon(size: base, destination: directory.appendingPathComponent("icon_\(base)x\(base).png"))
    try writeIcon(size: base * 2, destination: directory.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
}
