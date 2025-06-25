# LATS Go! 🎉 Chrome Extension

This extension enhances the NYS Leave and Accrual Tracking System (LATS) timesheet system with improved style and functionality, like focuse styles, automated timecard filling, and custom schedule settings.

## Installation

Visit the Chrome Web Store to install the extension: [LATS Go!](https://chromewebstore.google.com/detail/lats-go-%F0%9F%8E%89/obdmohilnmnjkdjgkbcjfaifiilikhip?hl=en&authuser=0)

Alternatively, you can install it manually:

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select this folder.

## Usage

- Visit the LATS url.
- Use the "Fill Timecard" button to automatically populate your timesheet based on your default or custom schedule.
- Edit your schedule settings via the "Edit Schedule Settings" link in the modal.
- If you get an Application Error when accessing the URL, you can use the "Fix LATS Session" button to clear cookies and reload the page.

## Technical Details

The extension uses content scripts and stylesheets to style and interact with the LATS timesheet page and add custom UI elements. 

All functionality is contained within the extension, so there are no external dependencies.
