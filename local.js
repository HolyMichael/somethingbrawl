

// Server setup
let crypto = require('crypto')
let server = require('http').createServer();
let io = require('socket.io')(server);
let sql = require('./localsql'); //fkml change this everytim u go to server
server.listen(3000);



//functions

function randomCardsFromDeck(deck, number){
	let max = Object.keys(deck).length;
	let cards = [];
	console.log("drawing this number of cards: " + number);
	for(i=0;i<number;i++){
		cards.push(deck[Math.floor(Math.random()*(max))].id);     // returns a number between 1 and decksize
	}
	return cards;
}

function randomCardFromAllCards(){
	let max = Object.keys(CardList).length;
	return Math.floor((Math.random()*max)) + 1;
}

function GetMatchmakingArray(callingsocket){
	let returnme = []
	let i = 0;
	const iMax = Object.keys(playerList).length;
	for(; i<iMax;i++){
		returnme.push(new Promise (function(resolve, reject){
			if(playerList[i].gameState == "LFO" && playerList[i].sock != callingsocket){ //We may add more verifications here for a more complex matchmaking algorithm
				this.i = i; //this.i scope refers to the promise therefore there will be a this.i for each player we created a promise for
				playerList[i].ping().then(()=>{
					console.log("player responded");
					reject(this.i);
				}).catch((error) =>{
					console.log("player has disconnected");
					resolve(this.i);
				});
			} else if(playerList[i].sock == callingsocket){ //we must resolve the promise to avoid blocking
				resolve("self");
			} else{
				resolve("Not LFO");
			}
		}))
	}
	console.log(returnme);
	return returnme;
}

function isEmpty(obj) {
    // null and undefined are "empty"
    if (obj == null) return true;
 
    // Assume if it has a length property with a non-zero value
    // that that property is correct.
    if (obj.length && obj.length > 0)    return false;
    if (obj.length === 0)  return true;
 
    // Otherwise, does it have any properties of its own?
    // Note that this doesn't handle
    // toString and toValue enumeration bugs in IE < 9
    for (let key in obj) {
        if (hasOwnProperty.call(obj, key)) return false;
    }
 
    return true;
}

function getSHA256(input){
    return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
}
// variable and object setup for objects read this https://code.tutsplus.com/tutorials/stop-nesting-functions-but-not-all-of-them--net-22315
let playerList = [];
let CardList= [];
let playerGames = []


//player object{
	function player(id, name, gameState, activedeck, sock){
		this.id = id; //primary key id in database possibly unique repeated with name might remove
		this.name = name;
		this.gameState = gameState;
		this.activedeck = activedeck;
		this.sock = sock; //primary key current connection id
		this.connectionStatus = true;
		this.currentTimeout; //mantains the timeout object so we can delete it in case the user responds
		this.currentPromise;
		this.currentGame;
	}

	player.prototype.ping = function(){
		io.to(this.sock).emit('ping');
		console.log("pinging " + this.sock);
		this.connectionStatus = false;
		this.currentTimeout = setTimeout(this.pingFailCheck.bind(this),5000); //bind(this) used because this function is called from setTimeout wich rebinds this to the timeout obj
		this.currentPromise = new deferred();
		return this.currentPromise.promise;
	}

	player.prototype.pingFailCheck = function(){
		console.log("removing player")
		console.log(this);
		let index
		if(this.connectionStatus == false){
			index = playerList.indexOf(this);
			if(index !== -1){
				playerList.splice(index,1);
				this.currentPromise.reject();
			}
		}
		console.log(playerList);
	}

	player.prototype.pong = function(){
		this.connectionStatus = true;
		clearTimeout(this.currentTimeout);
		console.log(this);
		this.currentPromise.resolve();
		console.log("cancelling pingfailcheck")
	}
//}

//player status
	let playerStatus = function (health ,energy, energygrowth, maxenergy){
		this.health = health;
		this.armor = 0;
		this.maxHealth = health;
		this.energy = energy;
		this.curmaxenergy = energy;
		this.energygrowth = energygrowth;
		this.maxenergy = maxenergy;
		this.turnsTimedOut = 0;
	}

