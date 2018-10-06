'use strict';
function connectionHandler(port) {
  port.onMessage.addListener(async function requestHandler(request) {
    switch (request.action) {
      case "check-login":
        port.postMessage({loggedIn: await checkLogin()});
        break;

      case "check-subscription":
        if (!localStorage.getItem('cache:' + request.id)) await updateCache();
        port.postMessage({subscribed: await checkSubscription(request.id)});
        break;

      case 'get-stream-map':
        port.postMessage(await getStreamMap(request.id, request.title));
        break;

      case 'active-page':
        chrome.pageAction.show(await getTabId());
        break;
    }
  });
}

async function init() {
  await updateCache();
  chrome.runtime.onConnectExternal.addListener(connectionHandler);
  setInterval(updateCache, 24 * 60 * 60 * 1000);
}

async function checkLogin() {
  var accountRequest = await fetch('https://www.floatplane.com/api/user/self', {credentials: "include"});
  return accountRequest.status === 200;
}

// TODO: Cache the result when extension starts
async function checkSubscription(id) {
  var subscriptionRequest = await fetch('https://www.floatplane.com/api/user/subscriptions', {credentials: "include"});
  var subscriptions = await subscriptionRequest.json();
  for (let subscription of subscriptions) {
    if (subscription.creator === id) return true;
  }
  return false;
}

async function getStreamMap(id, title) {
  let index = lunr.Index.load(JSON.parse(localStorage.getItem('cache:' + id)));
  if (!index) return {streamMap: null, baseURL: null};
  let result = index.search(title.replace(/ - /g, ' ')); // Separator work around TODO: PR a fix for this
  if (result[0].score <= 5) return {streamMap: null, baseURL: null};

  let videoRequest = await fetch('https://www.floatplane.com/api/video/url?quality=1080&guid=' + result[0].ref, {credentials: "include"});
  let baseURL = await videoRequest.json();
  baseURL = baseURL.replace('/chunk.m3u8', '');

  let streamMap = "";
  streamMap += "type=video%2Fmp4&itag=0&eotf=bt709&quality=medium&url=" + encodeURIComponent(baseURL.replace('1080.mp4', '360.mp4')) + ',';
  streamMap += "type=video%2Fmp4&itag=0&eotf=bt709&quality=large&url=" + encodeURIComponent(baseURL.replace('1080.mp4', '480.mp4')) + ',';
  streamMap += "type=video%2Fmp4&itag=0&eotf=bt709&quality=hd720&url=" + encodeURIComponent(baseURL.replace('1080.mp4', '720.mp4')) + ',';
  streamMap += "type=video%2Fmp4&itag=0&eotf=bt709&quality=hd1080&url=" + encodeURIComponent(baseURL);

  return {streamMap: streamMap, baseURL: baseURL};
}

async function updateCache() {
  if (!await checkLogin()) return;

  let subscriptionRequest = await fetch('https://www.floatplane.com/api/user/subscriptions', {credentials: "include"});
  let subscriptions = await subscriptionRequest.json();
  for (let subscription of subscriptions) {
    let counter = 0;
    let builder = new lunr.Builder();

    lunr.Pipeline.registerFunction(symbolRemover, 'symbolRemover');
    builder.pipeline.add(lunr.stopWordFilter, symbolRemover);
    builder.searchPipeline.add(lunr.stopWordFilter, symbolRemover);

    builder.ref('guid');
    builder.field('title');

    while (true) {
      let videosRequest = await fetch('https://www.floatplane.com/api/creator/videos?creatorGUID=' + subscription.creator + '&fetchAfter=' + counter, {credentials: "include"});
      let videos = await videosRequest.json();

      if (videos.length === 0) break;

      for (let video of videos) {
        builder.add({title: video.title.replace(/ - /g, ' '), guid: video.guid}); // Separator work around TODO: PR a fix for this
      };
      counter += 20;
    }

    let index = builder.build();
    console.log(index);
    localStorage.setItem('cache:' + subscription.creator, JSON.stringify(index));
  };
}

function symbolRemover(token) {
  return token.update((s) => {
    return s.replace(/[-#!?,$():.+*"”’&<>@[\]…]/g, '').replace(/mp4/g, '');
  });
}

async function getTabId() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({currentWindow: true, active: true}, (tabs) => {
      resolve(tabs[0].id);
    });
  });
}

init();
