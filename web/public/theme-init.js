// Set the theme before first paint so a dark-mode reload does not flash light.
// A file rather than an inline script: the production CSP allows only same-origin scripts.
// Kept in sync with src/theme/ThemeProvider.tsx.
(function () {
  var choice = null;
  try {
    choice = localStorage.getItem('theme');
  } catch (e) {
    // Blocked storage falls back to the system setting.
  }
  var dark =
    choice === 'dark' ||
    (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
