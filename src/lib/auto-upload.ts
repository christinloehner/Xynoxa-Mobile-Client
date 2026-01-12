import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as MediaLibrary from "expo-media-library";
import { loadSettings, saveSettings, type MobileSettings } from "./storage";
import { uploadFile, listFolders, listFiles, createFolder } from "./api";
import type { AuthConfig } from "./storage";

export const BACKGROUND_UPLOAD_TASK = "xynoxa-auto-upload";
const LEGACY_BACKGROUND_UPLOAD_TASK = "xynoxa-auto-upload";

type ExistingFilesResult = {
  folderId: string | null;
  filenames: Set<string>;
};

function normalizePathSegments(targetPath?: string) {
  const trimmed = (targetPath || "").replace(/^\/+|\/+$/g, "");
  if (!trimmed) return [];
  return trimmed.split("/").filter(Boolean);
}

async function resolveOrCreateFolderIdByPath(auth: AuthConfig, targetPath?: string): Promise<string | null> {
  const parts = normalizePathSegments(targetPath);
  if (!parts.length) return null;
  let currentId: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    const folders = (await listFolders(auth, currentId)) as Array<{ id: string; name: string; isGroupFolder?: boolean }>;
    const found = folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (found) {
      currentId = found.id;
      continue;
    }
    const created = await createFolder(auth, name, currentId);
    const createdId = created?.id || created?.folder?.id;
    if (!createdId) {
      return null;
    }
    currentId = createdId;
  }

  return currentId;
}

async function loadExistingFiles(auth: AuthConfig, targetPath?: string): Promise<ExistingFilesResult> {
  const folderId = await resolveOrCreateFolderIdByPath(auth, targetPath);
  const files = (await listFiles(auth, folderId)) as Array<{ path: string }>;
  const filenames = new Set<string>();
  files.forEach((file) => {
    const name = (file.path || "").split("/").pop() || file.path;
    if (name) filenames.add(name.toLowerCase());
  });
  return { folderId, filenames };
}

function getAssetDate(assetTime?: number) {
  if (!assetTime) return new Date();
  const ms = assetTime < 1_000_000_000_000 ? assetTime * 1000 : assetTime;
  return new Date(ms);
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function buildDatedTargetPath(basePath: string | undefined, assetTime?: number) {
  const trimmed = (basePath || "").replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  const date = getAssetDate(assetTime);
  const year = date.getFullYear().toString();
  const month = pad2(date.getMonth() + 1);
  return `${trimmed}/${year}/${month}`;
}

export async function runAutoUpload(settings: MobileSettings) {
  if (!settings.auth || !settings.autoUploadEnabled) {
    return { uploaded: 0, failed: 0, skipped: 0 };
  }

  const perm = await MediaLibrary.getPermissionsAsync(false, ["photo", "video"]);
  if (!perm.granted) {
    const req = await MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]);
    if (!req.granted) {
      return { uploaded: 0 };
    }
  }

  let uploaded = 0;
  let failed = 0;
  let skipped = 0;
  const nextSettings: MobileSettings = {
    ...settings,
    albums: settings.albums.map((a) => ({ ...a }))
  };
  const existingCache = new Map<string, ExistingFilesResult>();

  for (const album of nextSettings.albums) {
    if (!album.enabled) continue;
    const albumRef = album.albumId || album.albumTitle;
    if (!albumRef) continue;

    let hasNextPage = true;
    let after: string | undefined = undefined;
    const cutoff = album.lastUploadedAt ?? 0;
    let stop = false;

    while (hasNextPage) {
      const page = await MediaLibrary.getAssetsAsync({
        album: albumRef,
        first: 50,
        after,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]]
      });

      for (const asset of page.assets) {
        if (asset.creationTime <= cutoff) {
          stop = true;
          break;
        }
        const assetName = (asset.filename || `photo-${asset.id}.jpg`).toLowerCase();
        const datedTargetPath = buildDatedTargetPath(album.targetPath, asset.creationTime);
        let existing = existingCache.get(datedTargetPath);
        if (!existing) {
          try {
            existing = await loadExistingFiles(settings.auth, datedTargetPath);
            existingCache.set(datedTargetPath, existing);
          } catch {
            existing = null;
          }
        }
        if (existing?.filenames.has(assetName)) {
          skipped += 1;
          if (!album.lastUploadedAt || asset.creationTime > album.lastUploadedAt) {
            album.lastUploadedAt = asset.creationTime;
          }
          continue;
        }
        const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
        const uploadUri = info.localUri || asset.uri;
        try {
          await uploadFile(
            settings.auth,
            uploadUri,
            asset.filename || `photo-${asset.id}.jpg`,
            asset.mimeType || "image/jpeg",
            datedTargetPath || album.targetPath
          );
          uploaded += 1;
          if (!album.lastUploadedAt || asset.creationTime > album.lastUploadedAt) {
            album.lastUploadedAt = asset.creationTime;
          }
        } catch {
          failed += 1;
        }
      }

      if (stop) break;
      hasNextPage = page.hasNextPage;
      after = page.endCursor ?? undefined;
    }
  }

  await saveSettings(nextSettings);
  return { uploaded, failed, skipped };
}

TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
  try {
    const settings = await loadSettings();
    if (!settings.autoUploadEnabled) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    const res = await runAutoUpload(settings);
    return res.uploaded > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

TaskManager.defineTask(LEGACY_BACKGROUND_UPLOAD_TASK, async () => {
  try {
    const settings = await loadSettings();
    if (!settings.autoUploadEnabled) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    const res = await runAutoUpload(settings);
    return res.uploaded > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function ensureBackgroundTask(enabled: boolean) {
  const status = await BackgroundFetch.getStatusAsync();
  if (status !== BackgroundFetch.BackgroundFetchStatus.Available) {
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_UPLOAD_TASK);
  const legacyRegistered = await TaskManager.isTaskRegisteredAsync(LEGACY_BACKGROUND_UPLOAD_TASK);
  if (enabled && !isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
      minimumInterval: 15 * 60
    });
  }
  if (enabled && legacyRegistered) {
    await BackgroundFetch.unregisterTaskAsync(LEGACY_BACKGROUND_UPLOAD_TASK);
  }
  if (!enabled && isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_UPLOAD_TASK);
  }
}
