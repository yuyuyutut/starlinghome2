/**
 * character/Avatar.tsx — 角色头像
 * 优先显示插画头像（avatarImg），否则显示去色处理的 emoji。
 */
import type { CharacterCard } from "./types";
import { AVATAR_FOX } from "@/assets-gen";

export function Avatar({ card, className = "" }: { card: CharacterCard; className?: string }) {
  const base = `grid shrink-0 select-none place-items-center overflow-hidden rounded-2xl ${className}`;
  if (card.avatarImg) {
    const src = card.avatarImg === "builtin:fox" ? AVATAR_FOX : card.avatarImg;
    return <img src={src} alt={card.name} className={`${base} object-cover`} draggable={false} />;
  }
  return (
    <div className={`${base} bg-white/60`}>
      <span className="emoji-mono leading-none">{card.avatar}</span>
    </div>
  );
}
