import superjson from "superjson";
import * as FileSystem from "expo-file-system";
import type { AuthConfig } from "./storage";

export type TrpcResponse<T> = { result?: { data?: { json?: any; meta?: any } }; error?: { message?: string } };

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

function serializeInput(input?: unknown) {
  if (input === undefined) return undefined;
  return superjson.serialize(input);
}

async function trpcQuery<T>(auth: AuthConfig, path: string, input?: unknown): Promise<T> {
  const urlBase = normalizeBaseUrl(auth.baseUrl);
  const serialized = serializeInput(input);
  const query = serialized ? `?input=${encodeURIComponent(JSON.stringify(serialized))}` : "";
  const url = `${urlBase}/api/trpc/${path}${query}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.token}`
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as TrpcResponse<T>;
  if (data.error) {
    throw new Error(data.error.message || "tRPC Fehler");
  }
  const payload = data?.result?.data;
  if (!payload) return undefined as T;
  return superjson.deserialize(payload) as T;
}

export async function me(auth: AuthConfig) {
  return trpcQuery<{ user: { id: string; email: string; role: string } | null }>(auth, "auth.me");
}

export async function loginWithPassword(baseUrl: string, email: string, password: string) {
  const urlBase = normalizeBaseUrl(baseUrl);
  const res = await fetch(`${urlBase}/api/mobile/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      password,
      tokenName: "Mobile Client"
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return (await res.json()) as { token: string; userId: string; role: string };
}

export async function listFolders(auth: AuthConfig, parentId?: string | null) {
  return trpcQuery<any[]>(auth, "folders.list", parentId === undefined ? undefined : { parentId });
}

export async function createFolder(auth: AuthConfig, name: string, parentId?: string | null) {
  return trpcMutation<any>(auth, "folders.create", { name, parentId });
}

export async function listFiles(auth: AuthConfig, folderId?: string | null) {
  return trpcQuery<any[]>(auth, "files.list", folderId === undefined ? undefined : { folderId });
}

async function trpcMutation<T>(auth: AuthConfig, path: string, input?: unknown): Promise<T> {
  const urlBase = normalizeBaseUrl(auth.baseUrl);
  const serialized = serializeInput(input);
  const url = `${urlBase}/api/trpc/${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.token}`
    },
    body: JSON.stringify({ input: serialized })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as TrpcResponse<T>;
  if (data.error) {
    throw new Error(data.error.message || "tRPC Fehler");
  }
  const payload = data?.result?.data;
  if (!payload) return undefined as T;
  return superjson.deserialize(payload) as T;
}

export async function moveFile(auth: AuthConfig, id: string, folderId: string | null) {
  return trpcMutation<any>(auth, "files.move", { id, folderId });
}

export async function copyFile(auth: AuthConfig, id: string, folderId: string | null) {
  return trpcMutation<any>(auth, "files.copy", { id, folderId });
}

export async function deleteFile(auth: AuthConfig, fileId: string) {
  return trpcMutation<any>(auth, "files.softDelete", { fileId });
}

export async function downloadFile(auth: AuthConfig, fileId: string, filename: string) {
  const urlBase = normalizeBaseUrl(auth.baseUrl);
  const targetDir = `${FileSystem.documentDirectory}Xynoxa`;
  await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
  const targetPath = `${targetDir}/${filename}`;

  const res = await FileSystem.downloadAsync(
    `${urlBase}/api/files/download?id=${encodeURIComponent(fileId)}`,
    targetPath,
    { headers: { authorization: `Bearer ${auth.token}` } }
  );

  return res.uri;
}

export async function uploadFile(auth: AuthConfig, assetUri: string, filename: string, mimeType: string, targetPath?: string) {
  const urlBase = normalizeBaseUrl(auth.baseUrl);
  const safePath = targetPath ? targetPath.replace(/^\/+|\/+$/g, "") : "";
  const originalName = safePath ? `${safePath}/${filename}` : filename;

  const res = await FileSystem.uploadAsync(`${urlBase}/api/upload`, assetUri, {
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: mimeType || "application/octet-stream",
    parameters: {
      originalName: encodeURIComponent(originalName)
    },
    headers: {
      authorization: `Bearer ${auth.token}`
    }
  });

  if (res.status !== 200 && res.status !== 201 && res.status !== 409) {
    throw new Error(res.body || `HTTP ${res.status}`);
  }

  return res.status === 200 || res.status === 201;
}
