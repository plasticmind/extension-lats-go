// Add this near the top of the file, after the initial function declarations
function createUIElements() {
  console.log('createUIElements called');
  const isTimesheetPage = window.location.pathname.includes('/Time') || 
                         window.location.href.includes('lats.ny.gov/Time');
  
  console.log('isTimesheetPage:', isTimesheetPage);
  console.log('Current URL:', window.location.href);
  console.log('Current pathname:', window.location.pathname);
                         
  if (isTimesheetPage) {
    console.log('Inside timesheet page condition');
    
    const insertControls = () => {
      console.log('insertControls function started');
      
      try {
        const saveButton = document.getElementById('btnSaveTimesheet_0');
        console.log('Save button found:', saveButton);
        
        const saveButtonContainer = saveButton?.closest('.col-xs-3');
        console.log('Save button container:', saveButtonContainer);
                        
        if (!saveButtonContainer) {
          console.log('Save button container not found, will retry');
          setTimeout(insertControls, 500);
          return;
        }

        console.log('Checking for existing controls');
        if (!document.querySelector('.lats-enhancer-controls')) {
          console.log('Creating control panel');
          const controlPanel = document.createElement('div');
          controlPanel.className = 'lats-enhancer-controls';
          
          console.log('Creating fill button');
          const fillButton = document.createElement('button');
          fillButton.id = 'fillTimecard';
          fillButton.className = 'k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base lats-enhancer-button';
          fillButton.type = 'button';
          
          const buttonText = document.createElement('span');
          buttonText.className = 'k-button-text';
          buttonText.textContent = '✨ Fill Timecard';
          
          fillButton.appendChild(buttonText);
          controlPanel.appendChild(fillButton);
          
          console.log('Attempting to insert control panel');
          saveButtonContainer.insertBefore(controlPanel, saveButton);
          console.log('Control panel inserted successfully');

          // Create the modal for day selection if it doesn't exist
          if (!document.querySelector('.lats-modal')) {
            const modal = document.createElement('div');
            modal.className = 'lats-modal';
            
            const modalContent = document.createElement('div');
            modalContent.className = 'lats-modal-content';
            
            const header = document.createElement('h2');
            header.textContent = 'Select Days to Fill';
            modalContent.appendChild(header);

            // Add settings info
            const settingsInfo = document.createElement('div');
            settingsInfo.className = 'settings-info';
            
            const scheduleText = document.createElement('div');
            scheduleText.className = 'settings-info-text';
            scheduleText.textContent = 'Using default schedule (8:30 AM - 4:30 PM)';
            
            const settingsLink = document.createElement('a');
            settingsLink.href = '#';
            settingsLink.className = 'settings-info-link';
            settingsLink.textContent = 'Edit Schedule Settings';
            settingsLink.addEventListener('click', (e) => {
              e.preventDefault();
              chrome.runtime.sendMessage({ action: 'openOptions' });
            });

            settingsInfo.appendChild(scheduleText);
            settingsInfo.appendChild(settingsLink);
            modalContent.appendChild(settingsInfo);

            // Check if settings exist and update schedule text
            chrome.storage.sync.get(['week1', 'week2', 'alternateSchedule'], (settings) => {
              if (settings.week1) {
                const schedule = settings.alternateSchedule ? 'Custom schedule (varies by week)' : `Custom schedule (${settings.week1.timeIn} - ${settings.week1.timeOut})`;
                scheduleText.textContent = schedule;
              }
            });

            const daysContainer = document.createElement('div');
            daysContainer.className = 'days-container';
            modalContent.appendChild(daysContainer);

            // Get the dates from the timesheet table
            const dates = [];
            const headerRow = document.querySelector('#printTSTable tr:first-child');
            if (headerRow) {
              const dateCells = headerRow.querySelectorAll('td:not(:first-child)');
              dateCells.forEach(cell => {
                const dateText = cell.textContent.trim();
                if (dateText) {
                  const date = parseDate(dateText);
                  if (date) {
                    // Skip weekends
                    const day = date.getDay();
                    if (day !== 0 && day !== 6) { // 0 = Sunday, 6 = Saturday
                      dates.push(date);
                    }
                  }
                }
              });
            }

            // Create day selection cards
            dates.forEach(date => {
              const dayCard = document.createElement('div');
              dayCard.className = 'day-card';

              const dayCardHeader = document.createElement('div');
              dayCardHeader.className = 'day-card-header';

              const dateLabel = document.createElement('div');
              dateLabel.className = 'day-card-date';
              dateLabel.textContent = date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              });

              const checkboxLabel = document.createElement('label');
              checkboxLabel.className = 'day-checkbox-label';
              
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.className = 'day-checkbox';
              checkbox.checked = true;
              checkbox.dataset.date = date.toISOString();

              checkboxLabel.appendChild(document.createTextNode('Include'));
              checkboxLabel.appendChild(checkbox);

              dayCardHeader.appendChild(dateLabel);
              dayCardHeader.appendChild(checkboxLabel);

              const dayTypeSelect = document.createElement('select');
              dayTypeSelect.className = 'day-type-select';
              dayTypeSelect.dataset.date = date.toISOString();

              [
                { value: 'regular', text: 'Regular Day' },
                { value: 'vacation', text: 'Vacation' },
                { value: 'sick', text: 'Sick' },
                { value: 'sickFamily', text: 'Sick Family' },
                { value: 'personal', text: 'Personal Day' },
                { value: 'holiday', text: 'Holiday' },
                { value: 'floater', text: 'Floater' }
              ].forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                dayTypeSelect.appendChild(option);
              });

              dayCard.appendChild(dayCardHeader);
              dayCard.appendChild(dayTypeSelect);
              daysContainer.appendChild(dayCard);
              
              console.log('[DEBUG] Created day card for:', date.toLocaleDateString());
            });

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'modal-buttons';
            
            const cancelButton = document.createElement('button');
            cancelButton.id = 'cancelTimecard';
            cancelButton.className = 'k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base';
            const cancelText = document.createElement('span');
            cancelText.className = 'k-button-text';
            cancelText.textContent = 'Cancel';
            cancelButton.appendChild(cancelText);
            
            const applyButton = document.createElement('button');
            applyButton.id = 'applyTimecard';
            applyButton.className = 'k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base';
            const applyText = document.createElement('span');
            applyText.className = 'k-button-text';
            applyText.textContent = 'Apply';
            applyButton.appendChild(applyText);
            
            // Add Cancel button first, then Apply button
            buttonContainer.appendChild(cancelButton);
            buttonContainer.appendChild(applyButton);
            modalContent.appendChild(buttonContainer);
            
            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            // Add this after the modal creation code, before the initializeEventListeners call
            const loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'lats-loading-overlay';

            const loadingContent = document.createElement('div');
            loadingContent.className = 'lats-loading-content';

            const spinner = document.createElement('div');
            spinner.className = 'lats-spinner';

            const loadingText = document.createElement('div');
            loadingText.textContent = 'Filling timecard...';
            loadingText.className = 'loading-text';

            loadingContent.appendChild(spinner);
            loadingContent.appendChild(loadingText);
            loadingOverlay.appendChild(loadingContent);
            document.body.appendChild(loadingOverlay);

            // Add the spinner animation
            const style = document.createElement('style');
            style.textContent = `
              @keyframes lats-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `;
            document.head.appendChild(style);

            // Initialize event listeners
            this.initializeEventListeners();
          }
        } else {
          console.log('Controls already exist');
        }
      } catch (error) {
        console.error('Error in insertControls:', error);
        console.error('Error stack:', error.stack);
      }
    };

    console.log('About to start insertion attempt');
    insertControls();
    console.log('Insertion attempt started');
  }
}

