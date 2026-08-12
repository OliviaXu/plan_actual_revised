export function findExtensionPage(pages, extensionId) {
  const extensionOrigin = `chrome-extension://${extensionId}/`;
  return pages.find((page) => page.url().startsWith(extensionOrigin));
}
