"""A tiny offline OCR web app for exam-question screenshots.

Run ``python app.py`` and browse to http://127.0.0.1:7860.
The browser sends an image only to this local Python process.
"""

from __future__ import annotations

import base64
import io
import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import numpy as np
from PIL import Image, ImageDraw
from rapidocr_onnxruntime import RapidOCR


HTML = """<!doctype html><html lang='zh-CN'><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>研 Lens · 本地 OCR</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#17202f;font-family:system-ui,"Microsoft YaHei",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:48px 22px}h1{font-size:30px;margin:0 0 8px}.lead{color:#697386;line-height:1.6}.card{margin-top:24px;background:#fff;border:1px solid #e6e9f0;border-radius:16px;padding:24px;box-shadow:0 9px 28px #24305a0b}.mode{display:flex;gap:10px;margin:0 0 16px}.mode label{flex:1;border:1px solid #dfdced;border-radius:10px;padding:12px;color:#4e47a6;cursor:pointer}.mode input{accent-color:#6d5de7}.mode small{display:block;margin:4px 0 0 24px;color:#697386}.drop{display:block;border:2px dashed #bdb8ed;border-radius:13px;padding:30px;text-align:center;background:#fbfaff;color:#6558cc;font-weight:700;transition:.15s}.drop.dragging{background:#f0efff;border-color:#6d5de7}.drop small{display:block;margin-top:7px;color:#8992a5;font-weight:500}.drop input{display:block;margin:18px auto 0;max-width:320px;color:#4e47a6;font-weight:500}button{margin-top:14px;background:#6d5de7;color:#fff;border:0;border-radius:9px;padding:11px 17px;font-weight:700;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.status{margin:14px 0;color:#697386}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px}.panel{border:1px solid #e7e9f0;border-radius:11px;overflow:hidden}.panel h2{font-size:14px;margin:0;padding:12px 14px;background:#fafbfe}.panel small{display:block;padding:0 14px 10px;background:#fafbfe;color:#697386}.panel img{display:block;width:100%;max-height:560px;object-fit:contain;background:#f5f6f9}.panel textarea{width:100%;height:520px;border:0;resize:vertical;padding:14px;font:14px/1.6 ui-monospace,Consolas,monospace;color:#27314a}.formula-panel{grid-column:1/-1}.formula-panel textarea{height:220px;color:#352b87;background:#fcfbff}@media(max-width:720px){.grid{grid-template-columns:1fr}.mode{display:block}.mode label{display:block;margin-bottom:8px}.wrap{padding:28px 15px}}
</style><body><main class='wrap'><h1>研 Lens · 本地错题 OCR</h1><p class='lead'>图片只在这台电脑处理，不消耗 API Token。数学模式会按原图阅读顺序重建题目：公式、矩阵、上下标会直接嵌入题干的对应位置。</p><section class='card'><div class='mode'><label><input type='radio' name='mode' value='text' checked> 普通文字 OCR<small>题干、选项、中文与英文</small></label><label><input type='radio' name='mode' value='math'> 数学题识别（推荐）<small>公式 / 矩阵 / 分式 → LaTeX</small></label></div><div class='drop' id='drop'>选择图片，或把图片拖到这里<small>支持 JPG、PNG、WEBP；单张图片不超过 20 MB。</small><input id='file' type='file' accept='image/jpeg,image/png,image/webp'></div><button id='run'>开始本地识别</button><p class='status' id='status'>等待上传图片。</p><div class='grid'><section class='panel'><h2>识别区域</h2><img id='preview' alt='识别区域预览'></section><section class='panel'><h2>可直接录入的题目字符序列</h2><small>按阅读顺序合并普通文字和 LaTeX；公式使用 <code>\\(...\\)</code> 标记，可复制后再校对。</small><textarea id='text' placeholder='重建后的题目会出现在这里。'></textarea></section><section class='panel formula-panel'><h2>公式明细（用于校对）</h2><small>这是已嵌入上方题目中的公式副本，便于单独检查或手动修改。</small><textarea id='formula' placeholder='选择“数学题识别”后，公式结果会显示在这里。'></textarea></section></div></section></main><script>
const file=document.querySelector('#file'),drop=document.querySelector('#drop'),run=document.querySelector('#run'),status=document.querySelector('#status'),preview=document.querySelector('#preview'),text=document.querySelector('#text'),formula=document.querySelector('#formula');
['dragenter','dragover'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragging')}));['dragleave','drop'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragging')}));drop.addEventListener('drop',e=>{if(e.dataTransfer.files.length){file.files=e.dataTransfer.files;status.textContent='已选择：'+file.files[0].name}});file.addEventListener('change',()=>{if(file.files[0])status.textContent='已选择：'+file.files[0].name});
run.onclick=async()=>{if(!file.files[0]){status.textContent='请先选择图片。';return}const mode=document.querySelector('input[name="mode"]:checked').value;status.textContent=mode==='math'?'正在识别题干和数学结构，首次使用会加载本地模型，请稍候…':'正在本地识别，请稍候…';run.disabled=true;try{const f=file.files[0],r=await fetch('/api/recognize',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(f.name),'X-OCR-Mode':mode},body:await f.arrayBuffer()});const d=await r.json();if(!r.ok)throw Error(d.error||'识别失败');preview.src='data:image/png;base64,'+d.image;text.value=d.text;formula.value=d.latex||'';status.textContent=d.status}catch(e){status.textContent='识别失败：'+e.message}finally{run.disabled=false}};
</script></body></html>"""

