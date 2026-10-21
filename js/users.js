/* =====================================================================
   JSON Lab - fetch userProfiles.json and render every profile.
   ===================================================================== */
(function () {
  'use strict';

  var SOURCE = 'userProfiles.json';
  var dateFmt = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });

  var el = {
    status: document.getElementById('status'),
    grid: document.getElementById('profile-grid'),
    search: document.getElementById('search'),
    subFilter: document.getElementById('subscription-filter'),
    statUsers: document.getElementById('stat-users'),
    statSubscribed: document.getElementById('stat-subscribed'),
    statNotify: document.getElementById('stat-notify'),
    statLanguages: document.getElementById('stat-languages')
  };

  var state = { profiles: [], query: '', subscription: 'all' };

  /* ---------- helpers ---------- */
  function node(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function showStatus(kind, message) {
    if (!el.status) return;
    el.status.className = kind;
    el.status.textContent = message;
    el.status.hidden = false;
  }

  function clearStatus() {
    if (!el.status) return;
    el.status.hidden = true;
    el.status.textContent = '';
  }

  function initials(profile) {
    var first = (profile.firstName || '?').trim().charAt(0);
    var last = (profile.lastName || '').trim().charAt(0);
    return (first + last).toUpperCase();
  }

  function prettyDate(iso) {
    if (!iso) return 'not provided';
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? iso : dateFmt.format(d);
  }

  function ageFrom(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (!iso || isNaN(d.getTime())) return null;
    var today = new Date();
    var age = today.getFullYear() - d.getFullYear();
    var beforeBirthday =
      today.getMonth() < d.getMonth() ||
      (today.getMonth() === d.getMonth() && today.getDate() < d.getDate());
    return beforeBirthday ? age - 1 : age;
  }

  function addressText(address) {
    if (!address || typeof address !== 'object') return 'not provided';
    var parts = [address.street, address.city, address.state, address.zipCode]
      .filter(function (part) { return typeof part === 'string' && part.trim() !== ''; });
    return parts.length ? parts.join(', ') : 'not provided';
  }

  /* ---------- filtering ---------- */
  function visibleProfiles() {
    var query = state.query.trim().toLowerCase();
    return state.profiles.filter(function (profile) {
      var prefs = profile.preferences || {};
      if (state.subscription === 'yes' && prefs.subscription !== true) return false;
      if (state.subscription === 'no' && prefs.subscription === true) return false;
      if (!query) return true;
      var haystack = [
        profile.firstName, profile.lastName, profile.email, profile.dateOfBirth,
        addressText(profile.address), prefs.language, prefs.theme, profile.id
      ].join(' ').toLowerCase();
      return haystack.indexOf(query) !== -1;
    });
  }

  /* ---------- rendering ---------- */
  function renderProfile(profile) {
    var prefs = profile.preferences || {};
    var address = profile.address || {};
    var card = node('article', 'card profile-card');

    var head = node('div', 'profile-head');
    head.appendChild(node('div', 'avatar', initials(profile)));
    var nameBox = node('div');
    nameBox.appendChild(node('h3', 'profile-name', (profile.firstName || '') + ' ' + (profile.lastName || '')));
    nameBox.appendChild(node('p', 'profile-mail', profile.email || 'no e-mail'));
    head.appendChild(nameBox);
    card.appendChild(head);

    var kv = node('dl', 'kv');
    function pair(label, value) {
      kv.appendChild(node('dt', '', label));
      kv.appendChild(node('dd', '', value));
    }

    var age = ageFrom(profile.dateOfBirth);
    pair('Born', prettyDate(profile.dateOfBirth) + (age === null ? '' : ' (' + age + ')'));
    pair('Address', addressText(address));
    if (profile.id) pair('User id', profile.id);
    card.appendChild(kv);

    // Preferences -> chips
    var chips = node('ul', 'chip-list');
    function chip(label, value) {
      var li = node('li', 'chip');
      li.appendChild(node('strong', '', label + ': '));
      li.appendChild(document.createTextNode(String(value)));
      chips.appendChild(li);
    }
    chip('Theme', prefs.theme || 'n/a');
    chip('Language', prefs.language || 'n/a');
    chip('Notifications', prefs.notifications === true ? 'on' : 'off');
    card.appendChild(chips);

    var sub = node('p', 'badge ' + (prefs.subscription === true ? 'ok' : 'off'),
      prefs.subscription === true ? 'Newsletter subscriber' : 'Not subscribed');
    card.appendChild(sub);

    return card;
  }

  function render() {
    if (!el.grid) return;
    var list = visibleProfiles();
    el.grid.textContent = '';

    if (!list.length) {
      el.grid.appendChild(node('p', 'empty', 'No profile matches the current filter.'));
    } else {
      list.forEach(function (profile) {
        el.grid.appendChild(renderProfile(profile));
      });
    }

    if (el.statUsers) el.statUsers.textContent = String(state.profiles.length);
    if (el.statSubscribed) {
      el.statSubscribed.textContent = String(state.profiles.filter(function (p) {
        return (p.preferences || {}).subscription === true;
      }).length);
    }
    if (el.statNotify) {
      el.statNotify.textContent = String(state.profiles.filter(function (p) {
        return (p.preferences || {}).notifications === true;
      }).length);
    }
    if (el.statLanguages) {
      var langs = {};
      state.profiles.forEach(function (p) {
        var lang = (p.preferences || {}).language;
        if (lang) langs[lang] = true;
      });
      el.statLanguages.textContent = String(Object.keys(langs).length);
    }
  }

  /* ---------- wiring ---------- */
  if (el.search) {
    el.search.addEventListener('input', function (event) {
      state.query = event.target.value;
      render();
    });
  }
  if (el.subFilter) {
    el.subFilter.addEventListener('change', function (event) {
      state.subscription = event.target.value;
      render();
    });
  }

  /* ---------- go ---------- */
  showStatus('loading', 'Loading ' + SOURCE + ' …');

  fetch(SOURCE, { cache: 'no-cache' })
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Fetch error: ' + response.status);
      }
      return response.json();
    })
    .then(function (json) {
      // Accept both a bare array and an object that wraps the array.
      var list = Array.isArray(json)
        ? json
        : (Array.isArray(json.userProfiles) ? json.userProfiles
          : (Array.isArray(json.profiles) ? json.profiles : []));

      if (!list.length) {
        showStatus('empty', 'The JSON file is valid, but no user profiles were found in it.');
      } else {
        clearStatus();
      }

      state.profiles = list;
      render();
    })
    .catch(function (err) {
      showStatus('error', 'Fetch error: ' + err.message +
        (location.protocol === 'file:'
          ? ' — fetch() is blocked on file:// URLs. Serve the folder over HTTP, e.g. "npm run serve".'
          : ''));
      console.error('Fetch error: ' + err.message);
    });
})();
