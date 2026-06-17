// Dashboard API and interaction controller

// DOM elements
const tweetsGrid = document.getElementById('tweets-grid');
const kpiTotal = document.getElementById('kpi-total').querySelector('.kpi-value');
const kpiAvgEngagement = document.getElementById('kpi-avg-engagement').querySelector('.kpi-value');
const filterPattern = document.getElementById('filter-pattern');
const sortBy = document.getElementById('sort-by');
const searchInput = document.getElementById('search-input');
const btnSemanticSearch = document.getElementById('btn-semantic-search');
const resultsCount = document.getElementById('results-count');
const resultsTitle = document.getElementById('results-title');

// Generator elements
const selectedCountEl = document.getElementById('selected-count');
const genTopic = document.getElementById('gen-topic');
const btnGenerate = document.getElementById('btn-generate');
const genOutputContainer = document.getElementById('gen-output-container');
const genOutputText = document.getElementById('gen-output-text');
const btnCopyTweet = document.getElementById('btn-copy-tweet');

// Global State
let savedTweets = [];
let selectedTweetIDs = new Set();
let isSemanticSearchActive = false;

// API Base URL
const API_BASE = ''; // Same host

// Load and Render Tweets
async function loadTweets() {
  isSemanticSearchActive = false;
  resultsTitle.innerText = 'Saved Tweets';
  
  const pattern = filterPattern.value;
  const sort = sortBy.value;
  const search = searchInput.value;

  showLoader();

  try {
    const url = new URL(`${API_BASE}/tweets`, window.location.origin);
    if (search) url.searchParams.append('search', search);
    if (pattern && pattern !== 'All') url.searchParams.append('pattern', pattern);
    if (sort) url.searchParams.append('sortBy', sort);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error('Failed to fetch tweets');
    
    savedTweets = await response.ok ? await response.json() : [];
    if (!Array.isArray(savedTweets)) savedTweets = [];
    
    renderTweets(savedTweets);
    updateKPIs();
  } catch (error) {
    console.error('Error loading tweets:', error);
    showErrorState('Failed to load tweets from server.');
  }
}

