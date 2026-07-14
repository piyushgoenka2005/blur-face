/**
 * Optional SCRFD ONNX model directory.
 *
 * To enable SCRFD (ONNX Runtime Web):
 * 1. Export / obtain an SCRFD `.onnx` model.
 * 2. Place it here as `scrfd.onnx`.
 * 3. Redeploy — the app will prefer SCRFD and fall back to MediaPipe if load fails.
 *
 * Without this file, MediaPipe Face Detection is used automatically.
 */
