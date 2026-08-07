#!/usr/bin/env python3
"""
สร้างฉบับ self-contained — inline CSS/JS เข้าไปในแต่ละไฟล์
ผลลัพธ์: standalone/*.html แจกไฟล์เดียวได้ ไม่ต้องมีโฟลเดอร์ assets

⭐ ต้องใช้ lambda เป็น replacement ไม่ใช่ string
   เพราะ re.sub ตีความ \\s, \\1, \\g ใน replacement string
   ซึ่ง CSS/JS มีเต็มไปหมด

ใช้: python3 build-standalone.py
"""
import re, pathlib

SRC = pathlib.Path(__file__).parent
OUT = SRC / "standalone"

css = (SRC / "assets/style.css").read_text(encoding="utf-8")
js  = (SRC / "assets/app.js").read_text(encoding="utf-8")

OUT.mkdir(exist_ok=True)

files = sorted(SRC.glob("*.html"))
tb = ta = 0

for f in files:
    html = f.read_text(encoding="utf-8")
    before = len(html.encode())

    # ⭐ lambda กัน backslash ใน replacement ถูกตีความ
    html = re.sub(
        r'<link rel="stylesheet" href="assets/style\.css">',
        lambda _m: f"<style>\n{css}\n</style>",
        html,
    )
    html = re.sub(
        r'<script src="assets/app\.js"></script>',
        lambda _m: f"<script>\n{js}\n</script>",
        html,
    )

    leftover = re.findall(r'(?:href|src)="assets/[^"]*"', html)
    if leftover:
        print(f"  ⚠ {f.name}: ยังอ้าง assets {leftover}")

    (OUT / f.name).write_text(html, encoding="utf-8")

    after = len(html.encode())
    tb += before; ta += after
    print(f"  {f.name:24s} {before//1024:4d}K -> {after//1024:4d}K")

print()
print(f"  รวม {tb//1024}K -> {ta//1024}K  (+{(ta-tb)//1024}K)")
print(f"  ผลลัพธ์: {OUT}")
