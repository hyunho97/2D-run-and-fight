"""캐릭터 시트에서 한 컷을 잘라 마젠타 배경을 지우고 게임용 정지 이미지로 만든다.

  python -I tools/cutout_sprite.py            # SHEETS 전부 다시 만들기

출력
  assets/chars/<name>.png       전투용 전신 (오른쪽을 바라봄)
  assets/chars/<name>_head.png  블록·파티·메뉴용 얼굴 (EXTRAS 는 전신만)
  src/ui/SpriteData.js          위 PNG 를 data URL 로 담은 스크립트 (file:// 로 열어도 동작)

배경 제거: 색 거리로 알파 추정 → 캐릭터 덩어리만 남김 → 하드 알파(도트 스타일) →
가장자리 색에서 마젠타 성분 제거(언믹스 + 디스필) → 프리멀티플라이드 알파로 축소.
반투명 분홍 테두리가 남지 않는다.
필요: pip install pillow numpy scipy
"""
import base64
import io
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = np.array([253, 0, 250], np.float32)   # 배경 마젠타

# name: 원본, 자를 영역(원본 좌표 x0, y0, x1, y1), 전신 높이(= 전투 화면 표시 높이, 실행 중 축소로 테두리가 반짝이지 않게),
#   얼굴 영역(head_height 로 축소한 이미지 기준 좌표)
#   forms: 상위 등급 외형 {출력 이름: 단계}. 같은 컷에 망토 장식·별·랜턴 불빛을 코드로 덧입힌다 (evolve_art)
SHEETS = {
    'moka': {
        'src': 'imeage/Gemini_Generated_Image_p3umr9p3umr9p3um.png',   # SIDE 컷
        'box': (960, 260, 1680, 1260),
        'height': 180,
        'head_height': 360,
        'head': (70, 22, 184, 136),
        'forms': {'moka5': 5, 'moka6': 6},
    },
}

# 캐릭터 시트에서 따로 떼어 쓰는 작은 그림 (동료 정령 등). 마젠타 위의 따뜻한 색 덩어리를 잘라낸다
#   name: 원본, 자를 영역, 출력 높이, 덩어리 기준점(영역 좌표), recolor: 다시 칠한 사본 {이름: 팔레트(어두움→밝음)}
EXTRAS = {
    'bulssi': {   # 정령 '불씨' — 2번 시트 FRONT 컷의 깨어난(웃는) 얼굴
        'src': 'imeage/Gemini_Generated_Image_qgllh2qgllh2qgll.png',
        'box': (90, 330, 320, 560),
        'height': 40,
        'seed': (115, 115),
        'recolor': {'bulssi6': [(40, 70, 170), (90, 150, 240), (180, 225, 255), (250, 252, 255)]},
    },
}

# 등급별 외형 변화 (★4 원본 기준). 전투 화면에서는 정령 불씨·별 고리 등 코드 연출이 더해진다 (PixelArt.SPRITE_ART)
#   ★5 등불지기: 밝은 군청 망토, 금실 테두리(후드 입구·밑단), 금별 장식, 랜턴 더 밝게
#   ★6 별빛 등불지기: 은백색 별빛 망토, 두꺼운 금 테두리, 금·청 별 다수, 푸른 별빛 랜턴
#   ramp: 망토 명암(어두움→밝음)을 다시 칠할 색 (원래 명암 유지)
FORM_STYLE = {
    5: {'ramp': [(22, 28, 88), (38, 58, 150), (70, 100, 200), (130, 160, 235)],
        'trim': (240, 190, 80), 'trim_w': 14, 'stars': 16, 'star_cols': [(255, 200, 92), (255, 230, 150)],
        'flame': 0.25},
    6: {'ramp': [(92, 100, 165), (165, 175, 225), (228, 232, 252), (252, 252, 255)],
        'trim': (236, 180, 64), 'trim_w': 20, 'stars': 30, 'star_cols': [(255, 196, 70), (70, 110, 230), (240, 170, 50)],
        'flame': 0.5},
}


def ramp_colors(L, stops):
    """밝기(0~1) → 팔레트 보간색"""
    st = np.array(stops, np.float32)
    xs = np.linspace(0, 1, len(st))
    return np.stack([np.interp(L, xs, st[:, i]) for i in range(3)], -1)


