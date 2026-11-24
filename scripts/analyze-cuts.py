#!/usr/bin/env python3
"""
ReelCraft Eye-Line & Jump-Cut Analyzer (OpenCV 5 + YuNet FaceDetectorYN).
Measures exact (eyeX, eyeY, faceWidth) before & after every physical splice,
flags HIGH_TELEPORT / MEDIUM_JUMP cuts, and outputs a per-second eye-line track
for automatic multicam scale alternation and eye-line matching in HyperFrames.
"""
import json
import os
import sys
import cv2

if len(sys.argv) < 3:
    print("Usage: analyze-cuts.py <clean.mp4> <splices.json|comma_list> [out.json]", file=sys.stderr)
    sys.exit(1)

video_path = sys.argv[1]
splices_arg = sys.argv[2]
out_path = sys.argv[3] if len(sys.argv) > 3 else None

if os.path.isfile(splices_arg):
    with open(splices_arg) as fp:
        splices = [float(x) for x in json.load(fp)]
else:
    splices = [float(x) for x in splices_arg.split(",") if x.strip()]

model_path = os.path.join(os.path.dirname(__file__), "..", "assets", "models", "yunet.onnx")
if not os.path.isfile(model_path):
    print(f"Missing YuNet model at {model_path}", file=sys.stderr)
    sys.exit(1)

cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps

det_w = 360
det_h = int(round(height * (det_w / width)))
detector = cv2.FaceDetectorYN.create(model_path, "", (det_w, det_h), 0.6, 0.3, 5)

def detect_face_at(t_sec):
    frame_idx = max(0, min(total_frames - 1, int(round(t_sec * fps))))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ok, frame = cap.read()
    if not ok:
        return None
    small = cv2.resize(frame, (det_w, det_h))
    _, faces = detector.detect(small)
    if faces is None or len(faces) == 0:
        return None
    f = max(faces, key=lambda r: r[2] * r[3])
    eye_x = (f[4] + f[6]) / 2.0
    eye_y = (f[5] + f[7]) / 2.0
    return {
        "eyeX": round(float(eye_x / det_w), 4),
        "eyeY": round(float(eye_y / det_h), 4),
        "fw": round(float(f[2] / det_w), 4),
        "score": round(float(f[14]), 3),
    }

splice_reports = []
for i, t in enumerate(splices):
    before = detect_face_at(t - 0.08)
    after = detect_face_at(t + 0.08)
    dx = round(after["eyeX"] - before["eyeX"], 4) if before and after else None
    dy = round(after["eyeY"] - before["eyeY"], 4) if before and after else None
    dw = round(after["fw"] - before["fw"], 4) if before and after else None
    severity = "ok"
    if dx is not None:
        jump = (dx**2 + dy**2) ** 0.5
        if abs(dw) > 0.05 or jump > 0.08:
            severity = "HIGH_TELEPORT"
        elif jump > 0.035 or abs(dw) > 0.025:
            severity = "MEDIUM_JUMP"
    splice_reports.append({
        "index": i + 1,
        "time": t,
        "before": before,
        "after": after,
        "dx": dx,
        "dy": dy,
        "dw": dw,
        "severity": severity,
    })

track = []
for sec in range(0, int(duration) + 1):
    f = detect_face_at(float(sec))
    if f:
        track.append({"t": sec, **f})

cap.release()

result = {
    "video": video_path,
    "width": width,
    "height": height,
    "fps": round(fps, 3),
    "duration": round(duration, 3),
    "splices": splice_reports,
    "faceTrackSamples": len(track),
    "faceTrack": track,
}

if out_path:
    with open(out_path, "w") as fp:
        json.dump(result, fp, indent=2)
print(json.dumps({k: v for k, v in result.items() if k != "faceTrack"}, indent=2))
