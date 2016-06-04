angular
.module("index", [])
.controller("index_main", ['$scope', '$timeout', function ($scope, $timeout) {
		$scope.messageList = [
			{text: 'Hello. What can I do for you?'},
			{text: 'I\'m just looking around. Will you tell me something about yourself?'},
			{text: 'OK, my name is Limingqiang. I like singing, playing basketballand so on.'},
			{text: 'I am Derek. I am a photographer.'}
		];
		$scope.sendMessage = function(){
			$scope.messageList.push({text: $scope.currentMsg});
			$scope.currentMsg='';
			$timeout(function(){ $scope.messageList.push({text: 'Good'});; }, 1000);
		};
	}
]);