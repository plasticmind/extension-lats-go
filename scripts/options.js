// Convert 24-hour time format to 12-hour format
function to12Hour(time24) {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

// Convert 12-hour time format to 24-hour format
function to24Hour(time12) {
  if (!time12) return '';
  const [time, meridiem] = time12.split(' ');
  const [hours, minutes] = time.split(':');
  let hour = parseInt(hours);
  
  if (meridiem === 'PM' && hour !== 12) {
    hour += 12;
  } else if (meridiem === 'AM' && hour === 12) {
    hour = 0;
  }
  
  return `${hour.toString().padStart(2, '0')}:${minutes}`;
}

// Save settings to chrome.storage
function saveSettings() {
  const settings = {
    alternateSchedule: document.getElementById('alternateSchedule').checked,
    week1: {
      timeIn: to12Hour(document.getElementById('timeIn1').value),
      lunchOut: to12Hour(document.getElementById('lunchOut1').value),
      lunchIn: to12Hour(document.getElementById('lunchIn1').value),
      timeOut: to12Hour(document.getElementById('timeOut1').value)
    },
    week2: {
      timeIn: to12Hour(document.getElementById('timeIn2').value),
      lunchOut: to12Hour(document.getElementById('lunchOut2').value),
      lunchIn: to12Hour(document.getElementById('lunchIn2').value),
      timeOut: to12Hour(document.getElementById('timeOut2').value)
    }
  };

  chrome.storage.sync.set(settings, () => {
    const saveStatus = document.getElementById('saveStatus');
    saveStatus.style.display = 'block';
    setTimeout(() => {
      saveStatus.style.display = 'none';
    }, 2000);
  });
}

// Load settings from chrome.storage
function loadSettings() {
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
    document.getElementById('alternateSchedule').checked = settings.alternateSchedule;
    document.getElementById('week2Schedule').style.display = settings.alternateSchedule ? 'block' : 'none';

    // Week 1
    document.getElementById('timeIn1').value = to24Hour(settings.week1.timeIn);
    document.getElementById('lunchOut1').value = to24Hour(settings.week1.lunchOut);
    document.getElementById('lunchIn1').value = to24Hour(settings.week1.lunchIn);
    document.getElementById('timeOut1').value = to24Hour(settings.week1.timeOut);

    // Week 2
    document.getElementById('timeIn2').value = to24Hour(settings.week2.timeIn);
    document.getElementById('lunchOut2').value = to24Hour(settings.week2.lunchOut);
    document.getElementById('lunchIn2').value = to24Hour(settings.week2.lunchIn);
    document.getElementById('timeOut2').value = to24Hour(settings.week2.timeOut);
  });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('save').addEventListener('click', saveSettings);
document.getElementById('alternateSchedule').addEventListener('change', (e) => {
  document.getElementById('week2Schedule').style.display = e.target.checked ? 'block' : 'none';
}); 