ENGINE = RapidOCR()
FORMULA_ENGINE: Any | None = None
FORMULA_ENGINE_ERROR: str | None = None


def normalise(raw: Any) -> list[tuple[list[list[float]], str, float]]:
    if raw is None:
        return []
    if hasattr(raw, "txts") and hasattr(raw, "boxes"):
        scores = getattr(raw, "scores", [0.0] * len(raw.txts))
        return [(box.tolist() if hasattr(box, "tolist") else box, str(text), float(score)) for box, text, score in zip(raw.boxes, raw.txts, scores)]
    if isinstance(raw, tuple):
        raw = raw[0]
    return [(item[0].tolist() if hasattr(item[0], "tolist") else item[0], str(item[1]), float(item[2] if len(item) > 2 else 0)) for item in (raw or [])]


def formula_engine() -> Any:
    """Load the heavier formula pipeline only for a math upload."""
    global FORMULA_ENGINE, FORMULA_ENGINE_ERROR
    if FORMULA_ENGINE is not None:
        return FORMULA_ENGINE
    if FORMULA_ENGINE_ERROR:
        raise RuntimeError(FORMULA_ENGINE_ERROR)
    try:
        from paddleocr import FormulaRecognitionPipeline

        FORMULA_ENGINE = FormulaRecognitionPipeline(
            device="cpu",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            enable_mkldnn=False,
            cpu_threads=4,
        )
        return FORMULA_ENGINE
    except Exception as error:
        FORMULA_ENGINE_ERROR = (
            "数学公式引擎尚未就绪。请先完成 PaddleOCR 依赖和模型下载；"
            f"详细原因：{error}"
        )
        raise RuntimeError(FORMULA_ENGINE_ERROR) from error


def collect_latex(value: Any) -> list[str]:
    """Extract LaTeX strings from PaddleOCR result objects across v3 formats."""
    found: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in {"latex", "rec_formula", "formula"} and isinstance(item, str):
                found.append(item)
            else:
                found.extend(collect_latex(item))
    elif isinstance(value, (list, tuple)):
        for item in value:
            found.extend(collect_latex(item))
    return found


def result_data(result: Any) -> Any:
    data = getattr(result, "json", result)
    return data() if callable(data) else data


def numbers(value: Any) -> list[float]:
    """Flatten Polygon / ndarray coordinates returned by different PaddleOCR builds."""
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (list, tuple)):
        output: list[float] = []
        for item in value:
            output.extend(numbers(item))
        return output
    try:
        return [float(value)]
    except (TypeError, ValueError):
        return []