// Helper function to fill in time values
function fillTimeValues(date, times) {
  console.log('[DEBUG] fillTimeValues called with:', { 
    date: date.toLocaleDateString(),
    times 
  });
  
  const table = document.querySelector('#timesheetTable');
  if (!table) {
    console.error('[DEBUG] Table not found');
    return;
  }

  // Get the day of the week for the target date
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  // Format the target date as MM/DD to match LATS format
  const targetDateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  console.log('[DEBUG] Target day/date:', { dayOfWeek, targetDateStr });

  // Get all rows in the table
  const rows = table.getElementsByTagName('tr');
  console.log('[DEBUG] Found rows:', rows.length);

  // Time row types we need to fill
  const timeRows = {
    'Day In': times.timeIn,
    'Lunch Out': times.lunchOut,
    'Lunch In': times.lunchIn,
    'Day Out': times.timeOut
  };

  // First find the column index for our target date
  const headerRow = Array.from(rows).find(row => 
    row.querySelector('.k-header.timesheetGridHeader')
  );
  
  if (!headerRow) {
    console.error('[DEBUG] Header row not found');
    return;
  }

  const headerCells = headerRow.getElementsByTagName('th');
  let targetColumnIndex = -1;

  for (let i = 0; i < headerCells.length; i++) {
    const cell = headerCells[i];
    if (cell.textContent.trim().includes(targetDateStr)) {
      targetColumnIndex = i;
      break;
    }
  }

  console.log('[DEBUG] Target column index:', targetColumnIndex);

  if (targetColumnIndex === -1) {
    console.error('[DEBUG] Date column not found');
    return;
  }

  // Process each row
  for (const row of rows) {
    // Check if this row has a header cell with one of our target types
    const firstCell = row.querySelector('td');
    if (!firstCell) continue;

    const rowType = firstCell.textContent.trim();
    if (!Object.keys(timeRows).includes(rowType)) continue;

    console.log(`[DEBUG] Processing row for ${rowType}`);

    // Get all input fields in this row
    const inputs = row.getElementsByTagName('input');
    console.log(`[DEBUG] Found ${inputs.length} inputs in row`);

    // Get the input at our target column index
    const targetInput = inputs[targetColumnIndex];
    if (targetInput && targetInput.type === 'text') {
      console.log(`[DEBUG] Found input for ${rowType} at column ${targetColumnIndex}`);
      const timeValue = timeRows[rowType];
      console.log(`[DEBUG] Setting value to ${timeValue}`);
      
      targetInput.value = timeValue;
      
      // Trigger change event
      const event = new Event('change', { bubbles: true });
      targetInput.dispatchEvent(event);
      
      // Also trigger input event
      const inputEvent = new Event('input', { bubbles: true });
      targetInput.dispatchEvent(inputEvent);
      
      // Force blur to ensure LATS validation runs
      targetInput.blur();
    } else {
      console.error(`[DEBUG] No input found for ${rowType} at column ${targetColumnIndex}`);
    }
  }
}

