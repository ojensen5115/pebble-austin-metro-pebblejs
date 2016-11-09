/**
 * Welcome to Pebble.js!
 *
 * This is where you write your app.
 */

var UI = require('ui');
var settings = require('settings');
var ajax = require('ajax');

// subscribed consists of a list of stopIDs
settings.option('subscribed', [4983, 5528]);
// stop titles in localStorage
if (!localStorage.stopTitles) {
  localStorage.stopTitles = JSON.stringify({});
}

var stopId = false;
var scheduleCard = false;
var updateTimer = false;
var updateTime = 1000 * 45; // update every 45 seconds
var responseCache = {};
var scheduleCards = {};

var stopIdx = localStorage.stopIdx ? localStorage.stopIdx : 0;
var subscribed = settings.option('subscribed');
if (stopIdx > subscribed.length - 1) {
  stopIdx = 0;
}
var stopTitles = JSON.parse(localStorage.stopTitles);

if (subscribed.length) {
  showNewScheduleCard();
}

function getScheduleCard(stopId) {
  if (scheduleCards[stopId]) {
    return scheduleCards[stopId];
  }
  var title = stopTitles[subscribed[stopIdx]];
  if (!title) {
    title = 'Loading...';
  }
  var schedule = new UI.Card({
    title: title,
    body: 'loading...',
    style: 'small'
  });
  schedule.on('click', 'up', function(e) {
    stopIdx -= 1;
    if (stopIdx < 0) {
      stopIdx = subscribed.length - 1;
    }
    showNewScheduleCard();
  });
  schedule.on('click', 'down', function(e) {
    stopIdx += 1;
    if (stopIdx >= subscribed.length) {
      stopIdx = 0;
    }
    showNewScheduleCard();
  });
  scheduleCards[stopId] = schedule;
  return schedule;
}

function showNewScheduleCard() {
  stopId = subscribed[stopIdx];
  scheduleCard = getScheduleCard(subscribed[stopIdx]);
  scheduleCard.show();
  updateSchedule();
}

function getRequestUrl(stopId) {
  return 'http://capmetro.org/planner/s_nextbus2.asp?stopid=' + stopId + '&opt=2&_=' + Date.now();
}

function updateSchedule() {
  console.log('called updateSchedule');
  if (!stopId || !scheduleCard) {
    console.log(stopId, scheduleCard);
    console.log('not updating');
    return;
  }
  if (responseCache[stopId]) {
    if (responseCache[stopId].updated + updateTime > Date.now()) {
      console.log('using cached results');
      scheduleCard.body(responseCache[stopId].data);
      planUpdate(responseCache[stopId].updated + updateTime - Date.now());
      return;
    } else {
      console.log('Expired cache: ' + (responseCache[stopId].updated + updateTime) + ' < '+ Date.now());
    }
  }
  
  console.log('actually updating schedule');
  ajax(
    {url: getRequestUrl(stopId)},
    function(data) {
      console.log('ajax success');
      var response = JSON.parse(data);
      // update stop title as necessary
      if (stopTitles[stopId] != response.stopDesc) {
        stopTitles[stopId] = response.stopDesc;
        localStorage.stopTitles = JSON.stringify(stopTitles);
        scheduleCard.title(stopTitles[stopId]);
      }
      var lines = [''];
      for (var i = 0; i < response.list.length; i++) {
        var estTime = response.list[i].est;
        //var schedTime = response.list[i].sched;
        var minutes = response.list[i].estMin;
        lines.push(minutes + ' mins \t(' + estTime + ')');
      }
      var text = lines.join('\n');
      responseCache[stopId] = {data: text, updated: Date.now()};
      scheduleCard.body(text);
      
      planUpdate(updateTime);
    },
    function(error) {
      scheduleCard.body('Error reaching API');
    });
}

function planUpdate(time) {
  clearTimeout(updateTimer);
  console.log('Scheduling next update in ' + time);
  updateTimer = setTimeout(updateSchedule, time);
}