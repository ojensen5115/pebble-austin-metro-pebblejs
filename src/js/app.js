/**
 * Welcome to Pebble.js!
 *
 * This is where you write your app.
 */

var UI = require('ui');
var settings = require('settings');
var ajax = require('ajax');

// subscribed consists of a list of stopIDs
// settings.option('subscribed', [4983, 5528]);
// settings.option('subscribed', null);
// stop titles in localStorage
if (!localStorage.stopTitles) {
  localStorage.stopTitles = JSON.stringify({});
}

var stopId = false;
var scheduleCard = false;
var updateTimer = false;
var updateTime = 1000 * 45; // update every 45 seconds
var responseCache = {};
var stopChanged = false;  // since last update
var newStopDigits = [];
var delStopIdx; // temporary variable used for stop deletion

var stopIdx = localStorage.stopIdx ? localStorage.stopIdx : 0;
var subscribed = settings.option('subscribed');
if (!subscribed) subscribed = [];
if (stopIdx > subscribed.length - 1) {
  stopIdx = 0;
}
var stopTitles = JSON.parse(localStorage.stopTitles);

// initialize schedule card
scheduleCard = new UI.Card({
  style: 'small'
});
scheduleCard.on('click', 'up', function(e) {
  stopIdx -= 1;
  if (stopIdx < 0) {
    stopIdx = subscribed.length - 1;
  }
  stopChanged = true;
  updateScheduleCard();
});
scheduleCard.on('click', 'down', function(e) {
  stopIdx += 1;
  if (stopIdx >= subscribed.length) {
    stopIdx = 0;
  }
  stopChanged = true;
  updateScheduleCard();
});
scheduleCard.on('click', 'select', function(e) {
  showMenu();
});

// initialize menu card
var stopMenu = new UI.Menu({
  sections: [
    {
      title: 'Stop IDs'
    }
  ]
});
stopMenu.on('select', function(e) {
  if (e.itemIndex === 0) {
    addStop();
  } else {
    stopIdx = e.itemIndex - 1;
    stopChanged = true;
    updateScheduleCard();
    scheduleCard.show();
    stopMenu.hide();
  }
});
stopMenu.on('longSelect', function(e) {
  if (e.itemIndex === 0) {
    // nothing
  } else {
    console.log('show delete confirmation');
    delStopIdx = e.itemIndex - 1;
    showConfirmDelete();
  }
});

// initialize confirmDelete card
var confirmDelete = new UI.Menu({
  sections: [
    {
      title: 'Confirm stop deletion'
    }
  ]
});
confirmDelete.on('select', function(e) {
  if (e.itemIndex !== 0) {
    subscribed.splice(delStopIdx, 1);
    settings.option('subscribed', subscribed);
    if (stopIdx >= subscribed.length) {
      stopIdx = 0;
      updateScheduleCard();
      showMenu();
    }
    if (subscribed.length === 0) {
      scheduleCard.hide();
    }
  }
  confirmDelete.hide();
});


// if we're subscribed to at least one schedule, initialize and show
if (subscribed.length) {
  scheduleCard.show();
  stopChanged = true;
  updateScheduleCard();
} else {
  addStop();
}

