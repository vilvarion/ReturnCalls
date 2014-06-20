// Init
var express = require('express'), app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongoose = require('mongoose').connect('mongodb://localhost/returncalls');
var db = mongoose.connection;

app.use(require('connect').bodyParser());



// DB
var Chat = mongoose.model('chat', { user: String, message: String, time: String });
var ReturnCalls = mongoose.model('calls', { 
		phone: String, name: String, time: String, comment: String, operator: String, done: Boolean 
	});

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

	fetchCalls(socket);

	// Fetching chat history
	Chat.find({}, function (err, calls) {
		var chatMap = [];
		calls.forEach(function(chat) {
			chatMap.push(chat);
		});
		socket.emit('chat history', chatMap);  
	});


	socket.on('chat message', function(msg){

		console.log('message: ' + msg);

		if(msg.length>0) {

			var chat = new Chat({ message: msg, time: getTime() });

			chat.save(function (err) {
				if (err) {
					console.log('chat saving problem..');
				}else{
					console.log('chat saving success..');
				}
			});    	
		}

		io.sockets.emit('chat message', { message: msg, time: getTime() });

	});


	socket.on('disconnect', function(){
		// console.log('user disconnected');
	});  

});


// Http

http.listen(3000, function(){
	console.log('listening on *:3000');
});
