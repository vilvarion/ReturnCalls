/*
GLOBAL TODO:
1. CRUD for phone list
2. Звуковое оповещение о новом заказе
*/


// Init
var express = require('express'), app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var _ = require('underscore');
var mongoose = require('mongoose').connect('mongodb://localhost/returncalls');
var db = mongoose.connection;

app.use(require('connect').bodyParser());



// DB
var Chat = mongoose.model('chat', { user: String, message: String, time: String });
var ReturnCalls = mongoose.model('calls', { 
		phone: String, name: String, time: String, comment: String, operator: String, done: Boolean 
	});

var Users = []; // Пока что никакого модуля для пользователей, только массив


db.on('error', function (err) {
	console.log('connection error:', err.message);
});
db.once('open', function callback () {
	console.log("Connected to DB!");
});


function getTime () {
	return (new Date).toLocaleTimeString();
}
function fetchCalls (target) {
	// Fetching returncalls history
	ReturnCalls.find({})
	.limit(20).sort({'_id': -1})
	.exec(function (err, calls) {
		var callsMap = [];
		calls.forEach(function(call) {
			callsMap.push(call);
		});	
		target.emit('calls list', callsMap);  
	});
}

// Routes

app.get('/', function(req, res){
	res.sendfile('index.html');
});

app.post('/addReturnCall', function(req, res){

	var call = new ReturnCalls({ phone: req.body.phone, time: getTime(), done: false });

	call.save(function (err) {
		if (err) {
			console.log('call saving problem..');
		}else{
			console.log('call saving success..');
			fetchCalls(io);
		}
	});  

	res.send('ok!');

});

// Socket.IO

io.on('connection', function(socket){

	var userId = (socket.id).toString().substr(0, 7);
	Users.push({  _id: userId });
	io.sockets.emit('list users', Users);  
	console.log('connect user: ' + userId);

	fetchCalls(socket);


	socket.on('set username', function(msg) {
		_.extend(Users, [{ _id: userId, name: msg.name }]);
		io.sockets.emit('list users', Users); 
	});


	socket.on('call is done', function(msg) {
		ReturnCalls.findOneAndUpdate({ _id: msg }, { done: true }, function(result) {

			io.sockets.emit('calls updates', { _id: msg, done: true });

		});
	});

	socket.on('call comment update', function(msg) {
		ReturnCalls.findOneAndUpdate({ _id: msg._id }, { comment: msg.comment }, function(result) {

			io.sockets.emit('calls updates', { _id: msg._id, comment: msg.comment });

		});
	});







	/* Chat */

	// Fetching chat history
	Chat.find().sort({'_id': -1}).limit(20)
	.exec(function (err, calls) {
		socket.emit('chat history', calls);  
	});

	socket.on('chat message', function(msg){

		if(msg.message.length>0) {

			msg.time = getTime();

			var chat = new Chat(msg);

			chat.save(function (err) {
				if (err) {
					console.log('chat saving problem..');
				}else{
					console.log('chat saving success..');
				}
			});    	

			io.sockets.emit('chat message', chat.toJSON());
	
		}

	});


	socket.on('disconnect', function(){
		
		console.log('user disconnected: ' + userId);

		Users.forEach(function (item, i) {
			if(item._id == userId) {
				Users.splice(i, 1);
				io.sockets.emit('list users', Users); 
			}
		});
	});  

});


// Http

http.listen(3000, function(){
	console.log('listening on *:3000');
});
