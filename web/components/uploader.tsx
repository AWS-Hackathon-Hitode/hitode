"use client";

import { useRef, useState } from "react";

export function S3Uploader({ disabled = false }: { disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("");

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("署名URL取得中...");

    // 署名URLを取得
    const res = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`失敗: ${err.error ?? res.statusText}`);
      return;
    }

    const { uploadUrl, key } = (await res.json()) as {
      uploadUrl: string;
      key: string;
    };

    setStatus("S3へアップロード中...");

    // S3へ直PUT
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!put.ok) {
      setStatus(`アップロード失敗: ${put.status}`);
      return;
    }

    setStatus(`完了！ S3 key: ${key}`);

    // 同じファイルを再アップしたい時のためにクリア
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex h-8 items-center rounded-lg border px-3 text-xs hover:bg-accent disabled:opacity-50"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        S3にアップロード
      </button>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={onPickFile}
      />

      {status && <span className="text-xs opacity-70">{status}</span>}
    </div>
  );
}