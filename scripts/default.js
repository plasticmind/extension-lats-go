/**
 * LATS Go! Default Page Script
 * Enhances the timesheet link on the LATS default/home page
 */

/**
 * Enhance the timesheet link styling
 */
function enhanceTimesheetLink() {
  var timesheetLink = document.getElementById('lnkMyTimesheet');
  if (timesheetLink) {
    timesheetLink.className = 'lats-go-button';
    timesheetLink.textContent = 'LATS Go!';
  }
}

/**
 * Collapse announcement and tips columns by default with a "Show more" toggle.
 * Adds lats-collapsed class directly to the td; CSS handles max-height.
 * Targets the 1st and 2nd td in the 3-column layout table. (Item 5)
 */
function collapseContentColumns() {
  var table = document.querySelector('.tabContent > div > table:nth-of-type(2)');
  if (!table) return;

  var row = table.querySelector('tbody > tr:first-child');
  if (!row) return;

  // Collapse the 1st (Announcements) and 2nd (Tips) columns
  var columns = [row.children[0], row.children[1]];

  for (var i = 0; i < columns.length; i++) {
    var td = columns[i];
    if (!td || td.classList.contains('lats-collapsed')) continue;

    // Add collapsed class — CSS handles the max-height + overflow
    td.classList.add('lats-collapsed');

    // Add toggle button
    var toggle = document.createElement('button');
    toggle.className = 'lats-collapse-toggle';
    toggle.textContent = 'Show more';
    toggle.type = 'button';
    toggle.addEventListener('click', (function(cell, btn) {
      return function() {
        var expanded = cell.classList.toggle('lats-expanded');
        btn.textContent = expanded ? 'Show less' : 'Show more';
      };
    })(td, toggle));
    td.appendChild(toggle);
  }
}

// Initialize when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    enhanceTimesheetLink();
    collapseContentColumns();
  });
} else {
  enhanceTimesheetLink();
  collapseContentColumns();
}
