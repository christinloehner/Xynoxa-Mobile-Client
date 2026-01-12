import { loadSettings } from "../lib/storage";
import { runAutoUpload } from "../lib/auto-upload";

export async function headlessAutoUpload() {
  const settings = await loadSettings();
  if (!settings.autoUploadEnabled || !settings.auth) {
    return;
  }
  await runAutoUpload(settings);
}
