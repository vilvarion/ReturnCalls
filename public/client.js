var app = angular.module('ReturnCalls', []);

// Фабрика работы с сокет.ио взята отсюда:
// http://briantford.com/blog/angular-socket-io
app.factory('socket',function ($rootScope){
	var socket = io.connect();
	return {
		on: function (eventName,callback){
			socket.on(eventName,function(){
				var args = [].slice.call(arguments);
				$rootScope.$apply(function(){
					if(callback){
						callback.apply(socket,args);
					}
				});
			});
		},
		emit: function (eventName, data, callback){
			var args = [].slice.call(arguments), cb;
			if( typeof args[args.length-1]  == "function" ){
				cb = args[args.length-1];
				args[args.length-1] = function(){
					var args = [].slice.call(arguments);
					$rootScope.$apply(function(){
						if(cb){
							cb.apply(socket,args);
						}
					});
				};
			}
			socket.emit.apply(socket, args);
		}
	};
});

/** Сообщение на случай дисконнекта сокета **/
app.controller('onlineCheck', function ($scope, socket) {
	
	$scope.username = localStorage.getItem('username');
	$scope.online = false;

	socket.on('connect', function(){
		$scope.online = true;
		socket.emit('set username', { name: $scope.username });
	});
	socket.on('disconnect', function(){
		$scope.online = false;
	});

});

/** ОБСЛУЖИВАЕМ СПИСОК ТЕЛЕФОНОВ **/
app.directive('callsList', function() {
	return {
		restrict: 'E',
		templateUrl: 'public/calls-list.html',
		controller: function($scope, socket) {

			$scope.list = [ { phone: 'Нет данных' } ];
			$scope.username = localStorage.getItem('username');

			socket.on('calls list', function(list){
				$scope.list = list;
			});		

			// Кнопка "выполнено"
			$scope.makeDone = function(id) {
				socket.emit('call is done', id);
				return false;
			}

			// Присвоение заявки оператором
			$scope.takeOrder = function(id) {
				socket.emit('call operator update', { _id: id });
				return false;
			}

			// Добавление комментария
			$scope.addComment = function(id) {
				var newComment = prompt('Введите новый комментарий');
				if(newComment) {
					socket.emit('call comment update', { _id: id, comment: newComment });
				}
				return false;
			}			

			// Событие обновления данных по сокету
			socket.on('calls updates', function(msg){
				angular.forEach($scope.list, function(item) {
					if(item._id == msg._id) {
						angular.extend(item, msg);
					}
				});
			});		

		}
	}
});



/** Блок с пользователями онлайн **/
app.directive('showOnline', function() {
	return {
		restrict: 'E',
		templateUrl: 'public/show-online.html',
		controller: function($scope, socket) {

			$scope.online = function() {
				return $scope.users.length;
			}

			$scope.users = [];

			socket.on('list users', function(users){
				$scope.users = users;
			});	
		}
	}
});


/** ОБСЛУЖИВАЕМ ОПЕРАТОРСКИЙ ЧАТ **/

// Для отлавливания callback-a рендеринга окна чата,
// приходится использовать дополнительную директиву:
// Взято: http://www.nodewiz.biz/angular-js-final-callback-after-ng-repeat/
app.directive('onLastRepeat', function() {
	return function(scope, element, attrs) {				
		if (scope.$last) setTimeout(function(){
			scope.$emit('onRepeatLast', element, attrs);
		}, 1);
	};
});

// Работаем с контроллером операторского чата
app.directive('chatBox', function() {
	return {
		restrict: 'E',
		templateUrl: 'public/chat-box.html',
		controller: function($scope, socket) {

			$scope.messages = []; // Здесь храним сообщения чата
			$scope.writers = []; // А здесь тех, кто пишет сообщение прямо сейчас

			// Событие вызывается директивой onLastRepeat для отлавливания callbacka рендера
			var chatWindow = $('#chat-box')[0];
			$scope.$on('onRepeatLast', function(scope, element, attrs){
				chatWindow.scrollTop = chatWindow.scrollHeight; // скролим окно чата всегда вниз	
			});

			// Событие подгрузки истории чата
			// (автоматически при установки связи в сокете)
			socket.on('chat history', function(history){
				$scope.messages = history.reverse();
			});	

			// Форма отправки нового сообщения
			$scope.addMessage = function () {
				socket.emit('chat message', { user: localStorage.getItem('username'), message: $('#message').val() });
				$scope.currentInput = ""; 
				socket.emit('chat user stop writing', {});
				return false;
			}

			// Добавляем новое сообщение в чат
			socket.on('chat message', function(msg){
				msg.new = true;
				$scope.messages.push(msg);
			});	  

			// Следим и выводим, если кто-то пишет в чате
			$scope.$watch('currentInput', function() {
				if(typeof $scope.currentInput != "undefined") {
					if($scope.currentInput.length > 0) {
						socket.emit('chat user start writing', {});
					}else{
						socket.emit('chat user stop writing', {});
					}
				}
			});

			socket.on('chat user start writing', function(msg){
				if($scope.writers.indexOf(msg.user) === -1) {
					$scope.writers.push(msg.user);
				}
			});	  

			socket.on('chat user stop writing', function(msg){
				$scope.writers.splice($scope.writers.indexOf(msg.user), 1);
			});	  
		}
	}
});


/*
* Апи предоставлен http://bootswatch.com
* Создаем выборку оформления
*/
app.directive('themeSwatcher', function() {
	return {
		restrict: 'E',
		templateUrl: 'public/theme-swatcher.html',
		controller: function($scope, $http) {

			$scope.currentTheme = localStorage.getItem('theme');

			$http.get('http://api.bootswatch.com/3/')
			.success(function(data){
				$scope.themes = data.themes;
			})
			.error(function(){
				alert('error!');
			});

			$scope.$watch('currentTheme', function() {
				localStorage.setItem('theme', $scope.currentTheme);
				$('#theme-loading').show(); // TODO: перенести на рендер angular-a

				var themeFile = '//netdna.bootstrapcdn.com/bootswatch/latest/'+ $scope.currentTheme.toLowerCase() +'/bootstrap.min.css';

				// Сначала загружаем css файл, а потом уже подменяем его.
				// Иначе получаем unstyled flash в ff
				$.get( themeFile, function() {
					// $scope.loading = false;  - почему-то не срабатывает тут, не рендерит
					$('#theme-loading').hide();
					$('#bootswatch').attr('href', themeFile);
				});				

			});
		}
	}
});


// Модальное окно запроса имени оператора
app.directive('loginModal', function() {
	return {
		restrict: 'E',
		templateUrl: 'public/login-modal.html',
		controller: function($scope, socket) {

			$scope.username = localStorage.getItem('username');

			if($scope.username === null || $scope.username.length === 0) {
				$scope.showModal = true;
			}

			$scope.addName = function() {
				if($scope.username.length > 0) {

					socket.emit('set username', { name: $scope.username });
					localStorage.setItem('username', $scope.username);

					// TODO: перенести анимацию в логику шаблона??
					$('.modal-window').hide();
					$('.overlay').animate({opacity: 0}, 500, function() {
						$('.overlay').hide();
						$scope.showModal = false;
					});

				}
			}
		}
	}
});
