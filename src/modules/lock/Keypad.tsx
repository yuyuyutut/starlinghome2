/**
 * Keypad — 门锁数字键盘：半透明磨砂键帽、微微凸起，按下回沉。
 * 布局 1-9 / ⌫ 0 确定（保持九宫格式样）。
 */
import { Delete } from "lucide-react";

const KEYS: (string | null)[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"];

export function Keypad({
  onKey,
  okDisabled,
  disabled,
}: {
  onKey: (k: string) => void;
  okDisabled?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[300px] grid-cols-3 gap-x-5 gap-y-3.5">
      {KEYS.map((k, i) => {
        if (k === null) return <span key={`blank-${i}`} />;
        if (k === "del")
          return (
            <button
              key={k}
              disabled={disabled}
              onClick={() => onKey("del")}
              aria-label="删除一位"
              className="key-cap grid h-[60px] place-items-center rounded-[20px] text-[#2b2b2b]/70 transition-[transform,box-shadow] duration-150 active:translate-y-[3px] disabled:opacity-50"
            >
              <Delete className="h-5 w-5" strokeWidth={1.6} />
            </button>
          );
        if (k === "ok")
          return (
            <button
              key={k}
              disabled={disabled || okDisabled}
              onClick={() => onKey("ok")}
              className="key-cap-ok h-[60px] rounded-[20px] text-[16px] font-normal tracking-[0.2em] text-white transition-[transform,box-shadow] duration-150 active:translate-y-[3px] disabled:opacity-40"
            >
              确定
            </button>
          );
        return (
          <button
            key={k}
            disabled={disabled}
            onClick={() => onKey(k)}
            className="key-cap h-[60px] rounded-[20px] text-[22px] font-normal text-[#2b2b2b] transition-[transform,box-shadow] duration-150 active:translate-y-[3px] disabled:opacity-50"
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}
