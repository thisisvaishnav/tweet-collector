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
  /* ── Save Button ──────────────────────────────────────────── */
  .tweet-save-button-container {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: rgb(113, 118, 123);
    margin-right: 12px;
    user-select: none;
    transition: color 0.2s;
  }
  .tweet-save-button-container:hover {
    color: rgb(29, 155, 240) !important;
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
  .tweet-save-button-container.saving {
    color: rgb(234, 179, 8) !important;
  }
  .tweet-save-button-container.saving .btn-icon-wrapper {
    background-color: rgba(234, 179, 8, 0.1);
  }
  .tweet-save-button-container.saved {
    color: rgb(34, 197, 94) !important;
  }
  .tweet-save-button-container.saved .btn-icon-wrapper {
    background-color: rgba(34, 197, 94, 0.1);
  }
  .tweet-save-button-container.error {
    color: rgb(239, 68, 68) !important;
  }
  .tweet-save-button-container.error .btn-icon-wrapper {
    background-color: rgba(239, 68, 68, 0.1);
  }

  /* ── Comment Button ───────────────────────────────────────── */
  .tweet-comment-button-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-right: 12px;
    overflow: visible !important;
    z-index: 1;
  }
  .tweet-comment-btn {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: rgb(113, 118, 123);
    user-select: none;
    transition: color 0.2s;
    background: none;
    border: none;
    padding: 0;
    outline: none;
  }
  .tweet-comment-btn:hover {
    color: rgb(29, 155, 240) !important;
  }
  .tweet-comment-btn .btn-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    transition: background-color 0.2s;
  }
  .tweet-comment-btn:hover .btn-icon-wrapper {
    background-color: rgba(29, 155, 240, 0.1);
  }
  .tweet-comment-btn .btn-icon {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }
  .tweet-comment-btn .comment-text {
    margin-left: 4px;
    font-weight: 500;
  }
  .tweet-comment-btn.commenting {
    color: rgb(99, 179, 237) !important;
    pointer-events: none;
  }
  .tweet-comment-btn.commented {
    color: rgb(34, 197, 94) !important;
  }
  .tweet-comment-btn.commented .btn-icon-wrapper {
    background-color: rgba(34, 197, 94, 0.1);
  }
  .tweet-comment-btn.error {
    color: rgb(239, 68, 68) !important;
  }

  /* ── Comment Dropdown ─────────────────────────────────────── */
  .tc-comment-dropdown {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    background: #16181c;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35);
    min-width: 260px;
    max-width: 320px;
    z-index: 99999;
    overflow: hidden;
    animation: tc-dropdown-in 0.18s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  @keyframes tc-dropdown-in {
    from { opacity: 0; transform: translateX(-50%) scale(0.92) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) scale(1)    translateY(0); }
  }
  .tc-comment-dropdown-header {
    padding: 14px 16px 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(113,118,123);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .tc-comment-option {
    display: block;
    width: 100%;
    padding: 12px 16px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    color: rgb(231, 233, 234);
    line-height: 1.4;
    transition: background 0.15s;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .tc-comment-option:last-child {
    border-bottom: none;
  }
  .tc-comment-option:hover {
    background: rgba(29, 155, 240, 0.12);
    color: #fff;
  }
  .tc-comment-option:active {
    background: rgba(29, 155, 240, 0.22);
  }
  .tc-dropdown-arrow {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 14px;
    height: 14px;
    background: #16181c;
    border-right: 1px solid rgba(255,255,255,0.12);
    border-bottom: 1px solid rgba(255,255,255,0.12);
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

// ── Predefined comments list ──────────────────────────────────────────────────
const PREDEFINED_COMMENTS = [
  "🔥 This is fire! Love this take.",
  "💯 Absolutely agree with this!",
  "Great insight, thanks for sharing!",
  "This needs more attention 👀",
  "Facts 🙌 Well said.",
  "Bookmarking this for later!",
  "Couldn't have said it better myself.",
  "This is underrated content 🚀",
  "Interesting perspective! Thanks for posting.",
  "This made my day 😄"
];

// Close all open dropdowns (called before opening a new one)
function closeAllCommentDropdowns() {
  document.querySelectorAll('.tc-comment-dropdown').forEach(d => d.remove());
}

// Post a comment (reply) on a tweet using X's own reply flow
async function postComment(tweetEl, commentText, btn, textSpan) {
  btn.classList.add('commenting');
  textSpan.innerText = 'Posting...';

  try {
    // 1. Click the tweet's native reply button to open the reply dialog
    const replyBtn = tweetEl.querySelector('[data-testid="reply"]');
    if (!replyBtn) throw new Error('Reply button not found');
    replyBtn.click();

    // 2. Wait for the reply modal / inline editor to appear
    const replyBox = await waitForElement(
      '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_0_label"]',
      4000
    );
    if (!replyBox) throw new Error('Reply box did not appear');

    // 3. Focus and set the comment text via React's synthetic event system
    replyBox.focus();
    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype, 'innerHTML'
    );
    // Use execCommand for contenteditable divs (X's reply box)
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, commentText);

    // Dispatch input event so React picks up the value
    replyBox.dispatchEvent(new Event('input', { bubbles: true }));
    replyBox.dispatchEvent(new Event('change', { bubbles: true }));

    // 4. Wait briefly for the submit button to become enabled, then click it
    await sleep(600);
    const submitBtn = await waitForElement(
      '[data-testid="tweetButtonInline"]:not([disabled]), [data-testid="tweetButton"]:not([disabled])',
      3000
    );
    if (!submitBtn) throw new Error('Submit button not enabled in time');
    submitBtn.click();

    // 5. Success state
    btn.classList.remove('commenting');
    btn.classList.add('commented');
    textSpan.innerText = 'Commented!';
    setTimeout(() => {
      btn.classList.remove('commented');
      textSpan.innerText = 'Comment';
    }, 3000);

  } catch (err) {
    console.error('[Tweet Collector] Comment failed:', err);
    btn.classList.remove('commenting');
    btn.classList.add('error');
    textSpan.innerText = 'Error';
    setTimeout(() => {
      btn.classList.remove('error');
      textSpan.innerText = 'Comment';
    }, 3000);
    // Close any open dialog
    const closeBtn = document.querySelector('[data-testid="app-bar-close"], [aria-label="Close"]');
    if (closeBtn) closeBtn.click();
  }
}

// Helper: wait for a selector to appear in the DOM
function waitForElement(selector, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}

// Helper: simple async sleep
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

// Inject "Comment" button with predefined-comment dropdown into a single tweet
function injectCommentButton(tweetEl) {
  if (tweetEl.querySelector('.tweet-comment-button-wrapper')) return;
  console.log('[Tweet Collector] Injecting Comment button...');

  const actionGroup = tweetEl.querySelector('div[role="group"]');
  if (!actionGroup) return;

  // Wrapper holds the button + the floating dropdown
  const wrapper = document.createElement('div');
  wrapper.className = 'tweet-comment-button-wrapper';

  const btn = document.createElement('button');
  btn.className = 'tweet-comment-btn';
  btn.setAttribute('title', 'Quick Comment');
  // Chat-bubble SVG icon
  btn.innerHTML = `
    <div class="btn-icon-wrapper">
      <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path>
      </svg>
    </div>
    <span class="comment-text">Comment</span>
  `;

  const textSpan = btn.querySelector('.comment-text');

  // Toggle dropdown on click
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (btn.classList.contains('commenting')) return;

    // If already open, close it
    const existing = wrapper.querySelector('.tc-comment-dropdown');
    if (existing) {
      existing.remove();
      return;
    }

    closeAllCommentDropdowns();

    // Build dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'tc-comment-dropdown';
    dropdown.innerHTML = `<div class="tc-comment-dropdown-header">💬 Quick Comment</div>`;

    PREDEFINED_COMMENTS.forEach((comment) => {
      const option = document.createElement('button');
      option.className = 'tc-comment-option';
      option.textContent = comment;
      option.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        dropdown.remove();
        await postComment(tweetEl, comment, btn, textSpan);
      });
      dropdown.appendChild(option);
    });

    // Arrow pointer
    const arrow = document.createElement('div');
    arrow.className = 'tc-dropdown-arrow';
    dropdown.appendChild(arrow);

    wrapper.appendChild(dropdown);
  });

  wrapper.appendChild(btn);
  actionGroup.appendChild(wrapper);

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      const d = wrapper.querySelector('.tc-comment-dropdown');
      if (d) d.remove();
    }
  }, { capture: true });
}

// Scan DOM and inject buttons
function scanAndInject() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tweetEl => {
    injectSaveButton(tweetEl);
    injectCommentButton(tweetEl);
  });
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