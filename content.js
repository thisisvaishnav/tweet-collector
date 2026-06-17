// Cache for follower counts dynamically intercepted from GraphQL requests
const followersCache = {};

// Listen for intercepted followers count from inject.js
window.addEventListener('message', (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;

  const message = event.data;
  if (message && message.type === 'TWEET_COLLECTOR_FOLLOWERS') {
    const handle = message.handle.toLowerCase().trim();
    const followers = message.followers;
    followersCache[handle] = followers;
    // Also cache without @ prefix for easier lookup
    const rawHandle = handle.replace('@', '');
    followersCache[rawHandle] = followers;
    console.log(`[Tweet Collector] Cached followers count: ${handle} -> ${followers}`);
  }
});

// Inject network interceptor (inject.js) into the main page context
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
  console.log('[Tweet Collector] Injected inject.js successfully.');
} catch (err) {
  console.error('[Tweet Collector] Failed to inject network interceptor:', err);
}

// Inject CSS styles for the Save button (scoped and safe from style leaks)
const style = document.createElement('style');
style.textContent = `
  .tweet-save-button-container {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: rgb(113, 118, 123); /* Twitter dim grey */
    margin-right: 12px;
    user-select: none;
    transition: color 0.2s;
  }
  
  /* Use Twitter's brand colors on hover */
  .tweet-save-button-container:hover {
    color: rgb(29, 155, 240) !important; /* X Blue */
  }
  
  .tweet-save-button-container .btn-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    transition: background-color 0.2s;
  }
  
  .tweet-save-button-container:hover .btn-icon-wrapper {
    background-color: rgba(29, 155, 240, 0.1);
  }
  
  .tweet-save-button-container .btn-icon {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }
  
  .tweet-save-button-container .save-text {
    margin-left: 4px;
    font-weight: 500;
  }
  
  /* Saving State */
  .tweet-save-button-container.saving {
    color: rgb(234, 179, 8) !important; /* Yellow-500 */
  }
  .tweet-save-button-container.saving .btn-icon-wrapper {
    background-color: rgba(234, 179, 8, 0.1);
  }
  
  /* Saved State */
  .tweet-save-button-container.saved {
    color: rgb(34, 197, 94) !important; /* Green-500 */
  }
  .tweet-save-button-container.saved .btn-icon-wrapper {
    background-color: rgba(34, 197, 94, 0.1);
  }
  
  /* Error State */
  .tweet-save-button-container.error {
    color: rgb(239, 68, 68) !important; /* Red-500 */
  }
  .tweet-save-button-container.error .btn-icon-wrapper {
    background-color: rgba(239, 68, 68, 0.1);
  }
`;
document.head.appendChild(style);

// Utility to parse text counts like "1.2K" or "3.4M" into integers
function parseCount(str) {
  if (!str) return 0;
  const cleaned = str.trim().toUpperCase().replace(/,/g, '');
  const match = cleaned.match(/^([\d.]+)([KMB])?$/);
  if (!match) {
    const numMatch = cleaned.match(/[\d.]+/);
    return numMatch ? parseFloat(numMatch[0]) : 0;
  }
  const val = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'K') return Math.round(val * 1000);
  if (unit === 'M') return Math.round(val * 1000000);
  if (unit === 'B') return Math.round(val * 1000000000);
  return Math.round(val);
}

// Extractor helper: text content (handles quote tweets to save full context)
function extractText(tweetEl) {
  const textElements = tweetEl.querySelectorAll('[data-testid="tweetText"]');
  if (textElements.length === 0) return '';

  let mainText = textElements[0].innerText.trim();

  // Check if there is a quoted tweet cell
  const quoteCell = tweetEl.querySelector('[data-testid="quoteCell"]');
  if (quoteCell) {
    let quoteAuthor = 'Unknown';
    const quoteUserNameEl = quoteCell.querySelector('[data-testid="User-Name"]');
    
    if (quoteUserNameEl) {
      const spans = quoteUserNameEl.querySelectorAll('span');
      let handle = '';
      let name = '';
      for (let span of spans) {
        const text = span.innerText.trim();
        if (text.startsWith('@')) {
          handle = text;
        } else if (text && text !== '·' && !text.match(/^\d+[hmdy]$/)) {
          if (!name) name = text;
        }
      }
      if (handle) {
        quoteAuthor = name ? `${name} (${handle})` : handle;
      } else {
        quoteAuthor = quoteUserNameEl.innerText.trim().replace(/\n/g, ' ');
      }
    } else {
      // Fallback: search for any handle span inside the quote cell
      const allSpans = quoteCell.querySelectorAll('span');
      for (let span of allSpans) {
        const text = span.innerText.trim();
        if (text.startsWith('@')) {
          quoteAuthor = text;
          break;
        }
      }
    }

    // Extract the quoted tweet's text content
    const quoteTextEl = quoteCell.querySelector('[data-testid="tweetText"]') || textElements[1];
    const quoteText = quoteTextEl ? quoteTextEl.innerText.trim() : '';

    if (quoteText) {
      mainText += `\n\n--- Quoted Tweet by ${quoteAuthor} ---\n${quoteText}`;
    }
  }

  return mainText;
}

