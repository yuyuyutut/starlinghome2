/**
 * lib/iosKeyboard.ts — iOS 真机键盘适配
 *
 * iOS 上键盘弹出时不会自动把聚焦的输入框滚进可视区（尤其页面根节点
 * 是固定高度布局时），输入框经常被键盘/导航栏盖住一半。
 *
 * 这里做两件事：
 *  1. focusin 后延迟定位（等键盘弹出动画约 300ms 结束），把聚焦输入框
 *     滚进可视区；
 *  2. 可视高度变化（键盘弹起/收起、横竖屏切换）时，若仍有聚焦输入框，
 *     重新定位一次。
 *
 * 注意：绝不能用 scrollIntoView —— 它会连带滚动文档。iOS 键盘弹出本身
 * 就会平移 WebView，期间用变化中的坐标滚文档会形成正反馈，把整页顶出
 * 屏幕。这里只向上寻找应用内部最近的可滚动祖先容器，调整它的 scrollTop；
 * 聊天页输入栏位于根布局底部，根高度随 visualViewport 收缩后自然落在
 * 键盘上方，没有可滚祖先时直接安全返回。
 */
import { useEffect } from "react";

function scrollActiveIntoView() {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      const elRect = el.getBoundingClientRect();
      const boxRect = node.getBoundingClientRect();
      const pad = 16;
      if (elRect.bottom > boxRect.bottom - pad) {
        node.scrollTop += elRect.bottom - (boxRect.bottom - pad);
      } else if (elRect.top < boxRect.top + pad) {
        node.scrollTop -= boxRect.top + pad - elRect.top;
      }
      return; // 处理最近一个滚动容器即可
    }
    node = node.parentElement;
  }
}

export function useIosKeyboardPolish() {
  useEffect(() => {
    let timer: number | undefined;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scrollActiveIntoView, delay);
    };

    /* 输入框获得焦点：等键盘动画结束再滚动定位 */
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) schedule(350);
    };

    /* 可视高度变化（键盘收起/切换）后重新定位 */
    const vv = window.visualViewport;
    const onViewportChange = () => schedule(120);

    document.addEventListener("focusin", onFocusIn);
    vv?.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      vv?.removeEventListener("resize", onViewportChange);
      window.clearTimeout(timer);
    };
  }, []);
}
