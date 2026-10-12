/**
 * Saves a remote file through the browser (browser only). Resolves `false`
 * when it couldn't be fetched, so the caller can tell the user.
 */
export async function downloadFile(url: string, fileName: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const blobUrl = URL.createObjectURL(await response.blob());

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();

    // revoked a moment later: some browsers start the download asynchronously
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return true;
  } catch (error) {
    console.error("[download] failed", error);
    return false;
  }
}