def rectangle(value: Any) -> tuple[float, float, float, float] | None:
    values = numbers(value)
    if len(values) < 4:
        return None
    xs, ys = values[::2], values[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def formula_regions_from(value: Any) -> list[tuple[str, tuple[float, float, float, float]]]:
    """Read formula strings together with their page coordinates from PaddleOCR."""
    regions: list[tuple[str, tuple[float, float, float, float]]] = []
    if isinstance(value, dict):
        formulas = value.get("formula_res_list")
        if isinstance(formulas, list):
            for formula in formulas:
                if not isinstance(formula, dict):
                    continue
                latex = formula.get("rec_formula") or formula.get("latex")
                box = rectangle(formula.get("dt_polys") or formula.get("box"))
                if isinstance(latex, str) and latex.strip() and box:
                    regions.append((latex.strip(), box))
        for item in value.values():
            regions.extend(formula_regions_from(item))
    elif isinstance(value, (list, tuple)):
        for item in value:
            regions.extend(formula_regions_from(item))
    return regions


def formula_regions(image: Image.Image) -> list[tuple[str, tuple[float, float, float, float]]]:
    engine = formula_engine()
    regions: list[tuple[str, tuple[float, float, float, float]]] = []
    for result in engine.predict(np.asarray(image)):
        regions.extend(formula_regions_from(result_data(result)))
    # A tightly cropped matrix is sometimes too small for page-layout detection
    # to label as a formula. In that case, treat the upload as one formula region.
    if not regions:
        for result in engine.predict(np.asarray(image), use_layout_detection=False):
            data = result_data(result)
            latex = list(dict.fromkeys(item.strip() for item in collect_latex(data) if item and item.strip()))
            regions.extend((item, (0.0, 0.0, float(image.width), float(image.height))) for item in latex)
    # Some pipeline payloads repeat the same result through nested structures.
    return list(dict.fromkeys(regions))


def overlap_ratio(first: tuple[float, float, float, float], second: tuple[float, float, float, float]) -> float:
    left, top = max(first[0], second[0]), max(first[1], second[1])
    right, bottom = min(first[2], second[2]), min(first[3], second[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    area = max(1.0, (first[2] - first[0]) * (first[3] - first[1]))
    return intersection / area


def formula_as_text(latex: str) -> str:
    """A small comparison-only LaTeX flattening pass, not displayed to the user."""
    value = latex
    for command in ("boldsymbol", "mathbf", "mathrm", "mathit", "vec"):
        value = re.sub(rf"\\{command}\{{([^{{}}]*)\}}", r"\1", value)
    value = value.replace(r"\ne", "≠").replace(r"\neq", "≠")
    value = value.replace(r"\le", "≤").replace(r"\ge", "≥")
    return value.replace("{", "").replace("}", "").replace("\\", "")


def comparable(value: str) -> str:
    return re.sub(r"\s+", "", value).replace("（", "(").replace("）", ")").replace("，", ",")


def split_text_around_formula(
    rect: tuple[float, float, float, float], text: str, latex: str, formula_box: tuple[float, float, float, float]
) -> list[tuple[tuple[float, float, float, float], str]]:
    """Split a broad OCR line so a small inline formula can occupy its real slot."""
    target = comparable(formula_as_text(latex))
    source = comparable(text)
    start = source.find(target) if target else -1
    horizontally_inside = rect[0] < formula_box[0] < formula_box[2] < rect[2]
    if start < 0 or not horizontally_inside:
        return [(rect, text)]
    # Map the match back to the original string. This deliberately accepts minor
    # spacing differences, which are frequent around equality signs.
    compact_index = 0
    original_start = original_end = None
    for index, character in enumerate(text):
        if character.isspace():
            continue
        if compact_index == start:
            original_start = index
        compact_index += 1
        if compact_index == start + len(target):
            original_end = index + 1
            break
    if original_start is None or original_end is None:
        return [(rect, text)]
    before, after = text[:original_start].strip(), text[original_end:].strip()
    parts: list[tuple[tuple[float, float, float, float], str]] = []
    if before:
        parts.append(((rect[0], rect[1], formula_box[0], rect[3]), before))
    if after:
        parts.append(((formula_box[2], rect[1], rect[2], rect[3]), after))
    return parts


def rebuild_reading_order(
    lines: list[tuple[list[list[float]], str, float]],
    formulas: list[tuple[str, tuple[float, float, float, float]]],
) -> str:
    """Replace OCR fragments inside formula boxes, then arrange all regions by page order."""
    items: list[tuple[float, float, float, float, str]] = []
    for box, text, _score in lines:
        rect = rectangle(box)
        if not rect or not text.strip():
            continue
        # A text line wholly (or mostly) inside a formula box is usually a broken
        # matrix row such as "1 2 -2".  The LaTeX region replaces it below.
        pieces = [(rect, text.strip())]
        for latex, formula_box in formulas:
            next_pieces: list[tuple[tuple[float, float, float, float], str]] = []
            for piece_box, piece_text in pieces:
                next_pieces.extend(split_text_around_formula(piece_box, piece_text, latex, formula_box))
            pieces = next_pieces
        # If a formula did not split this text region, it is only a broken OCR
        # fragment within a formula (for example one row of a matrix), so discard
        # it. A successful split retains prefixes such as the "(B)" option label.
        if pieces == [(rect, text.strip())] and any(
            overlap_ratio(rect, formula_box) >= 0.42 for _latex, formula_box in formulas
        ):
            continue
        items.extend((*piece_box, piece_text) for piece_box, piece_text in pieces)
    for latex, rect in formulas:
        items.append((*rect, f"\\({latex}\\)"))
    if not items:
        return ""
    # Formula boxes are often taller than their surrounding sentence. Their
    # vertical centre, not their top edge, identifies the line they belong to.
    items.sort(key=lambda item: ((item[1] + item[3]) / 2, item[0]))
    rows: list[list[tuple[float, float, float, float, str]]] = []
    for item in items:
        midpoint = (item[1] + item[3]) / 2
        row_midpoint = sum((entry[1] + entry[3]) / 2 for entry in rows[-1]) / len(rows[-1]) if rows else 0
        if not rows or midpoint - row_midpoint > 46:
            rows.append([item])
        else:
            rows[-1].append(item)
    return "\n".join(" ".join(entry[4] for entry in sorted(row, key=lambda entry: entry[0])) for row in rows)


def recognise(payload: bytes, mode: str = "text") -> dict[str, str]:
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
    recognized_text = "\n".join(f"{index}. {text}" for index, (_box, text, _score) in enumerate(lines, 1))
    latex_text = ""
    if mode == "math":
        started = time.perf_counter()
        formulas = formula_regions(image)
        if formulas:
            # This is the primary result: it is ready to become an error-record
            # title/body, instead of requiring the user to stitch two panels.
            recognized_text = rebuild_reading_order(lines, formulas)
            latex = [item for item, _box in formulas]
            latex_text = "\n\n".join(f"$${item}$$" for item in latex)
            status += f" 已按原图顺序合并 {len(latex)} 段数学结构，用时 {time.perf_counter() - started:.2f} 秒。"
        else:
            status += " 未检测到独立公式区域；建议裁剪到单题或矩阵区域后重试。"
    return {"image": base64.b64encode(buffer.getvalue()).decode(), "text": recognized_text, "latex": latex_text, "status": status}


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
            mode = self.headers.get("X-OCR-Mode", "text").lower()
            if mode not in {"text", "math"}:
                raise ValueError("未知识别模式。")
            self.send_json(200, recognise(self.rfile.read(length), mode))
        except Exception as error:
            self.send_json(400, {"error": str(error)})

    def log_message(self, _format: str, *_args: object) -> None:
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 7860), Handler)
    print("本地 OCR 已启动：http://127.0.0.1:7860")
    server.serve_forever()
