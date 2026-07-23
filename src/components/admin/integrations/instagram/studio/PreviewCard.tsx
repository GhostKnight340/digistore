import type { StudioFormat, StudioMediaDescriptor } from "@/lib/composio/instagram/types";
import { C, fmtDuration } from "./tokens";
import { Icon } from "./Icon";

/** Striped placeholder block with a monospace label (matches the handoff). */
function Striped({ label }: { label: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background:
          "repeating-linear-gradient(135deg,#15161b,#15161b 10px,#1a1b21 10px,#1a1b21 20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 10,
      }}
    >
      <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, color: C.faint, letterSpacing: ".03em" }}>
        {label}
      </span>
    </div>
  );
}

/**
 * Instagram-style live preview card. Visual-only: it never mutates composer
 * state. Reflects the current media, caption and hashtags exactly as they will
 * read in the feed.
 */
export function PreviewCard({
  width = 320,
  format,
  media,
  caption,
  hashtags,
  handle,
  avatarUrl,
}: {
  width?: number;
  format: StudioFormat;
  media: StudioMediaDescriptor[];
  caption: string;
  hashtags: string[];
  handle: string;
  avatarUrl?: string | null;
}) {
  const isReel = format === "reel";
  const isStory = format === "story";
  const mediaBoxH = isStory || isReel ? Math.round(width * 1.6) : width;
  const m0 = media[0];

  let inner: React.ReactNode;
  if (!m0) {
    inner = <Striped label={isReel ? "APERÇU REEL · 9:16" : isStory ? "APERÇU STORY · 9:16" : "APERÇU MÉDIA"} />;
  } else if (m0.type === "video") {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    inner = <video src={m0.url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  } else {
    // eslint-disable-next-line @next/next/no-img-element
    inner = <img src={m0.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }

  const captionNode = caption ? caption.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line}
    </span>
  )) : null;
  const hashtagStr = hashtags.length ? hashtags.join(" ") : "";

  const avatarBase = {
    width: 28,
    height: 28,
    borderRadius: "50%",
    flexShrink: 0,
    objectFit: "cover" as const,
  };
  const avatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" style={avatarBase} />
  ) : (
    <div style={{ ...avatarBase, background: "linear-gradient(145deg,#f58529,#dd2a7b,#515bd4)" }} />
  );

  return (
    <div style={{ width, borderRadius: 14, overflow: "hidden", background: C.card, border: `1px solid ${C.borderInput}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 12px" }}>
        {avatar}
        <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{handle}</span>
        <Icon name="more" size={15} color={C.dim2} />
      </div>
      <div style={{ width: "100%", height: mediaBoxH, position: "relative", background: "#000" }}>
        {inner}
        {isReel && m0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(0,0,0,.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="play" size={18} color="#fff" />
            </div>
          </div>
        )}
        {isReel && m0?.duration ? (
          <span
            style={{
              position: "absolute",
              bottom: 9,
              right: 9,
              background: "rgba(0,0,0,.6)",
              color: "#fff",
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 6,
            }}
          >
            {fmtDuration(m0.duration)}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 12px 0" }}>
        <Icon name="heart" size={19} color={C.accentTextBright} strokeWidth={1.7} />
        <Icon name="comment" size={19} color={C.accentTextBright} strokeWidth={1.7} />
        <Icon name="send" size={19} color={C.accentTextBright} strokeWidth={1.7} />
        <div style={{ flex: 1 }} />
        <Icon name="bookmark" size={19} color={C.accentTextBright} strokeWidth={1.7} />
      </div>
      <div style={{ padding: "9px 12px 13px", fontSize: 12.5, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 600 }}>{handle}</span> {captionNode}
        {caption && hashtagStr ? " " : ""}
        {hashtagStr && <span style={{ color: C.accentText }}>{hashtagStr}</span>}
      </div>
      <div
        style={{
          padding: "0 12px 12px",
          fontSize: 10.5,
          color: C.faint,
          textTransform: "uppercase",
          letterSpacing: ".02em",
        }}
      >
        Il y a quelques secondes
      </div>
    </div>
  );
}
