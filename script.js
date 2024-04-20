$(document).ready(function(){
    ///////////////////////////////////////////////////////
   //                 Game controllers                  //
  ///////////////////////////////////////////////////////
  let gameControl = {
    gameStarted: false,     // whether a game is currently in progress
    difficulty: 'lenient',  // whether to allow mistakes
    level: 1,               // current number of iterations in the pattern
    currentPattern: [],     // current pattern
    playerPatternProgress: 0,     // where the player is in the current array
    runningPattern: false,  // whether the game is currently showing the pattern to the player
    titleTimeout: 0,
    playerControlTimeout: 0,
    patternTimeout: 0
  };

    ///////////////////////////////////////////
   //                  DOM                  //
  ///////////////////////////////////////////
  let els = {
    titleOverlay: $('#title-overlay'),
    playButton: $('#play'),
    gameContainer: $('#container'),
    cells: {
      top: $('#top'),
      left: $('#left'),
      right: $('#right'),
      bottom: $('#bottom')
    },
    level: $('#level'),
    beginButton: $('#begin'),
    difficultyButton: $('#difficulty')
  }

  // added a title overlay, since AudioContext is not allowed to trigger without user input on certain mobile devices
  $(els.playButton).click(()=>{
    $(els.titleOverlay).fadeOut(500, () => {
      globalAudioContext.resume();
      gameControl.titleTimeout = window.setTimeout(()=>{
        titleJingle();
      }, 500)
      $(els.gameContainer).fadeIn(500);
    });
  });  
  
    /////////////////////////////////////////////
   //                  Sound                  //
  /////////////////////////////////////////////
  let globalAudioContext = new (window.AudioContext || window.WebkitAudioContext)();
  
  // default chime frequency values (big ben chime pitches)
  // G : 391.996
  // C : 523.251
  // D : 587.330
  // E : 659.255
  let defaultChimes = {
    E: new Chime(659.225),
    D: new Chime(587.330),
    C: new Chime(523.251),
    G: new Chime(391.996)
  }; 

  // gameChimes array, for use with the board and its data-cell-num attribute
  let gameChimes = [
    defaultChimes.E,
    defaultChimes.D,
    defaultChimes.C,
    defaultChimes.G
  ];

  // Chime constructor, creates a chime based on a given frequency
  function Chime(freq) {
    this.gainNode = (globalAudioContext.createGain() || globalAudioContext.webkitCreateGain());        // create a gainNode
    this.gainNode.connect(globalAudioContext.destination || globalAudioContext.webkitDestination);  // connect the gainNode to the context destination
    this.osc = (globalAudioContext.createOscillator() || globalAudioContext.webkitCreateOscillator());   // create an oscillator
    this.osc.type = 'sine';    // set the chime sound to sine
    this.osc.webkitType = 'sine';    // set the chime sound to sine
    this.osc.frequency.value = freq;  // set the pitch
    this.osc.start();   // start the sound
    this.intervalId;
  }

  Chime.prototype.play = function() {
    window.clearInterval(this.intervalId);     // clear any existing setInterval currently running
    this.gainNode.gain.value = 0.5;            // reset the gainNode gain value
    this.osc.connect(this.gainNode);           // connect this chime object's oscillator to the gainNode
    this.intervalId = window.setInterval(()=>{
      if (this.gainNode.gain.value > 0) {      // while the sound is still audible (gain > 0)
        this.gainNode.gain.value -= 0.025;     // decrease the gain
      } else {
        this.osc.disconnect(this.gainNode);    // if the gain is below 0, disconnect the oscillator
        window.clearInterval(this.intervalId); // clear the interval function
      }
    }, 35);   // set the interval to something small enough to prevent overlapping sounds
  }

  /*
  // chimes player POC
  // the game array will have a list of data-cell-num values
  let chimeArray = ['E', 'C', 'D', 'G','G','D','E','C'];    // here, letters are used for POC; substitute numbers later

  for (let i = 0 ; i < chimeArray.length; i++) {  // run through the list of chimes to play
    window.setTimeout(()=>{
      defaultChimes[chimeArray[i]].play();    // set a timeout to play each chime one second after the previous one
    }, 1000 * i)
  }
  */

    ///////////////////////////////////////////////////////
   //                  Event listeners                  //
  ///////////////////////////////////////////////////////
  // difficulty button
  $(els.difficultyButton).click(()=>{
    if (gameControl.gameStarted) { return false; }  // don't allow changing difficulty mid-game
    if (gameControl.difficulty == 'lenient') { gameControl.difficulty = 'strict'; } // swap difficulty
    else { gameControl.difficulty = 'lenient'; }

    changeTextSlide(els.difficultyButton, gameControl.difficulty);
  });
  // begin button
  $(els.beginButton).click(()=>{
    if (!gameControl.gameStarted) { // begin the game
      gameStart();
    } else if (confirm('Back to game selection?')) {
      gameReset();
    }
  });
  // click game cells
  $('.game-cell').click((e)=>{
    if (gameControl.runningPattern) { return false; }
    if (e.target.className == 'game-cell') {
      if (gameControl.gameStarted && !gameControl.runningPattern) {
        testPlayerGuess($(e.target));
        return;
      }
      activateGameCell(e.target);
    }
  });

  // keyboard activation of game cells
  window.addEventListener('keydown', (e)=>{
    let cell;
    if (gameControl.runningPattern) {   // do not allow key presses while the game is iterating through a pattern!
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // enter/return
    if (e.keyCode == 13) {
      if ($(els.titleOverlay).css('display') !== 'none') {
        $(els.titleOverlay).fadeOut(500);
        globalAudioContext.resume();
        gameControl.titleTimeout = window.setTimeout(()=>{
          titleJingle();
        }, 500)
      } else if (!gameControl.gameStarted) {
        gameStart();
      }
      return false;
    }
    // numpad 8 or W
    else if (e.keyCode == 104 || e.keyCode == 87) { cell = els.cells.top; }
    // numpad 4 or A
    else if (e.keyCode == 102 || e.keyCode == 68) { cell = els.cells.left; }
    // numpad 6 or D
    else if (e.keyCode == 100 || e.keyCode == 65) { cell = els.cells.right; }
    // numpad 2 or S
    else if (e.keyCode == 98 || e.keyCode == 83)  { cell = els.cells.bottom; }
    if (!cell) { return false; }
    if (gameControl.gameStarted && !gameControl.runningPattern) {
      testPlayerGuess(cell);
      return;
    }
    activateGameCell(cell);
  }, false);

    /////////////////////////////////////////////////
   //                  Functions                  //
  /////////////////////////////////////////////////
  // swaps text in an element with a slide animation
  function changeTextSlide(el, text) {
    $(el).find('span').slideUp('fast', ()=>{  // swap text w/slide animation
      $(el).find('span').text(text);
      $(el).find('span').slideDown('fast');
    })
  }
  
  // flashes an element, using opacity
  function flashElement(el) {
    $(el).stop(false, true);
    $(el).css({'opacity': 0.8, 'display': 'block'});
    $(el).animate({'opacity': 0}, ()=>{
      $(el).css({'display': 'none'});
    });
  }
  
  // activates a game cell
  function activateGameCell(target) {
    let overlay = $(target).find('.overlay');
    let cellId = $(target).attr('data-cell-num');
    gameChimes[cellId].play();
    flashElement(overlay);
  }
  // initialize a new game
  function gameStart() {
    gameControl.gameStarted = true;
    gameControl.runningPattern = true;
    changeTextSlide(els.beginButton, 'reset');
    $(els.difficultyButton).css('opacity', 0.5);
    window.clearTimeout(gameControl.titleTimeout);
    window.setTimeout(()=>{
      nextLevel();
    }, 1000)
  }
  
  // reset the game
  function gameReset(skipTitleJingle) {
    window.clearTimeout(gameControl.playerControlTimeout);
    window.clearTimeout(gameControl.patternTimeout);
    gameControl.gameStarted = false;
    gameControl.runningPattern = false;
    gameControl.level = 1;
    gameControl.currentPattern = [];
    changeTextSlide(els.beginButton, 'begin');
    $(els.difficultyButton).css('opacity', 1);
    changeTextSlide(els.level, gameControl.level);
    if (!skipTitleJingle) {
      window.setTimeout(()=>{
        titleJingle();
      }, 500);
    }
  }
  
  // iterates through the current game pattern, then returns control to the player
  function runPattern() {
    gameControl.currentPattern.forEach((el, ind)=>{
      gameControl.patternTimeout = window.setTimeout(()=>{
        activateGameCell($('.game-cell')[el]);    // activate all game cells in turn
      }, ind * 1000);
    })
    gameControl.playerControlTimeout = window.setTimeout(()=>{
      gameControl.runningPattern = false; // after the pattern is iterated through fully, set runningPattern to false
    }, 1000 * gameControl.currentPattern.length);
  }
  
  // tests a player's input
  function testPlayerGuess(target) {
    let cellId = Number.parseInt($(target).attr('data-cell-num'));
    // if the player guesses wrong
    if (gameControl.currentPattern[gameControl.playerPatternProgress] !== cellId) {
      // flash the error element
      flashElement($(target).find('.error'));
      gameControl.playerPatternProgress = 0;
      if (gameControl.difficulty == 'lenient') {  // if in lenient mode, run the pattern again
        gameControl.runningPattern = true;
        window.setTimeout(()=>{
          runPattern();
        }, 1000);
      } else {                    // if in strict mode, end the game, and play the game over jingle
        window.setTimeout(()=>{
          gameOverJingle();
          window.setTimeout(()=>{
            gameReset();
          }, 1000)
        }, 200)
      }
    } else {  // if the player guesses right
      flashElement($(target).find('.overlay')); // flash the overlay
      gameControl.playerPatternProgress++; 
      gameChimes[cellId].play();
    }
    if (gameControl.playerPatternProgress == gameControl.currentPattern.length) { // if the player has reached the end of this pattern
      gameControl.runningPattern = true;  // immediately set runningPattern to true, to prevent further guesses
      if (gameControl.currentPattern.length == 20) {    // if this is level 20, the player wins!
        window.setTimeout(()=>{
          winJingle();
        }, 500);
        window.setTimeout(()=>{
          alert('Congratulations, you made it to level 20! Try to do it again!');
          gameReset(true);  // gameReset accepts a boolean, which determines whether to skip the title jingle
          gameStart();
        }, 2500);
      } else {   // otherwise, advance to the next level
        window.setTimeout(()=>{
          nextLevel();
        }, 1000);
      }
    }
  }
  
  // proceed to the next level
  function nextLevel() {
    gameControl.currentPattern.push(Math.floor(Math.random() * 4));   // add a random next pattern on to the array
    gameControl.level = gameControl.currentPattern.length;  // increase the level
    gameControl.playerPatternProgress = 0;  // reset the player progress counter
    changeTextSlide(els.level, gameControl.level);  // switch the level display
    window.setTimeout(()=>{
      runPattern();   // start the next pattern after a brief pause
    }, 1000);
  }
  
    ///////////////////////////////////////////////
   //                  Jingles                  //
  ///////////////////////////////////////////////
  // (dis)plays a jingle
  function jingle(sequence, timeout) {
    if (!timeout) { timeout = 200; }
    sequence.forEach((el, ind)=>{
      if (el !== null) {
        window.setTimeout(()=>{
          activateGameCell($('.game-cell')[el]);
        }, ind * timeout)
      }
    })
  }
  
  function titleJingle() {
    window.setTimeout(()=>{
      jingle([3,0,null,1,null,0,null,3,2], 200);
    }, 200)
  }
  
  function gameOverJingle() {
    window.setTimeout(()=>{
      jingle([0,1,2,3], 100);
    }, 100)
  }
  
  function winJingle() {
    window.setTimeout(()=>{
      jingle([3,2,1,0,null,3,2,1,0], 100);
    }, 100)
  }
});