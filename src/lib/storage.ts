import AsyncStorage from "@react-native-async-storage/async-storage";

export type AuthConfig = {
  baseUrl: string;
  token: string;
};

export type AlbumSetting = {
  albumId: string;
  albumTitle: string;
  enabled: boolean;
  targetPath: string;
  lastUploadedAt?: number;
};

export type MobileSettings = {
  auth?: AuthConfig;
  autoUploadEnabled: boolean;
  albums: AlbumSetting[];
};

const STORAGE_KEY = "xynoxa-mobile-settings";
const LEGACY_STORAGE_KEY = "xynoxa-mobile-settings";

export async function loadSettings(): Promise<MobileSettings> {
  const raw = (await AsyncStorage.getItem(STORAGE_KEY)) ?? (await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
  if (!raw) {
    return { autoUploadEnabled: false, albums: [] };
  }
  try {
    const parsed = JSON.parse(raw) as MobileSettings;
    if (!await AsyncStorage.getItem(STORAGE_KEY)) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return {
      autoUploadEnabled: Boolean(parsed.autoUploadEnabled),
      albums: Array.isArray(parsed.albums) ? parsed.albums : [],
      auth: parsed.auth
    };
  } catch {
    return { autoUploadEnabled: false, albums: [] };
  }
}

export async function saveSettings(settings: MobileSettings) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function updateSettings(mutator: (current: MobileSettings) => MobileSettings) {
  const current = await loadSettings();
  const next = mutator(current);
  await saveSettings(next);
  return next;
}
