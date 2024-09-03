(function() {
  cardDiv = document.querySelector('#cards');
  cardDiv.addEventListener('contextmenu', onRightClick, false);
  currentCount = document.querySelector('#current');
  totalCount = document.querySelector('#total');
  submitButton = document.querySelector('#submit');
  prioritySlider = document.querySelector('#priority');
  extraRowsSlider = document.querySelector('#extrarows');
  reservedDiv = document.querySelector('#reserved');
  formElement = document.querySelector('#form');
  formElement.addEventListener('submit', onSubmit, false);
  var allCardNames = [];
  var currentCardIndex = 0;
  var ignoredPromoTypes = [
    'arenaleague',
    'boosterfun',
    'boxtopper',
    'bundle',
    'buyabox',
    'commanderparty',
    'concept',
    'convention',
    'datestamped',
    'dossier',
    'draculaseries',
    'draftweekend',
    'duels',
    'fnm',
    'gameday',
    'giftbox',
    'godzillaseries',
    'imagine',
    'instore',
    'intropack',
    'jpwalker',
    'judgegift',
    'magnified',
    'mediainsert',
    'openhouse',
    'playerrewards',
    'playtest',
    'portrait',
    'poster',
    'prerelease',
    'promopack',
    'ravnicacity',
    'release',
    'scroll',
    'serialized',
    'setextension',
    'setpromo',
    'stamped',
    'starterdeck',
    'storechampionship',
    'thick',
    'tourney',
    'vault',
    'wizardsplaynetwork',
  ];
  var promoFinishes = [
    'confettifoil',
    'doublerainbow',
    'embossed',
    'galaxyfoil',
    'glossy',
    'halofoil',
    'neonink',
    'oilslick',
    'rainbowfoil',
    'raisedfoil',
    'ripplefoil',
    'silverfoil',
    'stepandcompleat',
    'surgefoil',
    'textured',
  ];
  fetch('all.txt').then(res => res.text()).then(data => {
    allCardNames = data.split('\n');
    totalCount.innerText = allCardNames.length;
    nextCard();
  });
  function queryCard(cardName, cb) {
    var c = cardName.replaceAll('"', '').replaceAll(' ', '+');
    url = 'https://api.scryfall.com/cards/search?q=%2B%2B%21"' + c + '"+game%3Apaper+-a%3A"terese+nielsen"+-a%3A"noah+bradley"+-a%3A"seb+mckinnon"-e%3A30a+-e%3Acei+-e%3Aced+-e%3Aovnt+include%3Aextras+-e%3Awc00+-e%3Awc03+-e%3Aptc+-e%3Aplist+-e%3Awc97+-e%3Awc98+-e%3A4bb+-e%3Afbb+-e%3Awc02+-e%3Awc01+-e%3Awc04+-e%3Awc99+-e%3Awc02+-t%3Atoken'
    fetch(url)
      .then(res => {
        if (res.ok) {
          return res.text();
        }
        return Promise.reject(res);
      })
      .then(cb)
      .catch(err => cb(null, err));
  }
  function onSubmit(e) {
    submitButton.disabled = true;
    var data = new FormData(formElement);
    var finalChoice = {};
    for (const entry of data) {
      if (entry[0] === 'cardz') {
        var choice = JSON.parse(decodeURI(entry[1]));
        finalChoice.name = choice.name;
        finalChoice.set = choice.set;
        finalChoice.finish = choice.finish;
        finalChoice.artist = choice.artist;
        finalChoice.collector_number = choice.collector_number;
      } else if (entry[0] === 'priority') {
        finalChoice.priority = entry[1];
      } else if (entry[0] === 'extrarows') {
        finalChoice.extra_rows = entry[1];
      }
    }
    e.preventDefault();
    if (finalChoice.name == null) {
      submitButton.disabled = false;
      return;
    }
    localStorage.setItem(allCardNames[currentCardIndex], JSON.stringify(finalChoice));
    e.preventDefault();
    nextCard();
  }
  function doProxyChoice() {
    var finalChoice = {
      name: allCardNames[currentCardIndex],
      set: 'PROXY',
      finish: 'nonfoil',
      artist: 'none',
      collector_number: '0',
      priority: '1',
      extra_rows: '0',
    }
    localStorage.setItem(allCardNames[currentCardIndex], JSON.stringify(finalChoice));
  }
  function nextCard() {
    while (currentCardIndex < allCardNames.length && localStorage.getItem(allCardNames[currentCardIndex])) {
      currentCardIndex++;
    }
    queryCard(allCardNames[currentCardIndex], queryCardCallback);
  }
  function queryCardCallback(data, err) {
    if (err) {
      if (err.status === 404) {
        doProxyChoice();
        nextCard();
      } else {
        throw err;
      }
      return;
    }
    cards = JSON.parse(data).data;
    console.log(JSON.parse(data));
    if (cards[0].reserved) {
      reservedDiv.style.display = 'block';
    } else {
      reservedDiv.style.display = 'none';
    }
    var choices = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.oversized) {
        console.log(`skipped ${i}: oversized`);
        continue;
      }
      if (card.set_name.endsWith('Art Series')) {
        console.log(`skipped ${i}: art series`);
        continue;
      }
      var nonfoilIndex = card.finishes.indexOf('nonfoil');
      if (card.finishes.length > 1 && nonfoilIndex > -1) {
        card.finishes.splice(nonfoilIndex, 1);
      }
      if (card.promo_types) {
        var promo_types = card.promo_types.filter((v,i,a) => {
          return !ignoredPromoTypes.includes(v);
        });
        if (!promo_types.every(v => promoFinishes.includes(v))) {
          throw Error('unexpected promo at index ' + i + '!');
        }
        card.finishes = card.finishes.concat(promo_types);
        var foilIndex = card.finishes.indexOf('foil');
        if (foilIndex > -1 && card.finishes.length > 1) {
          card.finishes.splice(foilIndex, 1);
        }
      }
      for (var j = 0; j < card.finishes.length; j++) {
        var newChoice = {
          name: card.name,
          set: card.set,
          finish: card.finishes[j],
          artist: card.artist,
          collector_number: card.collector_number,
          image_uris: []
        };
        if (card.image_uris) {
          newChoice.image_uris.push(card.image_uris.normal);
        } else if (card.card_faces && card.card_faces.length > 1) {
          for (var k = 0; k < card.card_faces.length; k++) {
            newChoice.image_uris.push(card.card_faces[k].image_uris.normal);
          }
        } else {
          throw new Error('image not found???');
        }
        choices.push(newChoice);
      }
    }
    if (choices.length === 0) {
      doProxyChoice();
      nextCard();
      return;
    } else if (choices.length === 1) {
      delete choices[0].image_uris;
      choices[0].priority = '3';
      choices[0].extra_rows = '0';
      localStorage.setItem(allCardNames[currentCardIndex], JSON.stringify(choices[0]));
      nextCard();
      return;
    }
    var h = '';
    for (var i = 0; i < choices.length; i++) {
      h += `<div class="cardwrap">
  <input type="radio" name="cardz" id="card${i}" value="${encodeURI(JSON.stringify(choices[i]))}" />
  <label for="card${i}" class="radiolabel">`
      for (var j = 0; j < choices[i].image_uris.length; j++) {
        h += `<img src="${choices[i].image_uris[j]}" />`
      }
      h += `<span class="finish ${choices[i].finish}">${choices[i].finish}</span></label></div>`
    }
    cardDiv.innerHTML = h;
    prioritySlider.value = 3;
    extraRowsSlider.value = 0;
    submitButton.disabled = false;
    currentCount.innerText = currentCardIndex + 1;
  }
  function onRightClick(e) {
    var target = e.target;
    while (target.tagName !== 'HTML' && !target.classList.contains('cardwrap')) {
      target = target.parentElement;
    }
    if (target.tagName === 'HTML') {
      return;
    }
    e.preventDefault();
    target.parentElement.removeChild(target);
  }
  function undo() {
    currentCardIndex--;
    delete localStorage[allCardNames[currentCardIndex]];
    queryCard(allCardNames[currentCardIndex], queryCardCallback);
  }
  window.undo = undo;
}());
