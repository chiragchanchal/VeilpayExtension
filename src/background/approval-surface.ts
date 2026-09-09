/**
 * Opens the popup so the user can approve or deny a dapp connection request.
 *
 * Chrome 127+ supports `chrome.action.openPopup()` (no extra permission).
 * When unavailable, the pending record is still readable from
 * `chrome.storage.session` — the user just needs to click the toolbar icon to
 * see the approval UI. Returns without throwing on failure.
 */
export async function openApprovalSurface(): Promise<void> {
  try {
    if (typeof chrome.action.openPopup === 'function') {
      await chrome.action.openPopup();
    }
  } catch {
    // openPopup fails if the popup is already open or the action is in a
    // restricted context. The user clicks the toolbar icon instead.
  }
}