//game object{
	let game = function(p1, p2, timeout){
		this.p1 = p1;
		this.p2 = p2;

		this.p1Status;
		this.p2Status;

		this.p1loaded = false;
		this.p2loaded = false;

		this.currentPlayer;

		this.p1deck;
		this.p2deck;

		this.currentTimeout = timeout;

		this.transmission = {
			self_hp:0.0,
			self_maxhp:0.0,
			self_energy:0.0,
			self_armor:0.0,

			enemy_hp:0.0,
			enemy_maxhp:0.0,
			enemy_energy:0.0,
			enemy_armor:0.0
		}

		game.prototype.setTransmission = function(){ //We will always transmit to player1 first every time, this is called after calculating damage.
			this.transmission.self_maxhp = this.p1Status.maxHealth;
			this.transmission.self_hp = this.p1Status.health;
			this.transmission.self_energy = this.p1Status.energy;
			this.transmission.self_armor = this.p1Status.armor;

			this.transmission.enemy_maxhp = this.p2Status.maxHealth;
			this.transmission.enemy_hp = this.p2Status.health;
			this.transmission.enemy_energy = this.p2Status.energy;
			this.transmission.enemy_armor = this.p2Status.armor;
		}

		game.prototype.switchTransmission = function(){ //makes the transmission for player2
			this.transmission.self_maxhp = this.p2Status.maxHealth;
			this.transmission.self_hp = this.p2Status.health;
			this.transmission.self_energy = this.p2Status.energy;
			this.transmission.self_armor = this.p2Status.armor;

			this.transmission.enemy_maxhp = this.p1Status.maxHealth;
			this.transmission.enemy_hp = this.p1Status.health;
			this.transmission.enemy_energy = this.p1Status.energy;
			this.transmission.enemy_armor = this.p1Status.armor;
		}

		game.prototype.transmitGameStatus = function(){ //transmit : both players health, self energy?
			console.log("sending status");
			this.setTransmission();
			io.to(this.p1.sock).emit('gameStatus',this.transmission);
			this.switchTransmission();
			io.to(this.p2.sock).emit('gameStatus',this.transmission);
		}

		game.prototype.setUpGame = function(firstPlayer){
			sql.GetPlayerStats(p1.id, p2.id).then((result) =>{
				if(result[0].user_id == p1.id){
					this.p1Status = new playerStatus(result[0].Char_Health, result[0].Char_Energy, result[0].Char_EnergyGrowth, result[0].Char_MaxEnergy);
					this.p2Status = new playerStatus(result[1].Char_Health, result[1].Char_Energy, result[1].Char_EnergyGrowth, result[1].Char_MaxEnergy);
				} else {
					this.p2Status = new playerStatus(result[0].Char_Health, result[0].Char_Energy, result[0].Char_EnergyGrowth, result[0].Char_MaxEnergy);
					this.p1Status = new playerStatus(result[1].Char_Health, result[1].Char_Energy, result[0].Char_EnergyGrowth, result[1].Char_MaxEnergy);
				}
				console.log(this.p1.name);
				console.log(this.p1deck);
				console.log("loaded status of p1:");
				console.log(this.p1Status);
				console.log("loaded status of p2:");
				console.log(this.p2Status);

	  			console.log("decks \n" + this.p1deck +"\n" + this.p2deck);
				if (firstPlayer == 0){
					this.currentPlayer = this.p1;
					io.to(this.p2.sock).emit("disableEndTurnBT");

					let cardsToDraw = randomCardsFromDeck(this.p1deck , 3);
					this.p1hand = cardsToDraw; //kept to avoid cheaters
					console.log(cardsToDraw);
					io.to(this.p1.sock).emit("drawCards", {cards: cardsToDraw, ammount: Object.keys(cardsToDraw).length});
				}
				else{
					this.currentPlayer = this.p2;
					io.to(this.p1.sock).emit("disableEndTurnBT");

					let cardsToDraw = randomCardsFromDeck(this.p2deck , 3);
					this.p2hand = cardsToDraw; //kept to avoid cheaters
					console.log(cardsToDraw);
					io.to(this.p2.sock).emit("drawCards", {cards: cardsToDraw});
				}
				console.log("current player: " + this.currentPlayer.name);
				//emit warning animation
				//setup timeouts
				this.transmitGameStatus();
				this.setTurnTimer();
			}).catch(function (error){
				console.log(error);
			});
		}

		game.prototype.setTurnTimer = function(){
			console.log("setting timeout");
			this.currentTimeout = setTimeout(this.turnTimerEnded.bind(this), 30 * 1000); //30 segs
		}

		game.prototype.turnTimerEnded = function(){
			console.log("player let his turn pass by time");
			io.to(this.currentPlayer.sock).emit('turnTimerEnded');
			this.turnEnd();
		}

		game.prototype.playerEndedTurn = function(player, message){
			if(player != this.currentPlayer)
				return;
			clearTimeout(this.currentTimeout);
			this.turnEnd();
		}

		game.prototype.playCard = function(message){
			if(this.currentPlayer == this.p1){
				console.log("card cost " + CardList[message.card-1].cost);
				if(this.p1Status.energy >= CardList[message.card-1].cost){
					if(!(this.p1hand.includes(message.card-1))){ //check if he actually has that card in hand
						io.to(this.p1.sock).emit("playCardNotAllowed");
					}

					this.p1hand.splice(this.p1hand.indexOf(message.card-1)); //remove an instance of that card from the hand
					io.to(this.p1.sock).emit("playCardAllowed");
					this.p1Status.energy -= CardList[message.card-1].cost;
					this.gameLogic(this.p2Status, this.p1Status, CardList[message.card-1]);
					this.transmitGameStatus();
				} else{
					io.to(this.p1.sock).emit("playCardNotAllowed");
				}
			} else {
				if(this.p2Status.energy >= CardList[message.card-1].cost){
					if(!(this.p1hand.includes(message.card-1))){ //check if he actually has that card in hand
						io.to(this.p1.sock).emit("playCardNotAllowed");
					}

					this.p2hand.splice(this.p2hand.indexOf(message.card-1)); //remove an instance of that card from the hand
					io.to(this.p2.sock).emit("playCardAllowed");
					this.p2Status.energy -= CardList[message.card-1].cost;
					this.gameLogic(this.p1Status, this.p2Status, CardList[message.card-1]);
					this.transmitGameStatus();
				} else{
					io.to(this.p2.sock).emit("playCardNotAllowed");
				}
			}
		}

		game.prototype.turnEnd = function(){
			let targetPlayer,selfPlayer;
			if(this.currentPlayer == this.p1){
				targetPlayer = this.p2Status;
				selfPlayer = this.p1Status;
			} else {
				targetPlayer = this.p1Status;
				selfPlayer = this.p2Status;
			}
			//things that happen at the end of every turn (player currently playing is selfPlayer)
			//increment his energy by his growth stat
			if((targetPlayer.curmaxenergy + targetPlayer.energygrowth) > targetPlayer.maxenergy)
				targetPlayer.curmaxenergy = targetPlayer.maxenergy;
			else
				targetPlayer.curmaxenergy += targetPlayer.energygrowth;

			//set his energy to his curmaxenergy
			targetPlayer.energy = targetPlayer.curmaxenergy;

			if (this.currentPlayer == this.p1){
				//switch server side variables!
				this.currentPlayer = this.p2;
				io.to(this.p2.sock).emit("yourTurn");

				//get him some cards!
				let cardsToDraw = randomCardsFromDeck(this.p2deck, 3);
				this.p2hand = cardsToDraw //kept to avoid cheaters
				console.log(cardsToDraw);
				io.to(this.p2.sock).emit("drawCards", {cards: cardsToDraw, ammount: Object.keys(cardsToDraw).length});

				console.log("new player is \n" + this.currentPlayer.name);
			}
			else{
				//switch server side variables!
				this.currentPlayer = this.p1;
				io.to(this.p1.sock).emit("yourTurn");

				//get him some cards!
				let cardsToDraw = randomCardsFromDeck(this.p1deck, 3);
				this.p1hand = cardsToDraw //kept to avoid cheaters
				console.log(cardsToDraw);
				io.to(this.p1.sock).emit("drawCards", {cards: cardsToDraw, ammount: Object.keys(cardsToDraw).length});


				console.log("new player is \n" + this.currentPlayer.name);
			}

			//things that happen at the start of every turn (player currently playing is targetPlayer [reversed])
			//remove armor from the player starting his turn
			targetPlayer.armor = 0;
			//check victories
			console.log(this.p1.sock)
			if(targetPlayer.health <= 0){
				if (this.currentPlayer == this.p1)
					this.victory(this.p2, this.p1);
				else
					this.victory(this.p1, this.p2);
				return;
			}
			if(selfPlayer.health <= 0){
				if (this.currentPlayer == this.p1)
					this.victory(this.p1, this.p2);
				else
					this.victory(this.p2, this.p1);
				return;
			}
			this.transmitGameStatus();
			this.setTurnTimer();
		}

		game.prototype.victory = function(player, otherPlayer){
			console.log("Player won");
			console.log(player.name);
			sql.rewardPlayer(player.id, randomCardFromAllCards()).then((result)=>{
				console.log(result);
				io.to(player.sock).emit("youWon", result);
			}).catch(function(error){
				console.log(error);
			});
			io.to(otherPlayer.sock).emit("youLost");
			clearTimeout(this.currentTimeout);
			player.currentGame = null;
			otherPlayer.currentGame = null;
			player.gameState = "mainmenu";
			otherPlayer.gameState = "mainmenu";
			let index = playerGames.indexOf(this);
			if(index !== -1)
				playerGames.splice(index,1);
			console.log("list of games")
			console.log(playerGames);
		}
		//game logic helper functions
		game.prototype.dealDamage = function(damage, targetPlayer){
			console.log(this.p1Status);
			console.log(this.p2Status);
			if (targetPlayer.armor>=damage){
				targetPlayer.armor -= damage;
			} else if(targetPlayer.armor < damage){
				damage -= targetPlayer.armor;
				targetPlayer.armor = 0;
				targetPlayer.health -=damage;
			}
			console.log(this.p1Status);
			console.log(this.p2Status);
		}

		//end game logic helper functions

		game.prototype.gameLogic = function(targetPlayer, selfPlayer, card){
			//we will do all the maths here
			//general card logic
			if (card.damage > 0 ){
				let damage = 0;
				console.log("damage: " + card.damage);
				console.log("numberofstrikes: " + card.numberofstrikes);
				for(let a=0 ; a<(card.numberofstrikes) ; a++){
					damage += (card.damage);
				}
				this.dealDamage(damage, targetPlayer);
				console.log(damage);
			}
			//apply sum heals
			if (card.heal > 0 ){
				let heal = 0;
				heal = card.heal;
				selfPlayer.health +=heal;
				console.log("heal: " + heal);
			}
			//apply sum armor
			if (card.armor > 0 ){
				let armor = 0;
				armor = card.armor;
				selfPlayer.armor += armor;
				console.log("Armor: " + armor);
			}
			//apply sum buffs/debuffs
			if (card.buff != ""){

			}
			

			this.transmitGameStatus();
		}
	}
