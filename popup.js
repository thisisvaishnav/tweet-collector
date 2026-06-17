document.getElementById("open-dashboard").onclick = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "http://localhost:3000" });
};