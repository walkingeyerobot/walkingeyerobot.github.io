(function() {
  var p = document.querySelector('#p');
  var c = document.querySelector('#c');
  var n = document.querySelector('#n');
  var currentArray;
  var currentIndex;
  function shuffle(array) {
    var m = array.length, t, i;
    
    // While there remain elements to shuffle…
    while (m) {
      
      // Pick a remaining element...
      // i = Math.floor(Math.random() * m--);
      do {
        i = crypto.getRandomValues(new Uint16Array(1))[0] & (Math.pow(2, Math.ceil(Math.log2(m))) - 1);
      } while (i >= m);

      m--;

      // And swap it with the current element.
      t = array[m];
      array[m] = array[i];
      array[i] = t;
    }

    return array;
  }
  function generateArray(cubeSize, numPacks) {
    var ret = new Array(cubeSize);
    for (var i = 0; i < cubeSize; i++) {
      for (var j = 0; j < numPacks; j++) {
        ret[i++] = j+1;
      }
      i--;
    }
    return ret;
  }
  function makeTrash(array, maxPacks) {
    return array.map((v) => {
      return v > maxPacks ? 'trash' : v;
    });
  }
  function compressTrash(array) {
    var newArray = [];
    var trashCount = 0;
    for (var i = 0; i < array.length; i++) {
      if (array[i] === 'trash') {
        trashCount++;
      } else {
        if (trashCount > 0) {
          newArray.push('skip ' + trashCount);
          trashCount = 0;
        }
        newArray.push(array[i].toString());
      }
    }
    if (trashCount > 0) {
      newArray.push('skip ' + trashCount);
    }
    return newArray;
  }
  function displayInstructions(array) {
    currentArray = array;
    currentIndex = 0;
    p.textContent = '';
    c.textContent = currentArray[0];
    n.textContent = currentArray[1];
  }
  function displayNextInstruction() {
    p.textContent = c.textContent;
    c.textContent = n.textContent;
    n.textContent = currentArray[++currentIndex+1] || '';
  }
  function displayPreviousInstruction() {
    n.textContent = c.textContent;
    c.textContent = p.textContent;
    p.textContent = currentArray[--currentIndex-1] || '';
  }
  document.querySelector('body').addEventListener('keydown', function(e) {
    if (e.code === 'ArrowRight') {
      displayNextInstruction();
    } else if (e.code === 'ArrowLeft') {
      displayPreviousInstruction();
    }
  });
  window.shuffle = shuffle;
  window.generateArray = generateArray;
  window.makeTrash = makeTrash;
  window.compressTrash = compressTrash;
  window.displayInstructions = displayInstructions;
  window.displayNextInstruction = displayNextInstruction;
  window.displayPreviousInstruction = displayPreviousInstruction;

  window.first = function() {
    displayInstructions(compressTrash(makeTrash(shuffle(generateArray(540, 540/15)), 12)));
  };
  window.second = function() {
    displayInstructions(compressTrash(makeTrash(shuffle(generateArray(360, 360/15)), 12)));
  };
  window.third = function() {
    displayInstructions(compressTrash(makeTrash(shuffle(generateArray(180, 180/15)), 12)));
  };
}());
