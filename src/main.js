'use strict';

const EXTENSION_ID = 'ipkdgenkijcamdpkjcpdmiohakfikgbf';

var platformMap, floatplaneButton, infoBox, originalConfig, port;

async function init() {
  platformMap = await (await fetch('chrome-extension://' + EXTENSION_ID + '/platform_map.json')).json();
  port = chrome.runtime.connect(EXTENSION_ID);
  port.onDisconnect.addListener(function reconnectPort() {
    // Ensures port is active
    port = chrome.runtime.connect(EXTENSION_ID);
    port.onDisconnect.addListener(reconnectPort);
  });
  document.addEventListener('yt-navigate-start', ottoCleanup);
  document.addEventListener('yt-navigate-finish', engageOttoPilot);
  console.log('[Otto Pilot] Injected into page');
};

async function engageOttoPilot() {
  let watch = document.querySelector('ytd-watch-flexy');
  if (watch == null) return;
  let player = watch.player;
  if (player == null) return;
  let config = player.getUpdatedConfigurationData();

  // Creator check
  if (!Object.keys(platformMap).includes(config.args.ucid)) return;

  if (!await loginCheck()) {
    // Inject login request dialog into page
    infoBox = document.createElement('ytd-clarification-renderer');

    let link = infoBox.querySelector('a');
    link.href = "https://floatplane.com/";
    link.target = "_blank";

    let floatplaneLogo = document.createElement('img');
    floatplaneLogo.src = "chrome-extension://" + EXTENSION_ID + "/assets/floatplane.png";
    floatplaneLogo.height = floatplaneLogo.width = "24";
    infoBox.querySelector('yt-icon').appendChild(floatplaneLogo);

    infoBox.querySelector('yt-formatted-string.description').innerHTML =
      "Subscribed to this creator with Floatplane? Login to " +
      "enjoy higher quality video and other benefits";

    infoBox.querySelector('.source').innerHTML = 'Floatplane' + infoBox.querySelector('.source').innerHTML;

    document.querySelector('#clarify-box').appendChild(infoBox);

    return;
  }

  if (!await subscriptionCheck(config.args.ucid)) {
    // Inject subscription request dialog into page
    infoBox = document.createElement('ytd-clarification-renderer');

    let link = infoBox.querySelector('a');
    link.href = "https://floatplane.com/";
    link.target = "_blank";

    let floatplaneLogo = document.createElement('img');
    floatplaneLogo.src = "chrome-extension://" + EXTENSION_ID + "/assets/floatplane.png";
    floatplaneLogo.height = floatplaneLogo.width = "24";
    infoBox.querySelector('yt-icon').appendChild(floatplaneLogo);

    infoBox.querySelector('yt-formatted-string.description').innerHTML =
      "Subscribed to this creator with Floatplane? Login to " +
      "enjoy higher quality video and other benefits";

    infoBox.querySelector('.source').innerHTML = 'Floatplane' + infoBox.querySelector('.source').innerHTML;

    document.querySelector('#clarify-box').appendChild(infoBox);
    return;
  }

  // Floatplane stream map
  let streamMap = await getStreamMap(config.args.ucid, config.args.title);
  if (!streamMap.streamMap || !streamMap.baseURL) return;

  port.postMessage({action: 'active-page'});

  /* YouTube Player Stuff */

  // YouTube whitelist bypass
  if (!RegExp.prototype.ogTest) {
    RegExp.prototype.ogTest = RegExp.prototype.test;
    let bypassedURL = /^https:\/\/edge[0-9]{2}-.{2}\.floatplaneclub\.com\/videos\/.*?\/.*?\?wmsAuthSign=.*/i;
    RegExp.prototype.test = function test(str) {
      if (bypassedURL.ogTest(str)) {
        return true;
      } else {
        return this.ogTest(str);
      }
    }
  }

  // Update YouTube player with Floatplane video sources
  originalConfig = config.clone();
  config.args.adaptive_fmts = null;
  config.args.fexp = null;
  config.args.fmt_list = null;
  config.args.url_encoded_fmt_stream_map = streamMap.streamMap;
  config.args.start = player.getCurrentTime();
  config.loaded = false;
  player.loadNewVideoConfig(config);

  // Add Floatplane button to player
  floatplaneButton = document.createElement('button');
  let floatplaneLogo = document.createElement('img');
  floatplaneButton.classList.add('ytp-button');
  floatplaneButton.setAttribute('id', 'floatplaneBtn')
  floatplaneButton.setAttribute('title', 'Floatplane');
  floatplaneButton.setAttribute('aria-pressed', 'true');
  floatplaneButton.addEventListener('click', toggleFloatplane);
  floatplaneLogo.src = 'chrome-extension://' + EXTENSION_ID + '/assets/floatplane.png'
  floatplaneLogo.setAttribute('style', 'width: auto; height: calc(100% - (5px * 2)); padding: 5px;')
  floatplaneButton.appendChild(floatplaneLogo);
  document.querySelector('.ytp-right-controls').prepend(floatplaneButton);

  console.log("[Otto Pilot] Successfully injected into player!");
}

function toggleFloatplane() {
  let player = document.querySelector('ytd-watch-flexy').player;
  let config = originalConfig.clone();
  originalConfig = player.getUpdatedConfigurationData();
  config.args.start = player.getCurrentTime();
  player.loadNewVideoConfig(config);
  floatplaneButton.setAttribute('aria-pressed', floatplaneButton.getAttribute('aria-pressed') !== 'true');
}

function ottoCleanup() {
  let controls = document.querySelector('.ytp-right-controls');
  let clarifyBox = document.querySelector('#clarify-box');
  if (controls && floatplaneButton && floatplaneButton.parentNode === controls) controls.removeChild(floatplaneButton);
  if (clarifyBox && infoBox && infoBox.parentNode === clarifyBox) clarifyBox.removeChild(infoBox);
}

async function loginCheck() {
  port.postMessage({action: 'check-login'});
  return new Promise((resolve, reject) => {
    port.onMessage.addListener(function loginCheck(response) {
      if (response.hasOwnProperty('loggedIn')) {
        port.onMessage.removeListener(loginCheck);
        resolve(response.loggedIn);
      }
    });
  });
}

async function subscriptionCheck(id) {
  port.postMessage({action: 'check-subscription', id: platformMap[id]});
  return await new Promise((resolve, reject) => {
    port.onMessage.addListener(function subscriptionCheck(response) {
      if (response.hasOwnProperty('subscribed')) {
        port.onMessage.removeListener(subscriptionCheck);
        resolve(response.subscribed);
      }
    });
  });
}

async function getStreamMap(id, title) {
  port.postMessage({action: 'get-stream-map', id: platformMap[id], title: title});
  return await new Promise((resolve, reject) => {
    port.onMessage.addListener(function retrieveStreamMap(response) {
      if (response.hasOwnProperty('streamMap') && response.hasOwnProperty('baseURL')) {
        port.onMessage.removeListener(retrieveStreamMap);
        resolve(response);
      }
    });
  });
}

init();
