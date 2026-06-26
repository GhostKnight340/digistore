"use client";

type UploadResponse = {
  url?: unknown;
  error?: unknown;
};

export async function uploadImageFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  const contentType = res.headers.get("content-type") ?? "";
  let payload: UploadResponse | null = null;

  if (contentType.includes("application/json")) {
    try {
      payload = (await res.json()) as UploadResponse;
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Upload failed.",
    );
  }

  if (typeof payload?.url !== "string" || payload.url.length === 0) {
    throw new Error("Upload response was invalid.");
  }

  return payload.url;
}