// Extractor helper: author
function extractAuthor(tweetEl) {
  const userNameEl = tweetEl.querySelector('[data-testid="User-Name"]');
  if (!userNameEl) return { name: 'Unknown', handle: 'unknown' };

  let handle = 'unknown';
  let name = 'Unknown';

  const spans = userNameEl.querySelectorAll('span');
  for (let span of spans) {
    const text = span.innerText.trim();
    if (text.startsWith('@')) {
      handle = text;
      break;
    }
  }

  const nameLink = userNameEl.querySelector('a');
  if (nameLink) {
    const nameSpan = nameLink.querySelector('span');
    if (nameSpan) {
      name = nameSpan.innerText.trim();
    } else {
      name = nameLink.innerText.trim();
    }
  }

  return { name, handle };
}

// Extractor helper: URL and Tweet ID
function extractUrlAndId(tweetEl) {
  const timeEl = tweetEl.querySelector('time');
  let href = '';
  if (timeEl) {
    const linkEl = timeEl.closest('a');
    if (linkEl) href = linkEl.getAttribute('href');
  }

  if (!href) {
    const statusLink = tweetEl.querySelector('a[href*="/status/"]');
    if (statusLink) href = statusLink.getAttribute('href');
  }

  if (href) {
    const idMatch = href.match(/\/status\/(\d+)/);
    const id = idMatch ? idMatch[1] : '';
    const url = 'https://x.com' + href.split('?')[0];
    return { id, url };
  }

  return { id: '', url: '' };
}

// Extractor helper: engagement metrics
function extractStats(tweetEl) {
  let replies = 0, reposts = 0, likes = 0, views = 0;

  const interactiveElements = tweetEl.querySelectorAll('[role="button"], a[role="link"], div[role="group"] > div');
  interactiveElements.forEach(btn => {
    const label = btn.getAttribute('aria-label');
    if (label) {
      const cleanLabel = label.toLowerCase();
      const numMatch = cleanLabel.match(/([\d,.]+)\s*(reply|replies|repost|reposts|retweet|retweets|like|likes|view|views)/);
      if (numMatch) {
        const val = parseCount(numMatch[1]);
        const type = numMatch[2];
        if (type.startsWith('reply')) replies = val;
        else if (type.startsWith('repost') || type.startsWith('retweet')) reposts = val;
        else if (type.startsWith('like')) likes = val;
        else if (type.startsWith('view')) views = val;
      }
    }
  });

  if (replies === 0) {
    const el = tweetEl.querySelector('[data-testid="reply"]');
    if (el) replies = parseCount(el.innerText);
  }
  if (reposts === 0) {
    const el = tweetEl.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
    if (el) reposts = parseCount(el.innerText);
  }
  if (likes === 0) {
    const el = tweetEl.querySelector('[data-testid="like"], [data-testid="unlike"]');
    if (el) likes = parseCount(el.innerText);
  }
  if (views === 0) {
    const el = tweetEl.querySelector('[data-testid="analytics"], a[href*="/analytics"]');
    if (el) views = parseCount(el.innerText);
  }

  return { replies, reposts, likes, views };
}

// Extract all tweet details
function extractTweetData(tweetEl) {
  const { id, url } = extractUrlAndId(tweetEl);
  const text = extractText(tweetEl);
  const { name, handle } = extractAuthor(tweetEl);
  const { replies, reposts, likes, views } = extractStats(tweetEl);

  return {
    id,
    url,
    text,
    author: `${name} (${handle})`,
    authorHandle: handle,
    likes,
    replies,
    reposts,
    views
  };
}