// Helper function to fill special day type
function fillSpecialDay(date, type) {
  console.log('[DEBUG] Filling special day:', date, type);
  
  // Map UI types to input title types
  const typeMap = {
    'vacation': 'Vacation',
    'sick': 'Sick',
    'sickFamily': 'Sick Family',
    'personal': 'Personal',
    'holiday': 'Holiday',
    'floater': 'Floater'
  };

  // Get the mapped type or use the original if not found
  const mappedType = typeMap[type] || type;
  
  // Get the day of the week for the target date
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  
  // Find the first header cell that matches our date to get the day number
  const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  const headers = Array.from(document.querySelectorAll('#timesheetTable th.k-header.timesheetGridHeader'));
  const dayIndex = headers.findIndex(th => th.textContent.trim().startsWith(dateStr)) + 1;
  
  if (dayIndex === 0) {
    console.error(`[DEBUG] Could not find header for date ${dateStr}`);
    return;
  }

  // Find input with exact title format: "{type} Day {dayIndex} {dayOfWeek}"
  const titlePattern = `${mappedType} Day ${dayIndex} ${dayOfWeek}`;
  console.log('[DEBUG] Looking for title:', titlePattern);
  
  const input = document.querySelector(`input[type="text"][title="${titlePattern}"]`);
  
  if (!input) {
    console.error(`[DEBUG] No input found with title: ${titlePattern}`);
    return;
  }

  console.log('[DEBUG] Found input:', input.title);
  input.value = '7.5';
  const event = new Event('change', { bubbles: true });
  input.dispatchEvent(event);
}

// Handle error page
function handleErrorPage() {
  if (document.body.textContent.includes('error')) {
    const fixButton = document.createElement('button');
    fixButton.textContent = 'Fix LATS Session';
    fixButton.className = 'lats-enhancer-button';
    fixButton.addEventListener('click', () => {
      // Clear cookies for the LATS domain
      chrome.runtime.sendMessage({ action: 'clearCookies' }, () => {
        window.location.reload();
      });
    });
    document.body.insertBefore(fixButton, document.body.firstChild);
  }
}

// Create loading overlay
function createLoadingOverlay() {
  // Check if overlay already exists
  if (document.querySelector('.lats-loading-overlay')) {
    return;
  }

  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'lats-loading-overlay';

  const loadingContent = document.createElement('div');
  loadingContent.className = 'lats-loading-content';

  const spinner = document.createElement('div');
  spinner.className = 'lats-spinner';

  const loadingText = document.createElement('div');
  loadingText.className = 'loading-text';
  loadingText.textContent = 'Filling timecard...';

  loadingContent.appendChild(spinner);
  loadingContent.appendChild(loadingText);
  loadingOverlay.appendChild(loadingContent);
  document.body.appendChild(loadingOverlay);
}

// Initialize event listeners
function initializeEventListeners() {
  console.log('Initializing event listeners');
  const self = this;
  const fillTimecardBtn = document.getElementById('fillTimecard');
  const modal = document.querySelector('.lats-modal');
  
  if (fillTimecardBtn) {
    fillTimecardBtn.addEventListener('click', () => {
      console.log('[DEBUG] Fill button clicked');
      if (modal) {
        modal.style.display = 'block';
        
        const daysContainer = modal.querySelector('.days-container');
        console.log('[DEBUG] Found days container:', !!daysContainer);
        
        if (daysContainer) {
          daysContainer.innerHTML = ''; // Clear existing content
          
          // Get dates from the timesheet table
          const dates = [];
          const headerRow = document.querySelector('#printTSTable tr:first-child');
          console.log('[DEBUG] Found header row:', !!headerRow);
          
          if (headerRow) {
            const dateCells = headerRow.querySelectorAll('td:not(:first-child)');
            console.log('[DEBUG] Found date cells:', dateCells.length);
            
            dateCells.forEach(cell => {
              const dateText = cell.textContent.trim();
              console.log('[DEBUG] Processing date cell:', dateText);
              
              if (dateText) {
                const date = new Date();
                const [month, day] = dateText.split('/');
                date.setMonth(parseInt(month) - 1);
                date.setDate(parseInt(day));
                
                // Skip weekends
                const dayOfWeek = date.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                  dates.push(date);
                  console.log('[DEBUG] Added date:', date.toLocaleDateString());
                } else {
                  console.log('[DEBUG] Skipping weekend date:', date.toLocaleDateString());
                }
              }
            });
          }
          
          console.log('[DEBUG] Total dates to process:', dates.length);
          
          // Create day cards
          dates.forEach(date => {
            const dayCard = document.createElement('div');
            dayCard.className = 'day-card';

            const dayCardHeader = document.createElement('div');
            dayCardHeader.className = 'day-card-header';

            const dateLabel = document.createElement('div');
            dateLabel.className = 'day-card-date';
            dateLabel.textContent = date.toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            });

            const checkboxLabel = document.createElement('label');
            checkboxLabel.className = 'day-checkbox-label';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'day-checkbox';
            checkbox.checked = true;
            checkbox.dataset.date = date.toISOString();

            checkboxLabel.appendChild(document.createTextNode('Include'));
            checkboxLabel.appendChild(checkbox);

            dayCardHeader.appendChild(dateLabel);
            dayCardHeader.appendChild(checkboxLabel);

            const dayTypeSelect = document.createElement('select');
            dayTypeSelect.className = 'day-type-select';
            dayTypeSelect.dataset.date = date.toISOString();

            [
              { value: 'regular', text: 'Regular Day' },
              { value: 'vacation', text: 'Vacation' },
              { value: 'sick', text: 'Sick' },
              { value: 'sickFamily', text: 'Sick Family' },
              { value: 'personal', text: 'Personal Day' },
              { value: 'holiday', text: 'Holiday' },
              { value: 'floater', text: 'Floater' }
            ].forEach(opt => {
              const option = document.createElement('option');
              option.value = opt.value;
              option.textContent = opt.text;
              dayTypeSelect.appendChild(option);
            });

            dayCard.appendChild(dayCardHeader);
            dayCard.appendChild(dayTypeSelect);
            daysContainer.appendChild(dayCard);
            
            console.log('[DEBUG] Created day card for:', date.toLocaleDateString());
          });
        }
      }
    });
  }

  const applyButton = document.getElementById('applyTimecard');
  if (applyButton) {
    applyButton.addEventListener('click', () => {
      console.log('[DEBUG] Apply button clicked');
      
      // Ensure loading overlay exists
      createLoadingOverlay();
      const loadingOverlay = document.querySelector('.lats-loading-overlay');
      
      if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        
        try {
          // Clear all existing values first
          this.clearTimecard();
          
          chrome.storage.sync.get({
            alternateSchedule: false,
            week1: {
              timeIn: '8:30 AM',
              lunchOut: '12:00 PM',
              lunchIn: '12:30 PM',
              timeOut: '4:30 PM'
            },
            week2: {
              timeIn: '8:30 AM',
              lunchOut: '12:00 PM',
              lunchIn: '12:30 PM',
              timeOut: '4:30 PM'
            }
          }, (settings) => {
            try {
              console.log('[DEBUG] Settings loaded:', settings);
              
              const dayControls = document.querySelectorAll('.day-card');
              console.log('[DEBUG] Found day cards:', dayControls.length);
              
              let successCount = 0;
              let errorCount = 0;
              
              dayControls.forEach((card) => {
                try {
                  const checkbox = card.querySelector('.day-checkbox');
                  if (!checkbox?.checked) {
                    console.log('[DEBUG] Skipping unchecked day');
                    return;
                  }

                  const dateText = checkbox.dataset.date;
                  const date = new Date(dateText);
                  const dayTypeSelect = card.querySelector('.day-type-select');
                  const dayType = dayTypeSelect?.value;
                  
                  if (dayType === 'regular') {
                    const times = settings.alternateSchedule && this.isSecondWeek(date) ? 
                      settings.week2 : settings.week1;
                    this.fillTimeValues(date, times);
                    successCount++;
                  } else if (dayType) {
                    this.fillSpecialDay(date, dayType);
                    successCount++;
                  }
                } catch (error) {
                  console.error('[DEBUG] Error processing day card:', error);
                  errorCount++;
                }
              });
              
              // Show final status
              if (errorCount === 0) {
                showNotification(`Successfully filled timecard for ${successCount} days`, 'success');
              } else {
                showNotification(`Completed with ${successCount} successes and ${errorCount} errors`, 'error');
              }
            } catch (error) {
              console.error('[DEBUG] Error processing timecard:', error);
              showNotification('Error filling timecard: ' + error.message, 'error');
            } finally {
              loadingOverlay.style.display = 'none';
              modal.style.display = 'none';
            }
          });
        } catch (error) {
          console.error('[DEBUG] Error in apply button handler:', error);
          showNotification('Error: ' + error.message, 'error');
          loadingOverlay.style.display = 'none';
        }
      } else {
        console.error('[DEBUG] Loading overlay not found');
        showNotification('Error: Could not show loading state', 'error');
      }
    });
  }

  const cancelButton = document.getElementById('cancelTimecard');
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      if (modal) {
        modal.style.display = 'none';
      }
    });
  }
}

