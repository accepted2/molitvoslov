/**
 * Staging-only placeholder. Returning null leaves the prebuilt index untouched.
 * Before activating engine_v10, connect this adapter to the existing OTA content
 * store; otherwise newly delivered content will not appear in search.
 */
export async function getOverlaySource() {
  return null;
}