// Perform Semantic Search
async function performSemanticSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    alert('Please enter a query in the search bar to run a Semantic Search.');
    return;
  }

  showLoader();
  isSemanticSearchActive = true;
  resultsTitle.innerText = `Semantic Search Results for "${query}"`;

  try {
    const response = await fetch(`${API_BASE}/search-semantic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 25 })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to complete semantic search');
    }

    const data = await response.json();
    
    // Map backend array similarity to list
    const results = data.map(item => ({
      ...item,
      similarityScore: item.similarity
    }));

    renderTweets(results);
    resultsCount.innerText = `${results.length} matched semantically`;
  } catch (error) {
    console.error('Semantic search failed:', error);
    alert(error.message || 'Semantic search failed. Is your OPENAI_API_KEY set on the server?');
    loadTweets(); // Fallback
  }
}

// Helper: Format pattern name to display nicely
function formatPatternName(pattern) {
  if (!pattern) return 'Unclassified';
  const mapping = {
    'contrarian_take': 'Contrarian Take',
    'personal_story': 'Personal Story',
    'build_in_public': 'Build in Public',
    'data_shock': 'Data/Stat Shock',
    'prediction': 'Prediction',
    'callout': 'Callout/Critique',
    'listicle': 'Listicle/Thread',
    'observation': 'Simple Observation'
  };
  return mapping[pattern] || pattern;
}

// Render Tweets into Grid
function renderTweets(tweetsList) {
  tweetsGrid.innerHTML = '';
  
  if (!tweetsList || tweetsList.length === 0) {
    resultsCount.innerText = '0 tweets';
    tweetsGrid.innerHTML = `
      <div class="no-results">
        <svg viewBox="0 0 24 24" width="48" height="48">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <span>No tweets matches this query. Scroll X and click 'Save' to collect!</span>
      </div>
    `;
    return;
  }

  resultsCount.innerText = `${tweetsList.length} tweet${tweetsList.length > 1 ? 's' : ''}`;

  tweetsList.forEach(t => {
    const card = document.createElement('div');
    card.className = `tweet-card ${selectedTweetIDs.has(t.id) ? 'selected' : ''}`;
    card.dataset.id = t.id;

    // Get display category class
    const categoryClass = getCategoryClass(t.pattern);

    // Calculate Engagement Class using followers-based rules
    let engagementClass = 'engagement-low';
    if (t.followers > 0) {
      const bucket = t.followers < 5000 ? 'micro' : t.followers < 50000 ? 'small' : t.followers < 500000 ? 'mid' : 'large';
      const threshold = bucket === 'micro' ? 15.0 : bucket === 'small' ? 5.0 : bucket === 'mid' ? 2.0 : 0.8;
      if (t.engagement_rate > threshold * 1.5) engagementClass = 'engagement-high';
      else if (t.engagement_rate > threshold) engagementClass = 'engagement-mid';
    } else {
      if (t.engagement_rate > 10.0) engagementClass = 'engagement-high';
      else if (t.engagement_rate > 3.0) engagementClass = 'engagement-mid';
    }

    // Similarity tag if semantic search is active
    const simTag = t.similarityScore !== undefined
      ? `<span class="similarity-badge">Match: ${Math.round(t.similarityScore * 100)}%</span>`
      : '';

    // Handle string format or object format for author
    let displayName = 'Unknown';
    let handle = '@unknown';
    
    if (t.author) {
      const handleMatch = t.author.match(/\(([^)]+)\)/);
      if (handleMatch) {
        handle = handleMatch[1];
        displayName = t.author.replace(/\([^)]+\)/, '').trim();
      } else {
        displayName = t.author;
      }
    }

    // Format metrics
    const likes = formatNumber(t.likes);
    const replies = formatNumber(t.replies);
    const reposts = formatNumber(t.reposts);
    const views = formatNumber(t.views);
    const rateStr = t.engagement_rate.toFixed(1) + '%';

    // Copywriting box if hook exists
    let copywritingHTML = '';
    if (t.hook_text) {
      copywritingHTML = `
        <div class="copywriting-details" onclick="event.stopPropagation();">
          <div class="hook-header">
            Hook
            <span class="hook-type-badge">${escapeHTML(t.hook_type || 'General')}</span>
          </div>
          <div class="hook-content">"${escapeHTML(t.hook_text)}"</div>
          ${t.structure_notes ? `<div class="structure-notes"><strong>Notes:</strong> ${escapeHTML(t.structure_notes)}</div>` : ''}
        </div>
      `;
    }

    // Badges HTML
    let badgeHTML = '';
    if (t.is_viral) {
      badgeHTML = `<span class="viral-badge" title="Viral for account size">🔥 Viral</span>`;
    } else if (t.is_candidate) {
      badgeHTML = `<span class="candidate-badge" title="Fits startup/AI niche">🎯 Niche</span>`;
    } else {
      badgeHTML = `<span class="candidate-badge" style="color: #64748b; border-color: rgba(148, 163, 184, 0.15)" title="Filtered out from tech/AI niche">⚠️ Non-Niche</span>`;
    }

    card.innerHTML = `
      <div class="tweet-header">
        <div class="tweet-author">
          <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
            <span class="author-display">${escapeHTML(displayName)}</span>
            ${badgeHTML}
          </div>
          <span class="author-handle">${escapeHTML(handle)}</span>
        </div>
        <span class="category-pill ${categoryClass}">${escapeHTML(formatPatternName(t.pattern))}</span>
      </div>
      
      <div class="tweet-body">${escapeHTML(t.text)}</div>
      
      ${copywritingHTML}
      
      ${simTag}

      <div class="tweet-stats">
        <div class="stat-item" title="Replies">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.488c4.421 0 8.006 3.58 8.006 8a8.006 8.006 0 0 1-8.006 8H9.756l-5.348 4.28a.75.75 0 0 1-1.217-.589V18.25c-1.411-1.47-2.22-3.48-2.22-5.5c0-.91-.186-1.75-.417-2.75z"/>
          </svg>
          <span>${replies}</span>
        </div>
        <div class="stat-item" title="Reposts">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M4.5 3.88l4.4 4.4a.75.75 0 0 1-1.06 1.06L4.5 6.06V14.5a3.5 3.5 0 0 0 3.5 3.5h7.25a.75.75 0 0 1 0 1.5H8A5 5 0 0 1 3 14.5V6.06L.66 8.4a.75.75 0 0 1-1.06-1.06l4.4-4.4a.75.75 0 0 1 1.06 0zm15 16.24l-4.4-4.4a.75.75 0 1 1 1.06-1.06l3.34 3.34V9.5A3.5 3.5 0 0 0 16 6H8.75a.75.75 0 0 1 0-1.5H16A5 5 0 0 1 21 9.5v8.44l2.34-2.34a.75.75 0 0 1 1.06 1.06l-4.4 4.4a.75.75 0 0 1-1.06 0z"/>
          </svg>
          <span>${reposts}</span>
        </div>
        <div class="stat-item" title="Likes">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M20.884 13.19c-1.351 2.48-5.748 6.57-8.1 8.76a1.004 1.004 0 0 1-1.35 0c-2.353-2.19-6.75-6.28-8.102-8.76C1.816 10.43 2.16 6.87 4.704 4.41c2.02-1.96 5.17-1.86 7.046.12c1.876-1.98 5.026-2.08 7.046-.12c2.544 2.46 2.888 6.02 1.388 8.78z"/>
          </svg>
          <span>${likes}</span>
        </div>
        <div class="stat-item" title="Views">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M8.75 21V3h2v18h-2zM3 21v-6h2v6H3zm12.25 0V11h2v10h-2zM21 21v-8h2v8h-2z"/>
          </svg>
          <span>${views}</span>
        </div>
        <span class="engagement-badge ${engagementClass}" title="Engagement Rate relative to follower count">
          ${rateStr}
        </span>
      </div>

      <div class="card-footer">
        <a href="${t.url}" target="_blank" class="tweet-link" onclick="event.stopPropagation();">
          View on X
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
          </svg>
        </a>
        <button class="btn-delete-tweet" title="Delete Tweet" onclick="deleteTweet('${t.id}', event)">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 2px;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          Delete
        </button>
      </div>
    `;

    // Click selection toggler (for structure generation examples)
    card.addEventListener('click', () => {
      toggleSelectTweet(t.id, card);
    });

    tweetsGrid.appendChild(card);
  });
}

// Select/Deselect a Card for RAG template
function toggleSelectTweet(id, cardElement) {
  if (selectedTweetIDs.has(id)) {
    selectedTweetIDs.delete(id);
    cardElement.classList.remove('selected');
  } else {
    selectedTweetIDs.add(id);
    cardElement.classList.add('selected');
  }

  // Update button and display
  const count = selectedTweetIDs.size;
  selectedCountEl.innerText = count;
  btnGenerate.disabled = !genTopic.value.trim();
}

// Generate New Copy
async function generateTweet() {
  const topic = genTopic.value.trim();
  const ids = Array.from(selectedTweetIDs);
  const patternSelect = document.getElementById('gen-pattern');
  const pattern = patternSelect ? patternSelect.value : 'auto';

  if (!topic) return;

  btnGenerate.disabled = true;
  btnGenerate.innerText = 'Analyzing & Writing...';
  genOutputContainer.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        example_ids: ids,
        pattern: pattern
      })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to generate tweet copy');
    }

    const result = await response.json();
    
    genOutputText.innerText = result.tweet;
    genOutputContainer.style.display = 'flex';
  } catch (error) {
    console.error('Generation failed:', error);
    alert(error.message || 'Generation failed. Make sure API keys are configured on the backend.');
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.innerText = 'Generate Viral Tweet';
  }
}

// Update KPIs based on loaded list
function updateKPIs() {
  const total = savedTweets.length;
  kpiTotal.innerText = total;

  if (total === 0) {
    kpiAvgEngagement.innerText = '0.0%';
    return;
  }

  const sumEng = savedTweets.reduce((acc, curr) => acc + curr.engagement_rate, 0);
  const avg = sumEng / total;
  kpiAvgEngagement.innerText = avg.toFixed(1) + '%';
}

// Helper: Show query loader
function showLoader() {
  tweetsGrid.innerHTML = `
    <div class="loader-container">
      <div class="loader"></div>
      <span>Querying DB...</span>
    </div>
  `;
}

// Helper: Show error
function showErrorState(msg) {
  tweetsGrid.innerHTML = `
    <div class="no-results">
      <div class="status-indicator offline" style="width: 24px; height: 24px; margin-bottom: 8px;"></div>
      <span>${msg}</span>
    </div>
  `;
}

// Helper: number conversions (e.g. 15400 -> 15.4K)
function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

// Helper: Normalize category class name
function getCategoryClass(cat) {
  if (!cat) return 'cat-unclassified';
  return 'cat-' + cat.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
}

// Helper: escape HTML
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Event Listeners
filterPattern.addEventListener('change', loadTweets);
sortBy.addEventListener('change', loadTweets);

// Trigger search on debounce/delay or Enter key
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (isSemanticSearchActive) {
      performSemanticSearch();
    } else {
      loadTweets();
    }
  }
});

searchInput.addEventListener('input', () => {
  if (searchInput.value.trim() === '' && isSemanticSearchActive) {
    loadTweets();
  }
});

btnSemanticSearch.addEventListener('click', performSemanticSearch);

genTopic.addEventListener('input', () => {
  btnGenerate.disabled = !genTopic.value.trim();
});

btnGenerate.addEventListener('click', generateTweet);

btnCopyTweet.addEventListener('click', () => {
  const text = genOutputText.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btnCopyTweet.innerText;
    btnCopyTweet.innerText = 'Copied!';
    setTimeout(() => {
      btnCopyTweet.innerText = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Copy failed:', err);
  });
});

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  loadTweets();
  // Auto-refresh stats every 10 seconds in case they are saving items actively
  setInterval(() => {
    if (searchInput.value.trim() === '' && !isSemanticSearchActive) {
      loadTweets();
    }
  }, 10000);
});

// Delete Tweet handler
async function deleteTweet(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (!confirm('Are you sure you want to delete this tweet from your database?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/delete?id=${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete tweet');
    }

    // Deselect if it was selected
    if (selectedTweetIDs.has(id)) {
      selectedTweetIDs.delete(id);
      selectedCountEl.innerText = selectedTweetIDs.size;
      const hasTopic = !!genTopic.value.trim();
      btnGenerate.disabled = !hasTopic || selectedTweetIDs.size === 0;
    }

    // Reload list
    loadTweets();
  } catch (error) {
    console.error('Failed to delete tweet:', error);
    alert('Failed to delete tweet from database.');
  }
}
window.deleteTweet = deleteTweet;
