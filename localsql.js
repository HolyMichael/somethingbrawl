//In here are all the implementations of the mysql functions used

//setup d8Wb1u$7
let mysql = require('mysql');
let con = mysql.createConnection({
  host: "127.0.0.1",
  user: "migue_server",
  password: "Wepp801*",
  database: "somethingbrawl"
});

//functions

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

//method implementation

exports.GetCard = new Promise(function(resolve, reject){
		let sql = "SELECT * FROM card";
		con.query(sql, function (err, result, fields) {
			if (err) reject(err);
			resolve(result)
		});
});

exports.GetPlayerStats = function (userid1, userid2){
	return new Promise(function(resolve, reject){
		let sql = "SELECT user_id, Char_Health, Char_Energy, Char_EnergyGrowth, Char_MaxEnergy FROM user WHERE user_id=" + mysql.escape(userid1) + 
		" UNION SELECT user_id, Char_Health, Char_Energy, Char_EnergyGrowth, Char_MaxEnergy FROM user WHERE user_id=" + mysql.escape(userid2);
		con.query(sql, function (err, result, fields) {
			if (err) reject(err); //server related issue
			if (isEmpty(result)) reject(err); //user not found
			resolve(result);
		});
	});
};

exports.GetPlayer = function(user,pass){
	return new Promise(function(resolve, reject){
		let sql = "SELECT user_id, user_username FROM user WHERE user_username=" + mysql.escape(user) + " AND user_pass=" + mysql.escape(pass);
		con.query(sql, function (err, result, fields) {
			if (err) reject(2); //server related issue
			if (isEmpty(result)) reject(1); //user not found
			resolve(result);
		});
	});
};

exports.RegisterPlayer = function(user,pass){
	return new Promise(function(resolve,reject){
		let sql = "SELECT * FROM user WHERE user_username=" + mysql.escape(user)
		con.query(sql, function (err, result, fields) {
			if (err) reject(2); //server related issue
			if (!isEmpty(result)) reject("username in use");
			if (isEmpty(result)){
				let sql = "INSERT INTO user (`user_username`, `user_pass`, `user_activedeck`, `Char_Health`, `Char_Energy`, `Char_EnergyGrowth`, `Char_MaxEnergy`) VALUES" +
				"(" + mysql.escape(user) +
				"," + mysql.escape(pass) +
				",1" + //active deck (not implemented)
				",100" + //health
				",5" + //energy
				",1" + //energy growth
				",15)"; //max energy
				con.query(sql, function (err, result) { //create the user
					if (err) reject(err); //server related issue
					if (isEmpty(result)) reject("user not created");
					console.log(result);
					let sql = "INSERT INTO usercards (`userid`, `cardid`, `ownedammount`) VALUES ";
					for(let i=1; i<7;i++){
						sql += "(" + result.insertId +
						"," + i +
						",1), ";
					}
					sql = sql.substring(0, sql.length - 2); // cut out the aditional ,\blank
					con.query(sql, function (err, result) { //give him some owned cards
						if (err) reject(err);
						resolve(result);
					})
				});
			} 
			
		});
	});
}

exports.SavePlayerDeck = function(cardlist, userid){
	return new Promise(function(resolve, reject){
		let sql = "DELETE FROM userdeck WHERE userid =" + mysql.escape(userid);
		con.query(sql, function(err, result){
			let sql = "INSERT INTO userdeck (`userid`, `deckid`, `cardid`) VALUES ";
			const iMax= Object.keys(cardlist).length;
			for(let i=0;i<iMax;i++){
				sql += "(" + mysql.escape(userid) +
				"," + 1 +
				"," + mysql.escape(cardlist[i]) + "), ";
			}
			sql = sql.substring(0, sql.length - 2);
			con.query(sql, function (err, result) {
				if (err) reject(err);
				resolve(result);
			});
		});
	});
}
exports.GetPlayerDeck = function (userid){
	return new Promise(function(resolve, reject){
		let sql = "SELECT user_activedeck FROM user WHERE user_id=" + mysql.escape(userid);
		con.query(sql, function(err, result, fields){
			if (err) reject(err);
			if (isEmpty(result)) reject("user not found");
			let sql = "SELECT cardid FROM userdeck WHERE userid="  + mysql.escape(userid) + " AND deckid=" + mysql.escape(result[0].user_activedeck);
			con.query(sql, function(err, result, fields){
				if (err) reject(err);
				if (isEmpty(result)) reject("user deck not found");
				const iMax = Object.keys(result).length;
				let sql ="SELECT id, level, type, name, cost, description FROM card WHERE id = " + mysql.escape(result[0].cardid);
				for(let i = 1;i<iMax;i++){
					sql += " UNION SELECT id, level, type, name, cost, description FROM card WHERE id = " + mysql.escape(result[i].cardid);
				}
				con.query(sql, function(err, result, fields){
					if (err) reject(err);
					if (isEmpty(result)) reject("empty");
					resolve(result);
				});
			});
		});
	});
}

exports.getPlayerOwnedCards = function(userid){
	return new Promise(function(resolve,reject){
		let sql= "SELECT C.id, C.level, C.type, C.name, C.cost, C.description, U.ownedammount from usercards U JOIN card C on U.cardid = C.id AND U.userid=" + mysql.escape(userid);
		con.query(sql, function (err, result, fields) {
			if (err) reject(err); //server related issue
			if (isEmpty(result)) reject("empty");
			resolve(result);
		});
	});
}

exports.rewardPlayer = function(userid, cardid){
	return new Promise(function(resolve, reject){
		let sql = "SELECT * FROM usercards WHERE userid=" + mysql.escape(userid) + " AND cardid=" + mysql.escape(cardid);
		con.query(sql, function (err, result, fields) {
			if (err) reject(err); //server related issue
			if (isEmpty(result)){
				console.log(result);
				let sql = "INSERT INTO usercards (`userid`, `cardid`, `ownedammount`) VALUES" +
					"(" + mysql.escape(userid) +
					"," + mysql.escape(cardid) +
					",1)";
				con.query(sql, function (err, result) {
					if (err) reject(err);
					resolve(result);
				});
				return;
			}
			else{
				console.log("adding repeated card" + result[0].cardid);
				let ammount = result[0].ownedammount;
				ammount ++;
				var sql = "UPDATE usercards SET ownedammount =" + mysql.escape(ammount) + " WHERE userid=" + mysql.escape(userid) + " AND cardid=" + mysql.escape(cardid);
				con.query(sql, function (err, result) {
					if (err) reject(err);
					resolve(result);
				});
			}
		});
	});
}
