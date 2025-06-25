document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings when popup opens
  chrome.storage.sync.get({
    alternateSchedule: false,
    week1: {
      timeIn: '08:30',
      lunchOut: '12:00',
      lunchIn: '12:30',
      timeOut: '16:30'
    },
    week2: {
      timeIn: '08:30',
      lunchOut: '12:00',
      lunchIn: '12:30',
      timeOut: '16:30'
    }
  }, (items) => {
    document.getElementById('alternateSchedule').checked = items.alternateSchedule;
    
    // Week 1 settings
    document.getElementById('timeIn1').value = items.week1.timeIn;
    document.getElementById('lunchOut1').value = items.week1.lunchOut;
    document.getElementById('lunchIn1').value = items.week1.lunchIn;
    document.getElementById('timeOut1').value = items.week1.timeOut;
    
    // Week 2 settings
    document.getElementById('timeIn2').value = items.week2.timeIn;
    document.getElementById('lunchOut2').value = items.week2.lunchOut;
    document.getElementById('lunchIn2').value = items.week2.lunchIn;
    document.getElementById('timeOut2').value = items.week2.timeOut;
    
    // Show/hide week 2 settings based on alternate schedule
    document.getElementById('week2Settings').style.display = 
      items.alternateSchedule ? 'block' : 'none';
  });

  // Toggle alternate schedule visibility
  document.getElementById('alternateSchedule').addEventListener('change', (e) => {
    document.getElementById('week2Settings').style.display = 
      e.target.checked ? 'block' : 'none';
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', () => {
    const settings = {
      alternateSchedule: document.getElementById('alternateSchedule').checked,
      week1: {
        timeIn: document.getElementById('timeIn1').value,
        lunchOut: document.getElementById('lunchOut1').value,
        lunchIn: document.getElementById('lunchIn1').value,
        timeOut: document.getElementById('timeOut1').value
      },
      week2: {
        timeIn: document.getElementById('timeIn2').value,
        lunchOut: document.getElementById('lunchOut2').value,
        lunchIn: document.getElementById('lunchIn2').value,
        timeOut: document.getElementById('timeOut2').value
      }
    };

    chrome.storage.sync.set(settings, () => {
      const saveButton = document.getElementById('saveSettings');
      const originalText = saveButton.textContent;
      saveButton.textContent = 'Saved!';
      saveButton.disabled = true;
      
      setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
      }, 1500);
    });
  });
}); 