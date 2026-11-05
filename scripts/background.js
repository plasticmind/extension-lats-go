/**
 * LATS Go! Background Service Worker
 * Handles cookie clearing and opens options page via message passing
 */

// Allowed actions whitelist
const ALLOWED_ACTIONS = ['clearCookies', 'openOptions'];

// Allowed origin pattern for LATS
const ALLOWED_ORIGIN_PATTERN = /^https?:\/\/[^/]*\.?lats\.ny\.gov/;

/**
 * Validate that the message sender is from an allowed origin
 * @param {chrome.runtime.MessageSender} sender - The message sender
 * @returns {boolean} True if sender is valid
 */
function isValidSender(sender) {
  // Allow messages from extension pages (popup, options)
  if (sender.origin && sender.origin.startsWith('chrome-extension://')) {
    return sender.id === chrome.runtime.id;
  }

  // Allow messages from LATS pages
  if (sender.url) {
    return ALLOWED_ORIGIN_PATTERN.test(sender.url);
  }

  if (sender.origin) {
    return ALLOWED_ORIGIN_PATTERN.test(sender.origin);
  }

  return false;
}

/**
 * Clear all cookies for the LATS domain
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function clearLatsCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'lats.ny.gov' });

    const removalPromises = cookies.map(cookie =>
      chrome.cookies.remove({
        url: `https://${cookie.domain}${cookie.path}`,
        name: cookie.name
      })
    );

    await Promise.all(removalPromises);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Listen for messages from content scripts and extension pages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate sender origin
  if (!isValidSender(sender)) {
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return false;
  }

  // Validate action is in whitelist
  if (!request.action || !ALLOWED_ACTIONS.includes(request.action)) {
    sendResponse({ success: false, error: 'Invalid action' });
    return false;
  }

  if (request.action === 'clearCookies') {
    clearLatsCookies().then(sendResponse);
    return true; // Will respond asynchronously
  }

  if (request.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return false;
  }

  return false;
});
