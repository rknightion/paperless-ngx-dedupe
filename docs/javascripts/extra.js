/* Custom JavaScript for Paperless-NGX Dedupe documentation */

// Enhanced search functionality

document.addEventListener('DOMContentLoaded', function() {
  // Add search result analytics
  const searchInput = document.querySelector('[data-md-component="search-query"]');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      if (e.target.value.length > 2) {
        // Track search queries (if analytics are enabled)
        if (typeof gtag !== 'undefined') {
          gtag('event', 'search', {
            search_term: e.target.value
          });
        }
      }
    });
  }

  // Add copy-to-clipboard functionality for code blocks
  addCopyButtons();

  // Enhanced table functionality
  enhanceTables();

  // Add keyboard shortcuts
  addKeyboardShortcuts();

  // Theme-aware mermaid diagrams
  initMermaidTheme();
});

// Add copy buttons to code blocks
function addCopyButtons() {
  const codeBlocks = document.querySelectorAll('pre code');

  codeBlocks.forEach(function(block) {
    if (block.parentElement.querySelector('.copy-button')) return;

    const button = document.createElement('button');
    button.className = 'copy-button md-button md-button--primary';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code to clipboard');

    button.addEventListener('click', function() {
      navigator.clipboard.writeText(block.textContent).then(function() {
        button.textContent = 'Copied!';
        button.classList.add('copied');

        setTimeout(function() {
          button.textContent = 'Copy';
          button.classList.remove('copied');
        }, 2000);
      });
    });

    const pre = block.parentElement;
    pre.style.position = 'relative';
    pre.appendChild(button);
  });
}

// Enhance tables with sorting and filtering
function enhanceTables() {
  const tables = document.querySelectorAll('table');

  tables.forEach(function(table) {
    // Add table wrapper for better mobile responsiveness
    if (!table.parentElement.classList.contains('table-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      table.parentElement.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }

    // Add sortable headers for configuration tables
    if (table.querySelector('th')?.textContent.includes('Setting') ||
        table.querySelector('th')?.textContent.includes('Variable')) {
      addTableSorting(table);
    }
  });
}

// Add table sorting functionality
function addTableSorting(table) {
  const headers = table.querySelectorAll('th');

  headers.forEach(function(header, index) {
    header.style.cursor = 'pointer';
    header.setAttribute('aria-label', 'Click to sort');

    header.addEventListener('click', function() {
      sortTable(table, index);
    });
  });
}

// Sort table by column
function sortTable(table, columnIndex) {
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));

  const isAscending = !table.dataset.sortDirection || table.dataset.sortDirection === 'desc';

  rows.sort(function(a, b) {
    const aText = a.cells[columnIndex].textContent.trim();
    const bText = b.cells[columnIndex].textContent.trim();

    // Try to sort as numbers first
    const aNum = parseFloat(aText);
    const bNum = parseFloat(bText);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return isAscending ? aNum - bNum : bNum - aNum;
    }

    // Sort as strings
    return isAscending ? aText.localeCompare(bText) : bText.localeCompare(aText);
  });

  // Remove existing rows
  rows.forEach(row => row.remove());

  // Add sorted rows
  rows.forEach(row => tbody.appendChild(row));

  // Update sort direction
  table.dataset.sortDirection = isAscending ? 'asc' : 'desc';

  // Update header indicators
  const headers = table.querySelectorAll('th');
  headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
  headers[columnIndex].classList.add(isAscending ? 'sorted-asc' : 'sorted-desc');
}

// Add keyboard shortcuts
function addKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('[data-md-component="search-query"]');
      if (searchInput) {
        searchInput.focus();
      }
    }

    // Escape to close search
    if (e.key === 'Escape') {
      const searchInput = document.querySelector('[data-md-component="search-query"]');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }
    }
  });
}

// Initialize theme-aware Mermaid diagrams
function initMermaidTheme() {
  if (typeof mermaid !== 'undefined') {
    const updateMermaidTheme = function() {
      const isDark = document.body.getAttribute('data-md-color-scheme') === 'slate';
      mermaid.initialize({
        theme: isDark ? 'dark' : 'default',
        themeVariables: {
          primaryColor: '#f97316',
          primaryTextColor: isDark ? '#ffffff' : '#111827',
          primaryBorderColor: '#ea580c',
          lineColor: isDark ? '#e5e7eb' : '#111827',
          sectionBkgColor: isDark ? '#1f2937' : '#fff7ed',
          altSectionBkgColor: isDark ? '#111827' : '#ffedd5',
          gridColor: isDark ? '#374151' : '#fed7aa'
        }
      });
    };

    // Initialize on load
    updateMermaidTheme();

    // Update when theme changes
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-md-color-scheme') {
          updateMermaidTheme();
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-md-color-scheme']
    });
  }
}

// Analytics helper functions
function trackDownload(filename) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'file_download', {
      file_name: filename,
      file_extension: filename.split('.').pop()
    });
  }
}

function trackExternalLink(url) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'click', {
      event_category: 'external_link',
      event_label: url,
      transport_type: 'beacon'
    });
  }
}

// Add analytics to external links
document.addEventListener('click', function(e) {
  const link = e.target.closest('a');
  if (link && link.hostname !== window.location.hostname) {
    trackExternalLink(link.href);
  }
});

// Performance monitoring
if ('PerformanceObserver' in window) {
  const observer = new PerformanceObserver(function(list) {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'navigation') {
        // Track page load performance
        if (typeof gtag !== 'undefined') {
          gtag('event', 'timing_complete', {
            name: 'page_load',
            value: Math.round(entry.loadEventEnd - entry.loadEventStart)
          });
        }
      }
    }
  });

  observer.observe({ entryTypes: ['navigation'] });
}
