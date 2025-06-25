# LATS Enhancer Chrome Extension

This extension enhances the NY State Leave and Accrual Tracking System (LATS) timesheet system by providing additional functionality, such as automated timecard filling, custom schedule settings, and error handling.

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select this folder.

## Usage

- Visit your LATS url (or any page under that domain).
- Use the "Fill Timecard" button to automatically populate your timesheet based on your default or custom schedule.
- Edit your schedule settings via the "Edit Schedule Settings" link in the modal.
- If you get an Application Error when trying to pull up the URL, you can use the "Fix LATS Session" button to clear cookies and reload the page.

## Features

- **Automated Timecard Filling:** Quickly fill in regular or special day types (e.g., vacation, sick, holiday) with predefined schedules.
- **Custom Schedule Settings:** Configure alternate schedules for different weeks.
- **Error Handling:** Clear cookies and reload the page to fix session issues.

## Technical Details

The extension uses content scripts and stylesheets to style and interact with the LATS timesheet page and add custom UI elements. 

All functionality is contained within the extension, so there are no external dependencies.