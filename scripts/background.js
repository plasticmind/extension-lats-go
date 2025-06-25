// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'clearCookies') {
    // Clear all cookies for LATS domains
    chrome.cookies.getAll({ domain: 'lats.ny.gov' }, (cookies) => {
      for (const cookie of cookies) {
        chrome.cookies.remove({
          url: `https://${cookie.domain}${cookie.path}`,
          name: cookie.name
        });
      }
      sendResponse({ success: true });
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return true;
  }
}); 