/**
 * LATS Go! Error Page Script
 * Adds a "Reboot LATS" button to clear cookies and recover from session errors
 */

/**
 * Create and insert the reboot button
 */
function createRebootButton() {
  // Check if button already exists
  if (document.getElementById('rebootLatsButton')) return;

  const button = document.createElement('button');
  button.id = 'rebootLatsButton';
  button.className = 'lats-reboot-button';
  button.textContent = 'Reboot LATS';

  // Insert the button at the top of the error page
  const targetElement = document.querySelector('body');
  if (targetElement) {
    targetElement.insertBefore(button, targetElement.firstChild);
  }

  // Add click handler
  button.addEventListener('click', async () => {
    button.textContent = 'Rebooting...';
    button.disabled = true;

    // Send message to background script to clear cookies
    chrome.runtime.sendMessage({ action: 'clearCookies' }, (response) => {
      // Handle case where response is undefined (background script didn't respond)
      if (chrome.runtime.lastError) {
        button.textContent = 'Error - Try Again';
        button.disabled = false;
        return;
      }

      // Validate response before acting
      if (response && response.success === true) {
        // Redirect to main LATS page
        window.location.href = 'https://time02.lats.ny.gov/';
      } else {
        button.textContent = 'Error - Try Again';
        button.disabled = false;
      }
    });
  });
}

// Initialize when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createRebootButton);
} else {
  createRebootButton();
}
