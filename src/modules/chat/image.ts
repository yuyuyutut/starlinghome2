/**
 * chat/image.ts — 发送图片的本地压缩（设置里「图片识别」开关的真实功能载体）
 * 发送前把图片缩到 1024px 内并转 JPEG data URI，控制体积后随消息存 IndexedDB、发给模型。
 */

export async function fileToDataUri(file: File, maxSide = 1024, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持图片处理");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close();
  }
}