function addStop() {
  newStopDigits = [0];
  var addStopCard = new UI.Card({
    title: 'Enter stop #',
    body: 'up/down to cycle the number, select to advance'
  });
  addStopCard.on('click', 'up', function(e) {
    var idx = newStopDigits.length - 1;
    newStopDigits[idx] += 1;
    if (newStopDigits[idx] > 9) {
      newStopDigits[idx] = 0;
    }
    this.updateDigitsSoFar();
  });
  addStopCard.on('click', 'down', function(e) {
    var idx = newStopDigits.length - 1;
    newStopDigits[idx] -= 1;
    if (newStopDigits[idx] < 0) {
      newStopDigits[idx] = 9;
    }
    this.updateDigitsSoFar();
  });
  addStopCard.on('click', 'select', function(e) {
    if (newStopDigits.length < 4) {
      newStopDigits.push(0);
      this.updateDigitsSoFar();
      if (newStopDigits.length == 4) {
        this.body('up/down to cycle the number, select to save');
      }
    } else {
      var newNumber = parseInt(newStopDigits.join(''), 10);
      subscribed.push(newNumber);
      settings.option('subscribed', subscribed);
      stopChanged = true;
      stopIdx = subscribed.length - 1;
      updateScheduleCard();
      scheduleCard.show();
      this.hide();
      stopMenu.hide();
    }
  });
  
  addStopCard.updateDigitsSoFar = function() {
    console.log('update');
    var str = '       ';
    for (var i = 0; i < 4; i++) {
      if (i < newStopDigits.length) {
        str += newStopDigits[i] + ' ';
      } else {
        str += '_ ';
      }
    }
    console.log(newStopDigits);
    console.log(str);
    this.subtitle(str);
  };
  addStopCard.updateDigitsSoFar();
  addStopCard.show();
}

function showMenu() {
  var menu_items = [];
  menu_items.push({title: '[ + ]', subtitle: ' Add new stop'});
  for (var i = 0; i < subscribed.length; i++) {
    var stop_id = subscribed[i];
    var item = {title: stop_id};
    if (stopTitles[stop_id]) {
      item.subtitle = stopTitles[stop_id];
    }
    menu_items.push(item);
  }
  stopMenu.items(0, menu_items);
  stopMenu.selection(0, 0);
  stopMenu.show();
}

function showConfirmDelete() {
  var suffix;
  if (stopTitles[delStopIdx]) {
    suffix = ' (' + stopTitles[delStopIdx] + ')';
  } else {
    suffix = '';
  }
  confirmDelete.items(0, [
    {title: 'Cancel'},
    {title: 'Confirm', subtitle: 'Delete ' + subscribed[delStopIdx] + suffix}
  ]);
  confirmDelete.selection(0, 0);
  confirmDelete.show();
}


function updateScheduleCard() {
  stopId = subscribed[stopIdx];
  var title = stopTitles[stopId];
  if (!title) {
    title = 'Loading...';
  }
  scheduleCard.title(title);
  updateScheduleContent();
}

function getRequestUrl(stopId) {
  return 'http://capmetro.org/planner/s_nextbus2.asp?stopid=' + stopId + '&opt=2&_=' + Date.now();
}

function updateScheduleContent() {
  console.log('called updateSchedule');
  if (stopId === false || !scheduleCard) {
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
  if (stopChanged) {
    scheduleCard.body('\nloading...');
  }
  ajax(
    {url: getRequestUrl(stopId)},
    function(data) {
      console.log('ajax success');
      console.log(data);
      var response = JSON.parse(data);
      
      if (response.status == 'OK') {
        // update stop title as necessary
        if (stopTitles[stopId] != response.stopDesc) {
          stopTitles[stopId] = response.stopDesc;
          localStorage.stopTitles = JSON.stringify(stopTitles);
          scheduleCard.title(stopTitles[stopId]);
        }
        var lines = [''];
        if (response.list.length == 0) {
          lines.push('(no results found)');
        }
        for (var i = 0; i < response.list.length; i++) {
          var estTime = response.list[i].est;
          //var schedTime = response.list[i].sched;
          var minutes = response.list[i].estMin;
          lines.push(minutes + ' mins \t(' + estTime + ')');
        }
        var text = lines.join('\n');
        responseCache[stopId] = {data: text, updated: Date.now()};
        scheduleCard.body(text);
        stopChanged = false;
        planUpdate(updateTime);
      } else {
        if (!stopTitles[stopId]) {
          scheduleCard.title(stopId);
        }
        scheduleCard.body('\n' + response.status);
      }
    },
    function(error) {
      scheduleCard.body('Error reaching API');
    });
}

function planUpdate(time) {
  clearTimeout(updateTimer);
  console.log('Scheduling next update in ' + time);
  updateTimer = setTimeout(updateScheduleContent, time);
}