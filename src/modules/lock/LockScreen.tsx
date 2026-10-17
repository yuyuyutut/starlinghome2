/**
 * LockScreen — 开屏门锁：
 *  1. 大门相：白色巴洛克大门，轻叩门扉后门扇打开（BaroqueGate）；
 *  2. 键盘相：输入六位口令（默认 111111，可在设置修改），正确则进入小屋。
 */
import { useState } from "react";
import { BG_LOCK } from "@/assets-gen";
import { BaroqueGate } from "./BaroqueGate";
import { Keypad } from "./Keypad";
import { verifyPass } from "./pass";

const CODE_LEN = 6;

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [phase, setPhase] = useState<"gate" | "keypad">("gate");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "wrong" | "ok">("idle");

  const submit = (next: string) => {
    if (verifyPass(next)) {
      setStatus("ok");
      window.setTimeout(onUnlock, 480);
    } else {
      setStatus("wrong");
      window.setTimeout(() => {
        setCode("");
        setStatus("idle");
      }, 520);
    }
  };

  const press = (k: string) => {
    if (status === "ok") return;
    if (k === "del") {
      setCode((c) => c.slice(0, -1));
      setStatus("idle");
      return;
    }
    if (k === "ok") {
      if (code.length === CODE_LEN) submit(code);
      return;
    }
    if (code.length >= CODE_LEN) return;
    setCode((c) => c + k);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden">
      {/* 背景与主应用同款：庭院插画 + 白色雾面 */}
      <div className="fixed inset-0 -z-10">
        <img src={BG_LOCK} alt="" className="h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/15 to-white/40" />
      </div>

      {phase === "gate" ? (
        <BaroqueGate onOpen={() => setPhase("keypad")} />
      ) : (
        <div className="bubble-in flex h-full flex-col items-center px-6 pb-10 pt-[13vh]">
          {/* 标题区 */}
          <h1 className="font-script text-[44px] leading-tight text-[#1f1f1f]">L&rsquo;Observatoire</h1>
          <p className="mt-3 text-[16px] font-normal tracking-wide text-black/70">
            观象台已落锁。输入口令进门。
          </p>
          <p className="font-caption mt-2.5 text-[12.5px] tracking-[0.18em] text-black/45">
            deuxième clef · 二级密码 · 星位
          </p>

          {/* 六位圆点：随输入点亮，错误摇晃，正确弹亮 */}
          <div
            className={`mt-[5vh] flex items-center gap-5 ${status === "wrong" ? "shake-x" : ""}`}
            aria-label="口令进度"
          >
            {Array.from({ length: CODE_LEN }, (_, i) => {
              const filled = i < code.length;
              return (
                <span
                  key={i}
                  className={`block rounded-full transition-all duration-200 ${
                    status === "ok" && filled
                      ? "dot-ok bg-[#2b2b2b]"
                      : filled
                        ? status === "wrong"
                          ? "bg-rose/70"
                          : "bg-[#2b2b2b]"
                        : "bg-black/15"
                  } h-[9px] w-[9px]`}
                />
              );
            })}
          </div>
          <p className="font-caption mt-3 h-5 text-[12px] tracking-wider text-rose/80">
            {status === "wrong" ? "— 口令不对，再试一次" : ""}
          </p>

          {/* 键盘沉在底部 */}
          <div className="mt-auto w-full">
            <Keypad onKey={press} okDisabled={code.length < CODE_LEN} disabled={status === "ok"} />
            <p className="font-caption mt-6 text-center text-[11.5px] tracking-[0.14em] text-black/35">
              — 口令可在「设置 · Verrou 门锁与口令」中修改
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
