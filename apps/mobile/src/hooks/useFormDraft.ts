import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { draftKey, readDraft, writeDraft, type DraftFields } from "../drafts/form-draft";

export function useFormDraft<T extends DraftFields>({ owner, form, fields, defaults, restore }: {
  owner: string | null | undefined; form: string; fields: T; defaults: T; restore: (value: T) => void;
}) {
  const key = draftKey(owner, form);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const current = useRef({ fields, defaults, restore });
  current.current = { fields, defaults, restore };
  const skip = useRef<string | null>(null);
  const serialized = JSON.stringify(fields);
  useEffect(() => {
    let active = true;
    setReady(false);
    void readDraft(SecureStore, key, current.current.defaults).then(saved => {
      if (active && saved) { current.current.restore(saved); setNotice("Your unfinished draft was restored."); }
    }).catch(() => { if (active) setError("Draft storage is unavailable. Keep this screen open until you finish."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (!ready || skip.current === serialized) return;
    skip.current = null;
    const empty = serialized === JSON.stringify(current.current.defaults);
    const save = () => {
      if (skip.current === serialized) return;
      void writeDraft(SecureStore, key, empty ? null : JSON.parse(serialized)).catch(() => setError("Your draft couldn’t be saved on this device. Keep this screen open until you finish."));
    };
    const timer = setTimeout(save, 300);
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") { clearTimeout(timer); save(); } });
    return () => { clearTimeout(timer); subscription.remove(); save(); };
  }, [key, ready, serialized]);
  async function clear() {
    skip.current = JSON.stringify(current.current.fields);
    setNotice("");
    try { await writeDraft(SecureStore, key, null); setError(""); }
    catch { setError("The saved draft couldn’t be cleared. Try again before leaving this screen."); throw new Error("Draft cleanup failed"); }
  }
  async function discard() { await clear(); current.current.restore(current.current.defaults); }
  return { ready, notice, error, clear, discard, hasContent: serialized !== JSON.stringify(defaults) };
}
