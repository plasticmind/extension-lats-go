// Create and insert the reboot button
function createRebootButton() {
  const button = document.createElement('button');
  button.id = 'rebootLatsButton';
  button.className = 'lats-reboot-button';
  button.textContent = '🔄 Reboot LATS';
  
  // Insert the button at the top of the error page
  const targetElement = document.querySelector('body');
  if (targetElement) {
    targetElement.insertBefore(button, targetElement.firstChild);
  }

  // Add click handler
  button.addEventListener('click', async () => {
    button.textContent = '🔄 Rebooting...';
    button.disabled = true;

    // Send message to background script to clear cookies
    chrome.runtime.sendMessage({ action: 'clearCookies' }, (response) => {
      if (response.success) {
        // Redirect to main LATS page
        window.location.href = 'https://time02.lats.ny.gov/';
      } else {
        button.textContent = '❌ Error - Try Again';
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