def evolve_art(img, level):
    st = FORM_STYLE[level]
    a = np.asarray(img).astype(np.float32)
    rgb, al = a[..., :3].copy(), a[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h, w = al.shape
    op = al > 0
    yy, xx = np.mgrid[0:h, 0:w]

    # 망토(후드 포함) = 파랑이 강한 남색 영역. 원래 박힌 별 점까지 덮도록 닫기
    blue = op & (b > r + 20) & (b > g + 20) & (b >= 40)
    cloak = ndimage.binary_fill_holes(ndimage.binary_closing(blue, iterations=6)) & op
    cloak &= ndimage.binary_opening(cloak, iterations=3)
    inner = ndimage.distance_transform_edt(cloak)

    # 망토 색 교체: 원래 밝기(남색 약 25~75)를 팔레트로 다시 칠함 → 명암·주름은 그대로
    L = np.clip(((r + g + b) / 3 - 25) / 50, 0, 1)
    rgb = np.where(blue[..., None], ramp_colors(L, st['ramp']), rgb)

    # 테두리: 후드 입구(얼굴·머리와 맞닿은 곳)와 밑단(바깥과 맞닿은 아래쪽)
    #   얼굴·머리 = 붉은기가 파랑보다 강한 따뜻한 색 (검은 외곽선·후드 가장자리 제외)
    tw = st['trim_w']
    face = op & (r > b + 8) & ((r + g + b) > 130) & (yy < h * 0.42) & (xx > w * 0.3)
    hood_edge = cloak & ndimage.binary_dilation(face, iterations=tw + 3) & (yy < h * 0.42)
    #   밑단 = 아래로 tw 픽셀 안에 망토가 끝나는 곳 (옆선은 제외)
    below = np.zeros_like(cloak)
    below[:-tw] = cloak[tw:]
    hem = cloak & ~below & (yy > h * 0.6)
    trim = (hood_edge | hem) & (inner > 2)
    shade = np.clip(0.55 + 0.45 * (1 - (yy % 14) / 14.0), 0.6, 1.0)[..., None]   # 금실 줄무늬 결
    rgb = np.where(trim[..., None], np.array(st['trim'], np.float32) * shade, rgb)

    # 별 장식 (+ 모양). 위치는 고정 시드
    rng = np.random.default_rng(level * 101)
    spots = np.argwhere(cloak & (inner > st['trim_w'] * 2.2) & ~trim)
    placed = []
    for _ in range(st['stars'] * 40):
        if len(placed) >= st['stars'] or not len(spots):
            break
        y, x = spots[rng.integers(len(spots))]
        if any((y - py) ** 2 + (x - px) ** 2 < 34 ** 2 for py, px in placed):
            continue
        placed.append((y, x))
        col = np.array(st['star_cols'][len(placed) % len(st['star_cols'])], np.float32)
        arm = 6 + (rng.integers(3) == 0) * 5
        core = 3
        rgb[y - core:y + core, x - core:x + core] = col
        rgb[y - arm:y + arm, x - 1:x + 2] = col * 0.92
        rgb[y - 1:y + 2, x - arm:x + arm] = col * 0.92

    # 랜턴 불빛: 오른쪽 위 주황 영역을 밝게 (★6 은 흰금빛 별빛)
    flame = op & (r > 190) & (g > 80) & (b < 140) & (xx > w * 0.72) & (yy > h * 0.25) & (yy < h * 0.62)
    k = st['flame']
    if level == 6:
        # 밝기에 따라 푸른빛 → 흰빛으로 다시 칠함 (별빛 불꽃)
        L = np.clip(((r + g + b) / 3 - 90) / 140, 0, 1)[..., None]
        lit = np.array([110, 160, 235], np.float32) * (1 - L) + np.array([250, 252, 255], np.float32) * L
    else:
        lit = rgb + (255 - rgb) * k
    rgb = np.where(flame[..., None], lit, rgb)

    out = np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8)
    out[~op] = 0
    return Image.fromarray(out, 'RGBA')


