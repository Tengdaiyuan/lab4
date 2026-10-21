/* =====================================================================
   XML Lab - fetch book.xml, parse it with DOMParser, render the result.
   ===================================================================== */
(function () {
  'use strict';

  var SOURCE = 'book.xml';
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  var el = {
    status: document.getElementById('status'),
    cards: document.getElementById('book-cards'),
    tbody: document.getElementById('book-rows'),
    search: document.getElementById('search'),
    sort: document.getElementById('sort'),
    viewButtons: document.querySelectorAll('[data-view]'),
    statCount: document.getElementById('stat-count'),
    statTotal: document.getElementById('stat-total'),
    statAverage: document.getElementById('stat-average'),
    statRange: document.getElementById('stat-range')
  };

  var state = { books: [], query: '', sort: 'title-asc', view: 'cards' };

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

  /* ---------- XML -> plain objects ---------- */
  function parseBooks(xmlText) {
    // The classic DOMParser route required by the lab handout.
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    var parseError = xmlDoc.getElementsByTagName('parsererror')[0];
    if (parseError) {
      throw new Error('XML is not well-formed: ' + parseError.textContent.replace(/\s+/g, ' ').trim());
    }

    var bookNodes = xmlDoc.getElementsByTagName('book');
    var books = [];
    for (var i = 0; i < bookNodes.length; i++) {
      var node_ = bookNodes[i];
      var id = node_.getAttribute('id') || '';
      var title = textOf(node_, 'title');
      var author = textOf(node_, 'author');
      var priceText = textOf(node_, 'price').replace(/[^0-9.\-]/g, '');
      var price = priceText === '' ? NaN : parseFloat(priceText);

      // Well-formed-but-incomplete data is reported, not silently dropped.
      var missing = [];
      if (!id) missing.push('id');
      if (!title) missing.push('title');
      if (!author) missing.push('author');
      if (!isFinite(price)) missing.push('price');

      books.push({
        id: id || '(no id)',
        title: title || '(untitled)',
        author: author || '(unknown author)',
        price: price,
        missing: missing
      });
    }
    return books;
  }

  function textOf(parent, tagName) {
    var found = parent.getElementsByTagName(tagName)[0];
    return found ? (found.textContent || '').trim() : '';
  }

  /* ---------- filtering / sorting ---------- */
  function visibleBooks() {
    var query = state.query.trim().toLowerCase();
    var list = state.books.filter(function (book) {
      if (!query) return true;
      return (book.title + ' ' + book.author + ' ' + book.id).toLowerCase().indexOf(query) !== -1;
    });

    var by = state.sort;
    list.sort(function (a, b) {
      if (by === 'price-asc') return a.price - b.price;
      if (by === 'price-desc') return b.price - a.price;
      if (by === 'author-asc') return a.author.localeCompare(b.author);
      return a.title.localeCompare(b.title);
    });
    return list;
  }

  /* ---------- rendering ---------- */
  function renderCards(list) {
    if (!el.cards) return;
    el.cards.textContent = '';

    if (!list.length) {
      el.cards.appendChild(node('p', 'empty', 'No book matches the current filter.'));
      return;
    }

    list.forEach(function (book) {
      var card = node('article', 'card entry-card');

      var top = node('div', 'entry-top');
      top.appendChild(node('h3', '', book.title));
      top.appendChild(node('span', 'entry-id', book.id));
      card.appendChild(top);

      card.appendChild(node('p', 'meta', '\u270E ' + book.author));
      card.appendChild(node('p', 'price', isFinite(book.price) ? money.format(book.price) : 'price missing'));

      if (book.missing.length) {
        card.appendChild(node('p', 'badge', 'missing: ' + book.missing.join(', ')));
      }
      el.cards.appendChild(card);
    });
  }

  function renderTable(list) {
    if (!el.tbody) return;
    el.tbody.textContent = '';

    list.forEach(function (book) {
      var tr = document.createElement('tr');
      tr.appendChild(node('td', '', book.id));
      tr.appendChild(node('td', '', book.title));
      tr.appendChild(node('td', '', book.author));
      var priceCell = node('td', 'num', isFinite(book.price) ? money.format(book.price) : '—');
      tr.appendChild(priceCell);
      el.tbody.appendChild(tr);
    });
  }

  function renderStats() {
    var prices = state.books
      .map(function (b) { return b.price; })
      .filter(function (p) { return isFinite(p); });

    var total = prices.reduce(function (sum, p) { return sum + p; }, 0);
    var average = prices.length ? total / prices.length : 0;
    var min = prices.length ? Math.min.apply(null, prices) : 0;
    var max = prices.length ? Math.max.apply(null, prices) : 0;

    if (el.statCount) el.statCount.textContent = String(state.books.length);
    if (el.statTotal) el.statTotal.textContent = money.format(total);
    if (el.statAverage) el.statAverage.textContent = money.format(average);
    if (el.statRange) el.statRange.textContent = money.format(min) + ' – ' + money.format(max);
  }

  function render() {
    var list = visibleBooks();
    renderCards(list);
    renderTable(list);
    renderStats();
  }

  /* ---------- view switch ---------- */
  function setView(view) {
    state.view = view;
    for (var i = 0; i < el.viewButtons.length; i++) {
      var btn = el.viewButtons[i];
      var active = btn.getAttribute('data-view') === view;
      btn.className = 'btn ' + (active ? 'btn-primary' : 'btn-ghost');
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (el.cards) el.cards.classList.toggle('hidden', view !== 'cards');
    var tableShell = document.getElementById('book-table');
    if (tableShell) tableShell.classList.toggle('hidden', view !== 'table');
  }

  /* ---------- wiring ---------- */
  if (el.search) {
    el.search.addEventListener('input', function (event) {
      state.query = event.target.value;
      render();
    });
  }

  if (el.sort) {
    el.sort.addEventListener('change', function (event) {
      state.sort = event.target.value;
      render();
    });
  }

  for (var i = 0; i < el.viewButtons.length; i++) {
    el.viewButtons[i].addEventListener('click', function (event) {
      setView(event.currentTarget.getAttribute('data-view'));
    });
  }

  /* ---------- go ---------- */
  // Deep links: books.html?view=table&sort=price-desc&q=knuth
  var params = new URLSearchParams(location.search);
  var wantedView = params.get('view');
  if (wantedView === 'table' || wantedView === 'cards') state.view = wantedView;

  var wantedSort = params.get('sort');
  if (wantedSort && el.sort) {
    for (var s = 0; s < el.sort.options.length; s++) {
      if (el.sort.options[s].value === wantedSort) {
        state.sort = wantedSort;
        el.sort.value = wantedSort;
      }
    }
  }

  var wantedQuery = params.get('q');
  if (wantedQuery && el.search) {
    state.query = wantedQuery;
    el.search.value = wantedQuery;
  }

  setView(state.view);
  showStatus('loading', 'Loading ' + SOURCE + ' …');

  fetch(SOURCE, { cache: 'no-cache' })
    .then(function (response) {
      if (!response.ok) throw new Error('Fetch error: ' + response.status);
      return response.text();
    })
    .then(function (xmlText) {
      state.books = parseBooks(xmlText);
      if (!state.books.length) {
        showStatus('empty', 'The XML file was read, but it contains no <book> elements.');
      } else {
        clearStatus();
      }
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
