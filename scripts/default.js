// Function to enhance the timesheet link
function enhanceTimesheetLink() {
  const timesheetLink = document.getElementById('lnkMyTimesheet');
  if (timesheetLink) {
    // Add the button class
    timesheetLink.className = 'lats-go-button';
    
    // Update the text content with emoji
    timesheetLink.textContent = 'LATS GO! 🎉';
    
    // Log success
    console.log('LATS link enhanced successfully');
  } else {
    console.log('Timesheet link not found');
  }
}

// Initialize when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceTimesheetLink);
} else {
  enhanceTimesheetLink();
} 