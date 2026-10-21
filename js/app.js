/* Shared behaviour for every page: theme toggle + small DOM helpers. */
(function () {
  'use strict';

  var STORAGE_KEY = 'lab-theme';
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function paintLabel() {
    if (!toggle) return;
    var dark = currentTheme() === 'dark';
    toggle.textContent = dark ? '\u263E Dark' : '\u2600 Light';
    toggle.setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' theme');
    toggle.setAttribute('title', 'Toggle light / dark theme');
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (err) { /* private mode */ }
    paintLabel();
  }

  if (toggle) {
    paintLabel();
    toggle.addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  // Mark the nav link of the page we are on.
  var here = location.pathname.split('/').pop() || 'index.html';
  var links = document.querySelectorAll('.nav a[href]');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (href === here) links[i].setAttribute('aria-current', 'page');
  }

  // Fill in the copyright year.
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
