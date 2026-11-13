import chinese from './zh-CN.json';
import chineseFont from './runtime/NotoSansSC-subset.woff2?url&no-inline';

export async function chineseAssets() {
  const font = new FontFace('Greenhouse CJK', 'url("' + chineseFont + '")', { weight: '700' });
  document.fonts.add(await font.load());
  const glyphs = [...new Set(Object.values(chinese).join(''))].filter(character => character.codePointAt(0)! >= 0x2000).sort();
  const cell = 32;
  const columns = 32;
  const atlas = document.createElement('canvas');
  atlas.width = cell * columns;
  atlas.height = cell * Math.ceil(glyphs.length / columns);
  const context = atlas.getContext('2d')!;
  context.font = '700 28px "Greenhouse CJK", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'white';
  const index = new Uint8Array(glyphs.length * 4);
  const codepoints = new DataView(index.buffer);
  glyphs.forEach((character, position) => {
    context.fillText(character, (position % columns + 0.5) * cell, (Math.floor(position / columns) + 0.5) * cell);
    codepoints.setUint32(position * 4, character.codePointAt(0)!, true);
  });
  const png = await new Promise<Blob>((resolve, reject) => {
    atlas.toBlob(blob => blob ? resolve(blob) : reject(new Error('中文字体加载失败。')));
  });
  const entries = Object.entries(chinese).map(([key, value]) => {
    const escaped = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return '<String id="' + key + '">' + escaped + '</String>';
  }).join('\n');
  return { entries, index, image: new Uint8Array(await png.arrayBuffer()) };
}
