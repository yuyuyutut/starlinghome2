/**
 * LockSettings — 设置页「Verrou · 门锁与口令」区块：
 *  开关（随「保存设置」生效）+ 修改口令（立即生效，六位数字）。
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Section } from "../settings/Section";
import { changePass, isPassDefault } from "./pass";

export function LockSettings({ lockEnabled, onToggle }: { lockEnabled: boolean; onToggle: (v: boolean) => void }) {
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const doChange = () => {
    if (newPass !== confirm) {
      setMsg({ ok: false, text: "两次输入的新口令不一致" });
      return;
    }
    const err = changePass(oldPass.trim(), newPass.trim());
    if (err) {
      setMsg({ ok: false, text: err });
    } else {
      setMsg({ ok: true, text: "口令已更新，下次进门生效" });
      setOldPass("");
      setNewPass("");
      setConfirm("");
    }
  };

  const inputCls = "h-9 rounded-xl border-black/15 bg-white/40 text-center text-[14px] tracking-[0.3em]";

  return (
    <Section zh="门锁与口令" fr="Verrou">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-normal text-black/60">启用开屏门锁（风铃 · 口令）</p>
        <Switch checked={lockEnabled} onCheckedChange={onToggle} />
      </div>
      <p className="font-caption mt-2 text-[12.5px] leading-relaxed text-black/45">
        — 打开后，每次进入小屋先见风铃，拉下绳结并输入口令；口令只存本浏览器，不进备份
      </p>

      {lockEnabled && (
        <div className="mt-4 space-y-2.5">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder={isPassDefault() ? "现在的口令（默认 111111）" : "现在的口令"}
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value.replace(/\D/g, ""))}
            className={inputCls}
          />
          <div className="flex gap-2.5">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="新口令（6 位数字）"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
            />
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="再输一遍"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
            />
          </div>
          <Button
            onClick={doChange}
            variant="secondary"
            className="glass h-9 w-full rounded-full text-[13px] font-normal text-black/70 hover:bg-white/70"
          >
            更新口令
          </Button>
          <p className={`font-caption h-4 text-[12px] ${msg ? (msg.ok ? "text-black/50" : "text-rose/80") : ""}`}>
            {msg ? (msg.ok ? `— ${msg.text}` : msg.text) : ""}
          </p>
        </div>
      )}
    </Section>
  );
}
