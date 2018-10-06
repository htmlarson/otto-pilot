// Injects the main script into YouTube watch pages
let script = document.createElement('script');
script.src = chrome.extension.getURL('src/main.js');
document.firstElementChild.appendChild(script);
