//BY DEM NISBET
//SOUND EFFECTS BY ZAPSPLAT FOR RIGHT AND WRONG ANSWERS

//TODO: add something to show game is active, using css
//@@@add new question without clearing last question: should be disabled until round is finished
//@@@new round isn't working yet: can't load up new question properly
//@@@turn QuestionBank into QuestionManager: might handle things like how many answers revealed so far etc???
//@@@@@GOING WELL, BUT WON'T REVERSE STAKE POINTS!!!!
//@@@@@CLEAN SWEEP CAN PRODUCE NAN



window.isAnswerBoardLocked = false; //special global var, currently the only safe way to control this.


$(document).ready(function() {


    // ========== EVENT SYSTEM: OPTIONAL ONLY ==========


	class NeptuneDesign {
		constructor() {
			// Singleton instance
			if (NeptuneDesign.instance) {
				return NeptuneDesign.instance;
			}
			NeptuneDesign.instance = this;
		}
		
		toast(message, duration = 3000) {
			this._removeExistingToast();
			
			const $toast = $(`<div class="toast">${message}</div>`);
			$toast.css('animation-duration', (duration / 1000) + 's');
			
			$('body').append($toast);
			
			setTimeout(() => $toast.remove(), duration);
		}

		toastGood(message, duration = 3000) {
			this._removeExistingToast();
			
			const $toast = $(`<div class="toast toast-good">😊 ${message}</div>`);
			$toast.css('animation-duration', (duration / 1000) + 's');
			
			$('body').append($toast);
			
			setTimeout(() => $toast.remove(), duration);
		}
		
		toastBad(message, duration = 3000) {
			this._removeExistingToast();
			
			const $toast = $(`<div class="toast toast-bad">😞 ${message}</div>`);
			$toast.css('animation-duration', (duration / 1000) + 's');
			
			$('body').append($toast);
			
			setTimeout(() => $toast.remove(), duration);
		}
		
		_removeExistingToast() {
			$('.toast').remove();
		}
	}

    class QuestionBank {
        #questions;
        
        constructor(questionsData) {
            this.#questions = questionsData;
        }
        
        // Public methods
        getAllQuestions() {
            return this.#questions.map(q => ({ id: q.id, question: q.question }));
        }
        
        getQuestionById(id) {
            return this.#questions.find(q => q.id === id) || null;
        }
        
        getSortedAnswers(questionId) {
            const question = this.getQuestionById(questionId);
            if (!question) return [];
            
            return [...question.answers].sort((a, b) => b.points - a.points);
        }
    }
	
	class AudioManager {
        #soundsEnabled = true;
		#sounds;

		constructor() {
			this.#sounds = {
				reveal: new Audio('sounds/correctTrill1.mp3'),
				correct: new Audio('sounds/correctTrill1.mp3'),
				wrong: new Audio('sounds/wrongBuzzer1.mp3')
			};
		}

		playSound(name) {
			const sound = this.#sounds[name];
			if (this.#soundsEnabled && sound) {
				sound.currentTime = 0;
				sound.play();
			}
		}

        // Public methods
        toggleSounds() {
            this.#soundsEnabled = !this.#soundsEnabled;
            return this.#soundsEnabled;
        }        
        areSoundsEnabled() {
            return this.#soundsEnabled;
        }
        
		
		playCountdown321() {
			if (!this.#soundsEnabled) return;

			const utterances = [
				new SpeechSynthesisUtterance("Three"),
				new SpeechSynthesisUtterance("Two"),
				new SpeechSynthesisUtterance("One"),
				//new SpeechSynthesisUtterance("Confirm your stake")
			];

			utterances.forEach(u => {
				u.rate = 1;       // Slightly slower for clarity
				u.pitch = 1.2;      // Friendly voice
				u.volume = 1;
			});

			// Chain them one after another
			utterances[0].onend = () => speechSynthesis.speak(utterances[1]);
			utterances[1].onend = () => speechSynthesis.speak(utterances[2]);
			utterances[2].onend = () => speechSynthesis.speak(utterances[3]);

			speechSynthesis.speak(utterances[0]);
		}
		
		
		
        // Private method
        #playBeep(frequency, duration) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration / 1000);
        }
    }

	class ScoreManager {
		#parent;
		#history = []; 
		#errorCounts;
		#currentScores; //scores-teamA-teamB
		#pointsThisRound; //same format as all scores, counts only points direct from board this round.
		#currentStake = 0; //single round value
		#currentRoundIndex = 0;
		#totalScoreThisRound; //total score available for this round.
		#currentQuestionSM;
		#totalNumberOfAnswers; //TODO: should store the whole question object, much simpler
		#sAnswerTrackerSM; //tracks independently of Game Manager, same var name
	
		// Constructor optionally takes initial scores
		constructor({parent}) {
			this.#parent = parent;
			this.#currentScores = { teamA: 0, teamB: 0 };
			this.#pointsThisRound = { teamA: 0, teamB: 0 };
			this.#errorCounts = {teamA: 0, teamB: 0};
			this.#sAnswerTrackerSM = new Set();
		}

		//getters
		getScores() { return { ...this.#currentScores }; } //return a copy to prevent changes
		getScoreByTeamName(name) { return this.#currentScores[("team" + name)]; }
		getPointsThisRoundByTeamName(name) { return this.#pointsThisRound[("team" + name)]; }
		getHistory() { return [...this.#history]; } //return a copy only
		getHistoryLength() { return this.#history.length; }
		getCurrentStakeSM() { return this.#currentStake; }
		#getBoardRendererSM() { return this.#parent.getBoardRenderer(); } //should be called after setting scores
		
		//CALLED ONCE, by renderAnswersBoardBR()
		getHasIndex(index) {
			return this.#history.filter( (item) => { 
				return (item.answerIndex === index);
			}).length > 0;
		}
		setCurrentStake(value) { this.#currentStake = value; }
		
		//pre: mode can be 'add' or 'edit' -> currently only used for 'add' mode, should change to edit
		#setCurrentScoresWithObj({mode = 'add', currentA = null, currentB = null, thisRndA = null, thisRndB = null}) {
			const multiplier = mode === 'add' ? 1 : 0;
			if (currentA !== null) this.#currentScores.teamA = currentA + this.#currentScores.teamA * multiplier;
			if (currentB !== null) this.#currentScores.teamB = currentB + this.#currentScores.teamB * multiplier;
			if (thisRndA !== null) this.#pointsThisRound.teamA = thisRndA + this.#pointsThisRound.teamA * multiplier;
			if (thisRndB !== null) this.#pointsThisRound.teamB = thisRndB + this.#pointsThisRound.teamB * multiplier;

			this.setCurrentStake(0);
			this.#getBoardRendererSM().updateScoresDisplayBR();
		}

		//setup new round, called only by selectQuestion()
		startNewRoundSM(currentQuestion) {
			this.#currentQuestionSM = currentQuestion
			this.#sAnswerTrackerSM = new Set();
			this.#clearHistory();
			this.#pointsThisRound = { teamA: 0, teamB: 0 };
			this.#totalNumberOfAnswers = currentQuestion.answers.length;
		}

		//might not be needed
		#calculateTotalScoreThisRound(currentQuestion) {
			if (currentQuestion?.answers?.[0]?.points) {
				this.#totalScoreThisRound = 0;
				currentQuestion.answers.forEach( x => {
					this.#totalScoreThisRound += x.points;
				});
			} else {
				console.warn("in ScoreManager, in calculateTotalScoreThisRound, can't find points");
			}
		}

		// Add points from an object supplied when calling:
			//processScoring-type-team-boardPoints-manualPoints-answerIndex
		// pre: used for 'correctAnswer' 'wrongAnswer' and 'manual'
		// add stake for correct answer or wrong answer, NOT manual
		// update history stack
		
		//@@@@@@@signature changed: no more "points"
		processScoringFromSuppliedObject({type = 'correctAnswer', team, boardPoints, manualPoints, answerIndex = null}) {
			if (team !== 'A' && team !== 'B') { throw new Error('Team must be "A" or "B"'); }
			let multiplier = 0;
			switch(type) {
				case 'correctAnswer':
					multiplier = 1;
					break;
				case 'wrongAnswer':
					multiplier = -1;
					break;
			}
			const stakePoints = this.#currentStake * multiplier;
			
			//@@@@@open change: clean sweep is tricky now
			this.#updateScoresWithHistorySM({type, team, boardPoints, manualPoints, stakePoints, answerIndex});
			if (answerIndex !== null) { this.#sAnswerTrackerSM.add(answerIndex); }

			if (this.#sAnswerTrackerSM.size === this.#totalNumberOfAnswers && type === 'correctAnswer') {
				const otherTeam = team === 'A' ? 'B' : 'A';
				const pointsToTransfer = team === 'A' ? this.#pointsThisRound.teamB :
														this.#pointsThisRound.teamA;
				this.#updateScoresWithHistorySM({type: 'cleanSweep', team, boardPoints: pointsToTransfer});
				this.#updateScoresWithHistorySM({type: 'cleanSweep', team: otherTeam, 
							boardPoints: (-pointsToTransfer)});
			}
		}

		//pre: stakePoints has the correct sign (-ve for wrong answer)
		//updateScores-type-team-boardPoints-stakePoints-answerIndex
		#updateScoresWithHistorySM({type, team, boardPoints, stakePoints, answerIndex = null}) {

			if (!type) { throw new Error("type cannot be null or empty"); }

			const mode = type === 'manual' ? 'edit' : 'add';

			this.#setCurrentScoresWithObj({ 
				mode, 
				["current" + team]: (boardPoints + stakePoints),
				["thisRnd" + team]: boardPoints,
			});

			// Push to history
			this.#history.push({
				type,
				team,
				boardPoints,
				stakePoints,
				answerIndex,
				timestamp: Date.now(),
			});
		}

		// addPoints-type-team-points-answerIndex
		// @@@check what happens: seems to subtract current score to compensate for the addition:
				//this should be corrected, use mode "edit" rather than add
		manualEdit({team, manualPoints}) { //@@@@@must check manual edits
			console.log("in manualEdit(), points: ", manualPoints);
			this.processScoringFromSuppliedObject({type: 'manual', team, manualPoints, answerIndex: null}); 
		}

		// Reverse last move (subtract from original team, add to the other)
		reverseLast() {
			if (this.#history.length === 0) return this.getScores();

			const lastChange = this.#history.at(-1);
			console.log("in reverseLast(), lastChange: ", lastChange);
			if (lastChange.type === 'manual') {
				N.toastBad("Cannot reverse after manual edit", 2000);
			} else {
				const other = lastChange.team === 'A' ? 'B' : 'A';
				this.#updateScoresWithHistorySM({
					...lastChange, 
					boardPoints: -lastChange.boardPoints,
					stakePoints: -lastChange.stakePoints,
				});
				this.#updateScoresWithHistorySM({
					...lastChange, 
					team: other, //BUGWATCH: doesn't matter which team is active: think why not
					boardPoints: +lastChange.boardPoints,
					stakePoints: +lastChange.stakePoints,
				});
			}
			console.log("In reverseLast(), History: ", this.#history);
			
			
				
				
				
				/*
				this.#setCurrentScoresWithObj({
					mode: 'add',
					["current" + this.#parent.getCurrentTeamGM()]: -lastChange.points,
					["current" + this.#parent.getOtherTeamGM()]: lastChange.points,
					//["thisRnd" + this.#parent.getCurrentTeamGM()]
				});*/
				
			
		}

		#clearHistory() {
			this.#history = [];
		}
			
		// --- Error tracking ---
		incrementError(team) {
			if (team !== 'A' && team !== 'B') return;
			const key = team === 'A' ? 'teamA' : 'teamB';
			if (this.#errorCounts[key] < 4) this.#errorCounts[key]++;
			return this.#errorCounts;
		}

		resetErrors() {
			this.#errorCounts = { teamA: 0, teamB: 0 };
		}			
	}

    class BoardRenderer {
        #$answersBoard;
        #$questionsContainer;
        #$currentQuestion;
		#parent;
        
        constructor({parent}) { //parent is GM
			this.#parent = parent;
            this.#$answersBoard = $('#answers-board');
            this.#$questionsContainer = $('#questions-container');
            this.#$currentQuestion = $('#current-question');
        }
        renderQuestionsList(questions, onQuestionSelect) {
            this.#$questionsContainer.empty();

            questions.forEach(question => {
                const $questionElement = $('<div>')
                    .addClass('question-item')
                    .text(question.question)
                    .data('id', question.id)
                    .on('click', function() {
                        onQuestionSelect($(this).data('id'));
                        $('.question-item').removeClass('active');
                        $(this).addClass('active');
                    });
                
                this.#$questionsContainer.append($questionElement);
            });
        }

		//POWERHOUSE FUNCTION, CALLED ONCE
		//onAnswerRevealBR() is a function passed in, added to a click listener
		//TODO: CHANGE TO {} SYNTAX
        renderAnswersBoardBR(sortedAnswers, onAnswerRevealBR) {
            this.#$answersBoard.empty();
            
            if (!sortedAnswers.length) return;
            
            // Create column ordering
            const reorderedAnswers = [];
            const originalIndices = [];
            const half = Math.ceil(sortedAnswers.length / 2);
            
            for (let i = 0; i < half; i++) {
                reorderedAnswers.push(sortedAnswers[i]);
                originalIndices.push(i);
                
                if (i + half < sortedAnswers.length) {
                    reorderedAnswers.push(sortedAnswers[i + half]);
                    originalIndices.push(i + half);
                }
            }

			//CREATE CARDS AND ADD CLICK LISTENERS FOR EACH ANSWER
            reorderedAnswers.forEach((answerObj, displayIndex) => {
                const originalIndex = originalIndices[displayIndex];
                const isRevealed = this.#parent.getScoreManager().getHasIndex(originalIndex);
				console.log("in renderAnswersBoardBR(), check for isRevealed should be false: ", isRevealed);
				

				const $flipContainer = $('<div>')
					.addClass('flip-container')
					.attr('data-answer-index', originalIndex);

				const $mainCard = $('<div>')
					.addClass('main-card')
					.html(`<div class="answer-number">${originalIndex + 1}</div>`)
					.on('click', () => onAnswerRevealBR(originalIndex)); //POWERHOUSE: CLICK LISTENER IS HERE
																		//SPECS: onAnswerReveal-index

				const $topCard = $('<div>')
					.addClass('top-card')
					.html(`
						<div class="answer-text">${answerObj.answer}</div>
						<div class="answer-points">${answerObj.points} points</div>
					`);

				$flipContainer.append($mainCard, $topCard);

                if (isRevealed) {
                    //$flipContainer.addClass('flipped'); //flipped is for horizontal flip
                    $flipContainer.addClass('rolled'); //rolled is for roll forward
					console.log("-----in renderAnswersBoardBR->reorderedAnswers.forEach(...), just added an isRevealed");
                }

                this.#$answersBoard.append($flipContainer);
            });
        }
        
        updateQuestionDisplay(questionText) {
            this.#$currentQuestion.text(questionText);
        }
        
		flipAnswer(index) {
			const $flipContainer = $(`.flip-container[data-answer-index="${index}"]`);
			if ($flipContainer.length) {
				//$flipContainer.addClass('flipped'); //flipped is for horizontal flipped
				$flipContainer.addClass('rolled'); //rolled is for roll forward
			}
		}
        
        clearAnswersBoard() {
            this.#$answersBoard.empty();
        }
		
        updateScoresDisplayBR() {
			console.log("In updateScoresDisplayBR(), STAKE: ", this.#parent.getScoreManager().getCurrentStakeSM());
			$('#team-a-stake span').text("");
			$('#team-b-stake span').text("");
			const scores = this.#parent.getScoreManager().getScores(); 
            $('#team-a-score').text(scores.teamA);
            $('#team-b-score').text(scores.teamB);
			const teamLowerCase = this.#parent.getCurrentTeamGM().toLowerCase();
			if (this.#parent.getScoreManager().getCurrentStakeSM()) {
				$(`#team-${teamLowerCase}-stake span`).text("STAKE: " + this.#parent.getScoreManager().getCurrentStakeSM() );
			}
        }
        
        highlightCurrentTeam() {
			const currentTeam = this.#parent.getCurrentTeamGM();
            const $teamAPanel = $('.team-panel').first();
            const $teamBPanel = $('.team-panel').last();
            
            $teamAPanel.css('boxShadow', currentTeam === 'A' ? '0 0 20px #FFD700' : '0 5px 15px rgba(0, 0, 0, 0.3)');
            $teamBPanel.css('boxShadow', currentTeam === 'B' ? '0 0 20px #FFD700' : '0 5px 15px rgba(0, 0, 0, 0.3)');
        }
        resetQuestionSelection() {
            $('.question-item').removeClass('active');
        }
		
		//used once but powerful: called once by GM to add scores manually through editing (GM then processes)
		editScoresBR(onFinishCallback) {
			console.log("BoardRenderer.editScoresBR() activated");

			const $scores = $('.score');
			if (!$scores.length) return;

			// Make editable and highlight
			$scores.attr('contenteditable', 'true')
				   .addClass('editing')
				   .css({
					   cursor: 'text',
					   outline: 'none',
					   boxShadow: '0 0 12px 3px rgba(0,255,0,0.6)',
					   transition: 'box-shadow 0.2s ease'
				   });

			$scores.each(function() {
				$(this).data('oldVal', $(this).text().trim());
			});

			$scores.first().focus();

			// Enter commits current field
			$scores.on('keypress.scoreEdit', function(e) {
				if (e.which === 13) {
					e.preventDefault();
					$(this).blur();
				}
			});

			// Blur commits edit only if focus did not move to another .score
			$scores.on('blur.scoreEdit', function(e) {
				const $el = $(this);

				// Delay slightly to allow another .score to gain focus
				setTimeout(() => {
					if (!$('.score:focus').length) {
						console.log("No score focused, committing edits");

						const results = {};
						$scores.each(function() {
							const $s = $(this);
							const newVal = $s.text().trim();
							const oldVal = $s.data('oldVal');
							const id = $s.attr('id');

							console.log("Committing score. Old:", oldVal, "New:", newVal);

							if (isNaN(newVal) || newVal === '') {
								console.warn("Invalid score, reverting");
								$s.text(oldVal);
								results[id] = parseInt(oldVal, 10);
							} else {
								const parsed = parseInt(newVal, 10);
								$s.text(parsed);
								results[id] = parsed;
							}
						});

						// Remove editing styles and events
						$scores.removeAttr('contenteditable')
							   .removeClass('editing')
							   .off('.scoreEdit')
							   .css({cursor: 'default', boxShadow: 'none'});
						if (typeof onFinishCallback === 'function') {
							onFinishCallback(results);
						}
					} else {
						console.log("Focus moved to another score field, edit continues");
					}
				}, 50);
			});

			// Use timeout to avoid immediate triggering from button click
			setTimeout(() => {
				$(document).on('click.scoreEdit', function(e) {
					if (!$(e.target).closest('.score').length) {
						console.log("Outside click detected, blurring all scores");
						$scores.blur(); // triggers the blur handler above
						$(document).off('click.scoreEdit');
					}
				});
			}, 50);
		}
	}

    class UIHandler {
        #gameManager;
		#scoreManagerUI;
		#boardRendererUI;
		//#isAnswerBoardLocked = false;
		
        constructor(gameManager) {
            this.#gameManager = gameManager;
			this.#scoreManagerUI = gameManager.getScoreManager();
			this.#boardRendererUI = gameManager.getBoardRenderer();
            this.#setupEventListenersUI();
			this.#initKeyboardListener();
        }
        
        // Public methods
        updateUI() {
            // Can be expanded for more complex UI updates
        }
		
		
		updateWrongAnswerUI(errorCounts) {
			this.#showWrongAnswerOverlay();
			this.#updateStrikeBoxes(errorCounts);
		}
		showCleanSweepAnimation(message) {
			
			// Create full-screen overlay
			const overlay = $(`
				<div class="clean-sweep-overlay">
					<div class="sweep-bar"></div>
					<div class="sweep-text">${message}</div>
				</div>
			`);

			$('body').append(overlay);

			// Animate in and out
			setTimeout(() => {
				overlay.addClass('animate');
			}, 50);

			setTimeout(() => {
				overlay.fadeOut(400, () => overlay.remove());
			}, 1800);
		}

		#initKeyboardListener() {
			// Listen for keydown events on the whole document
			$(document).on('keydown', (e) => {
				// Only respond to number keys 1-9 (you can extend)
				if (isAnswerBoardLocked) {
					return;
				}
				const key = e.key;

				// Ignore anything outside 1-9
				if (!/^[0-9]$/.test(key)) return;
				e.preventDefault();

				console.log("Key pressed: ", key);
				if (key === '0') { console.log("-----Wrong answer button-----"); }

				// Convert key to index (0-based)
				const answerIndex = parseInt(key, 10) - 1;
				this.#gameManager.processAnswerByIndex(answerIndex);
			});
		}
		
		#updateStrikeBoxes(errorCounts) {
			  const maxStrikes = 4;
			  for (let team in errorCounts) {
				  const filled = '⚫'.repeat(errorCounts[team]);
				  const empty = '⚪'.repeat(maxStrikes - errorCounts[team]);
				  const name = team === 'teamA' ? 'a' : 'b';
				  $(`#team-${name}-strikes`).text(filled + empty);
			  }
		}
		
		#showWrongAnswerOverlay() {
			const $overlay = $('#wrong-answer-overlay');

			// Restart animation if already visible
			$overlay.removeClass('show');
			void $overlay[0].offsetWidth; // trigger reflow
			$overlay.addClass('show');

			// Auto-hide after animation
			setTimeout(() => {
				$overlay.removeClass('show');
			}, 800);
		}
		
		#toggleStakeWindow(show) {
			
			const thisTeam = this.#gameManager.getCurrentTeamGM(); // "A" or "B"
			const thisTeamKey = thisTeam === "A" ? "teamA" : "teamB";
			const thisTeamScore = this.#scoreManagerUI.getScores()[thisTeamKey];
			
			if (show) {
				isAnswerBoardLocked = true;
				$("#stake-overlay").addClass("visible");
				$(".score").addClass("stake-shrink");
				
				// Update labels
				$("#stake-team-label").text(`Current Team: Team ${thisTeam}`);
				$("#stake-max-label").text(`Max Allowed Stake: ${thisTeamScore}`);

				// Set input limits
				const stakeInput = $("#stake-input");
				stakeInput.attr("max", thisTeamScore);
				stakeInput.val("");  // clear previous value

				// Auto focus after small delay (HTML needs to render)
				setTimeout(() => stakeInput.trigger("focus"), 100);

			} else {
				isAnswerBoardLocked = false;
				$("#stake-overlay").removeClass("visible");
				$(".score").removeClass("stake-shrink");
				const value = Math.max(Math.min( parseInt($("#stake-input").val(), 10), thisTeamScore), 0);
				if (isNaN(value)) return;
				this.#gameManager.applyStakeGM(value);
			}
		}

        // Private methods
        #setupEventListenersUI() {
            $('#reveal-answer').on('click', () => this.#gameManager.revealNextAnswer());
            $('#wrong-answer').on('click', () => this.#gameManager.processAnswerByIndex(-1));
            $('#next-round').on('click', () => this.#gameManager.nextRound());
            $('#reset-game').on('click', () => this.#gameManager.resetGame());
            $('#toggle-sounds').on('click', () => this.#gameManager.toggleSounds());
            $('#switch-team').on('click', () => this.#gameManager.switchActiveTeamGM());
            $('#end-this-round').on('click', () => this.#gameManager.endThisRound());
			$('#edit-score').on('click', () => {
				isAnswerBoardLocked = true;
				this.#gameManager.editScoresGM();
			});

			$('#reverse-last-points').on('click', () => {
				this.#scoreManagerUI.reverseLast();
			});
			$("#stake-points-btn").on("click", () => {
				this.#toggleStakeWindow(true);
			});
			$("#stake-cancel").on("click", () => {
				this.#toggleStakeWindow(false);
			});
			$("#stake-confirm").on("click", () => {
				const value = $("#stake-input").val();
				console.log("Stake entered:", value);
				setTimeout( () => this.#boardRendererUI.updateScoresDisplayBR(), 50);
				this.#toggleStakeWindow(false);
			});
        }
	}


    class GameManager {
        #questionBank;
        #scoreManagerGM;
		#sAnswerTrackerGM; //TODO: can be moved to ScoreManager
        #boardRendererGM;
        #audioManager;
        #uiHandlerGM;

		#isThisRoundActive = false;
        #currentQuestion = null;
		#currentTeam = 'A';
		#otherTeam = 'B';

        constructor(questionsData) {
            this.#questionBank = new QuestionBank(questionsData);
            this.#scoreManagerGM = new ScoreManager({parent: this});
			this.#sAnswerTrackerGM = new Set(); //TODO: can be moved to ScoreManager
            this.#boardRendererGM = new BoardRenderer({parent: this});
            this.#audioManager = new AudioManager();
            this.#uiHandlerGM = new UIHandler(this);
            this.#initializeGame();
        }

		//needed for click listeners
		getScoreManager() { return this.#scoreManagerGM; }
		getBoardRenderer() { return this.#boardRendererGM; }
		getCurrentTeamGM() { return this.#currentTeam; }
		getOtherTeamGM() { return this.#otherTeam; }
		endThisRound() {this.#isThisRoundActive = false;}

		//set as a click listener on each question in the question bank
        selectQuestion(questionId) {
            this.#currentQuestion = this.#questionBank.getQuestionById(questionId);
			

            if (this.#currentQuestion) {
				this.#sAnswerTrackerGM = new Set();
				this.#scoreManagerGM.startNewRoundSM(this.#currentQuestion);
                this.#boardRendererGM.updateQuestionDisplay(this.#currentQuestion.question);
				const sortedAnswers = this.#questionBank.getSortedAnswers(this.#currentQuestion.id);
				this.#boardRendererGM.renderAnswersBoardBR(
					sortedAnswers, 
					(index) => this.processAnswerByIndex(index) //added as a click listener to each panel
				);
				this.#isThisRoundActive = true;
            }
        }
		

		//-1 is for wrong answer, all answers should go here
		processAnswerByIndex(index) {
			if (index === -1) {
				this.#processWrongAnswer(); 
				return;
			}
			if (typeof index === 'int') { console.log("typeof is integer"); }
			if (this.#currentQuestion && this.#isThisRoundActive && index < this.#currentQuestion.answers.length && !this.#sAnswerTrackerGM.has(index)) {
					this.#onAnswerRevealGM(index);
			} else {
				console.log("failed check", this.#currentQuestion, this.#isThisRoundActive, !this.#sAnswerTrackerGM.has(index));
			}
		}
		


		//CLICK LISTENER FUNCTION: passed as a variable, added as a click listener to each panel; also called when answers revealed at end of game.
		//pre: trusts the index is correct (comes from a click event)
		//flips answer, adds to array of revealed answers, plays sound
        #onAnswerRevealGM(index) {
			
			this.#sAnswerTrackerGM.add(index);
			
			//QUICKFIX: clean sweep
			if (this.#sAnswerTrackerGM.size === this.#currentQuestion.answers.length) {
				const message = this.#scoreManagerGM.getPointsThisRoundByTeamName(this.#otherTeam) === 0 ? "CLEAN SWEEP!" : "STEAL!!!"; 
				this.#uiHandlerGM.showCleanSweepAnimation(message);
			}

			const answer = this.#currentQuestion.answers[index];
			this.#scoreManagerGM.processScoringFromSuppliedObject({
				type:'correctAnswer', team: this.#currentTeam, boardPoints: answer.points, answerIndex: index});
										//addPoints-type-team-points-answerIndex

			this.#boardRendererGM.flipAnswer(index);
			this.#audioManager.playSound('correct');
			this.#audioManager.playSound('correct');
        }

		//designed to reveal at end of round
        revealNextAnswer() {
            if (!this.#currentQuestion) return;
            const hiddenAnswers = this.#currentQuestion.answers
                .map((_, index) => index)
                .filter(index => !this.#sAnswerTrackerGM.has(index));
			console.log("***in revealNextAnswer; hiddenAnswers: ", hiddenAnswers);
            if (hiddenAnswers.length > 0) {
				const indexToReveal = hiddenAnswers[hiddenAnswers.length - 1];
				this.#boardRendererGM.flipAnswer(indexToReveal);
				this.#audioManager.playSound('reveal');
				this.#sAnswerTrackerGM.add(indexToReveal); // add it to the set
            } else {
				console.log("all answers revealed");
			}
        }
		
		///switchActiveTeamGM()
		switchActiveTeamGM() {
			const newCurrentTeam = this.#otherTeam;
			this.#otherTeam = this.#currentTeam;
			this.#currentTeam = newCurrentTeam;
            this.#boardRendererGM.highlightCurrentTeam();
		}
        
        #processWrongAnswer() {
			const errorCounts = this.#scoreManagerGM.incrementError(this.#currentTeam);
			this.#scoreManagerGM.processScoringFromSuppliedObject({
				type: 'wrongAnswer',
				team: this.#currentTeam,
				boardPoints: 0, //controlled by stake found in ScoreManager
				answerIndex: null,
			});
            this.#audioManager.playSound('wrong');
			this.#uiHandlerGM.updateWrongAnswerUI(errorCounts);
			this.switchActiveTeamGM();
        }

		applyStakeGM(stake) {
			this.#scoreManagerGM.setCurrentStake(stake);
		}

		//edit scores by sending a callback to editScoresBR (entire function here is a callback function)
		editScoresGM() {
			this.#boardRendererGM.editScoresBR( (results) => {
				
				isAnswerBoardLocked = false;
				
				const teamAVal = parseInt(results['team-a-score'], 10);
				const teamBVal = parseInt(results['team-b-score'], 10);

				if (!isNaN(teamAVal) && !isNaN(teamBVal)) {
					// Directly update ScoreManager state
					if (teamAVal !== this.#scoreManagerGM.getScores().teamA || 
					teamBVal !== this.#scoreManagerGM.getScores().teamB) {
						
						this.#scoreManagerGM.manualEdit({
							team: 'A',
							manualPoints: teamAVal - this.#scoreManagerGM.getScores().teamA
						});
						this.#scoreManagerGM.manualEdit({
							team: 'B',
							manualPoints: teamBVal - this.#scoreManagerGM.getScores().teamB
						});
						N.toast("Scores updated");
					} else {
						N.toast("No change: scores not updated");
					}
				}
			});
		}

        //called by next-round button, sets up new round, but without question chosen as yet.
        nextRound() {
			//@@@ensure all answers revealed???
            this.#currentQuestion = null;
            //this.#revealedAnswers = []; //@@@make robust by using reset
            this.#boardRendererGM.updateQuestionDisplay('Select a question to begin the next round!');
            this.#boardRendererGM.clearAnswersBoard();
            this.#boardRendererGM.resetQuestionSelection();
        }
        
        resetGame() {
            this.#scoreManagerGM.resetScores();
            this.#currentQuestion = null;
            //this.#revealedAnswers = [];
            
			this.#currentTeam = 'A'; //@@@needs a better default method, one place initialise and reset
			this.#otherTeam = 'B';
            this.#boardRendererGM.updateScoresDisplayBR(); 
            this.#boardRendererGM.updateQuestionDisplay('Select a question to begin the game!');
            this.#boardRendererGM.clearAnswersBoard();
            this.#boardRendererGM.resetQuestionSelection();
            this.#boardRendererGM.highlightCurrentTeam();
        }
        
        toggleSounds() {
            const soundsEnabled = this.#audioManager.toggleSounds();
            $('#toggle-sounds').text(soundsEnabled ? 'Disable Sounds' : 'Enable Sounds');
        }
        
        #initializeGame() {
            const questions = this.#questionBank.getAllQuestions();
            this.#boardRendererGM.renderQuestionsList(questions, (questionId) => this.selectQuestion(questionId));
            this.#boardRendererGM.updateScoresDisplayBR();
            this.#boardRendererGM.highlightCurrentTeam();
        }
        

    }

    // Sample questions data
    const questionsData = [
        {
            id: 1,
            question: "Name something people take on vacation.",
            answers: [
                { answer: "Suitcase", points: 40 },
                { answer: "Clothes", points: 25 },
                { answer: "Toothbrush", points: 15 },
                { answer: "Phone", points: 10 },
                { answer: "Money", points: 10 }
            ]
        },
        {
            id: 2,
            question: "Name a fruit that is yellow.",
            answers: [
                { answer: "Banana", points: 35 },
                { answer: "Lemon", points: 25 },
                { answer: "Pineapple", points: 20 },
                { answer: "Mango", points: 15 },
                { answer: "Peach", points: 5 }
            ]
        },
        {
            id: 3,
            question: "Name a sport that uses a ball.",
            answers: [
                { answer: "Soccer", points: 30 },
                { answer: "Basketball", points: 25 },
                { answer: "Tennis", points: 20 },
                { answer: "Baseball", points: 15 },
                { answer: "Volleyball", points: 10 }
            ]
        },
        {
            id: 4,
            question: "Name something you find in a kitchen.",
            answers: [
                { answer: "Refrigerator", points: 35 },
                { answer: "Stove", points: 25 },
                { answer: "Sink", points: 15 },
                { answer: "Knife", points: 15 },
                { answer: "Plate", points: 10 }
            ]
        },
		// Sample questions data

		{
			id: 5,
			question: "What would you do if someone next to you on a plane smelled bad?",
			answers: [
				{ answer: "Change seats", points: 39 },
				{ answer: "Cover nose/Wear a mask", points: 24 },
				{ answer: "Turn your head", points: 6 },
				{ answer: "Put up with it", points: 6 },
				{ answer: "Spray perfume", points: 6 }
			]
		},
		{
			id: 6,
			question: "If Batman went broke, what Bat-item might he sell?",
			answers: [
				{ answer: "Batmobile", points: 81 },
				{ answer: "Batcave", points: 9 },
				{ answer: "Batcopter", points: 2 },
				{ answer: "Batcycle", points: 2 },
				{ answer: "Batplane", points: 2 }
			]
		},
		{
			id: 7,
			question: "Name an animal without legs.",
			answers: [
				{ answer: "Snake", points: 59 },
				{ answer: "Fish/Eel/Shark", points: 23 },
				{ answer: "Whale", points: 5 },
				{ answer: "Seal/Sea Lion", points: 4 },
				{ answer: "Worm", points: 2 }
			]
		},
		{
			id: 8,
			question: "If your dog ran away, name something you'd be shocked to see he took along.",
			answers: [
				{ answer: "The cat", points: 23 },
				{ answer: "His leash or collar", points: 17 },
				{ answer: "Food or bowl", points: 16 },
				{ answer: "A bone", points: 9 },
				{ answer: "His bed or pillow", points: 6 },
				{ answer: "Your wallet or cash", points: 4 }
			]
		},
		{
			id: 9,
			question: "Name something people often do at night.",
			answers: [
				{ answer: "Read a book", points: 26 },
				{ answer: "Use their phone", points: 23 },
				{ answer: "Play board games", points: 20 },
				{ answer: "Play video games", points: 17 },
				{ answer: "Meditate", points: 14 }
			]
		},
		{
			id: 10,
			question: "Name things that are hot.",
			answers: [
				{ answer: "Fire", points: 26 },
				{ answer: "Coffee", points: 24 },
				{ answer: "Tea", points: 21 },
				{ answer: "Stove", points: 16 },
				{ answer: "Fireplace", points: 13 }
			]
		},
		{
			id: 11,
			question: "Name something some people are scared to ride.",
			answers: [
				{ answer: "Airplane", points: 44 },
				{ answer: "Motorcycle", points: 21 },
				{ answer: "Roller Coaster", points: 16 },
				{ answer: "Boat", points: 4 },
				{ answer: "Horse", points: 4 },
				{ answer: "Elevator", points: 3 }
			]
		},
		{
			id: 12,
			question: "Name a common fear.",
			answers: [
				{ answer: "Heights", points: 50 },
				{ answer: "Spiders", points: 25 },
				{ answer: "Public Speaking", points: 15 },
				{ answer: "Flying", points: 10 }
			]
		},
		{
			id: 13,
			question: "Name something people forget when they leave the house.",
			answers: [
				{ answer: "Keys", points: 50 },
				{ answer: "Phone", points: 25 },
				{ answer: "Wallet", points: 15 },
				{ answer: "Sunglasses", points: 10 }
			]
		},
		{
			id: 14,
			question: "Name something with a long neck.",
			answers: [
				{ answer: "Giraffe", points: 78 },
				{ answer: "Ostrich", points: 10 },
				{ answer: "Bottle", points: 4 },
				{ answer: "Crane", points: 3 },
				{ answer: "Swan", points: 3 },
				{ answer: "Glass", points: 2 }
			]
		},
		{
			id: 15,
			question: "Name a place where people often lose their keys.",
			answers: [
				{ answer: "At home", points: 55 },
				{ answer: "At the mall", points: 17 },
				{ answer: "In a purse", points: 10 },
				{ answer: "In the car", points: 7 },
				{ answer: "At a bar", points: 6 }
			]
		},
		{
			id: 16,
			question: "Name a place teens complain about going to.",
			answers: [
				{ answer: "School/College", points: 56 },
				{ answer: "Church", points: 26 },
				{ answer: "Family events", points: 9 },
				{ answer: "Doctor/Dentist", points: 4 },
				{ answer: "Grocery store", points: 2 },
				{ answer: "Work", points: 2 }
			]
		},
		{
			id: 17,
			question: "Name an animal that’s easy to act out in charades.",
			answers: [
				{ answer: "Monkey/Ape", points: 32 },
				{ answer: "Dog", points: 21 },
				{ answer: "Cat", points: 16 },
				{ answer: "Bird", points: 14 },
				{ answer: "Elephant", points: 4 }
			]
		},
		{
			id: 18,
			question: "Name something people often do before a big presentation.",
			answers: [
				{ answer: "Practice", points: 34 },
				{ answer: "Panic", points: 21 },
				{ answer: "Drink water", points: 18 },
				{ answer: "Check notes", points: 15 },
				{ answer: "Go to the bathroom", points: 12 }
			]
		},
		{
			id: 19,
			question: "Name something people say they never have enough of.",
			answers: [
				{ answer: "Money", points: 39 },
				{ answer: "Time", points: 27 },
				{ answer: "Sleep", points: 17 },
				{ answer: "Energy", points: 10 },
				{ answer: "Vacation days", points: 7 }
			]
		},
		{
			id: 20,
			question: "Worst thing to forget on vacation.",
			answers: [
				{ answer: "Toiletries", points: 29 },
				{ answer: "Clothes/Shoes", points: 28 },
				{ answer: "Money/Credit Card", points: 20 },
				{ answer: "Medication", points: 9 },
				{ answer: "Camera", points: 6 }
			]
		},
		{
			id: 21,
			question: "Name an animal starting with E.",
			answers: [
				{ answer: "Elephant", points: 85 },
				{ answer: "Eagle", points: 7 },
				{ answer: "Eel", points: 3 },
				{ answer: "Emu", points: 3 }
			]
		},
		{
			id: 22,
			question: "Name a sport where athletes earn a lot.",
			answers: [
				{ answer: "Football", points: 29 },
				{ answer: "Baseball", points: 27 },
				{ answer: "Basketball", points: 24 },
				{ answer: "Soccer", points: 7 },
				{ answer: "Tennis", points: 7 }
			]
		},
		{
			id: 23,
			question: "Name something people fall out of.",
			answers: [
				{ answer: "Tree", points: 36 },
				{ answer: "Love", points: 25 },
				{ answer: "Bed", points: 21 },
				{ answer: "Chair", points: 12 },
				{ answer: "Car", points: 6 }
			]
		},
		{
			id: 24,
			question: "Name a chore nobody likes doing.",
			answers: [
				{ answer: "Cleaning the bathroom", points: 45 },
				{ answer: "Doing the dishes", points: 25 },
				{ answer: "Vacuuming", points: 20 },
				{ answer: "Laundry", points: 10 }
			]
		},
		{
			id: 25,
			question: "Name something people do when they’re bored.",
			answers: [
				{ answer: "Watch TV", points: 40 },
				{ answer: "Play video games", points: 30 },
				{ answer: "Read a book", points: 15 },
				{ answer: "Take a nap", points: 15 }
			]
		},

    ];

    // Initialize the game
	const N = new NeptuneDesign();
    const gameManager = new GameManager(questionsData);
});


