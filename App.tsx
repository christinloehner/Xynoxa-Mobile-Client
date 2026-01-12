import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import { me, listFiles, listFolders, deleteFile, moveFile, copyFile, downloadFile, loginWithPassword } from "./src/lib/api";
import { loadSettings, saveSettings, type MobileSettings, type AuthConfig, type AlbumSetting } from "./src/lib/storage";
import { ensureBackgroundTask, runAutoUpload } from "./src/lib/auto-upload";

const DEFAULT_BASE_URL = "https://cloud.xynoxa.com";

type FolderItem = {
  id: string;
  name: string;
  isGroupFolder?: boolean;
};

type FileItem = {
  id: string;
  path: string;
  size?: string;
  updatedAt?: string;
  mime?: string;
};

type FolderStackItem = {
  id: string | null;
  name: string;
};

export default function App() {
  const [settings, setSettings] = useState<MobileSettings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const saveAll = async (next: MobileSettings) => {
    setSettings(next);
    await saveSettings(next);
  };

  if (!settings) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#45E6C5" />
        <Text style={styles.mutedText}>Lade Einstellungen...</Text>
      </SafeAreaView>
    );
  }

  if (!settings.auth) {
    return (
      <LoginScreen
        initialBaseUrl={DEFAULT_BASE_URL}
        onAuthenticated={async (auth) => {
          const next = { ...settings, auth };
          await saveAll(next);
        }}
      />
    );
  }

  return (
    <MainApp
      settings={settings}
      onUpdateSettings={saveAll}
      onLogout={async () => {
        const next = { ...settings, auth: undefined };
        await saveAll(next);
      }}
    />
  );
}

function LoginScreen({
  initialBaseUrl,
  onAuthenticated
}: {
  initialBaseUrl: string;
  onAuthenticated: (auth: AuthConfig) => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!baseUrl || !email || !password) {
      Alert.alert("Fehlende Daten", "Bitte Cloud URL, E-Mail und Passwort angeben.");
      return;
    }
    setLoading(true);
    try {
      const login = await loginWithPassword(baseUrl.trim(), email.trim(), password);
      const auth = { baseUrl: baseUrl.trim(), token: login.token };
      const res = await me(auth);
      if (!res?.user) {
        throw new Error("Login fehlgeschlagen");
      }
      await onAuthenticated(auth);
    } catch (err: any) {
      Alert.alert("Login fehlgeschlagen", err?.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Xynoxa Mobile</Text>
        <Text style={styles.label}>Cloud URL</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          placeholderTextColor="#94A3B8"
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="https://cloud.xynoxa.com"
        />
        <Text style={styles.label}>E-Mail</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor="#94A3B8"
          value={email}
          onChangeText={setEmail}
          placeholder="du@example.com"
        />
        <Text style={styles.label}>Passwort</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          secureTextEntry
          placeholderTextColor="#94A3B8"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />
        <Pressable style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
          <Text style={styles.primaryButtonText}>{loading ? "Pruefe..." : "Verbinden"}</Text>
        </Pressable>
        <Text style={styles.helpText}>
          Login erfolgt ueber E-Mail und Passwort. Die App erstellt intern einen API-Token.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function MainApp({
  settings,
  onUpdateSettings,
  onLogout
}: {
  settings: MobileSettings;
  onUpdateSettings: (next: MobileSettings) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"files" | "uploads">("files");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Xynoxa</Text>
        <Pressable onPress={onLogout}>
          <Text style={styles.linkText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, tab === "files" && styles.tabButtonActive]}
          onPress={() => setTab("files")}
        >
          <Text style={styles.tabButtonText}>Dateien</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === "uploads" && styles.tabButtonActive]}
          onPress={() => setTab("uploads")}
        >
          <Text style={styles.tabButtonText}>Auto-Upload</Text>
        </Pressable>
      </View>

      {tab === "files" ? (
        <FilesScreen auth={settings.auth!} />
      ) : (
        <AutoUploadScreen settings={settings} onUpdateSettings={onUpdateSettings} />
      )}
    </SafeAreaView>
  );
}

