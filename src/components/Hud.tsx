"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { audioBus } from "@/audio/audioBus";
import { useSettings } from "@/store/settings";

export function Hud({ backHref }: { backHref?: string }) {
  const t = useTranslations("hud");
  const locale = useLocale();
  const pathname = usePathname();
  const { muted, toggleMuted } = useSettings();

  useEffect(() => audioBus().setMuted(muted), [muted]);

  const btn =
    "rounded-full border border-white/10 bg-panel/80 px-3 py-1.5 text-sm text-text backdrop-blur transition hover:border-partition/60 hover:text-partition focus-visible:outline-2 focus-visible:outline-partition";

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      {backHref && (
        <Link href={backHref} className={btn}>
          ← {t("back")}
        </Link>
      )}
      <button
        type="button"
        className={btn}
        onClick={toggleMuted}
        aria-pressed={muted}
        aria-label={muted ? t("unmute") : t("mute")}
        title={`${muted ? t("unmute") : t("mute")} (M)`}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <Link href={pathname} locale={locale === "en" ? "es" : "en"} className={btn} lang={locale === "en" ? "es" : "en"}>
        {t("language")}
      </Link>
    </div>
  );
}