def cutout(reg):
    r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
    over = np.minimum(r, b) - g                         # 마젠타 성분
    alpha = np.clip(np.sqrt(((reg - KEY) ** 2).sum(2)) / 140.0, 0, 1)
    alpha = np.minimum(alpha, 1 - np.clip((over / 245.0 - 0.35) / 0.4, 0, 1))

    # 가장 큰 덩어리 + 그 근처 조각만 (옆 컷·라벨 제외)
    solid = alpha > 0.5
    lab, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    near = ndimage.binary_dilation(lab == np.argmax(sizes) + 1, iterations=12)
    keep = [i + 1 for i in range(n) if sizes[i] > 30 and (near & (lab == i + 1)).any()]
    hard = ndimage.binary_opening(np.isin(lab, keep) & solid, iterations=1)

    # 가장자리 언믹스: 관측색 = a·전경 + (1-a)·마젠타 → 전경 복원
    edge = hard & ~ndimage.binary_erosion(hard)
    a3 = np.clip(alpha, 0.35, 1)[..., None]
    rgb = reg.copy()
    rgb[edge] = ((reg - (1 - a3) * KEY) / a3)[edge]
    rgb = np.clip(rgb, 0, 255)
    # 디스필: 바깥 4px 띠는 마젠타 성분을 전부, 안쪽은 원래 보라색이 남도록 약하게
    over = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
    ring = hard & ~ndimage.binary_erosion(hard, iterations=4)
    spill = np.where(ring, np.clip(over, 0, None), np.clip(over - 40, 0, None))
    rgb[..., 0] -= spill
    rgb[..., 2] -= spill

    out = np.zeros(reg.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(hard, 255, 0)
    out[~hard] = 0
    ys, xs = np.nonzero(hard)
    return Image.fromarray(out[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')


def cut_extra(sheet, s):
    """마젠타 위의 따뜻한 색 덩어리(기준점이 속한 것)를 잘라 구멍(눈·입)까지 채움"""
    x0, y0, x1, y1 = s['box']
    reg = sheet[y0:y1, x0:x1]
    r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
    warm = (r > 170) & (b < 130) & (g < 235)
    lab, _ = ndimage.label(warm)
    m = ndimage.binary_fill_holes(lab == lab[s['seed'][1], s['seed'][0]])
    rgb = reg.copy()
    ring = m & ~ndimage.binary_erosion(m, iterations=3)          # 분홍기 도는 가장자리 디스필
    over = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, None)
    rgb[..., 2] -= np.where(ring, over, 0)
    out = np.zeros(reg.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m, 255, 0)
    out[~m] = 0
    ys, xs = np.nonzero(m)
    return Image.fromarray(out[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')


def recolor(img, stops):
    a = np.asarray(img).astype(np.float32)
    L = np.clip((a[..., :3].mean(2) - 40) / 180, 0, 1)
    a[..., :3] = ramp_colors(L, stops)
    a[a[..., 3] == 0] = 0
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def shrink(img, height):
    w = round(img.width * height / img.height)
    small = np.asarray(img.convert('RGBa').resize((w, height), Image.LANCZOS).convert('RGBA')).copy()
    small[small[..., 3] < 8] = 0
    return Image.fromarray(small, 'RGBA')


def data_url(img):
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def main():
    os.makedirs(os.path.join(ROOT, 'assets', 'chars'), exist_ok=True)
    entries = []
    for name, s in SHEETS.items():
        sheet = np.asarray(Image.open(os.path.join(ROOT, s['src'])).convert('RGB')).astype(np.float32)
        x0, y0, x1, y1 = s['box']
        full = cutout(sheet[y0:y1, x0:x1])
        variants = [(name, full)] + [(n, evolve_art(full, lv)) for n, lv in s.get('forms', {}).items()]
        for out_name, art in variants:
            body = shrink(art, s['height'])
            head = shrink(art, s.get('head_height', s['height'])).crop(s['head'])
            body.save(os.path.join(ROOT, 'assets', 'chars', out_name + '.png'), optimize=True)
            head.save(os.path.join(ROOT, 'assets', 'chars', out_name + '_head.png'), optimize=True)
            entries.append(f"    {out_name}: {{ w: {body.width}, h: {body.height}, headW: {head.width}, headH: {head.height},\n"
                           f"      body: '{data_url(body)}',\n"
                           f"      head: '{data_url(head)}' }}")
            print(out_name, 'body', body.size, 'head', head.size)
    for name, s in EXTRAS.items():
        sheet = np.asarray(Image.open(os.path.join(ROOT, s['src'])).convert('RGB')).astype(np.float32)
        art = cut_extra(sheet, s)
        for out_name, img in [(name, art)] + [(n, recolor(art, stops)) for n, stops in s.get('recolor', {}).items()]:
            body = shrink(img, s['height'])
            body.save(os.path.join(ROOT, 'assets', 'chars', out_name + '.png'), optimize=True)
            entries.append(f"    {out_name}: {{ w: {body.width}, h: {body.height},\n"
                           f"      body: '{data_url(body)}' }}")
            print(out_name, 'body', body.size)

    js = ("// 자동 생성 파일 — 직접 수정하지 말 것. tools/cutout_sprite.py 로 다시 만든다.\n"
          "// 일러스트 캐릭터 정지 이미지 (data URL: file:// 로 열어도 WebGL 텍스처로 쓸 수 있음)\n"
          "(function (G) {\n  'use strict';\n\n  G.SpriteData = {\n"
          + ',\n'.join(entries) + "\n  };\n})(window.Game = window.Game || {});\n")
    with open(os.path.join(ROOT, 'src', 'ui', 'SpriteData.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)


if __name__ == '__main__':
    main()