function FilesScreen({ auth }: { auth: AuthConfig }) {
  const [folderStack, setFolderStack] = useState<FolderStackItem[]>([{ id: null, name: "Root" }]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [pickerMode, setPickerMode] = useState<"move" | "copy" | null>(null);

  const currentFolder = folderStack[folderStack.length - 1];

  const refresh = async () => {
    setLoading(true);
    try {
      const [foldersData, filesData] = await Promise.all([
        listFolders(auth, currentFolder.id),
        listFiles(auth, currentFolder.id)
      ]);
      setFolders(foldersData as FolderItem[]);
      const normalizedFiles = (filesData as any[]).map((file) => ({
        ...file,
        id: file?.id ?? file?.fileId
      }));
      setFiles(normalizedFiles as FileItem[]);
    } catch (err: any) {
      Alert.alert("Fehler", err?.message || "Konnte Dateien nicht laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [currentFolder.id]);

  const openFolder = (folder: FolderItem) => {
    setFolderStack((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const goBack = () => {
    setFolderStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const handleDelete = async (file: FileItem) => {
    try {
      if (!file?.id) {
        Alert.alert("Fehler", "Datei-ID fehlt, Loeschen nicht moeglich.");
        return;
      }
      await deleteFile(auth, file.id);
      await refresh();
    } catch (err: any) {
      Alert.alert("Fehler", err?.message || "Loeschen fehlgeschlagen");
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const uri = await downloadFile(auth, file.id, file.path);
      Alert.alert("Download fertig", `Gespeichert unter: ${uri}`);
    } catch (err: any) {
      Alert.alert("Fehler", err?.message || "Download fehlgeschlagen");
    }
  };

  const handleMoveCopy = async (file: FileItem, folderId: string | null) => {
    try {
      if (pickerMode === "move") {
        await moveFile(auth, file.id, folderId);
      } else if (pickerMode === "copy") {
        await copyFile(auth, file.id, folderId);
      }
      setPickerMode(null);
      setSelectedFile(null);
      await refresh();
    } catch (err: any) {
      Alert.alert("Fehler", err?.message || "Aktion fehlgeschlagen");
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        <Pressable onPress={goBack} disabled={folderStack.length <= 1}>
          <Text style={[styles.linkText, folderStack.length <= 1 && styles.disabledText]}>Zurueck</Text>
        </Pressable>
        <Text style={styles.pathText}>{folderStack.map((f) => f.name).join(" / ")}</Text>
        <Pressable onPress={refresh}>
          <Text style={styles.linkText}>Refresh</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#45E6C5" />
          <Text style={styles.mutedText}>Lade Dateien...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {folders.map((folder) => (
            <Pressable key={folder.id} style={styles.listItem} onPress={() => openFolder(folder)}>
              <Text style={styles.listTitle}>{folder.name}</Text>
              <Text style={styles.listSubtitle}>{folder.isGroupFolder ? "Gruppenordner" : "Ordner"}</Text>
            </Pressable>
          ))}
          {files.map((file) => (
            <Pressable key={file.id} style={styles.listItem} onPress={() => setSelectedFile(file)}>
              <Text style={styles.listTitle}>{file.path}</Text>
              <Text style={styles.listSubtitle}>{file.size || ""}</Text>
            </Pressable>
          ))}
          {folders.length === 0 && files.length === 0 && (
            <Text style={styles.mutedText}>Keine Dateien</Text>
          )}
        </ScrollView>
      )}

      <FileActionsModal
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDelete={handleDelete}
        onDownload={handleDownload}
        onMove={() => setPickerMode("move")}
        onCopy={() => setPickerMode("copy")}
      />

      <FolderPickerModal
        visible={!!pickerMode}
        auth={auth}
        onClose={() => setPickerMode(null)}
        onSelect={(folderId) => {
          if (selectedFile) {
            handleMoveCopy(selectedFile, folderId);
          }
        }}
      />
    </View>
  );
}

function FileActionsModal({
  file,
  onClose,
  onDelete,
  onDownload,
  onMove,
  onCopy
}: {
  file: FileItem | null;
  onClose: () => void;
  onDelete: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onMove: () => void;
  onCopy: () => void;
}) {
  if (!file) return null;

  return (
    <Modal transparent animationType="fade" visible={!!file} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{file.path}</Text>
          <Pressable style={styles.modalButton} onPress={() => onDownload(file)}>
            <Text style={styles.modalButtonText}>Download</Text>
          </Pressable>
          <Pressable style={styles.modalButton} onPress={onMove}>
            <Text style={styles.modalButtonText}>Verschieben</Text>
          </Pressable>
          <Pressable style={styles.modalButton} onPress={onCopy}>
            <Text style={styles.modalButtonText}>Kopieren</Text>
          </Pressable>
          <Pressable style={[styles.modalButton, styles.dangerButton]} onPress={() => onDelete(file)}>
            <Text style={styles.modalButtonText}>Loeschen</Text>
          </Pressable>
          <Pressable style={styles.linkButton} onPress={onClose}>
            <Text style={styles.linkText}>Schliessen</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FolderPickerModal({
  visible,
  auth,
  onClose,
  onSelect
}: {
  visible: boolean;
  auth: AuthConfig;
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
}) {
  const [stack, setStack] = useState<FolderStackItem[]>([{ id: null, name: "Root" }]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const currentFolder = stack[stack.length - 1];

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await listFolders(auth, currentFolder.id);
      setFolders(data as FolderItem[]);
    } catch (err: any) {
      Alert.alert("Fehler", err?.message || "Ordner konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setStack([{ id: null, name: "Root" }]);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      refresh();
    }
  }, [currentFolder.id, visible]);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCardLarge}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
            >
              <Text style={styles.linkText}>Zurueck</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Zielordner</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.linkText}>Schliessen</Text>
            </Pressable>
          </View>

          <Pressable style={styles.modalButton} onPress={() => onSelect(null)}>
            <Text style={styles.modalButtonText}>Root auswaehlen</Text>
          </Pressable>

          {loading ? (
            <ActivityIndicator color="#45E6C5" />
          ) : (
            <ScrollView style={{ marginTop: 8 }}>
              {folders.map((folder) => (
                <Pressable
                  key={folder.id}
                  style={styles.listItem}
                  onPress={() => setStack((prev) => [...prev, { id: folder.id, name: folder.name }])}
                  onLongPress={() => onSelect(folder.id)}
                >
                  <Text style={styles.listTitle}>{folder.name}</Text>
                  <Text style={styles.listSubtitle}>{folder.isGroupFolder ? "Gruppenordner" : "Ordner"}</Text>
                </Pressable>
              ))}
              {folders.length === 0 && (
                <Text style={styles.mutedText}>Keine Ordner</Text>
              )}
            </ScrollView>
          )}
          <Text style={styles.helpText}>Tippe auf einen Ordner, um hineinzugehen. Langes Druecken waehlt ihn aus.</Text>
        </View>
      </View>
    </Modal>
  );
}

function AutoUploadScreen({
  settings,
  onUpdateSettings
}: {
  settings: MobileSettings;
  onUpdateSettings: (next: MobileSettings) => Promise<void>;
}) {
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const settingsRef = useRef(settings);
  const uploadLock = useRef(false);

  const albumSettings = useMemo(() => settings.albums, [settings.albums]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]).then((res) => {
      if (!res.granted) {
        Alert.alert("Berechtigung fehlt", "Bitte erlaube den Zugriff auf die Galerie.");
      }
    });
  }, []);

  useEffect(() => {
    ensureBackgroundTask(settings.autoUploadEnabled).catch(() => undefined);
  }, [settings.autoUploadEnabled]);

  const loadAlbums = async () => {
    setLoading(true);
    try {
      const data = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      setAlbums(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlbums();
  }, []);

  const updateAlbumSetting = async (album: MediaLibrary.Album, updates: Partial<AlbumSetting>) => {
    const nextAlbums = [...albumSettings];
    const idx = nextAlbums.findIndex((a) => a.albumId === album.id);
    if (idx === -1) {
      nextAlbums.push({
        albumId: album.id,
        albumTitle: album.title,
        enabled: false,
        targetPath: "",
        ...updates
      });
    } else {
      nextAlbums[idx] = { ...nextAlbums[idx], ...updates };
    }
    await onUpdateSettings({ ...settings, albums: nextAlbums });
  };

  const ensureNotificationPermission = async () => {
    if (Platform.OS !== "android") return true;
    if (typeof Platform.Version === "number" && Platform.Version < 33) return true;
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    const hasPermission = await PermissionsAndroid.check(permission);
    if (hasPermission) return true;
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  const toggleAutoUpload = async (enabled: boolean) => {
    if (enabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert(
          "Benachrichtigungen erforderlich",
          "Fuer Hintergrund-Uploads braucht Xynoxa die Benachrichtigungs-Berechtigung. Bitte erlaube sie, damit der Auto-Upload im Hintergrund laufen kann."
        );
        return;
      }
    }
    const next = { ...settings, autoUploadEnabled: enabled };
    await onUpdateSettings(next);
    await ensureBackgroundTask(enabled);
  };

  const manualUpload = async () => {
    setUploading(true);
    try {
      const res = await runAutoUpload(settingsRef.current);
      Alert.alert(
        "Auto-Upload",
        `Hochgeladen: ${res.uploaded}\nUebersprungen: ${res.skipped}\nFehlgeschlagen: ${res.failed}`
      );
      const refreshed = await loadSettings();
      await onUpdateSettings(refreshed);
    } catch (err: any) {
      Alert.alert("Fehler", err?.message || "Auto-Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const maybeRun = async () => {
      const current = settingsRef.current;
      if (!current.autoUploadEnabled || !current.auth) return;
      if (uploadLock.current) return;
      uploadLock.current = true;
      try {
        const res = await runAutoUpload(current);
        if (res.uploaded > 0) {
          const refreshed = await loadSettings();
          await onUpdateSettings(refreshed);
        }
      } finally {
        uploadLock.current = false;
      }
    };

    const startInterval = () => {
      if (interval) return;
      interval = setInterval(() => {
        void maybeRun();
      }, 2 * 60 * 1000);
    };

    const stopInterval = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    if (settingsRef.current.autoUploadEnabled) {
      startInterval();
    }

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void maybeRun();
        if (settingsRef.current.autoUploadEnabled) {
          startInterval();
        }
      } else {
        stopInterval();
      }
    });

    const mediaSub = MediaLibrary.addListener(() => {
      void maybeRun();
    });

    return () => {
      appStateSub.remove();
      mediaSub.remove();
      stopInterval();
    };
  }, [onUpdateSettings]);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.card}>
        <Text style={styles.title}>Automatischer Upload</Text>
        <Text style={styles.helpText}>Waehle Alben und Zielpfade fuer automatische Uploads (Fotos + Videos).</Text>

        <View style={styles.toggleRow}>
          <Text style={styles.label}>Auto-Upload aktiv</Text>
          <Pressable
            style={[styles.toggleButton, settings.autoUploadEnabled && styles.toggleButtonActive]}
            onPress={() => toggleAutoUpload(!settings.autoUploadEnabled)}
          >
            <Text style={[styles.toggleText, settings.autoUploadEnabled ? styles.toggleTextActive : styles.toggleTextInactive]}>
              {settings.autoUploadEnabled ? "An" : "Aus"}
            </Text>
          </Pressable>
        </View>

        <Pressable style={styles.primaryButton} onPress={manualUpload} disabled={uploading}>
          <Text style={styles.primaryButtonText}>{uploading ? "Lade hoch..." : "Jetzt hochladen"}</Text>
        </Pressable>

        {Platform.OS === "android" && settings.autoUploadEnabled && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>Wichtig fuer Hintergrund-Uploads</Text>
            <Text style={styles.helpText}>
              Stelle sicher, dass Xynoxa nicht von der Akku-Optimierung eingeschraenkt wird.
              Oeffne die App-Einstellungen und setze den Akku-Modus auf "Nicht optimiert" oder "Unrestricted".
            </Text>
            <Pressable style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
              <Text style={styles.secondaryButtonText}>App-Einstellungen oeffnen</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.toolbar}>
          <Text style={styles.title}>Alben</Text>
          <Pressable onPress={loadAlbums}>
            <Text style={styles.linkText}>Neu laden</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#45E6C5" />
        ) : (
          albums.map((album) => {
            const config = albumSettings.find((a) => a.albumId === album.id);
            const enabled = config?.enabled ?? false;
            const targetPath = config?.targetPath ?? "";
            return (
              <View key={album.id} style={styles.albumRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{album.title}</Text>
                  <Text style={styles.listSubtitle}>{album.assetCount} Dateien</Text>
                </View>
                <Pressable
                  style={[styles.toggleButton, enabled && styles.toggleButtonActive]}
                  onPress={() => updateAlbumSetting(album, { enabled: !enabled })}
                >
                  <Text style={[styles.toggleText, enabled ? styles.toggleTextActive : styles.toggleTextInactive]}>
                    {enabled ? "An" : "Aus"}
                  </Text>
                </Pressable>
                {enabled && (
                  <TextInput
                    style={styles.input}
                    value={targetPath}
                    onChangeText={(val) => updateAlbumSetting(album, { targetPath: val })}
                    placeholder="Zielpfad in der Cloud"
                  />
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0E1A2B"
  },
  flex: {
    flex: 1
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0E1A2B"
  },
  mutedText: {
    color: "#94A3B8",
    marginTop: 8
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#F8FAFC",
    marginBottom: 8
  },
  label: {
    color: "#E2E8F0",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 12
  },
  input: {
    backgroundColor: "#111827",
    borderColor: "#1F2937",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 16,
    color: "#F8FAFC",
    marginTop: 6,
    flex: 1
  },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 16,
    margin: 16
  },
  primaryButton: {
    backgroundColor: "#45E6C5",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16
  },
  primaryButtonText: {
    color: "#0E1A2B",
    fontWeight: "600"
  },
  secondaryButton: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 12
  },
  secondaryButtonText: {
    color: "#E2E8F0",
    fontWeight: "600",
    fontSize: 13
  },
  noticeBox: {
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    backgroundColor: "#0B1220"
  },
  noticeTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6
  },
  helpText: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 8
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16
  },
  topBarTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "600"
  },
  linkText: {
    color: "#45E6C5",
    fontSize: 14
  },
  disabledText: {
    color: "#475569"
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
    alignItems: "center"
  },
  tabButtonActive: {
    backgroundColor: "#1E293B"
  },
  tabButtonText: {
    color: "#E2E8F0",
    fontSize: 14
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 12
  },
  pathText: {
    color: "#E2E8F0",
    fontSize: 12,
    flex: 1,
    textAlign: "center"
  },
  list: {
    padding: 16,
    gap: 12
  },
  listItem: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1F2937"
  },
  listTitle: {
    color: "#F8FAFC",
    fontWeight: "600"
  },
  listSubtitle: {
    color: "#94A3B8",
    fontSize: 12
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  modalCard: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 20,
    width: "100%"
  },
  modalCardLarge: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxHeight: "85%"
  },
  modalTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12
  },
  modalButton: {
    backgroundColor: "#1E293B",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10
  },
  modalButtonText: {
    color: "#E2E8F0"
  },
  dangerButton: {
    backgroundColor: "#7F1D1D"
  },
  linkButton: {
    alignItems: "center",
    marginTop: 16
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8
  },
  toggleButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1F2937",
    backgroundColor: "#0F172A"
  },
  toggleButtonActive: {
    backgroundColor: "#45E6C5",
    borderColor: "#45E6C5"
  },
  toggleText: {
    fontWeight: "600"
  },
  toggleTextActive: {
    color: "#0E1A2B"
  },
  toggleTextInactive: {
    color: "#E2E8F0"
  },
  albumRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    paddingVertical: 12
  }
});