// Helper function to parse date from LATS format
function parseDate(dateText) {
  const [month, day] = dateText.split('/');
  const year = new Date().getFullYear();
  return new Date(year, parseInt(month) - 1, parseInt(day));
}

// Helper function to determine if a date is in the second week
function isSecondWeek(date) {
  // Get the first date from the table
  const firstDateCell = document.querySelector('#printTSTable tr:first-child td:nth-child(2)');
  if (!firstDateCell) return false;
  
  const firstDateText = firstDateCell.textContent.trim().split('\n')[0];
  const firstDate = parseDate(firstDateText);
  
  // If the date is more than 7 days after the first date, it's in the second week
  return (date - firstDate) / (1000 * 60 * 60 * 24) >= 7;
}

// Add logging to initialization
console.log('Content script loaded');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired');
  createUIElements();
  handleErrorPage();
});

if (document.readyState === 'complete') {
  console.log('Document already complete');
  createUIElements();
  handleErrorPage();
}

(function() {
  // Make our main function available globally for debugging
  window.latsEnhancer = {
    createUIElements: function() {
      console.log('createUIElements called');
      const isTimesheetPage = window.location.pathname.includes('/Time') || 
                             window.location.href.includes('lats.ny.gov/Time');
                             
      if (isTimesheetPage) {
        const insertControls = () => {
          const saveButton = document.getElementById('btnSaveTimesheet_0');
          const saveButtonContainer = saveButton?.closest('.col-xs-3');
                            
          if (!saveButtonContainer) {
            console.log('Save button container not found, will retry');
            setTimeout(insertControls, 500);
            return;
          }

          if (!document.querySelector('.lats-enhancer-controls')) {
            const controlPanel = document.createElement('div');
            controlPanel.className = 'lats-enhancer-controls';
            
            const fillButton = document.createElement('button');
            fillButton.id = 'fillTimecard';
            fillButton.className = 'k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base lats-enhancer-button';
            fillButton.type = 'button';
            
            const buttonText = document.createElement('span');
            buttonText.className = 'k-button-text';
            buttonText.textContent = '✨ Fill Timecard';
            
            fillButton.appendChild(buttonText);
            controlPanel.appendChild(fillButton);
            
            saveButtonContainer.insertBefore(controlPanel, saveButton);
            console.log('Fill Timecard button inserted');

            // Create the modal for day selection if it doesn't exist
            if (!document.querySelector('.lats-modal')) {
              const modal = document.createElement('div');
              modal.className = 'lats-modal';
              
              const modalContent = document.createElement('div');
              modalContent.className = 'lats-modal-content';
              
              const header = document.createElement('h2');
              header.textContent = 'Select Days to Fill';
              modalContent.appendChild(header);

              // Add settings info
              const settingsInfo = document.createElement('div');
              settingsInfo.className = 'settings-info';
              
              const scheduleText = document.createElement('div');
              scheduleText.className = 'settings-info-text';
              scheduleText.textContent = 'Using default schedule (8:30 AM - 4:30 PM)';
              
              const settingsLink = document.createElement('a');
              settingsLink.href = '#';
              settingsLink.className = 'settings-info-link';
              settingsLink.textContent = 'Edit Schedule Settings';
              settingsLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.runtime.sendMessage({ action: 'openOptions' });
              });

              settingsInfo.appendChild(scheduleText);
              settingsInfo.appendChild(settingsLink);
              modalContent.appendChild(settingsInfo);

              // Check if settings exist and update schedule text
              chrome.storage.sync.get(['week1', 'week2', 'alternateSchedule'], (settings) => {
                if (settings.week1) {
                  const schedule = settings.alternateSchedule ? 'Custom schedule (varies by week)' : `Custom schedule (${settings.week1.timeIn} - ${settings.week1.timeOut})`;
                  scheduleText.textContent = schedule;
                }
              });

              const daysContainer = document.createElement('div');
              daysContainer.className = 'days-container';
              modalContent.appendChild(daysContainer);

              // Get the dates from the timesheet table
              const dates = [];
              const headerRow = document.querySelector('#printTSTable tr:first-child');
              if (headerRow) {
                const dateCells = headerRow.querySelectorAll('td:not(:first-child)');
                dateCells.forEach(cell => {
                  const dateText = cell.textContent.trim();
                  if (dateText) {
                    const date = parseDate(dateText);
                    if (date) {
                      // Skip weekends
                      const day = date.getDay();
                      if (day !== 0 && day !== 6) { // 0 = Sunday, 6 = Saturday
                        dates.push(date);
                      }
                    }
                  }
                });
              }

              // Create day selection cards
              dates.forEach(date => {
                const dayCard = document.createElement('div');
                dayCard.className = 'day-card';

                const dayCardHeader = document.createElement('div');
                dayCardHeader.className = 'day-card-header';

                const dateLabel = document.createElement('div');
                dateLabel.className = 'day-card-date';
                dateLabel.textContent = date.toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                });

                const checkboxLabel = document.createElement('label');
                checkboxLabel.className = 'day-checkbox-label';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'day-checkbox';
                checkbox.checked = true;
                checkbox.dataset.date = date.toISOString();

                checkboxLabel.appendChild(document.createTextNode('Include'));
                checkboxLabel.appendChild(checkbox);

                dayCardHeader.appendChild(dateLabel);
                dayCardHeader.appendChild(checkboxLabel);

                const dayTypeSelect = document.createElement('select');
                dayTypeSelect.className = 'day-type-select';
                dayTypeSelect.dataset.date = date.toISOString();

                [
                  { value: 'regular', text: 'Regular Day' },
                  { value: 'vacation', text: 'Vacation' },
                  { value: 'sick', text: 'Sick' },
                  { value: 'sickFamily', text: 'Sick Family' },
                  { value: 'personal', text: 'Personal Day' },
                  { value: 'holiday', text: 'Holiday' },
                  { value: 'floater', text: 'Floater' }
                ].forEach(opt => {
                  const option = document.createElement('option');
                  option.value = opt.value;
                  option.textContent = opt.text;
                  dayTypeSelect.appendChild(option);
                });

                dayCard.appendChild(dayCardHeader);
                dayCard.appendChild(dayTypeSelect);
                daysContainer.appendChild(dayCard);
              });

              const buttonContainer = document.createElement('div');
              buttonContainer.className = 'modal-buttons';
              
              const cancelButton = document.createElement('button');
              cancelButton.id = 'cancelTimecard';
              cancelButton.className = 'k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base';
              const cancelText = document.createElement('span');
              cancelText.className = 'k-button-text';
              cancelText.textContent = 'Cancel';
              cancelButton.appendChild(cancelText);
              
              const applyButton = document.createElement('button');
              applyButton.id = 'applyTimecard';
              applyButton.className = 'k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base';
              const applyText = document.createElement('span');
              applyText.className = 'k-button-text';
              applyText.textContent = 'Apply';
              applyButton.appendChild(applyText);
              
              // Add Cancel button first, then Apply button
              buttonContainer.appendChild(cancelButton);
              buttonContainer.appendChild(applyButton);
              modalContent.appendChild(buttonContainer);
              
              modal.appendChild(modalContent);
              document.body.appendChild(modal);

              // Initialize event listeners
              this.initializeEventListeners();
            }
          }
        };

        insertControls();
      }
    },

    createDayControl: function(dateText, container) {
      const dayDate = this.parseDate(dateText);
      const dayOfWeek = dayDate.getDay();
      
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return;
      }

      const dayControl = document.createElement('div');
      dayControl.className = 'day-control';
      dayControl.style.cssText = 'border: 1px solid #e0e0e0; padding: 10px; margin-bottom: 10px; border-radius: 4px;';

      const dayHeader = document.createElement('div');
      dayHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

      const checkbox = document.createElement('div');
      checkbox.style.cssText = 'display: flex; align-items: center;';
      
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.dataset.date = dateText;
      input.style.marginRight = '8px';

      const label = document.createElement('label');
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      label.textContent = `${days[dayOfWeek]} (${dateText})`;

      checkbox.appendChild(input);
      checkbox.appendChild(label);
      dayHeader.appendChild(checkbox);

      // Add special day type selector
      const select = document.createElement('select');
      select.className = 'special-day-type';
      select.dataset.date = dateText;
      select.style.cssText = 'padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; margin-left: 10px;';

      [
        { value: '', text: 'Regular Day' },
        { value: 'vacation', text: 'Vacation' },
        { value: 'sick', text: 'Sick' },
        { value: 'sickFamily', text: 'Sick Family' },
        { value: 'personal', text: 'Personal' },
        { value: 'holiday', text: 'Holiday' },
        { value: 'floater', text: 'Floater' }
      ].forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        select.appendChild(option);
      });

      dayHeader.appendChild(select);
      dayControl.appendChild(dayHeader);
      container.appendChild(dayControl);
    },

    initializeEventListeners: function() {
      console.log('Initializing event listeners');
      const self = this;
      const fillTimecardBtn = document.getElementById('fillTimecard');
      const modal = document.querySelector('.lats-modal');
      
      if (fillTimecardBtn) {
        fillTimecardBtn.addEventListener('click', () => {
          console.log('[DEBUG] Fill button clicked');
          if (modal) {
            modal.style.display = 'block';
            
            const daysContainer = modal.querySelector('.days-container');
            console.log('[DEBUG] Found days container:', !!daysContainer);
            
            if (daysContainer) {
              daysContainer.innerHTML = ''; // Clear existing content
              
              // Get dates from the timesheet table
              const dates = [];
              const headerRow = document.querySelector('#printTSTable tr:first-child');
              console.log('[DEBUG] Found header row:', !!headerRow);
              
              if (headerRow) {
                const dateCells = headerRow.querySelectorAll('td:not(:first-child)');
                console.log('[DEBUG] Found date cells:', dateCells.length);
                
                dateCells.forEach(cell => {
                  const dateText = cell.textContent.trim();
                  console.log('[DEBUG] Processing date cell:', dateText);
                  
                  if (dateText) {
                    const date = new Date();
                    const [month, day] = dateText.split('/');
                    date.setMonth(parseInt(month) - 1);
                    date.setDate(parseInt(day));
                    
                    // Skip weekends
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                      dates.push(date);
                      console.log('[DEBUG] Added date:', date.toLocaleDateString());
                    } else {
                      console.log('[DEBUG] Skipping weekend date:', date.toLocaleDateString());
                    }
                  }
                });
              }
              
              console.log('[DEBUG] Total dates to process:', dates.length);
              
              // Create day cards
              dates.forEach(date => {
                const dayCard = document.createElement('div');
                dayCard.className = 'day-card';

                const dayCardHeader = document.createElement('div');
                dayCardHeader.className = 'day-card-header';

                const dateLabel = document.createElement('div');
                dateLabel.className = 'day-card-date';
                dateLabel.textContent = date.toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                });

                const checkboxLabel = document.createElement('label');
                checkboxLabel.className = 'day-checkbox-label';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'day-checkbox';
                checkbox.checked = true;
                checkbox.dataset.date = date.toISOString();

                checkboxLabel.appendChild(document.createTextNode('Include'));
                checkboxLabel.appendChild(checkbox);

                dayCardHeader.appendChild(dateLabel);
                dayCardHeader.appendChild(checkboxLabel);

                const dayTypeSelect = document.createElement('select');
                dayTypeSelect.className = 'day-type-select';
                dayTypeSelect.dataset.date = date.toISOString();

                [
                  { value: 'regular', text: 'Regular Day' },
                  { value: 'vacation', text: 'Vacation' },
                  { value: 'sick', text: 'Sick' },
                  { value: 'sickFamily', text: 'Sick Family' },
                  { value: 'personal', text: 'Personal Day' },
                  { value: 'holiday', text: 'Holiday' },
                  { value: 'floater', text: 'Floater' }
                ].forEach(opt => {
                  const option = document.createElement('option');
                  option.value = opt.value;
                  option.textContent = opt.text;
                  dayTypeSelect.appendChild(option);
                });

                dayCard.appendChild(dayCardHeader);
                dayCard.appendChild(dayTypeSelect);
                daysContainer.appendChild(dayCard);
              });
            }
          }
        });
      }

      const applyButton = document.getElementById('applyTimecard');
      if (applyButton) {
        applyButton.addEventListener('click', () => {
          console.log('[DEBUG] Apply button clicked');
          
          // Ensure loading overlay exists
          createLoadingOverlay();
          const loadingOverlay = document.querySelector('.lats-loading-overlay');
          
          if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
            
            try {
              // Clear all existing values first
              this.clearTimecard();
              
              chrome.storage.sync.get({
                alternateSchedule: false,
                week1: {
                  timeIn: '8:30 AM',
                  lunchOut: '12:00 PM',
                  lunchIn: '12:30 PM',
                  timeOut: '4:30 PM'
                },
                week2: {
                  timeIn: '8:30 AM',
                  lunchOut: '12:00 PM',
                  lunchIn: '12:30 PM',
                  timeOut: '4:30 PM'
                }
              }, (settings) => {
                try {
                  console.log('[DEBUG] Settings loaded:', settings);
                  
                  const dayControls = document.querySelectorAll('.day-card');
                  console.log('[DEBUG] Found day cards:', dayControls.length);
                  
                  let successCount = 0;
                  let errorCount = 0;
                  
                  dayControls.forEach((card) => {
                    try {
                      const checkbox = card.querySelector('.day-checkbox');
                      if (!checkbox?.checked) {
                        console.log('[DEBUG] Skipping unchecked day');
                        return;
                      }

                      const dateText = checkbox.dataset.date;
                      const date = new Date(dateText);
                      const dayTypeSelect = card.querySelector('.day-type-select');
                      const dayType = dayTypeSelect?.value;
                      
                      if (dayType === 'regular') {
                        const times = settings.alternateSchedule && this.isSecondWeek(date) ? 
                          settings.week2 : settings.week1;
                        this.fillTimeValues(date, times);
                        successCount++;
                      } else if (dayType) {
                        this.fillSpecialDay(date, dayType);
                        successCount++;
                      }
                    } catch (error) {
                      console.error('[DEBUG] Error processing day card:', error);
                      errorCount++;
                    }
                  });
                  
                  // Show final status
                  if (errorCount === 0) {
                    showNotification(`Successfully filled timecard for ${successCount} days`, 'success');
                  } else {
                    showNotification(`Completed with ${successCount} successes and ${errorCount} errors`, 'error');
                  }
                } catch (error) {
                  console.error('[DEBUG] Error processing timecard:', error);
                  showNotification('Error filling timecard: ' + error.message, 'error');
                } finally {
                  loadingOverlay.style.display = 'none';
                  modal.style.display = 'none';
                }
              });
            } catch (error) {
              console.error('[DEBUG] Error in apply button handler:', error);
              showNotification('Error: ' + error.message, 'error');
              loadingOverlay.style.display = 'none';
            }
          } else {
            console.error('[DEBUG] Loading overlay not found');
            showNotification('Error: Could not show loading state', 'error');
          }
        });
      }

      const cancelButton = document.getElementById('cancelTimecard');
      if (cancelButton) {
        cancelButton.addEventListener('click', () => {
          if (modal) {
            modal.style.display = 'none';
          }
        });
      }
    },

    parseDate: function(dateText) {
      console.log('Parsing date:', dateText);
      const [month, day] = dateText.split('/');
      const year = new Date().getFullYear();
      return new Date(year, parseInt(month) - 1, parseInt(day));
    },

    isSecondWeek: function(date) {
      // Get the first day of the timesheet
      const firstDateCell = document.querySelector('#printTSTable tr:first-child td:nth-child(2)');
      if (!firstDateCell) return false;
      
      const firstDateText = firstDateCell.textContent.trim();
      const firstDate = this.parseDate(firstDateText);
      
      // If the date is more than 7 days after the first date, it's in the second week
      return date.getTime() - firstDate.getTime() > 7 * 24 * 60 * 60 * 1000;
    },

    fillSpecialDay: function(date, type) {
      try {
        console.log('[DEBUG] Filling special day:', date, type);
        
        // Map UI types to input title types
        const typeMap = {
          'vacation': 'Vacation',
          'sick': 'Sick',
          'sickFamily': 'Sick Family',
          'personal': 'Personal',
          'holiday': 'Holiday',
          'floater': 'Floater'
        };

        // Get the mapped type or use the original if not found
        const mappedType = typeMap[type] || type;
        
        // Get the day of the week for the target date
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        
        // Find the first header cell that matches our date to get the day number
        const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
        const headers = Array.from(document.querySelectorAll('#timesheetTable th.k-header.timesheetGridHeader'));
        const dayIndex = headers.findIndex(th => th.textContent.trim().startsWith(dateStr)) + 1;
        
        if (dayIndex === 0) {
          throw new Error(`Could not find header for date ${dateStr}`);
        }

        // Find input with exact title format: "{type} Day {dayIndex} {dayOfWeek}"
        const titlePattern = `${mappedType} Day ${dayIndex} ${dayOfWeek}`;
        console.log('[DEBUG] Looking for title:', titlePattern);
        
        const input = document.querySelector(`input[type="text"][title="${titlePattern}"]`);
        
        if (!input) {
          throw new Error(`No input found for ${mappedType} on ${dayOfWeek}`);
        }

        console.log('[DEBUG] Found input:', input.title);
        
        // Validate hours before setting
        const hours = '7.5';
        if (!validateHours(hours)) {
          throw new Error(`Invalid hours value: ${hours}. Must be between 0 and 7.5`);
        }
        
        input.value = hours;
        const event = new Event('change', { bubbles: true });
        input.dispatchEvent(event);
        
        showNotification(`Successfully filled ${mappedType} for ${dayOfWeek}`, 'success');
      } catch (error) {
        console.error('[DEBUG] Error in fillSpecialDay:', error);
        showNotification(error.message, 'error');
        throw error; // Re-throw to handle in the calling function
      }
    },

    fillTimeValues: function(date, times) {
      try {
        console.log('[DEBUG] fillTimeValues called with:', { 
          date: date.toLocaleDateString(),
          times 
        });
        
        // Validate all time values first
        Object.entries(times).forEach(([key, value]) => {
          if (!validateTime(value)) {
            throw new Error(`Invalid time format for ${key}: ${value}`);
          }
        });
        
        const table = document.querySelector('#timesheetTable');
        if (!table) {
          throw new Error('Timesheet table not found');
        }

        // Get the day of the week for the target date
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        // Format the target date as MM/DD to match LATS format
        const targetDateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
        console.log('[DEBUG] Target day/date:', { dayOfWeek, targetDateStr });

        // Get all rows in the table
        const rows = table.getElementsByTagName('tr');
        console.log('[DEBUG] Found rows:', rows.length);

        // Time row types we need to fill
        const timeRows = {
          'Day In': times.timeIn,
          'Lunch Out': times.lunchOut,
          'Lunch In': times.lunchIn,
          'Day Out': times.timeOut
        };

        // First find the column index for our target date
        const headerRow = Array.from(rows).find(row => 
          row.querySelector('.k-header.timesheetGridHeader')
        );
        
        if (!headerRow) {
          throw new Error('Header row not found');
        }

        const headerCells = headerRow.getElementsByTagName('th');
        let targetColumnIndex = -1;

        for (let i = 0; i < headerCells.length; i++) {
          const cell = headerCells[i];
          if (cell.textContent.trim().includes(targetDateStr)) {
            targetColumnIndex = i;
            break;
          }
        }

        console.log('[DEBUG] Target column index:', targetColumnIndex);

        if (targetColumnIndex === -1) {
          throw new Error('Date column not found');
        }

        // Process each row
        for (const row of rows) {
          // Check if this row has a header cell with one of our target types
          const firstCell = row.querySelector('td');
          if (!firstCell) continue;

          const rowType = firstCell.textContent.trim();
          if (!Object.keys(timeRows).includes(rowType)) continue;

          console.log(`[DEBUG] Processing row for ${rowType}`);

          // Get all input fields in this row
          const inputs = row.getElementsByTagName('input');
          console.log(`[DEBUG] Found ${inputs.length} inputs in row`);

          // Get the input at our target column index
          const targetInput = inputs[targetColumnIndex];
          if (targetInput && targetInput.type === 'text') {
            console.log(`[DEBUG] Found input for ${rowType} at column ${targetColumnIndex}`);
            const timeValue = timeRows[rowType];
            console.log(`[DEBUG] Setting value to ${timeValue}`);
            
            targetInput.value = timeValue;
            
            // Trigger change event
            const event = new Event('change', { bubbles: true });
            targetInput.dispatchEvent(event);
            
            // Also trigger input event
            const inputEvent = new Event('input', { bubbles: true });
            targetInput.dispatchEvent(inputEvent);
            
            // Force blur to ensure LATS validation runs
            targetInput.blur();
          } else {
            console.error(`[DEBUG] No input found for ${rowType} at column ${targetColumnIndex}`);
          }
        }

        showNotification(`Successfully filled regular hours for ${dayOfWeek}`, 'success');
      } catch (error) {
        console.error('[DEBUG] Error in fillTimeValues:', error);
        showNotification(error.message, 'error');
        throw error;
      }
    },

    // Helper function to clear all timecard values
    clearTimecard: function() {
      console.log('[DEBUG] Clearing timecard values');
      
      const table = document.querySelector('#timesheetTable');
      if (!table) {
        console.error('[DEBUG] Table not found');
        return;
      }

      // Get all rows in the table
      const rows = table.getElementsByTagName('tr');
      
      // Process each row
      for (const row of rows) {
        const firstCell = row.querySelector('td');
        if (!firstCell) continue;

        const rowType = firstCell.textContent.trim();
        // Clear both regular time entry rows and special day rows
        if (['Day In', 'Lunch Out', 'Lunch In', 'Day Out'].includes(rowType)) {
          // Clear regular time entry fields
          const inputs = row.querySelectorAll('input[type="text"]');
          inputs.forEach(input => {
            input.value = '';
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
          });
        }
      }

      // Clear all special day fields (Vacation, Sick, Personal, etc.)
      const specialDayInputs = table.querySelectorAll('input[type="text"][title*=" Day "][class*="timesheetCell"]');
      specialDayInputs.forEach(input => {
        if (input.title.match(/^(Vacation|Sick|Personal|Sick Family) Day/)) {
          input.value = '0';
          const event = new Event('change', { bubbles: true });
          input.dispatchEvent(event);
        }
      });

      console.log('[DEBUG] Finished clearing timecard');
    }
  };

  // Initialize when the page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.latsEnhancer.createUIElements();
    });
  } else {
    window.latsEnhancer.createUIElements();
  }
})(); 