//}

//deferred object{
	let deferred = function(){
		this.promise = new Promise((resolve, reject)=> {
      		this.reject = reject
      		this.resolve = resolve
      	});
	}
//}
//console.log(getSHA256('wasd'));


console.log ('Server Started');

//ping check sequence
//playerList.push(new player(1, "testname", "LFO", 1, "testsocketid"));
console.log(playerList);
//setTimeout(test2, 10000);

/*console.log("pinging player");
function test(){
	playerList[0].ping().then(function(){
		console.log("everything worked out no ping fail check should be executed")
	}).catch(function(error){
		console.log("player has disconnected");
	});
}
function test2(){
	playerList[0].pong();
}
setTimeout(test,1000);
//setTimeout(test2,3000);*/

// Server setup
sql.GetCard.then(function (cards){
	console.log(cards);
	CardList = cards;
}).catch(function (error){
	console.log(error);
});

//looping http://www.andygup.net/fastest-way-to-find-an-item-in-a-javascript-array/
// Server methods
io.sockets.on('connection', function(socket)
{
	console.log ('User connected: ' + socket.id);
	socket.emit('connectionEstabilished', {id: socket.id});

	socket.on('deckedit_getCards', function(){
		let i = 0; const iMax = Object.keys(playerList).length;
		let userid;
		for(;i<iMax;i++){
			if(playerList[i].sock==socket.id){
				userid=playerList[i].id;
				sql.getPlayerOwnedCards(userid).then((result) =>{
					console.log(result);
					let cards = [];
					let ammounts = [];
					const oMax = Object.keys(result).length;
					for(let o=0;o<oMax;o++){
						cards[o] = {
							id: result[o].id,
							level: result[o].level,
							type: result[o].type,
							name: result[o].name,
							cost: result[o].cost,
							description: result[o].description
						}
						ammounts [o] = {
							id: result[o].id,
							ammount: result[o].ownedammount
						}
					}
					console.log("dismantled result:");
					console.log(cards);
					console.log(ammounts);
					socket.emit('cardsToLoadDeckEditor', {cards:cards, ammounts: ammounts});
				});
				break;
			}
		}
	});

	socket.on('deckSaveRequest', (message)=>{
		console.log("user requested to save:")
		console.log(message);
		let i = 0; const iMax = Object.keys(playerList).length;
		for(;i<iMax;i++){
			if(playerList[i].sock==socket.id){
				sql.SavePlayerDeck(message.cards, playerList[i].id).then(() =>{
					socket.emit('deckSaveSucess');
				});
				break;
			}
		}
	})

	socket.on('registerUser', function(message){
		sql.RegisterPlayer(message.user, message.pass).then((result) =>{
			socket.emit("registerSucess");
		}).catch((result) =>{
			console.log(result);
			socket.emit("registerFail", {message: result});
		});
	});

	socket.on('pong', function(){
		console.log("pong from " + socket.id);
		let i = 0; const iMax = Object.keys(playerList).length;
		for(;i<iMax;i++){
			if(playerList[i].sock==socket.id){
				playerList[i].pong();
				console.log("pong registered");
				break;
			}
		}
	});

	socket.on('endTurn', function(message){
		let i = 0; const iMax = Object.keys(playerList).length;
		console.log(message);
		for(;i<iMax;i++){
			if(playerList[i].sock==socket.id){
				playerList[i].currentGame.playerEndedTurn(playerList[i], message);
				break;
			}
		}
	});

	socket.on('playCard',function(message){
		let i = 0; const iMax = Object.keys(playerList).length;
		for(;i<iMax;i++){
			if(playerList[i].sock==socket.id){
				playerList[i].currentGame.playCard(message);
			}
		}
	})

	socket.on('LoginAttempt', function(message){ //lacks security and persistence
		console.log(message);
		sql.GetPlayer(message.user, message.pass).then(function (result){
			//we test if this user is already on the list for now we remove him, later we might want to put him back into the game
			let i = 0; const iMax = Object.keys(playerList).length;
			for(;i<iMax;i++){
				if(playerList[i].id==result[0].user_id){
					playerList.splice(i,1)
					console.log("player was in the list already, log in renewed");
					break;
				}
			}
			console.log("addding player to list");
			playerList.push(new player(result[0].user_id, result[0].user_username, "mainmenu", 1, socket.id));
			console.log("player logged in -> " +result[0].user_id + " : " + result[0].user_username);
			socket.emit('loginSucess', {id: socket.id, username:result[0].user_username});
		}).catch(function (error){
			if(error == 1){
				socket.emit('loginFailed');
				console.log("emmited login failed");
			}
			if(error == 2)
				socket.emit('warningBox', {message:"server related issue", errCode:2}); //still need some way of displaying this
		});
	})

	socket.on('gotCards', function(){
		//we find the game this player is refering too
		let i = 0; const iMax = Object.keys(playerGames).length; let flag=false;
		for(;i<iMax;i++){
			if(playerGames[i].p1.sock==socket.id){
				playerGames[i].p1loaded = true;
				flag = true;
				console.log("p1 loaded");
				break;
			}
			if(playerGames[i].p2.sock==socket.id){
				playerGames[i].p2loaded = true;
				flag = true;
				console.log("p2 loaded");
				break;
			}
		}
		if(flag){//if we found this players let's check if both are loaded
			if(playerGames[i].p1loaded && playerGames[i].p2loaded){ //both players are loaded so let's clear the timeout
				clearTimeout(playerGames[i].currentTimeout);
				console.log("timeout cleared game has started");
				console.log("telling " + playerGames[i].p1.sock);
				console.log("and " + playerGames[i].p2.sock + "  that everyone has loaded");
				io.to(playerGames[i].p1.sock).emit('loadGame');
				io.to(playerGames[i].p2.sock).emit('loadGame');
				//define who plays first
				let firstPlayer = Math.floor(Math.random());
				playerGames[i].setUpGame(firstPlayer);

			}
		}  else{
			console.log("didnt find the player calling gotCards");
		}

	});
	// TODO if player logs in, quequees for match, logs out, someone else quequees and he logins while he has not timed out his new object is destroyed!
	socket.on('FindOpponent', function(){ //after setting user to LFO user needs to be able to revert back to not lfo
		//this function runs code for every client the first one to reject it is the first player to answer to the ping with a gamestate of LFO, if no one
		//rejects it, they will all be sovled within client timeout time, disconnecting all disconnected players in the process and setting this player to LFO

		//we must test if this user is really logged in to avoid hacked clients from spamming this function.
		let i = 0; const iMax = Object.keys(playerList).length;
		let flag = false;
		let indexOfPlayer = 0;
		for(;i<iMax;i++){
			if(playerList[i].sock==socket.id){
				flag = true; //we have found him
				console.log("we found this player on the list");
				PlayerRef = playerList[i];
				break;
			}
		}

		if(!flag){ //let's disconnect from him
			socket.disconnect();
			console.log("fake player");
		}

		//Promise.all() returns the first reject if any, or all resolves, wich makes it perfect to use it inversely
		//as soon as a player pongs that promise is rejected and the code progresses, on the other hand if all solves no user is in LFO mode so we set this one to LFO
		Promise.all(GetMatchmakingArray(socket.id)).then(function(values) {
  			console.log("resolved " + values);
			PlayerRef.gameState = "LFO";
			console.log("setting self to lfo");
  		}).catch(function(value){ //hapens if someone answers to the game find call
  			console.log("rejected aka opponent found! " + value)
			//we warn the player calling this to load the game and we find his deck
			this.CurrentGameIndex;
  			io.to(playerList[value].sock).emit('foundOpp',{username:PlayerRef.name}); //we send him the oposing player name
  			sql.GetPlayerDeck(playerList[value].id).then((result) =>{ //we send him his deck
  				console.log(playerList[value].name + "'s Deck");
  				console.log(result);
  				playerGames[this.CurrentGameIndex].p2deck=result;
  				io.to(playerList[value].sock).emit('cardList',{cards:result});
			}).catch(function (error){
				console.log(error);
			});
			//and the user that was waiting to load the game and we find his deck
			socket.emit("foundOpp",{username:playerList[value].name}) //we send him the oposing player name
			sql.GetPlayerDeck(PlayerRef.id).then((result) =>{
				console.log(PlayerRef.name + "'s Deck");
  				console.log(result);
  				playerGames[this.CurrentGameIndex].p1deck=result;
  				socket.emit("cardList",{cards:result})
				}).catch(function (error){
					console.log(error);
				});

	  		let timeout = setTimeout(function(){ //we set a timeout for the players to load in
	  			console.log("game timed out")
	  			PlayerRef.gameState = "mainmenu";
	  			playerList[value].gameState = "mainmenu";
	  			socket.emit("reset")
	  			io.to(playerList[value].sock).emit("reset");
	  			playerGames.splice(CurrentGameIndex,1);
  			},10000)

	  		//we push a new game into the games list
	  		//this line is possible because .push returns the index it pushed the new object into
	  		this.CurrentGameIndex = playerGames.push(new game(PlayerRef, playerList[value], timeout)) - 1;
	  		console.log("current game index = " + CurrentGameIndex);
	  		PlayerRef.currentGame = playerGames[CurrentGameIndex];
	  		playerList[value].currentGame = playerGames[CurrentGameIndex];
	  		console.log(playerGames[this.CurrentGameIndex]);
  		});
	});


});