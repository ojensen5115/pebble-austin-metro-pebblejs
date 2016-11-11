/**
 * Very sparsely tested, your mileage may vary.
 */

var UI = require('ui');
var settings = require('settings');
var ajax = require('ajax');

/*
settings.option('subscribed', null);
localStorage.removeItem('stopIdx');
localStorage.removeItem('stopTitles');
*/

/*
settings.option('subscribed', [4983, 5528]);
localStorage.stopIdx = 0;
localStorage.stopTitles = '{}';
*/

var stopId = false;
var scheduleCard = false;
var updateTimer = false;
var updateTime = 1000 * 30; // update every 30 seconds
var responseCache = {};
var stopChanged = false;  // since last update
var newStopDigits = [];
var delStopIdx; // temporary variable used for stop deletion
var initialFailureBackoff = 1000;  // start at 1 second
var failureBackoff = initialFailureBackoff;

var subscribed = settings.option('subscribed');
if (!subscribed) subscribed = [];

var stopIdx = localStorage.stopIdx ? parseInt(localStorage.stopIdx) : 0;
var stopTitles = localStorage.stopTitles ? JSON.parse(localStorage.stopTitles) : {};






// initialize schedule card
var scheduleCard = new UI.Card({
  style: 'small'
});
scheduleCard.on('click', 'up', function(e) {
  updateStopIdx(-1);
});
scheduleCard.on('click', 'down', function(e) {
  updateStopIdx(1);
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
    setStopIdx(e.itemIndex - 1);
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
      updateStopIdx();
      showMenu();
    }
    if (subscribed.length === 0) {
      scheduleCard.hide();
    }
  }
  confirmDelete.hide();
});






function updateStopIdx(modifier) {
  if (!modifier) modifier = 0;
  setStopIdx(stopIdx + modifier);
}

function setStopIdx(newIdx, forceUpdate) {
  if (newIdx < 0) {
    newIdx = subscribed.length - 1;
  } else if (newIdx >= subscribed.length) {
    newIdx = 0;
  }
  if (stopIdx != newIdx || forceUpdate) {
    stopChanged = true;
    stopIdx = newIdx;
    localStorage.stopIdx = newIdx;
    updateScheduleCard();
  }
  scheduleCard.show();
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
      console.log('Subscribing to stop: ' + newNumber);
      subscribed.push(newNumber);
      console.log('Now subscribed to: ' + subscribed);
      settings.option('subscribed', subscribed);
      setStopIdx(subscribed.length - 1, true);
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
  var url = 'http://capmetro.org/planner/s_nextbus2.asp?stopid=' + stopId + '&opt=2&_=' + Date.now();
  //console.log(url);
  return url;
}

function updateScheduleContent() {
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
  
  console.log('updating schedule...');
  if (stopChanged) {
    scheduleCard.body('\nloading...');
  }
  ajax(
    {url: getRequestUrl(stopId)},
    function(data) {
      failureBackoff = initialFailureBackoff;
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
        if (response.list.length === 0) {
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
          scheduleCard.title(stopId.toString());
        }
        scheduleCard.body('\n' + response.status);
      }
    },
    function(error) {
      scheduleCard.body('Error reaching API');
      console.log('Communication failure! Trying again in: ' + failureBackoff);
      planUpdate(failureBackoff);
      failureBackoff *= 2;
      if (failureBackoff > updateTime) {
        failureBackoff = updateTime;
      }
    });
}

function planUpdate(time) {
  clearTimeout(updateTimer);
  //console.log('Scheduling next update in ' + time);
  updateTimer = setTimeout(updateScheduleContent, time);
}






if (subscribed.length) {
  // if we're subscribed to at least one schedule, initialize and show
  setStopIdx(stopIdx, /*forceUpdate*/ true);
} else {
  // otherwise, show the interface for adding a stop
  addStop();
}