// Get follower count for a user handle — cache-only, zero extra requests to X
// The cache is populated automatically by inject.js reading X's own GraphQL responses.
// If the handle isn't cached yet (e.g. you saved before the timeline fully loaded),
// followers will be 0. Tip: hover over the author's avatar first — X will fire a
// profile GraphQL call that inject.js will intercept and cache.
function fetchFollowersCount(handle) {
  if (!handle || handle === 'unknown' || handle === '@unknown') return 0;

  const normalizedHandle = handle.toLowerCase().trim();
  const rawHandle = normalizedHandle.replace('@', '');

  if (followersCache[normalizedHandle] !== undefined) {
    console.log(`[Tweet Collector] Cache hit: ${normalizedHandle} -> ${followersCache[normalizedHandle]} followers`);
    return followersCache[normalizedHandle];
  }
  if (followersCache[rawHandle] !== undefined) {
    console.log(`[Tweet Collector] Cache hit: ${rawHandle} -> ${followersCache[rawHandle]} followers`);
    return followersCache[rawHandle];
  }

  // Not in cache yet — return 0, no extra requests made to X
  console.warn(`[Tweet Collector] No cached follower count for ${rawHandle}. Hover the author avatar to warm the cache, then Save.`);
  return 0;
}

// Inject "Save" button into a single tweet
function injectSaveButton(tweetEl) {
  if (tweetEl.querySelector('.tweet-save-button-container')) return;

  const actionGroup = tweetEl.querySelector('div[role="group"]');
  if (!actionGroup) return;

  const btnContainer = document.createElement('div');
  btnContainer.className = 'tweet-save-button-container';
  btnContainer.setAttribute('role', 'button');
  btnContainer.setAttribute('tabindex', '0');

  // Bookmark-like SVG icon
  btnContainer.innerHTML = `
    <div class="btn-icon-wrapper">
      <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v15.44l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path>
      </svg>
    </div>
    <span class="save-text">Save</span>
  `;

  // Click Handler with strict event isolation
  btnContainer.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (btnContainer.classList.contains('saving') || btnContainer.classList.contains('saved')) return;

    btnContainer.className = 'tweet-save-button-container saving';
    const textSpan = btnContainer.querySelector('.save-text');
    textSpan.innerText = 'Analyzing...';

    const data = extractTweetData(tweetEl);
    if (!data.id) {
      console.warn('[Tweet Collector] Safe Skip: Could not parse Tweet ID.');
      btnContainer.className = 'tweet-save-button-container error';
      textSpan.innerText = 'No ID';
      setTimeout(() => {
        btnContainer.className = 'tweet-save-button-container';
        textSpan.innerText = 'Save';
      }, 3000);
      return;
    }

    try {
      console.log(`[Tweet Collector] Fetching followers count for ${data.authorHandle}...`);
      data.followers = fetchFollowersCount(data.authorHandle);
      
      textSpan.innerText = 'Saving...';
      const response = await fetch('http://localhost:3000/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        btnContainer.className = 'tweet-save-button-container saved';
        textSpan.innerText = 'Saved!';
        setTimeout(() => {
          btnContainer.className = 'tweet-save-button-container';
          textSpan.innerText = 'Save';
        }, 3000);
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (err) {
      console.error('[Tweet Collector] Failed to save tweet:', err);
      btnContainer.className = 'tweet-save-button-container error';
      textSpan.innerText = 'Error';
      setTimeout(() => {
        btnContainer.className = 'tweet-save-button-container';
        textSpan.innerText = 'Save';
      }, 3000);
    }
  });

  actionGroup.appendChild(btnContainer);
}

// Scan DOM and inject buttons
function scanAndInject() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(injectSaveButton);
}

// Throttled scan to minimize CPU footprint and prevent layout recalculation alerts
let throttleTimeout = null;
function throttledScan() {
  if (throttleTimeout) return;
  
  // Use requestIdleCallback if available for ultra-smooth UI threads
  if (window.requestIdleCallback) {
    throttleTimeout = true;
    window.requestIdleCallback(() => {
      scanAndInject();
      setTimeout(() => { throttleTimeout = false; }, 250);
    });
  } else {
    throttleTimeout = setTimeout(() => {
      scanAndInject();
      throttleTimeout = null;
    }, 250);
  }
}

// Set up MutationObserver to handle scrolling safely and stealthily
const observer = new MutationObserver((mutations) => {
  throttledScan();
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial run
scanAndInject();

// Handle messages from popup.js (in case popup triggers extraction manually)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    const activeTweet = document.querySelector('article[data-testid="tweet"]');
    if (activeTweet) {
      const data = extractTweetData(activeTweet);
      sendResponse(data);
    } else {
      sendResponse({ error: "No tweet found on page" });
    }
  }
  return true;
});