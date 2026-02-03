(() => {
  const overlay = document.getElementById('site-search-overlay');
  if (!overlay) {
    return;
  }

  const searchButton = document.getElementById('site-search-button');
  const overlayInput = document.getElementById('search-overlay-input');
  const resultsList = document.getElementById('search-results-list');
  const emptyState = document.getElementById('search-empty');
  const noResultsState = document.getElementById('search-no-results');
  const statusRegion = document.getElementById('search-status');
  const indexUrl = overlay.getAttribute('data-search-index') || '/index.json';

  let indexData = [];
  let indexPromise = null;
  let overlayOpen = false;
  let activeIndex = -1;
  let currentResults = [];
  let lastActiveElement = null;
  let debounceTimer = null;

  const BODY_OPEN_CLASS = 'search-overlay-open';
  const MAX_RESULTS = 20;

  const escapeHtml = (value) => {
    return String(value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case '\'':
          return '&#39;';
        default:
          return char;
      }
    });
  };

  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const normalize = (value) => String(value || '').toLowerCase();

  const tokenize = (query) => {
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .filter((token, index, list) => list.indexOf(token) === index);
  };

  const prepareDoc = (doc) => {
    const tags = Array.isArray(doc.tags) ? doc.tags.join(' ') : (doc.tags || '');
    return {
      ...doc,
      _title: normalize(doc.title),
      _summary: normalize(doc.summary),
      _content: normalize(doc.content),
      _section: normalize(doc.section),
      _tags: normalize(tags),
      _date: doc.date ? new Date(doc.date).getTime() : 0
    };
  };

  const getIndex = () => {
    if (indexPromise) {
      return indexPromise;
    }
    indexPromise = fetch(indexUrl, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Search index load failed');
        }
        return response.json();
      })
      .then((data) => {
        indexData = Array.isArray(data) ? data.map(prepareDoc) : [];
        return indexData;
      })
      .catch(() => {
        indexData = [];
        return indexData;
      });
    return indexPromise;
  };

  const isEditableTarget = (target) => {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  };

  const openOverlay = (initialValue = '') => {
    if (overlayOpen) {
      overlayInput.focus();
      overlayInput.select();
      return;
    }
    lastActiveElement = document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add(BODY_OPEN_CLASS);
    overlayOpen = true;
    if (searchButton) {
      searchButton.setAttribute('aria-expanded', 'true');
    }
    getIndex();
    overlayInput.value = initialValue;
    resetResultsState();
    requestAnimationFrame(() => {
      overlayInput.focus();
      overlayInput.select();
      if (initialValue.trim()) {
        triggerSearch();
      }
    });
  };

  const closeOverlay = () => {
    if (!overlayOpen) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove(BODY_OPEN_CLASS);
    overlayOpen = false;
    activeIndex = -1;
    if (searchButton) {
      searchButton.setAttribute('aria-expanded', 'false');
    }
    if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
      lastActiveElement.focus();
    }
  };

  const resetResultsState = () => {
    emptyState.hidden = false;
    noResultsState.hidden = true;
    resultsList.innerHTML = '';
    statusRegion.textContent = '';
    activeIndex = -1;
    currentResults = [];
    overlayInput.removeAttribute('aria-activedescendant');
  };

  const computeScore = (doc, tokens) => {
    let score = 0;
    tokens.forEach((token) => {
      if (doc._title.startsWith(token)) score += 7;
      if (doc._title.includes(token)) score += 5;
      if (doc._tags.includes(token)) score += 3;
      if (doc._section.includes(token)) score += 2;
      if (doc._summary.includes(token)) score += 2;
      if (doc._content.includes(token)) score += 1;
    });
    return score;
  };

  const filterResults = (query) => {
    const tokens = tokenize(query);
    if (!tokens.length) {
      return [];
    }
    const results = [];
    indexData.forEach((doc) => {
      const combined = `${doc._title} ${doc._summary} ${doc._content} ${doc._tags} ${doc._section}`;
      const matchesAll = tokens.every((token) => combined.includes(token));
      if (!matchesAll) {
        return;
      }
      const score = computeScore(doc, tokens);
      if (score > 0) {
        results.push({ doc, score });
      }
    });
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.doc._date || 0) - (a.doc._date || 0);
    });
    return results.slice(0, MAX_RESULTS);
  };

  const highlightText = (text, tokens) => {
    if (!tokens.length) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const pattern = tokens.map(escapeRegex).join('|');
    if (!pattern) return escaped;
    const regex = new RegExp(`(${pattern})`, 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
  };

  const makeSnippet = (text, tokens) => {
    const plain = String(text || '');
    if (!plain) return '';
    const lower = plain.toLowerCase();
    let index = -1;
    tokens.some((token) => {
      const found = lower.indexOf(token);
      if (found !== -1) {
        index = found;
        return true;
      }
      return false;
    });
    const maxLength = 180;
    if (index === -1) {
      return plain.slice(0, maxLength);
    }
    const start = Math.max(0, index - 60);
    const end = Math.min(plain.length, start + maxLength);
    let snippet = plain.slice(start, end);
    if (start > 0) snippet = `...${snippet}`;
    if (end < plain.length) snippet = `${snippet}...`;
    return snippet;
  };

  const renderResults = (query, results) => {
    resultsList.innerHTML = '';
    if (!query.trim()) {
      resetResultsState();
      return;
    }
    emptyState.hidden = true;
    if (!results.length) {
      noResultsState.hidden = false;
      statusRegion.textContent = 'No results.';
      currentResults = [];
      overlayInput.removeAttribute('aria-activedescendant');
      return;
    }
    noResultsState.hidden = true;
    statusRegion.textContent = `${results.length} result${results.length === 1 ? '' : 's'} found.`;
    const tokens = tokenize(query);
    const fragment = document.createDocumentFragment();
    currentResults = results;
    results.forEach((result, index) => {
      const item = document.createElement('li');
      item.className = 'search-result';
      item.id = `search-result-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');

      const link = document.createElement('a');
      link.className = 'search-result-link';
      link.href = result.doc.permalink;

      const title = document.createElement('div');
      title.className = 'search-result-title';
      title.innerHTML = highlightText(result.doc.title || 'Untitled', tokens);

      const meta = document.createElement('div');
      meta.className = 'search-result-meta';
      const sectionLabel = result.doc.section ? result.doc.section : 'page';
      meta.textContent = sectionLabel;

      const snippetSource = result.doc.summary || result.doc.content || '';
      const snippetText = makeSnippet(snippetSource, tokens);
      const snippet = document.createElement('div');
      snippet.className = 'search-result-snippet';
      snippet.innerHTML = highlightText(snippetText, tokens);

      link.appendChild(title);
      link.appendChild(meta);
      if (snippetText) {
        link.appendChild(snippet);
      }
      item.appendChild(link);

      item.addEventListener('mouseenter', () => {
        setActiveIndex(index);
      });

      fragment.appendChild(item);
    });
    resultsList.appendChild(fragment);
    activeIndex = -1;
  };

  const setActiveIndex = (index) => {
    const items = resultsList.querySelectorAll('.search-result');
    if (!items.length) return;
    if (index < 0 || index >= items.length) return;
    activeIndex = index;
    items.forEach((item, idx) => {
      const selected = idx === activeIndex;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    const activeItem = items[activeIndex];
    if (activeItem) {
      overlayInput.setAttribute('aria-activedescendant', activeItem.id);
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  };

  const openActiveResult = () => {
    if (activeIndex < 0 && currentResults.length) {
      setActiveIndex(0);
    }
    const activeItem = resultsList.querySelector('.search-result.is-selected a');
    if (activeItem) {
      window.location.href = activeItem.href;
    }
  };

  const triggerSearch = () => {
    const query = overlayInput.value;
    getIndex().then(() => {
      const results = filterResults(query);
      renderResults(query, results);
    });
  };

  const debouncedSearch = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerSearch, 150);
  };

  overlay.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.hasAttribute('data-search-close')) {
      closeOverlay();
    }
  });

  const handleGlobalKeydown = (event) => {
    if (event.key === '/' && !overlayOpen && !isEditableTarget(event.target)) {
      event.preventDefault();
      openOverlay('');
      return;
    }
    if (event.key === 'Escape' && overlayOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeOverlay();
    }
  };

  document.addEventListener('keydown', handleGlobalKeydown, true);

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      const focusables = overlay.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  overlayInput.addEventListener('input', debouncedSearch);

  overlayInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeOverlay();
      return;
    }
    if (!currentResults.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = activeIndex < 0 ? 0 : Math.min(activeIndex + 1, currentResults.length - 1);
      setActiveIndex(nextIndex);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = activeIndex <= 0 ? 0 : activeIndex - 1;
      setActiveIndex(nextIndex);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      openActiveResult();
    }
  });

  if (searchButton) {
    searchButton.addEventListener('click', () => {
      openOverlay('');
    });
    searchButton.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeOverlay();
      }
    });
  }
})();
