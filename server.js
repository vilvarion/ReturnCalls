
// Init
var express = require('express'), app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongoose = require('mongoose').connect('mongodb://localhost/returncalls');
var db = mongoose.connection;

app.use(require('connect').bodyParser());


// DB
var Chat = mongoose.model('chat', { user: String, message: String, time: Date });
var ReturnCalls = mongoose.model('calls', { 
		phone: String, name: String, time: Date, comment: String, operator: String, done: Boolean 
	});


// Я не брал никакого стандартного модуля для работы пользователей.
// Сделал сам простенький объект.
var Users = {
	// массив пользователей
	list: [],
	// функция выборки текущего пользователя из массива
	// возвращает объект { _id, name }
	current: function (socket) {
		var current;
		Users.list.forEach(function (user) {
			if(user._id === (socket.id).toString()) {
				current = user;
				return false;
			}
		});
		return current;
	},
	// функция присвоения имени пользователя
	setCurrentName:  function (socket, name) {
		Users.list.forEach(function (user) {
			if(user._id === (socket.id).toString()) {
				user.name = name;
			}
		});
	}
};


db.on('error', function (err) {
	console.log('connection error:', err.message);
});
db.once('open', function callback () {
	console.log("Connected to DB!");
});


function getTime () {
	return (new Date());
}
function fetchCalls (target) {
	// Вытаскиваем историю заявок звонков
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


// Папка для директив, css и js
app.use("/public", express.static(__dirname + '/public'));


// Роут принимающий новый запрос обратного звонка
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

	Users.list.push({  _id: (socket.id).toString() });
	io.sockets.emit('list users', Users.list);  

	console.log('Users.current(socket)');
	console.log(Users.current(socket));
	console.log('Users.list');
	console.log(Users.list);

	fetchCalls(socket);


	socket.on('set username', function(msg) {
		Users.setCurrentName(socket, msg.name);
		console.log('Users.list + username');
		console.log(Users.list);		
		io.sockets.emit('list users', Users.list); 
	});


	socket.on('call is done', function(msg) {
		ReturnCalls.findOneAndUpdate({ _id: msg }, { done: true }, function() {

			io.sockets.emit('calls updates', { _id: msg, done: true });

		});
	});

	socket.on('call comment update', function(msg) {
		ReturnCalls.findOneAndUpdate({ _id: msg._id }, { comment: msg.comment }, function() {

			io.sockets.emit('calls updates', { _id: msg._id, comment: msg.comment });

		});
	});

	socket.on('call operator update', function(msg) {
		ReturnCalls.findOneAndUpdate({ _id: msg._id }, { operator: Users.current(socket).name }, function(err, res) {
			io.sockets.emit('calls updates', res);
		});
	});


	/* Чат */

	// вытаскиваем историю чата
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

	
	// Сообщения, что пользователь начал и закончил печатать
	// Рассылаем всем кроме него самого
	socket.on('chat user start writing', function(){
		socket.broadcast.emit('chat user start writing', { user: Users.current(socket).name });
	});

	socket.on('chat user stop writing', function(){
		socket.broadcast.emit('chat user stop writing', { user: Users.current(socket).name });
	});


	// Отключение пользователя от системы
	socket.on('disconnect', function(){
		
		console.log('user disconnected: ' + Users.current(socket)._id);

		Users.list.forEach(function (item, i) {
			if(item._id === Users.current(socket)._id) {
				Users.list.splice(i, 1);
				io.sockets.emit('list users', Users.list); 
			}
		});
	});  

});


// Http

http.listen(3000, function(){
	console.log('listening on *:3000');
});
