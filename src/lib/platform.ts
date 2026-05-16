/**
 * Lightweight platform detection. Used to surface the right Zotero data
 * directory hint per OS without a roundtrip to the server.
 *
 * Browsers can't read arbitrary local paths, so the goal isn't to auto-load
 * the file — only to point the user at the right place to navigate to.
 */

export type Platform = "macos" | "windows" | "linux" | "unknown";

type UAData = {
  platform?: string;
};

function readUAData(): UAData | null {
  // Modern Chromium ships `navigator.userAgentData`. Firefox/Safari don't.
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (!nav) return null;
  const data = (nav as unknown as { userAgentData?: UAData }).userAgentData;
  return data ?? null;
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";

  const uaData = readUAData();
  const hint = (uaData?.platform ?? "").toLowerCase();
  if (hint) {
    if (hint.includes("mac")) return "macos";
    if (hint.includes("win")) return "windows";
    if (hint.includes("linux") || hint.includes("chrome os")) return "linux";
  }

  const ua = navigator.userAgent.toLowerCase();
  // iPad pretends to be Mac in modern Safari; treat it the same here since the
  // file picker UX is identical and Zotero on iPadOS is not a real target.
  if (/mac|iphone|ipad|ipod/.test(ua)) return "macos";
  if (/win/.test(ua)) return "windows";
  if (/linux|cros|x11/.test(ua)) return "linux";

  return "unknown";
}

export type ZoteroPathHint = {
  platform: Platform;
  label: string;
  /** Human-readable absolute (or shell-expanded) path to the database. */
  primaryPath: string;
  /** Best-effort copy-pastable form. On Windows we hand the user a literal
   *  `%USERPROFILE%\…` since most file pickers expand env vars. */
  copyPath: string;
  /** A second-best location to try when the primary path is empty (older
   *  installs, Snap packages, etc). */
  altPath?: string;
  /** A short note printed below the path. */
  note?: string;
};

export function zoteroPathHint(platform: Platform): ZoteroPathHint {
  switch (platform) {
    case "macos":
      return {
        platform,
        label: "macOS",
        primaryPath: "~/Zotero/zotero.sqlite",
        copyPath: "~/Zotero/zotero.sqlite",
        altPath:
          "~/Library/Application Support/Zotero/Profiles/<profile>/zotero.sqlite",
        note: "Close Zotero before copying — open writers can leave the WAL inconsistent.",
      };
    case "windows":
      return {
        platform,
        label: "Windows",
        primaryPath: "%USERPROFILE%\\Zotero\\zotero.sqlite",
        copyPath: "%USERPROFILE%\\Zotero\\zotero.sqlite",
        altPath:
          "%APPDATA%\\Zotero\\Zotero\\Profiles\\<profile>\\zotero.sqlite",
        note: "Close Zotero before copying. Most file pickers expand %USERPROFILE%; if not, paste C:\\Users\\<you>\\Zotero\\zotero.sqlite.",
      };
    case "linux":
      return {
        platform,
        label: "Linux",
        primaryPath: "~/Zotero/zotero.sqlite",
        copyPath: "~/Zotero/zotero.sqlite",
        altPath: "~/snap/zotero/common/Zotero/zotero.sqlite",
        note: "Close Zotero before copying. The Snap and Flatpak builds put the data dir under ~/snap/ or ~/.var/app/.",
      };
    default:
      return {
        platform,
        label: "Unknown",
        primaryPath: "<your home>/Zotero/zotero.sqlite",
        copyPath: "Zotero/zotero.sqlite",
        note: "Couldn't detect your OS automatically. Look for the data directory shown in Zotero → Preferences → Advanced → Files and Folders.",
      };
  }
}

/**
 * Native file-system access via the modern File System Access API. When
 * available, we can ask the picker to open at the user's documents folder —
 * the closest the API lets us get to "home". Returns null if the API isn't
 * available or the user cancelled.
 *
 * The `accept` map mirrors the legacy `<input type=file accept>` attribute.
 */
export async function pickFileNative(
  accept: Record<string, string[]>,
): Promise<File | null> {
  const w = typeof window !== "undefined"
    ? (window as unknown as {
        showOpenFilePicker?: (opts: {
          types: { description: string; accept: Record<string, string[]> }[];
          startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
          multiple?: boolean;
          excludeAcceptAllOption?: boolean;
        }) => Promise<{ getFile: () => Promise<File> }[]>;
      })
    : null;
  if (!w?.showOpenFilePicker) return null;
  try {
    const [handle] = await w.showOpenFilePicker({
      types: [{ description: "Zotero SQLite database", accept }],
      startIn: "documents",
      multiple: false,
      excludeAcceptAllOption: false,
    });
    if (!handle) return null;
    return await handle.getFile();
  } catch (err) {
    // AbortError fires when the user closes the picker; treat as a no-op.
    const name = (err as { name?: string }).name;
    if (name === "AbortError") return null;
    throw err;
  }
}

export function hasNativeFilePicker(): boolean {
  if (typeof window === "undefined") return false;
  return "showOpenFilePicker" in window;
}
