"""A tiny offline OCR web app for exam-question screenshots.

Run ``python app.py`` and browse to http://127.0.0.1:7860.
The browser sends an image only to this local Python process.
"""

from __future__ import annotations

import base64
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import numpy as np
from PIL import Image, ImageDraw
from rapidocr_onnxruntime import RapidOCR


HTML = """<!doctype html><html lang='zh-CN'><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>研 Lens · 本地 OCR</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#17202f;font-family:system-ui,"Microsoft YaHei",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:48px 22px}h1{font-size:30px;margin:0 0 8px}.lead{color:#697386;line-height:1.6}.card{margin-top:24px;background:#fff;border:1px solid #e6e9f0;border-radius:16px;padding:24px;box-shadow:0 9px 28px #24305a0b}.drop{display:block;border:2px dashed #bdb8ed;border-radius:13px;padding:30px;text-align:center;background:#fbfaff;color:#6558cc;font-weight:700;transition:.15s}.drop.dragging{background:#f0efff;border-color:#6d5de7}.drop small{display:block;margin-top:7px;color:#8992a5;font-weight:500}.drop input{display:block;margin:18px auto 0;max-width:320px;color:#4e47a6;font-weight:500}button{margin-top:14px;background:#6d5de7;color:#fff;border:0;border-radius:9px;padding:11px 17px;font-weight:700;cursor:pointer}.status{margin:14px 0;color:#697386}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px}.panel{border:1px solid #e7e9f0;border-radius:11px;overflow:hidden}.panel h2{font-size:14px;margin:0;padding:12px 14px;background:#fafbfe}.panel img{display:block;width:100%;max-height:560px;object-fit:contain;background:#f5f6f9}.panel textarea{width:100%;height:520px;border:0;resize:vertical;padding:14px;font:14px/1.6 ui-monospace,Consolas,monospace;color:#27314a}@media(max-width:720px){.grid{grid-template-columns:1fr}.wrap{padding:28px 15px}}
 </style><body><main class='wrap'><h1>研 Lens · 本地错题 OCR</h1><p class='lead'>上传错题截图，识别在这台电脑完成，不消耗 API Token。数学公式、上下标和手写内容请人工复核。</p><section class='card'><div class='drop' id='drop'>选择图片，或把图片拖到这里<small>支持 JPG、PNG、WEBP；单张图片不超过 20 MB。</small><input id='file' type='file' accept='image/jpeg,image/png,image/webp'></div><button id='run'>开始本地识别</button><p class='status' id='status'>等待上传图片。</p><div class='grid'><section class='panel'><h2>识别区域</h2><img id='preview' alt='识别区域预览'></section><section class='panel'><h2>可编辑识别文本</h2><textarea id='text' placeholder='识别结果会出现在这里。'></textarea></section></div></section></main><script>
const file=document.querySelector('#file'),drop=document.querySelector('#drop'),run=document.querySelector('#run'),status=document.querySelector('#status'),preview=document.querySelector('#preview'),text=document.querySelector('#text');
['dragenter','dragover'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragging')}));['dragleave','drop'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragging')}));drop.addEventListener('drop',e=>{if(e.dataTransfer.files.length){file.files=e.dataTransfer.files;status.textContent='已选择：'+file.files[0].name}});file.addEventListener('change',()=>{if(file.files[0])status.textContent='已选择：'+file.files[0].name});
run.onclick=async()=>{if(!file.files[0]){status.textContent='请先选择图片。';return}status.textContent='正在本地识别，请稍候…';run.disabled=true;try{const f=file.files[0],r=await fetch('/api/recognize',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(f.name)},body:await f.arrayBuffer()});const d=await r.json();if(!r.ok)throw Error(d.error||'识别失败');preview.src='data:image/png;base64,'+d.image;text.value=d.text;status.textContent=d.status}catch(e){status.textContent='识别失败：'+e.message}finally{run.disabled=false}};
</script></body></html>"""

ENGINE = RapidOCR()


def normalise(raw: Any) -> list[tuple[list[list[float]], str, float]]:
    if raw is None:
        return []
    if hasattr(raw, "txts") and hasattr(raw, "boxes"):
        scores = getattr(raw, "scores", [0.0] * len(raw.txts))
        return [(box.tolist() if hasattr(box, "tolist") else box, str(text), float(score)) for box, text, score in zip(raw.boxes, raw.txts, scores)]
    if isinstance(raw, tuple):
        raw = raw[0]
    return [(item[0].tolist() if hasattr(item[0], "tolist") else item[0], str(item[1]), float(item[2] if len(item) > 2 else 0)) for item in (raw or [])]


def recognise(payload: bytes) -> dict[str, str]:
    image = Image.open(io.BytesIO(payload)).convert("RGB")
    raw, elapsed = ENGINE(np.asarray(image))
    lines = normalise(raw)
    canvas = image.copy()
    draw = ImageDraw.Draw(canvas)
    for index, (box, _text, _score) in enumerate(lines, 1):
        points = [(int(x), int(y)) for x, y in box]
        if len(points) < 2:
            continue
        draw.line(points + [points[0]], fill="#6d5de7", width=max(2, image.width // 600))
        x, y = points[0]
        draw.rectangle((x, max(0, y - 20), x + 24, y), fill="#6d5de7")
        draw.text((x + 6, max(0, y - 18)), str(index), fill="white")
    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG")
    low = sum(score < 0.75 for _box, _text, score in lines)
    elapsed_seconds = sum(float(value) for value in elapsed) if isinstance(elapsed, (list, tuple)) else float(elapsed)
    status = f"识别到 {len(lines)} 行文字，用时 {elapsed_seconds:.2f} 秒。"
    if low:
        status += f" {low} 行置信度偏低，请核对公式、上下标和选项。"
    return {"image": base64.b64encode(buffer.getvalue()).decode(), "text": "\n".join(f"{index}. {text}" for index, (_box, text, _score) in enumerate(lines, 1)), "status": status}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, data: dict[str, str]) -> None:
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/":
            self.send_error(404)
            return
        body = HTML.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path != "/api/recognize":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 20 * 1024 * 1024:
                raise ValueError("图片大小需在 20 MB 以内。")
            self.send_json(200, recognise(self.rfile.read(length)))
        except Exception as error:
            self.send_json(400, {"error": str(error)})

    def log_message(self, _format: str, *_args: object) -> None:
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 7860), Handler)
    print("本地 OCR 已启动：http://127.0.0.1:7860")
    server.serve_forever()
