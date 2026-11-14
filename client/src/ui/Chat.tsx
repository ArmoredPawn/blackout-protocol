import { useEffect, useRef, useState } from "react";
import { net } from "../net/connection";
import { useApp } from "../store";
import { input } from "../game/input";

/** Room chat. Inline in the lobby; in-game it fades and opens with Enter or /. */
export function ChatBox({ inline = false }: { inline?: boolean }) {
  const chat = useApp((s) => s.chat);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(inline);
  const ref = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (inline) return;
    const off = input.on((a, down) => {
      if (a === "chat" && down && !open) {
        setOpen(true);
        input.releaseAll();
        setTimeout(() => ref.current?.focus(), 0);
      }
    });
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [inline, open]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.length]);

  const send = () => {
    const t = text.trim();
    if (t) net.send("chat", t);
    setText("");
    if (!inline) {
      setOpen(false);
      ref.current?.blur();
    }
  };

  const now = Date.now();
  const lines = inline ? chat.slice(-40) : chat.filter((c) => open || now - c.id < 10000).slice(-6);
  return (
    <div className={inline ? "col" : "chat"} style={inline ? { gap: 8, minHeight: 0, flex: 1 } : undefined}>
      <div ref={list} className="col" style={{ gap: 4, overflowY: inline ? "auto" : "visible", maxHeight: inline ? 180 : undefined }}>
        {lines.length === 0 && inline && <span className="muted" style={{ fontSize: 13 }}>Say hi to your room.</span>}
        {lines.map((c) => (
          <div key={c.id} className="chat-line">
            <b style={{ color: c.self ? "var(--accent)" : "#cdd6e6" }}>{c.name}:</b> {c.text}
          </div>
        ))}
      </div>
      {open && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={ref}
            className="input"
            value={text}
            maxLength={160}
            placeholder={inline ? "Message the room" : "Press Enter to send, Esc to cancel"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !inline) {
                setOpen(false);
                ref.current?.blur();
              }
            }}
            onBlur={() => !inline && !text && setOpen(false)}
          />
          {inline && (
            <button className="btn" type="submit">
              Send
            </button>
          )}
        </form>
      )}
    </div>
  );
}
