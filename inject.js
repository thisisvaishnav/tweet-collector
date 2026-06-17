// inject.js
// Monkey-patches window.fetch and XMLHttpRequest to intercept X's internal GraphQL responses
// and cache follower counts dynamically without triggering extra network requests.
(function() {
  const cache = {};

  // Recursive helper to traverse JSON and locate profile objects
  // depth limit prevents stack overflow on deeply nested GraphQL responses
  function findUsersInJSON(obj, depth) {
    if (!obj || typeof obj !== 'object') return;
    if (depth > 12) return; // safety cap — GraphQL nesting rarely exceeds 10
    
    // Handle arrays efficiently
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        findUsersInJSON(obj[i], depth + 1);
      }
      return;
    }

    // Check for standard user details node
    if (obj.screen_name && typeof obj.followers_count === 'number') {
      const handle = '@' + obj.screen_name.toLowerCase();
      const count = obj.followers_count;
      if (!cache[handle] || cache[handle] !== count) {
        cache[handle] = count;
        window.postMessage({
          type: "TWEET_COLLECTOR_FOLLOWERS",
          handle: handle,
          followers: count
        }, "*");
      }
    } else if (obj.legacy && obj.legacy.screen_name && typeof obj.legacy.followers_count === 'number') {
      const handle = '@' + obj.legacy.screen_name.toLowerCase();
      const count = obj.legacy.followers_count;
      if (!cache[handle] || cache[handle] !== count) {
        cache[handle] = count;
        window.postMessage({
          type: "TWEET_COLLECTOR_FOLLOWERS",
          handle: handle,
          followers: count
        }, "*");
      }
    }
    
    // Search nested properties recursively
    for (let key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        findUsersInJSON(obj[key], depth + 1);
      }
    }
  }

  // Intercept window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch(...args);
    try {
      const url = args[0];
      if (url && typeof url === 'string' && url.includes('/graphql/')) {
        const clonedResponse = response.clone();
        clonedResponse.json().then(data => {
          findUsersInJSON(data, 0);
        }).catch(err => {});
      }
    } catch (e) {}
    return response;
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._url = url;
    return originalOpen.call(this, method, url, ...args);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        if (this._url && this._url.includes('/graphql/')) {
          const data = JSON.parse(this.responseText);
          findUsersInJSON(data, 0);
        }
      } catch (e) {}
    });
    return originalSend.apply(this, args);
  };

  console.log('[Tweet Collector] Network interceptor injected successfully.');
})();