// Update the fillTimecard function to handle per-day types
function fillTimecard(settings) {
  const table = document.querySelector('#printTSTable');
  if (!table) return;

  const selectedDays = document.querySelectorAll('.day-checkbox:checked');
  selectedDays.forEach(checkbox => {
    const date = new Date(checkbox.dataset.date);
    const dayTypeSelect = checkbox.closest('.day-card').querySelector('.day-type-select');
    const dayType = dayTypeSelect.value;

    if (dayType === 'regular') {
      // For regular days, fill in the time values
      const times = window.latsEnhancer.isSecondWeek(date) && settings.alternateSchedule ? settings.week2 : settings.week1;
      window.latsEnhancer.fillTimeValues(date, times);
    } else {
      // For special days, fill in 7.5 hours
      window.latsEnhancer.fillSpecialDay(date, dayType);
    }
  });
}

// Update fillTimeValues to work with dates
function fillTimeValues(date, times) {
  const table = document.querySelector('#printTSTable');
  if (!table) return;

  const headerRow = table.querySelector('tr:first-child');
  const regularRow = table.querySelector('tr:nth-child(2)');
  
  if (!headerRow || !regularRow) return;

  const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
  const cells = regularRow.querySelectorAll('td');

  for (let i = 1; i < cells.length; i++) {
    const headerCell = headerRow.querySelector(`td:nth-child(${i + 1})`);
    if (headerCell && headerCell.textContent.trim().includes(dateStr)) {
      const inputs = cells[i].querySelectorAll('input[type="text"]');
      if (inputs.length >= 4) {
        inputs[0].value = times.timeIn;
        inputs[1].value = times.lunchOut;
        inputs[2].value = times.lunchIn;
        inputs[3].value = times.timeOut;
      }
      break;
    }
  }
}

// Add these utility functions near the top of the file
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `lats-notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  // Remove notification after 5 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Add notification animations
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes slideOut {
    from { transform: translateX(0); }
    to { transform: translateX(100%); }
  }
`;
document.head.appendChild(notificationStyles);

// Validation functions
function validateHours(value) {
  if (!value) return true; // Allow empty values
  const hours = parseFloat(value);
  return !isNaN(hours) && hours >= 0 && hours <= 7.5;
}

function validateTime(timeStr) {
  if (!timeStr) return true; // Allow empty values
  const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(?:AM|PM)$/i;
  return timeRegex.test(timeStr);
} 